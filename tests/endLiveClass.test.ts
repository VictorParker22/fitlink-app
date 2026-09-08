/**
 * Ending a class must survive a network drop: the status write is retried
 * with backoff, and if it still fails the class id is parked for Studio to
 * flush later. It never throws at the caller.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@sentry/react-native', () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn(), captureMessage: jest.fn() }));
jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() }, from: jest.fn() } }));
jest.mock('../lib/entitlement', () => ({ confirmEntitlement: jest.fn(async () => null) }));

import { endLiveClass, getPendingEnd, clearPendingEnd, flushPendingEnd } from '../lib/streamSetup';

const networkFail = () => Promise.reject(new TypeError('Network request failed'));

beforeEach(async () => { await clearPendingEnd(); });

describe('endLiveClass', () => {
  it('confirms on the first success and leaves nothing parked', async () => {
    const update = jest.fn(async () => ({}));
    const r = await endLiveClass('c1', update);
    expect(r.confirmed).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(await getPendingEnd()).toBeNull();
  });

  it('retries transport failures and succeeds when the network returns', async () => {
    const update = jest.fn()
      .mockImplementationOnce(networkFail)
      .mockImplementationOnce(networkFail)
      .mockImplementationOnce(async () => ({}));
    const r = await endLiveClass('c1', update);
    expect(r.confirmed).toBe(true);
    expect(update).toHaveBeenCalledTimes(3);
  }, 15000);

  it('parks the class when every attempt fails, and never throws', async () => {
    const update = jest.fn(networkFail);
    const r = await endLiveClass('c9', update);
    expect(r.confirmed).toBe(false);
    expect(update).toHaveBeenCalledTimes(3);
    expect((await getPendingEnd())?.classId).toBe('c9');
  }, 15000);

  it('flushPendingEnd retries a parked class and clears it on success', async () => {
    await endLiveClass('c9', jest.fn(networkFail));
    const update = jest.fn(async () => ({}));
    expect(await flushPendingEnd(update)).toBeNull();
    expect(update).toHaveBeenCalledWith('c9', { status: 'ended' });
    expect(await getPendingEnd()).toBeNull();
  }, 15000);
});
