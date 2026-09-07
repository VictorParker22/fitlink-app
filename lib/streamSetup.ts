/**
 * lib/streamSetup.ts — the one path from "go live" to a real Mux stream.
 *
 * The server gate for live streaming is trainers.elite_until, checked by the
 * create-mux-stream function (402 { error: 'elite_required' } when it is not
 * active). Elite is bought through RevenueCat on the phone, and the webhook
 * that writes elite_until can be late or absent, so a coach can be Elite on
 * the device and not yet on the server. A 402 here therefore asks the server
 * to sync entitlements now (confirmEntitlement) and retries the stream once;
 * if the pass still is not active the failure is reported as it is.
 *
 * Every network step has a hard timeout. Failures are a StreamSetupError
 * whose `reason` the screens map to copy that says what to do next. Nothing
 * in this file logs, reports or stores a stream key anywhere but the
 * live_class_secrets row it belongs to.
 */
import * as Sentry from '@sentry/react-native';
import { supabase } from './supabase';
import { confirmEntitlement } from './entitlement';

export type StreamSetupReason = 'elite_required' | 'unreachable' | 'mux_error' | 'timeout';

export interface MuxStream {
  stream_id: string;
  stream_key: string;
  playback_id: string;
}

export interface StreamSecrets {
  stream_id: string | null;
  stream_key: string | null;
}

/** Hard ceiling on any single network call in the go-live flow. */
export const NETWORK_TIMEOUT_MS = 15_000;

/** Alert copy per reason. Plain sentences that say what to do next. */
export const STREAM_SETUP_COPY: Record<StreamSetupReason, { title: string; message: string }> = {
  elite_required: {
    title: 'Elite pass still syncing',
    message: "Your Elite pass hasn't reached our server yet. Give it a moment and try again.",
  },
  unreachable: {
    title: 'No connection',
    message: "We couldn't reach the stream service. Check your connection and try again.",
  },
  timeout: {
    title: 'Taking too long',
    message: 'The stream service took too long to answer. Check your connection and try again.',
  },
  mux_error: {
    title: 'Stream service error',
    message: 'The stream service returned an error. Try again in a moment.',
  },
};

export class StreamSetupError extends Error {
  readonly reason: StreamSetupReason;
  /** HTTP status when the server answered at all. */
  readonly status?: number;
  /** Diagnostic text for Sentry only; never shown to the coach, never a key. */
  readonly detail?: string;

  constructor(reason: StreamSetupReason, opts: { message?: string; status?: number; detail?: string } = {}) {
    super(opts.message ?? STREAM_SETUP_COPY[reason].message);
    this.name = 'StreamSetupError';
    this.reason = reason;
    this.status = opts.status;
    this.detail = opts.detail;
    // Babel's class transform can drop the prototype on Error subclasses;
    // pin it so instanceof holds on Hermes.
    Object.setPrototypeOf(this, StreamSetupError.prototype);
  }
}

export function isStreamSetupError(e: unknown): e is StreamSetupError {
  if (e instanceof StreamSetupError) return true;
  const o = e as { name?: unknown; reason?: unknown } | null;
  return !!o && typeof o === 'object' && o.name === 'StreamSetupError' && typeof o.reason === 'string';
}

/** Alert copy for any failure in the flow; unknown errors fall back to their own message. */
export function describeStreamSetupError(e: unknown): { title: string; message: string; reason: StreamSetupReason | 'unknown' } {
  if (isStreamSetupError(e)) return { ...STREAM_SETUP_COPY[e.reason], reason: e.reason };
  const message = (e as { message?: unknown } | null)?.message;
  return {
    title: 'Setup error',
    message: typeof message === 'string' && message ? message : 'Could not set up the stream.',
    reason: 'unknown',
  };
}

/** Rejects with StreamSetupError('timeout') when `p` has not settled in `ms`. */
export function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new StreamSetupError('timeout', { detail: `${label} exceeded ${ms} ms` })),
      ms,
    );
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// ── Instrumentation ─────────────────────────────────────────────────────────

