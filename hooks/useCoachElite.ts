/**
 * hooks/useCoachElite.ts — is this coach Elite, for gating coach-side UI.
 *
 * Two sources, either is enough:
 *  - RevenueCat's customer info on the device (`isCoachElite`), the fastest
 *    signal right after a purchase;
 *  - the server's `trainers.elite_until`, written by the RevenueCat webhook
 *    and by confirm-entitlement. The server enforces every paid gate with
 *    this column anyway, so a coach the server considers Elite must never be
 *    shown a paywall because the device's RevenueCat cache lagged (2026-09-07:
 *    Elite "disappeared" after a relaunch while the server still granted it).
 */
import { useApp } from '../context/AppContext';
import { useRevenueCat } from '../context/RevenueCatContext';

export function eliteUntilActive(eliteUntil: string | null | undefined, nowMs = Date.now()): boolean {
  if (!eliteUntil) return false;
  const t = Date.parse(eliteUntil);
  return Number.isFinite(t) && t > nowMs;
}

export function useCoachElite(): boolean {
  const { isCoachElite } = useRevenueCat();
  const { trainer } = useApp();
  return isCoachElite || eliteUntilActive((trainer as { elite_until?: string | null } | null)?.elite_until);
}
