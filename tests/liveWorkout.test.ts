/**
 * The workout clock is wall time, never a tick count: an hour away from the
 * app is an hour on the clock. The live-session record survives a relaunch
 * and expires when it is obviously from another day.
 */
import { elapsedSince, remainingUntil, formatElapsed, isLiveWorkoutFresh, saveLiveWorkout, loadLiveWorkout, clearLiveWorkout, LIVE_WORKOUT_MAX_AGE_MS } from '../lib/liveWorkout';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  },
}));

describe('clock math', () => {
  it('derives elapsed from timestamps, so backgrounded time counts', () => {
    const start = 1_700_000_000_000;
    expect(elapsedSince(start, start)).toBe(0);
    expect(elapsedSince(start, start + 24 * 60 * 1000)).toBe(24 * 60);
    expect(elapsedSince(start, start + 61 * 60 * 1000 + 500)).toBe(61 * 60);
    expect(elapsedSince(start, start - 5000)).toBe(0);
  });
  it('counts rest down from its end time and floors at zero', () => {
    const now = 1_700_000_000_000;
    expect(remainingUntil(now + 90_000, now)).toBe(90);
    expect(remainingUntil(now + 1, now)).toBe(1);
    expect(remainingUntil(now - 10_000, now)).toBe(0);
    expect(remainingUntil(null, now)).toBe(0);
  });
  it('formats minutes and hours', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(24 * 60 + 31)).toBe('24:31');
    expect(formatElapsed(3600 + 3 * 60 + 9)).toBe('1:03:09');
  });
});

describe('live record', () => {
  const lw = { clientWorkoutId: 'cw1', workoutId: 'w1', name: 'Lower A', startedAt: Date.now() - 60_000 };
  it('round-trips through storage and clears', async () => {
    await saveLiveWorkout('u1', lw);
    expect(await loadLiveWorkout('u1')).toEqual(lw);
    expect(await loadLiveWorkout('u2')).toBeNull();
    await clearLiveWorkout('u1');
    expect(await loadLiveWorkout('u1')).toBeNull();
  });
  it('treats a session from another day as stale', async () => {
    const old = { ...lw, startedAt: Date.now() - LIVE_WORKOUT_MAX_AGE_MS - 1000 };
    expect(isLiveWorkoutFresh(old)).toBe(false);
    expect(isLiveWorkoutFresh(lw)).toBe(true);
    await saveLiveWorkout('u3', old);
    expect(await loadLiveWorkout('u3')).toBeNull();
  });
});