type CrumbData = Record<string, string | number | boolean | null | undefined>;

/** One breadcrumb per step of the go-live flow. Keep `data` small and key-free. */
export function broadcastBreadcrumb(message: string, data?: CrumbData): void {
  Sentry.addBreadcrumb({ category: 'broadcast', message, level: 'info', data });
}

export function reportBroadcastFailure(err: unknown, data: CrumbData): void {
  const extra: Record<string, unknown> = { ...data };
  if (isStreamSetupError(err)) {
    extra.reason = err.reason;
    extra.status = err.status;
    extra.detail = err.detail;
  }
  Sentry.captureException(err instanceof Error ? err : new Error(errorText(err)), {
    tags: { flow: 'broadcast' },
    extra,
  });
}

export function reportBroadcastWarning(message: string, data: CrumbData): void {
  Sentry.captureMessage(message, { level: 'warning', tags: { flow: 'broadcast' }, extra: { ...data } });
}

function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
    return String((e as { message: string }).message);
  }
  return String(e);
}

// ── create-mux-stream ───────────────────────────────────────────────────────

const CREATE_STREAM_FN = 'create-mux-stream';

async function readErrorBody(error: unknown): Promise<{ error?: unknown } | null> {
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!ctx || typeof ctx.json !== 'function') return null;
  try {
    const body = await withTimeout(Promise.resolve(ctx.json()), 2_000, 'error body');
    return body && typeof body === 'object' ? (body as { error?: unknown }) : null;
  } catch {
    return null;
  }
}

async function invokeCreateStream(timeoutMs: number): Promise<MuxStream> {
  let res: { data: any; error: any };
  try {
    res = await withTimeout(supabase.functions.invoke(CREATE_STREAM_FN), timeoutMs, CREATE_STREAM_FN);
  } catch (e) {
    if (isStreamSetupError(e)) throw e;
    throw new StreamSetupError('unreachable', { detail: errorText(e) });
  }
  const { data, error } = res;
  if (error) {
    // supabase-js 2.105: a non-2xx reply is a FunctionsHttpError whose
    // `context` is the Response; older builds put the body in `data`. Read
    // both so a client on either behaviour classifies the same way. A
    // FunctionsFetchError has no status at all: nothing answered.
    const status: number | undefined =
      typeof error?.context?.status === 'number' ? error.context.status
      : typeof error?.status === 'number' ? error.status
      : undefined;
    const body = await readErrorBody(error);
    const code = body?.error ?? data?.error;
    if (status === 402 || code === 'elite_required') throw new StreamSetupError('elite_required', { status: 402 });
    if (status === undefined) throw new StreamSetupError('unreachable', { detail: errorText(error) });
    throw new StreamSetupError('mux_error', { status, detail: typeof code === 'string' ? code : errorText(error) });
  }
  if (data?.error) {
    if (data.error === 'elite_required') throw new StreamSetupError('elite_required', { status: 402 });
    throw new StreamSetupError('mux_error', { detail: String(data.error) });
  }
  if (
    typeof data?.stream_key !== 'string' || !data.stream_key ||
    typeof data?.stream_id !== 'string' || !data.stream_id ||
    typeof data?.playback_id !== 'string' || !data.playback_id
  ) {
    throw new StreamSetupError('mux_error', { detail: 'no stream in response' });
  }
  return { stream_id: data.stream_id, stream_key: data.stream_key, playback_id: data.playback_id };
}

/**
 * Ask the server for a real Mux stream. On a 402 the entitlement is synced
 * from RevenueCat right now and the request retried once; a second 402 is
 * final. Throws StreamSetupError; never resolves with a placeholder.
 */
