/**
 * authErrors — turns a Supabase auth failure into a plain sentence and gives
 * the sign-up calls one retry when the phone simply could not reach the
 * server.
 *
 * Why this exists: the 2026-09-04 device pass showed "Network request
 * failed" on the athlete sign-up screen. The auth logs had no request at
 * all, so the fetch never left the phone, and the app repeated the raw fetch
 * error back to the athlete. Every auth screen now goes through here.
 *
 * Shapes this has to recognise (checked against @supabase/auth-js 2.x):
 *   - A thrown fetch is wrapped as AuthRetryableFetchError: name set, status
 *     0, message "Network request failed".
 *   - AuthApiError carries .code (user_already_exists, weak_password,
 *     invalid_credentials, otp_expired, over_email_send_rate_limit,
 *     over_sms_send_rate_limit, email_not_confirmed, validation_failed) and
 *     .status (429 for the rate limits). Older GoTrue builds send the same
 *     failures with a message only, so the message is matched as a fallback.
 *   - PostgREST and RPC calls do not throw. They resolve with an error whose
 *     message reads "TypeError: Network request failed".
 *   - functions-js throws FunctionsFetchError when the function is unreachable.
 *   - An aborted fetch is a DOMException named AbortError.
 *
 * Pure: no React, no Supabase import, so it is unit tested directly.
 */

export const CONNECTION_MESSAGE = "Couldn't reach FitLink. Check your connection and try again.";
export const RATE_LIMIT_MESSAGE = 'Too many attempts. Wait a few minutes and try again.';

/**
 * Same heuristic as isNetworkError in lib/outbox.ts. It lives there for the
 * chat outbox; it is copied rather than imported so this module stays free
 * of AsyncStorage and can run in any test.
 */
const TRANSPORT_MESSAGE = /network|failed to fetch|fetch failed|timeout|timed out|connection|socket|offline|abort/i;

const TRANSPORT_NAMES = new Set(['AuthRetryableFetchError', 'FunctionsFetchError', 'AbortError']);

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
};

function asErrorLike(err: unknown): ErrorLike {
  if (err && typeof err === 'object') return err as ErrorLike;
  return { message: err };
}

function messageOf(err: unknown): string {
  const e = asErrorLike(err);
  return typeof e.message === 'string' ? e.message : '';
}

function codeOf(err: unknown): string {
  const e = asErrorLike(err);
  return typeof e.code === 'string' ? e.code : '';
}

function statusOf(err: unknown): number | undefined {
  const e = asErrorLike(err);
  return typeof e.status === 'number' ? e.status : undefined;
}

/** True when the request never got an answer from the server. */
export function isTransportError(err: unknown): boolean {
  if (err == null) return false;
  const e = asErrorLike(err);
  if (typeof e.name === 'string' && TRANSPORT_NAMES.has(e.name)) return true;
  if (statusOf(err) === 0) return true;
  return TRANSPORT_MESSAGE.test(messageOf(err));
}

/** True when the server answered 429 or named a send/sign-in rate limit. */
export function isRateLimited(err: unknown): boolean {
  if (err == null) return false;
  if (statusOf(err) === 429) return true;
  if (/rate_limit/i.test(codeOf(err))) return true;
  return /rate limit/i.test(messageOf(err));
}

type KnownCode =
  | 'user_already_exists'
  | 'weak_password'
  | 'invalid_credentials'
  | 'otp_expired'
  | 'email_not_confirmed'
  | 'validation_failed';

const KNOWN_COPY: Record<KnownCode, string> = {
  user_already_exists: 'That email already has an account. Sign in instead.',
  weak_password: 'That password is too easy to guess. Use at least 6 characters.',
  invalid_credentials: "That email and password don't match.",
  otp_expired: 'That code has expired. Send a new one.',
  email_not_confirmed: 'Confirm your email first. The link is in your inbox.',
  validation_failed: "That doesn't look like a valid email or phone number.",
};

/** Message-only fallbacks for servers that send no error code. */
const MESSAGE_TO_CODE: [RegExp, KnownCode][] = [
  [/already (registered|exists)|already has an account/i, 'user_already_exists'],
  [/weak password|password should be|password is too/i, 'weak_password'],
  [/invalid login credentials|invalid credentials/i, 'invalid_credentials'],
  [/token has expired|otp expired|code has expired/i, 'otp_expired'],
  [/email not confirmed/i, 'email_not_confirmed'],
  [/unable to validate|validation failed|invalid format/i, 'validation_failed'],
];

function knownCode(err: unknown): KnownCode | null {
  const code = codeOf(err);
  if (code in KNOWN_COPY) return code as KnownCode;
  // Weak-password failures come as AuthWeakPasswordError with code
  // 'weak_password', already covered above; the message match handles the
  // older builds.
  const msg = messageOf(err);
  for (const [re, mapped] of MESSAGE_TO_CODE) {
    if (re.test(msg)) return mapped;
  }
  return null;
}

export type FriendlyAuthErrorOptions = {
  /**
   * When true (the default) an unrecognised error shows its own message so
   * a real server rejection is never hidden. Pass false on paths whose raw
   * text is not for the person holding the phone (RPC internals, "Not
   * authenticated").
   */
  exposeRaw?: boolean;
};

/**
 * One sentence the person can act on. Order matters: a transport failure is
 * checked first because a wrapped fetch error carries no code, then rate
 * limits, then the codes the auth screens can do something about.
 */
export function friendlyAuthError(err: unknown, fallback: string, opts: FriendlyAuthErrorOptions = {}): string {
  const exposeRaw = opts.exposeRaw ?? true;
  if (isTransportError(err)) return CONNECTION_MESSAGE;
  if (isRateLimited(err)) return RATE_LIMIT_MESSAGE;
  const code = knownCode(err);
  if (code) return KNOWN_COPY[code];
  const raw = messageOf(err).trim();
  if (exposeRaw && raw) return raw;
  return fallback;
}

export type NetworkRetryOptions = {
  /** Extra attempts after the first. Default 1. */
  retries?: number;
  /** Pause before each extra attempt. Default 800 ms. */
  delayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` again, once by default, when it failed because the phone could
 * not reach the server. Anything the server actually said (an AuthApiError,
 * a rate limit, a validation failure) is thrown straight through.
 *
 * Works for both call shapes: a function that throws, and a Supabase call
 * that resolves with `{ error }`. In the second case a transport error in
 * the resolved object triggers the retry; once the attempts are used up the
 * last result is returned as-is so callers keep their `{ error }` check.
 */
export async function withNetworkRetry<T>(fn: () => Promise<T>, opts: NetworkRetryOptions = {}): Promise<T> {
  const retries = Math.max(0, opts.retries ?? 1);
  const delayMs = Math.max(0, opts.delayMs ?? 800);
  let attempt = 0;
  for (;;) {
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      if (attempt >= retries || !isTransportError(err)) throw err;
      attempt += 1;
      await sleep(delayMs);
      continue;
    }
    const resolvedError = (result as { error?: unknown } | null | undefined)?.error;
    if (resolvedError && attempt < retries && isTransportError(resolvedError)) {
      attempt += 1;
      await sleep(delayMs);
      continue;
    }
    return result;
  }
}
