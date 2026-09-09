/**
 * nav — going back means the screen you were on.
 *
 * A screen reached from a push, a deep link or a cold start has no history
 * behind it; `router.back()` there does nothing (or lands somewhere
 * arbitrary). Every "Go back" control goes through here: real history when
 * there is any, otherwise the caller's stated home.
 */
import type { Router } from 'expo-router';

export function goBackOr(router: Router, fallback: string): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as any);
}

export const COACH_HOME = '/(tabs)';
export const ATHLETE_HOME = '/(client-tabs)';
