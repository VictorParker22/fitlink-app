/**
 * lib/legalLinks.ts — the hosted legal documents, in one place.
 *
 * App Store review (3.1.2) wants a paywall to link to the terms of use and
 * privacy policy as functional links, and the same URLs go into App Store
 * Connect. Keeping them here means the paywalls, the in-app summary screen
 * and any future settings row all point at the same two pages.
 */

export const TERMS_URL = 'https://fitlink.coach/terms';
export const PRIVACY_URL = 'https://fitlink.coach/privacy';
