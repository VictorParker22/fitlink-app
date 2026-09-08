import {
  dueFromRequirements, landingAfterStripe, payoutsHeadline, payoutsReady,
  payoutsStateFor, payoutsStateFromStatus,
} from '../lib/payoutsState';

describe('payoutsStateFor', () => {
  it('is not_connected with no trainer row or no Connect account', () => {
    expect(payoutsStateFor(null)).toBe('not_connected');
    expect(payoutsStateFor(undefined)).toBe('not_connected');
    expect(payoutsStateFor({})).toBe('not_connected');
    expect(payoutsStateFor({ stripe_account_id: null, stripe_onboarding_complete: false })).toBe('not_connected');
  });

  it('is in_progress once an account exists but charges are off', () => {
    expect(payoutsStateFor({ stripe_account_id: 'acct_1' })).toBe('in_progress');
    // details_submitted alone is NOT connected: Stripe may still be verifying
    // and create-subscription refuses the charge until charges_enabled.
    expect(payoutsStateFor({ stripe_account_id: 'acct_1', stripe_onboarding_complete: true, stripe_charges_enabled: false })).toBe('in_progress');
    expect(payoutsReady({ stripe_account_id: 'acct_1', stripe_onboarding_complete: true })).toBe(false);
  });

  it('is connected only when charges are enabled', () => {
    expect(payoutsStateFor({ stripe_account_id: 'acct_1', stripe_charges_enabled: true })).toBe('connected');
    expect(payoutsReady({ stripe_account_id: 'acct_1', stripe_charges_enabled: true })).toBe(true);
  });
});

describe('payoutsStateFromStatus', () => {
  const base = { onboardingComplete: false, pendingVerification: false, due: { details: true, bank: true, identity: true } };
  it('maps the server answer', () => {
    expect(payoutsStateFromStatus({ ...base, hasAccount: false, chargesEnabled: false })).toBe('not_connected');
    expect(payoutsStateFromStatus({ ...base, hasAccount: true, chargesEnabled: false })).toBe('in_progress');
    expect(payoutsStateFromStatus({ ...base, hasAccount: true, chargesEnabled: true })).toBe('connected');
  });
});

describe('dueFromRequirements', () => {
  it('folds Stripe requirement keys into the three lines', () => {
    expect(dueFromRequirements([])).toEqual({ details: false, bank: false, identity: false });
    expect(dueFromRequirements(['external_account'])).toEqual({ details: false, bank: true, identity: false });
    expect(dueFromRequirements(['individual.verification.document'])).toEqual({ details: false, bank: false, identity: true });
    expect(dueFromRequirements(['individual.id_number', 'individual.ssn_last_4'])).toEqual({ details: false, bank: false, identity: true });
    expect(dueFromRequirements(['individual.dob.day', 'tos_acceptance.date', 'business_profile.url']))
      .toEqual({ details: true, bank: false, identity: false });
    expect(dueFromRequirements(['external_account', 'individual.verification.document', 'individual.address.line1']))
      .toEqual({ details: true, bank: true, identity: true });
  });
});

describe('landingAfterStripe', () => {
  it('sends a signed-out person to welcome, an athlete home, and a coach to payouts', () => {
    expect(landingAfterStripe('trainer', false)).toBe('/(auth)/welcome');
    expect(landingAfterStripe('client', true)).toBe('/(client-tabs)');
    expect(landingAfterStripe('trainer', true)).toBe('/payouts');
    expect(landingAfterStripe(null, true)).toBe('/payouts');
  });
});

describe('payoutsHeadline', () => {
  it('has one headline per state and a verifying variant', () => {
    expect(payoutsHeadline('not_connected').title).toBe('Where should the money go?');
    expect(payoutsHeadline('in_progress').subtitle).toMatch(/still needs/);
    expect(payoutsHeadline('in_progress', true).subtitle).toMatch(/checking/);
    expect(payoutsHeadline('connected').title).toBe('Payouts are on.');
  });
});
