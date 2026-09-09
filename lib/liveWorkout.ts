/**
 * liveWorkout — the one session the athlete is in the middle of.
 *
 * Two things went wrong at the gym on 2026-09-08: the workout and rest
 * timers counted ticks, so any time the app spent in the background simply
 * vanished (an hour on the floor read as 24 minutes), and the running session
 * lived only inside the Train tab, so a wrong tap left the athlete with no
 * sign that a workout was still going and no way back to it.
 *
 * So: every clock here is a TIMESTAMP, and elapsed is always derived from the
 * wall clock (`elapsedSince`), never accumulated. And the session itself is a
 * small record persisted per athlete, read by Home and Train to offer the way
 * back, cleared only when the session is finished or abandoned.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LiveWorkout {
  /** client_workouts.id (the session the set logs are keyed under). */
  clientWorkoutId: string;
  /** workouts.id, for reopening the session by id. */
  workoutId: string;
  name: string;
  /** ms since epoch when "Start session" was tapped. */
  startedAt: number;
  source?: 'track' | undefined;
  /** ms since epoch when the current rest ends; null when not resting. */
  restEndsAt?: number | null;
}

const KEY_PREFIX = 'fitlink_live_workout_';
const key = (userId: string) => `${KEY_PREFIX}${userId}`;

/** Whole seconds since `startedAt`, never negative. */
export function elapsedSince(startedAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** Whole seconds left until `endsAt`, never negative; 0 once it has passed. */
export function remainingUntil(endsAt: number | null | undefined, now: number = Date.now()): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** "24:31" or "1:03:09". */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

/** A session older than this is stale, not live: the phone was put away for the night. */
export const LIVE_WORKOUT_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function isLiveWorkoutFresh(lw: LiveWorkout | null | undefined, now: number = Date.now()): lw is LiveWorkout {
  return !!lw && Number.isFinite(lw.startedAt) && now - lw.startedAt >= 0 && now - lw.startedAt < LIVE_WORKOUT_MAX_AGE_MS;
}

export async function saveLiveWorkout(userId: string, lw: LiveWorkout): Promise<void> {
  try { await AsyncStorage.setItem(key(userId), JSON.stringify(lw)); } catch { /* best effort */ }
}

export async function loadLiveWorkout(userId: string): Promise<LiveWorkout | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LiveWorkout;
    if (!parsed || typeof parsed.clientWorkoutId !== 'string' || !Number.isFinite(parsed.startedAt)) return null;
    return isLiveWorkoutFresh(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearLiveWorkout(userId: string): Promise<void> {
  try { await AsyncStorage.removeItem(key(userId)); } catch { /* best effort */ }
}

/** The set logs of the live session ride along so a relaunch restores them. */
const LOGS_PREFIX = 'fitlink_live_logs_';
export async function saveLiveLogs(userId: string, logs: Record<string, unknown>): Promise<void> {
  try { await AsyncStorage.setItem(`${LOGS_PREFIX}${userId}`, JSON.stringify(logs)); } catch { /* best effort */ }
}
export async function loadLiveLogs<T = unknown>(userId: string): Promise<Record<string, T> | null> {
  try {
    const raw = await AsyncStorage.getItem(`${LOGS_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, T> : null;
  } catch {
    return null;
  }
}
export async function clearLiveLogs(userId: string): Promise<void> {
  try { await AsyncStorage.removeItem(`${LOGS_PREFIX}${userId}`); } catch { /* best effort */ }
}
