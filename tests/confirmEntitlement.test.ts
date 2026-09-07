/**
 * confirm-entitlement must grant exactly what RevenueCat's subscriber record
 * justifies, with the webhook's grace, and never move a stored expiry back.
 */
import { grantedUntil, nextUntil, GRACE_MS, NON_EXPIRING_WINDOW_MS } from '../supabase/functions/confirm-entitlement/compute';

const NOW = Date.parse('2026-09-07T12:00:00Z');

describe('grantedUntil', () => {
  it('adds the grace window to a future expiry', () => {
    const exp = '2026-10-07T12:00:00Z';
    expect(grantedUntil({ expires_date: exp }, NOW)).toBe(new Date(Date.parse(exp) + GRACE_MS).toISOString());
  });

  it('grants a renewal-length window for a non-expiring entitlement', () => {
    expect(grantedUntil({ expires_date: null }, NOW)).toBe(new Date(NOW + NON_EXPIRING_WINDOW_MS).toISOString());
  });

  it('grants nothing for an expired, malformed or missing entitlement', () => {
    expect(grantedUntil({ expires_date: '2026-09-01T00:00:00Z' }, NOW)).toBeNull();
    expect(grantedUntil({ expires_date: 'garbage' }, NOW)).toBeNull();
    expect(grantedUntil(undefined, NOW)).toBeNull();
  });
});

describe('nextUntil', () => {
  it('writes when the grant is later than what is stored', () => {
    expect(nextUntil('2026-10-10T12:00:00.000Z', '2026-09-20T00:00:00Z')).toBe('2026-10-10T12:00:00.000Z');
    expect(nextUntil('2026-10-10T12:00:00.000Z', null)).toBe('2026-10-10T12:00:00.000Z');
  });

  it('never shortens a longer stored expiry', () => {
    expect(nextUntil('2026-10-10T12:00:00.000Z', '2027-09-04T00:00:00Z')).toBeNull();
  });

  it('writes nothing when there is no grant', () => {
    expect(nextUntil(null, null)).toBeNull();
  });
});
