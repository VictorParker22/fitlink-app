/**
 * Offline snapshot cache — a tiny versioned layer over AsyncStorage.
 *
 * Contexts save their last-known-good server data here after every successful
 * fetch, and hydrate from it on sign-in so screens render instantly (and keep
 * rendering in airplane mode). Data stored here WAS real server data — it is
 * never fabricated — callers that surface it while offline should label
 * staleness honestly (see components/OfflineBanner.tsx).
 *
 * Keys are namespaced per user id so two accounts on one device never see
 * each other's cache. Bump VERSION to invalidate all snapshots after a
 * breaking shape change.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const VERSION = 'v1';
const PREFIX = `fitlink.snap.${VERSION}`;

const snapshotKey = (userId: string, name: string) => `${PREFIX}.${userId}.${name}`;

/** Persist a snapshot. Fire-and-forget safe — never throws. */
export async function saveSnapshot(userId: string | null | undefined, name: string, data: unknown): Promise<void> {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(snapshotKey(userId, name), JSON.stringify(data));
  } catch {
    // Storage full / serialization failure — silently skip, cache is best-effort.
  }
}

/** Load a snapshot, or null when missing/corrupt. Never throws. */
export async function loadSnapshot<T>(userId: string | null | undefined, name: string): Promise<T | null> {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(snapshotKey(userId, name));
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Remove every snapshot belonging to a user.
 *
 * Called from `signOut` in context/AuthContext.tsx (and it must stay called
 * there). AsyncStorage is PLAIN, unencrypted device storage, and these
 * snapshots are not innocuous: they hold an athlete's `assessment_data`
 * (health intake), emails and phone numbers, message previews, and a coach's
 * entire client roster. Without this, all of it outlives the session and the
 * next person to use a shared device can read it out.
 *
 * Never throws — a storage failure must not be able to abort a sign-out.
 * Returns false when the clear did not complete, so the caller can say so
 * honestly rather than assume it worked.
 */
export async function clearSnapshots(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return true;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(`${PREFIX}.${userId}.`));
    if (mine.length) await AsyncStorage.multiRemove(mine);
    return true;
  } catch (e) {
    // Not swallowed: PII is still on disk after this. Surface it in dev — in
    // production there is no safe UI for it mid-sign-out, and failing the
    // sign-out would be strictly worse.
    if (__DEV__) console.warn('[offlineCache] clearSnapshots failed — cached PII may remain on device:', e);
    return false;
  }
}
