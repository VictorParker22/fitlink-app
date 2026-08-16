/**
 * Onboarding completion flags — keyed per ACCOUNT, not per device.
 *
 * History, because this bit has bitten twice: the flags were originally
 * device-global (`fitlink_onboarded`). That meant a shared phone leaked one
 * user's completed setup to the next person, so sign-out erased them — which
 * in turn made the SAME user redo the wizard on every login whenever their
 * auth metadata was missing. Keying by user id resolves both: different
 * account, different key.
 *
 * The account's `user_metadata` is still written on completion and is checked
 * as a secondary source (app/_layout.tsx), so a genuinely new device knows too.
 */

// SecureStore rejects any key containing characters outside
// [A-Za-z0-9._-] — a colon separator throws "Invalid key provided to
// SecureStore". Underscore is safe, and UUID hyphens are allowed.
export function onboardedKey(userId: string): string {
  return `fitlink_onboarded_${userId}`;
}

export function clientOnboardedKey(userId: string): string {
  return `fitlink_client_onboarded_${userId}`;
}

/** Pre-per-user keys. Read only to migrate, never written again. */
export const LEGACY_KEYS = [
  'fitlink_onboarded',
  'fitlink_client_onboarded',
  'fitlink_wizard_complete',
];
