/**
 * The athlete paywall must never sell the coach product, whatever the
 * RevenueCat dashboard's package layout is. These shapes are the two real
 * ones: the misconfigured dashboard found on 2026-09-06 and the intended one.
 */
import { pickPlan, storeDiagnostic, baseProductId, ALL_PRODUCT_IDS } from '../lib/storePlans';

const pkg = (identifier: string, packageType: string, productId: string) => ({
  identifier,
  packageType,
  product: { identifier: productId },
});

// Everything in `default`, coach products in the standard slots.
const misconfigured = {
  current: {
    identifier: 'default',
    availablePackages: [
      pkg('Annual', 'CUSTOM', 'fitlink_athlete_annual'),
      pkg('Monthly', 'CUSTOM', 'fitlink_athlete_monthly'),
      pkg('$rc_annual', 'ANNUAL', 'fitlink_coach_elite_annual'),
      pkg('$rc_monthly', 'MONTHLY', 'fitlink_coach_elite_monthly'),
    ],
  },
  all: {} as Record<string, any>,
};
misconfigured.all.default = misconfigured.current;

const intended = {
  current: {
    identifier: 'default',
    availablePackages: [
      pkg('$rc_monthly', 'MONTHLY', 'fitlink_athlete_monthly'),
      pkg('$rc_annual', 'ANNUAL', 'fitlink_athlete_annual'),
    ],
  },
  all: {} as Record<string, any>,
};
intended.all.default = intended.current;
intended.all.coach = {
  identifier: 'coach',
  availablePackages: [
    pkg('$rc_monthly', 'MONTHLY', 'fitlink_coach_elite_monthly'),
    pkg('$rc_annual', 'ANNUAL', 'fitlink_coach_elite_annual'),
  ],
};

describe('pickPlan', () => {
  it('gives athletes the athlete products even when the coach products sit in the standard slots', () => {
    const plan = pickPlan(misconfigured, 'athlete', 'default');
    expect(plan.monthly?.product.identifier).toBe('fitlink_athlete_monthly');
    expect(plan.annual?.product.identifier).toBe('fitlink_athlete_annual');
  });

  it('finds the coach products without a coach offering', () => {
    const plan = pickPlan(misconfigured, 'coach', 'coach');
    expect(plan.monthly?.product.identifier).toBe('fitlink_coach_elite_monthly');
    expect(plan.annual?.product.identifier).toBe('fitlink_coach_elite_annual');
  });

  it('works with the intended two-offering layout', () => {
    expect(pickPlan(intended, 'athlete', 'default').monthly?.product.identifier).toBe('fitlink_athlete_monthly');
    expect(pickPlan(intended, 'coach', 'coach').annual?.product.identifier).toBe('fitlink_coach_elite_annual');
  });

  it('falls back to package type only inside the audience offering and never to the other audience product', () => {
    const renamed = {
      current: {
        identifier: 'default',
        availablePackages: [
          pkg('$rc_monthly', 'MONTHLY', 'fitlink_coach_elite_monthly'),
          pkg('$rc_annual', 'ANNUAL', 'some_new_athlete_annual'),
        ],
      },
      all: {} as Record<string, any>,
    };
    renamed.all.default = renamed.current;
    const plan = pickPlan(renamed, 'athlete', 'default');
    expect(plan.monthly).toBeNull();
    expect(plan.annual?.product.identifier).toBe('some_new_athlete_annual');
  });

  it('matches Play base-plan identifiers by their product part', () => {
    expect(baseProductId('fitlink_athlete_monthly:monthly')).toBe('fitlink_athlete_monthly');
    const play = {
      current: null,
      all: {
        default: {
          identifier: 'default',
          availablePackages: [pkg('$rc_monthly', 'MONTHLY', 'fitlink_athlete_monthly:monthly')],
        },
      },
    };
    expect(pickPlan(play, 'athlete', 'default').monthly?.identifier).toBe('$rc_monthly');
  });

  it('returns empty plans for no offerings', () => {
    expect(pickPlan(null, 'athlete', 'default')).toEqual({ monthly: null, annual: null });
  });
});

describe('storeDiagnostic', () => {
  it('names the region and the fetch count', () => {
    const line = storeDiagnostic({ country: 'US', canPay: true, tried: ALL_PRODUCT_IDS, fetched: [] });
    expect(line).toContain('Store region: US');
    expect(line).toContain('returned 0 of 4');
  });

  it('lists what is missing when some products came back', () => {
    const line = storeDiagnostic({ country: 'CA', tried: ALL_PRODUCT_IDS, fetched: ['fitlink_athlete_monthly', 'fitlink_athlete_annual'] });
    expect(line).toContain('returned 2 of 4');
    expect(line).toContain('missing: fitlink_coach_elite_monthly, fitlink_coach_elite_annual');
  });

  it('says when the device cannot pay and when lookup failed', () => {
    const line = storeDiagnostic({ country: null, canPay: false, tried: ALL_PRODUCT_IDS, fetched: null });
    expect(line).toContain('Store region: unknown');
    expect(line).toContain('cannot make payments');
    expect(line).toContain('product lookup failed');
  });
});