export async function requestMuxStream(opts: { timeoutMs?: number } = {}): Promise<MuxStream> {
  const timeoutMs = opts.timeoutMs ?? NETWORK_TIMEOUT_MS;
  const startedAt = Date.now();
  broadcastBreadcrumb('stream: requesting');
  try {
    const stream = await invokeCreateStream(timeoutMs);
    broadcastBreadcrumb('stream: created', { elapsed_ms: Date.now() - startedAt });
    return stream;
  } catch (e) {
    if (!isStreamSetupError(e) || e.reason !== 'elite_required') throw e;
  }
  // The server says no Elite. The pass may be on the phone and not yet on
  // the server, so sync it now and ask once more.
  broadcastBreadcrumb('stream: 402, confirming entitlement', { elapsed_ms: Date.now() - startedAt });
  const confirm = await withTimeout(confirmEntitlement(), timeoutMs, 'confirm-entitlement').catch(() => null);
  const eliteNow = !!confirm?.active?.coach_elite;
  broadcastBreadcrumb('stream: entitlement confirmed', { coach_elite: eliteNow, elapsed_ms: Date.now() - startedAt });
  if (!eliteNow) throw new StreamSetupError('elite_required', { status: 402 });
  const stream = await invokeCreateStream(timeoutMs);
  broadcastBreadcrumb('stream: created after confirm', { elapsed_ms: Date.now() - startedAt });
  return stream;
}

// ── live_class_secrets ──────────────────────────────────────────────────────

/** Keys seeded before a real stream existed look like `key_<timestamp>`. */
export function isPlaceholderStreamKey(key: string | null | undefined): boolean {
  return !key || key.startsWith('key_');
}

function classifyDbError(error: { message?: string; code?: string } | null, fallback: string): StreamSetupError {
  // postgrest-js reports a failed fetch as code '' with the TypeError text.
  const network = !error?.code && /network|fetch|abort/i.test(error?.message ?? '');
  return new StreamSetupError(network ? 'unreachable' : 'mux_error', {
    message: network ? undefined : fallback,
    detail: `${error?.code ?? ''} ${error?.message ?? ''}`.trim(),
  });
}

/** The stream credentials for a class, or null when no row exists. Throws StreamSetupError. */
export async function readStreamSecrets(liveClassId: string): Promise<StreamSecrets | null> {
  const { data, error } = await withTimeout(
    supabase
      .from('live_class_secrets')
      .select('mux_stream_key, mux_stream_id')
      .eq('live_class_id', liveClassId)
      .maybeSingle(),
    NETWORK_TIMEOUT_MS,
    'live_class_secrets read',
  );
  if (error) throw classifyDbError(error, 'Could not load the stream credentials.');
  const row = data as { mux_stream_key?: string | null; mux_stream_id?: string | null } | null;
  if (!row) return null;
  return { stream_id: row.mux_stream_id ?? null, stream_key: row.mux_stream_key ?? null };
}

async function dbWrite(
  label: string,
  q: PromiseLike<{ data?: unknown; error: { message: string } | null }>,
): Promise<{ data: unknown; error: string | null }> {
  try {
    const r = await withTimeout(q, NETWORK_TIMEOUT_MS, label);
    return { data: r.data ?? null, error: r.error ? r.error.message : null };
  } catch (e) {
    return { data: null, error: errorText(e) };
  }
}

/**
 * Save a freshly issued stream on the class's secrets row (update, or insert
 * when the row never existed). Resolves with the error text instead of
 * throwing: the key is already in memory for THIS broadcast, so the caller
 * decides whether a failed save is fatal.
 */
export async function persistStreamSecrets(liveClassId: string, stream: MuxStream): Promise<{ error: string | null }> {
  const row = { mux_stream_id: stream.stream_id, mux_stream_key: stream.stream_key };
  const updated = await dbWrite(
    'live_class_secrets update',
    supabase.from('live_class_secrets').update(row).eq('live_class_id', liveClassId).select('live_class_id'),
  );
  if (updated.error) return { error: updated.error };
  if (Array.isArray(updated.data) && updated.data.length > 0) return { error: null };
  const inserted = await dbWrite(
    'live_class_secrets insert',
    supabase.from('live_class_secrets').insert({ live_class_id: liveClassId, ...row }),
  );
  return { error: inserted.error };
}
