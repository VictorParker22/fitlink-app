// ============================================================
// ai — the one way an edge function talks to a model.
//
// - withRetry: one retry with backoff on 429 / 5xx / network, 20 s timeout.
// - PROMPT_VERSION: every function stamps the version of the prompt set it
//   ran, so a regression can be tied to a prompt change, not guessed.
// - clampInt / clampStr / pickEnum: schema-by-hand for structured
//   generations (no zod on the edge runtime): never trust model JSON.
// - numbersNotInContext: grounding check — numbers a reply states that
//   never appeared in the context it was given.
// - report: forwards an error to Sentry when SENTRY_DSN is set; no-op
//   otherwise. Fire-and-forget.
// ============================================================

export const PROMPT_VERSION = '2026-09-04.1';

export class AiTimeout extends Error {
  constructor() { super('ai_timeout'); }
}

function isRetryable(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
  const status = Number((err as any)?.status ?? (err as any)?.statusCode ?? 0);
  if (status === 429 || (status >= 500 && status < 600)) return true;
  return /429|5\d\d|resource exhausted|overloaded|unavailable|timeout|fetch failed|network/.test(msg);
}

/** Run `fn` with a timeout; retry once on a retryable failure. */
export async function withRetry<T>(fn: () => Promise<T>, opts: { timeoutMs?: number; retries?: number; label?: string } = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const retries = opts.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race<T>([
        fn(),
        new Promise<T>((_, reject) => setTimeout(() => reject(new AiTimeout()), timeoutMs)),
      ]);
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetryable(err)) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1) + Math.random() * 300));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function clampStr(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s || fallback;
}

export function pickEnum<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(String(v)) ? (v as T) : fallback;
}

/** Parse model JSON, tolerating code fences. Returns null on failure. */
export function parseJson(text: string): any | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

/**
 * Numbers the reply states that the context never mentioned. Ignores small
 * counts (1-12: sets, reps, days) since those are instructions, not data.
 */
export function numbersNotInContext(reply: string, context: string): string[] {
  const inCtx = new Set((context.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));
  const out: string[] = [];
  for (const raw of reply.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const n = raw.replace(',', '.');
    const val = Number(n);
    if (Number.isFinite(val) && val >= 1 && val <= 12 && !n.includes('.')) continue;
    if (!inCtx.has(n)) out.push(n);
  }
  return Array.from(new Set(out));
}

/** Best-effort error forwarding to Sentry (envelope API). Never throws. */
export function report(err: unknown, tags: Record<string, string> = {}): void {
  const dsn = Deno.env.get('SENTRY_DSN');
  if (!dsn) return;
  try {
    const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(dsn);
    if (!m) return;
    const [, key, host, project] = m;
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: new Date().toISOString(),
      platform: 'javascript',
      level: 'error',
      logger: 'edge',
      tags: { runtime: 'supabase-edge', prompt_version: PROMPT_VERSION, ...tags },
      exception: { values: [{ type: (err as any)?.name ?? 'Error', value: String((err as any)?.message ?? err) }] },
    };
    const envelope = `${JSON.stringify({ event_id: event.event_id, sent_at: event.timestamp })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
    fetch(`https://${host}/api/${project}/envelope/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=fitlink-edge/1` },
      body: envelope,
    }).catch(() => {});
  } catch { /* never throw from a reporter */ }
}
