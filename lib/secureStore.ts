/**
 * lib/secureStore.ts — one platform-aware wrapper around expo-secure-store.
 *
 * WHY THIS EXISTS. `expo-secure-store` has no web implementation: on web its
 * native module resolves to an object without the methods, so the first call
 * throws `ExpoSecureStore.default.getValueWithKeyAsync is not a function`.
 * That is a RUNTIME failure, not a bundling one — the web build compiled
 * perfectly and then rendered a blank screen, because the very first thing
 * `app/_layout.tsx` does on launch is read the onboarding flags.
 *
 * Ten modules called SecureStore directly and only `lib/supabase.ts` had a
 * web branch. Rather than ten copies of the same `Platform.OS === 'web'`
 * check — nine of which would be forgotten by the next person — the branch
 * lives here once.
 *
 * HONEST ABOUT THE GUARANTEE. On native this is the iOS Keychain / Android
 * Keystore: encrypted at rest, isolated per app. On web it is `localStorage`,
 * which is readable by any script running on the origin. That is a genuine
 * downgrade, not an equivalent — it is accepted because the browser offers no
 * keychain, and it is why the web build must keep its strict CSP and its
 * zero-WebView / zero-eval posture. Anything that would be catastrophic in
 * localStorage should not be stored client-side on web at all.
 *
 * API-compatible with expo-secure-store's three common calls, so call sites
 * change only their import.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

/** localStorage is unavailable in SSR and can throw in private-mode Safari. */
function webStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb) {
    const s = webStorage();
    return s ? s.getItem(key) : null;
  }
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb) {
    const s = webStorage();
    // Quota errors must not take down the caller — a preference that fails to
    // persist is a nuisance; an unhandled throw mid-sign-in is a broken app.
    try { s?.setItem(key, value); } catch { /* quota / disabled storage */ }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb) {
    const s = webStorage();
    try { s?.removeItem(key); } catch { /* disabled storage */ }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/**
 * SecureStore rejects any key containing characters outside [A-Za-z0-9._-]
 * — a colon throws "Invalid key provided to SecureStore", which is a bug this
 * codebase has already shipped once (see lib/onboardingFlags.ts). localStorage
 * has no such restriction, so a key that works on web can still fail on
 * native; keep native's rule everywhere so the platforms cannot diverge.
 */
export function isValidKey(key: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(key);
}
