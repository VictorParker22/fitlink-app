// Platform-aware wrapper: expo-secure-store has NO web implementation and
// throws on first call. See ./secureStore.ts.
import * as SecureStore from './secureStore';

/**
 * "Do not disturb" for Studio — the app can only control its OWN
 * notifications (it can't silence real phone calls, which is what the
 * label used to imply). When on, FitLink suppresses its own push/local
 * notification sound + banner; badge/list delivery is untouched so nothing
 * is actually lost, just quiet during a broadcast.
 */

const KEY = 'fitlink_broadcast_dnd';
let enabled = false;
const listeners = new Set<(v: boolean) => void>();

export function isBroadcastDndEnabled() {
  return enabled;
}

export async function loadBroadcastDnd(): Promise<boolean> {
  const saved = await SecureStore.getItemAsync(KEY);
  enabled = saved === 'true';
  return enabled;
}

export async function setBroadcastDnd(value: boolean) {
  enabled = value;
  await SecureStore.setItemAsync(KEY, value ? 'true' : 'false');
  listeners.forEach((l) => l(value));
}

export function subscribeBroadcastDnd(listener: (v: boolean) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
