// Pure helper for confirm-entitlement: turns RevenueCat's subscriber
// entitlement block into the timestamp the DB should hold. No imports so
// jest can test it (tests/confirmEntitlement.test.ts).
//
// Same doctrine as revenuecat-webhook: an active entitlement grants
// expires + 3 days of grace (billing-retry lag), a non-expiring one grants
// a renewal-length window, and a grant only ever moves the stored value
// FORWARD. An expired or absent entitlement never shortens what is stored:
// expiry is the webhook's job (EXPIRATION event), not this endpoint's.

export interface RcEntitlement {
  expires_date?: string | null;
  product_identifier?: string;
  purchase_date?: string;
}

export const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
export const NON_EXPIRING_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;

/** ISO timestamp the entitlement justifies, or null when it grants nothing now. */
export function grantedUntil(ent: RcEntitlement | null | undefined, nowMs: number): string | null {
  if (!ent) return null;
  if (ent.expires_date === null || ent.expires_date === undefined) {
    return new Date(nowMs + NON_EXPIRING_WINDOW_MS).toISOString();
  }
  const exp = Date.parse(ent.expires_date);
  if (!Number.isFinite(exp) || exp <= nowMs) return null;
  return new Date(exp + GRACE_MS).toISOString();
}

/** The value to write, or null when the stored value already covers it. */
export function nextUntil(granted: string | null, currentIso: string | null | undefined): string | null {
  if (!granted) return null;
  const current = currentIso ? Date.parse(currentIso) : 0;
  return Date.parse(granted) > (Number.isFinite(current) ? current : 0) ? granted : null;
}
