/**
 * lib/storePlans.ts — which store package is the athlete's, which is the coach's.
 *
 * Pure, no SDK import, so it runs in jest.
 *
 * Why this exists: the paywalls used to pick "the MONTHLY package of the
 * default offering". The RevenueCat dashboard can (and on 2026-09-06 did)
 * carry the COACH Elite products in the default offering's standard monthly
 * and annual slots, with the athlete products under custom package names.
 * Picking by package type then sold an athlete the coach product and the
 * wrong entitlement. Product identifiers are the only stable contract, so
 * every plan is picked by product identifier first, across every offering,
 * and only then by package type inside the audience's own offering — never a
 * product known to belong to the other audience.
 */

export type PlanAudience = 'athlete' | 'coach';

export const PRODUCT_IDS = {
  athlete: { monthly: 'fitlink_athlete_monthly', annual: 'fitlink_athlete_annual' },
  coach: { monthly: 'fitlink_coach_elite_monthly', annual: 'fitlink_coach_elite_annual' },
} as const;

export const ALL_PRODUCT_IDS: string[] = [
  PRODUCT_IDS.athlete.monthly,
  PRODUCT_IDS.athlete.annual,
  PRODUCT_IDS.coach.monthly,
  PRODUCT_IDS.coach.annual,
];

/** The structural slice of a RevenueCat package this module reads. */
export interface PlanPackage {
  identifier: string;
  packageType: string;
  product: { identifier: string };
}

export interface PlanOffering<P extends PlanPackage> {
  identifier: string;
  availablePackages: P[];
}

export interface PlanOfferings<P extends PlanPackage> {
  current: PlanOffering<P> | null;
  all: Record<string, PlanOffering<P>>;
}

export interface StorePlan<P extends PlanPackage> {
  monthly: P | null;
  annual: P | null;
}

/** Play subscriptions arrive as `product:basePlan`; the store product is the part before the colon. */
export function baseProductId(identifier: string): string {
  const i = identifier.indexOf(':');
  return i === -1 ? identifier : identifier.slice(0, i);
}

const OTHER: Record<PlanAudience, PlanAudience> = { athlete: 'coach', coach: 'athlete' };

function belongsTo(audience: PlanAudience, productId: string): boolean {
  const ids = PRODUCT_IDS[audience];
  const base = baseProductId(productId);
  return base === ids.monthly || base === ids.annual;
}

export function pickPlan<P extends PlanPackage>(
  offerings: PlanOfferings<P> | null | undefined,
  audience: PlanAudience,
  audienceOfferingId: string,
): StorePlan<P> {
  if (!offerings) return { monthly: null, annual: null };

  const everyPackage: P[] = [];
  const seen = new Set<string>();
  const offeringList = Object.values(offerings.all ?? {});
  if (offerings.current && !offeringList.includes(offerings.current)) offeringList.unshift(offerings.current);
  for (const offering of offeringList) {
    for (const pkg of offering?.availablePackages ?? []) {
      const key = `${offering.identifier}/${pkg.identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      everyPackage.push(pkg);
    }
  }

  const want = PRODUCT_IDS[audience];
  const byProduct = (id: string) =>
    everyPackage.find((p) => baseProductId(p.product.identifier) === id) ?? null;

  let monthly = byProduct(want.monthly);
  let annual = byProduct(want.annual);
  if (monthly || annual) return { monthly, annual };

  // Fallback: package type inside the audience's own offering, skipping any
  // product that is known to be the other audience's.
  const own =
    offerings.all?.[audienceOfferingId] ??
    (audience === 'athlete' ? offerings.current : null) ??
    null;
  const safe = (own?.availablePackages ?? []).filter(
    (p) => !belongsTo(OTHER[audience], p.product.identifier),
  );
  monthly = safe.find((p) => p.packageType === 'MONTHLY') ?? null;
  annual = safe.find((p) => p.packageType === 'ANNUAL') ?? null;
  return { monthly, annual };
}

/**
 * One line the paywall can show when the store returns nothing, built from
 * what the phone could find out. Every input is optional because each probe
 * can fail on its own.
 */
export function storeDiagnostic(input: {
  country?: string | null;
  canPay?: boolean | null;
  tried: string[];
  fetched?: string[] | null;
}): string {
  const parts: string[] = [];
  parts.push(input.country ? `Store region: ${input.country}` : 'Store region: unknown');
  if (input.canPay === false) parts.push('this device cannot make payments (restrictions or no store account)');
  if (input.fetched) {
    const got = new Set(input.fetched.map(baseProductId));
    const missing = input.tried.filter((id) => !got.has(id));
    parts.push(`StoreKit returned ${got.size} of ${input.tried.length} products`);
    if (missing.length && got.size > 0) parts.push(`missing: ${missing.join(', ')}`);
  } else {
    parts.push('product lookup failed');
  }
  return parts.join(' · ');
}
