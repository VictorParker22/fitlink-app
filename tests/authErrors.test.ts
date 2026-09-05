/**
 * Every auth screen shows the person one sentence they can act on, and a
 * sign-up that never left the phone gets a second try before it is reported.
 * These pin the shapes @supabase/auth-js and PostgREST actually produce.
 */
import {
  CONNECTION_MESSAGE,
  RATE_LIMIT_MESSAGE,
  friendlyAuthError,
  isRateLimited,
  isTransportError,
  withNetworkRetry,
} from '../lib/authErrors';

/** The wrapper auth-js puts around a thrown fetch. */
function retryableFetchError(message = 'Network request failed') {
  const e = new Error(message) as Error & { status: number; code?: string };
  e.name = 'AuthRetryableFetchError';
  e.status = 0;
  return e;
}

/** A real server answer. */
function authApiError(message: string, status: number, code?: string) {
  const e = new Error(message) as Error & { status: number; code?: string };
  e.name = 'AuthApiError';
  e.status = status;
  e.code = code;
  return e;
}

describe('isTransportError', () => {
  it('recognises the auth-js fetch wrapper', () => {
    expect(isTransportError(retryableFetchError())).toBe(true);
  });
  it('recognises a functions-js fetch failure and an aborted request', () => {
    const fn = Object.assign(new Error('Failed to send a request to the Edge Function'), { name: 'FunctionsFetchError' });
    const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    expect(isTransportError(fn)).toBe(true);
    expect(isTransportError(abort)).toBe(true);
  });
  it('treats status 0 as no answer from the server', () => {
    expect(isTransportError({ status: 0, message: 'anything' })).toBe(true);
  });
  it('recognises the non-throwing PostgREST shape by message', () => {
    expect(isTransportError({ message: 'TypeError: Network request failed' })).toBe(true);
  });
  it('does not flag a real server rejection', () => {
    expect(isTransportError(authApiError('User already registered', 422, 'user_already_exists'))).toBe(false);
    expect(isTransportError(null)).toBe(false);
    expect(isTransportError(undefined)).toBe(false);
  });
});

describe('isRateLimited', () => {
  it('matches 429 and the rate-limit codes', () => {
    expect(isRateLimited(authApiError('Request rate limit reached', 429, 'over_request_rate_limit'))).toBe(true);
    expect(isRateLimited(authApiError('Email rate limit exceeded', 429, 'over_email_send_rate_limit'))).toBe(true);
    expect(isRateLimited(authApiError('SMS rate limit exceeded', 429, 'over_sms_send_rate_limit'))).toBe(true);
    expect(isRateLimited({ message: 'Email rate limit exceeded' })).toBe(true);
  });
  it('does not match other 4xx answers', () => {
    expect(isRateLimited(authApiError('Invalid login credentials', 400, 'invalid_credentials'))).toBe(false);
  });
});

describe('friendlyAuthError', () => {
  it('turns every transport shape into the connection line', () => {
    expect(friendlyAuthError(retryableFetchError(), 'fallback')).toBe(CONNECTION_MESSAGE);
    expect(friendlyAuthError({ message: 'TypeError: Network request failed' }, 'fallback')).toBe(CONNECTION_MESSAGE);
    expect(friendlyAuthError({ status: 0 }, 'fallback')).toBe(CONNECTION_MESSAGE);
  });
  it('turns a 429 or a rate-limit code into the wait line', () => {
    expect(friendlyAuthError(authApiError('x', 429), 'fallback')).toBe(RATE_LIMIT_MESSAGE);
    expect(friendlyAuthError(authApiError('SMS rate limit exceeded', 400, 'over_sms_send_rate_limit'), 'fallback')).toBe(RATE_LIMIT_MESSAGE);
  });
  it('maps the known auth codes to plain sentences', () => {
    expect(friendlyAuthError(authApiError('User already registered', 422, 'user_already_exists'), 'f')).toMatch(/Sign in instead/);
    expect(friendlyAuthError(authApiError('Password is too weak', 422, 'weak_password'), 'f')).toMatch(/password/i);
    expect(friendlyAuthError(authApiError('Invalid login credentials', 400, 'invalid_credentials'), 'f')).toMatch(/don't match/);
    expect(friendlyAuthError(authApiError('Token has expired or is invalid', 403, 'otp_expired'), 'f')).toMatch(/expired/);
    expect(friendlyAuthError(authApiError('Email not confirmed', 400, 'email_not_confirmed'), 'f')).toMatch(/Confirm your email/);
    expect(friendlyAuthError(authApiError('Unable to validate email address: invalid format', 400, 'validation_failed'), 'f')).toMatch(/valid email or phone/);
  });
  it('maps the same failures when only a message is present', () => {
    expect(friendlyAuthError({ message: 'User already registered' }, 'f')).toMatch(/Sign in instead/);
    expect(friendlyAuthError({ message: 'Invalid login credentials' }, 'f')).toMatch(/don't match/);
  });
  it('shows an unknown server message by default and the fallback when raw text is hidden', () => {
    const odd = authApiError('Database error saving new user', 500, 'unexpected_failure');
    expect(friendlyAuthError(odd, 'Something went wrong.')).toBe('Database error saving new user');
    expect(friendlyAuthError(odd, 'Something went wrong.', { exposeRaw: false })).toBe('Something went wrong.');
    expect(friendlyAuthError(new Error(''), 'Something went wrong.')).toBe('Something went wrong.');
    expect(friendlyAuthError(undefined, 'Something went wrong.')).toBe('Something went wrong.');
  });
});

describe('withNetworkRetry', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('retries once after a transport failure and returns the second result', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(retryableFetchError())
      .mockResolvedValueOnce('ok');
    const p = withNetworkRetry(fn, { delayMs: 800 });
    await jest.advanceTimersByTimeAsync(800);
    await expect(p).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never retries a real server answer', async () => {
    const rejection = authApiError('User already registered', 422, 'user_already_exists');
    const fn = jest.fn().mockRejectedValue(rejection);
    await expect(withNetworkRetry(fn)).rejects.toBe(rejection);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after two attempts and throws the last transport error', async () => {
    const fn = jest.fn().mockRejectedValue(retryableFetchError());
    const p = withNetworkRetry(fn, { delayMs: 800 });
    // Attach the rejection handler before the timers run so nothing is unhandled.
    const outcome = expect(p).rejects.toMatchObject({ name: 'AuthRetryableFetchError' });
    await jest.advanceTimersByTimeAsync(800);
    await outcome;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries a Supabase call that resolves with a transport error and hands back the last result', async () => {
    const offline = { data: null, error: retryableFetchError() };
    const fn = jest.fn().mockResolvedValue(offline);
    const p = withNetworkRetry(fn, { delayMs: 800 });
    await jest.advanceTimersByTimeAsync(800);
    await expect(p).resolves.toBe(offline);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a resolved server rejection', async () => {
    const taken = { data: null, error: authApiError('User already registered', 422, 'user_already_exists') };
    const fn = jest.fn().mockResolvedValue(taken);
    await expect(withNetworkRetry(fn)).resolves.toBe(taken);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
