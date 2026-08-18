/**
 * lib/revenuecat.ts
 * RevenueCat singleton — initializes the SDK and exports constants.
 *
 * ── Setup ────────────────────────────────────────────────────────────────────
 * 1. Create a RevenueCat project at app.revenuecat.com
 * 2. Add your iOS + Android API keys below (replace the placeholders)
 * 3. Create two Entitlements in the RC dashboard:
 *      • "client_premium"  → client monthly/annual subscriptions
 *      • "coach_elite"     → coach Elite tier subscriptions
 * 4. Offerings (one per audience — a single offering cannot carry two
 *    different monthly products):
 *      • "default" → athlete pass:  fitlink_athlete_monthly / fitlink_athlete_annual
 *      • "coach"   → coach elite:   fitlink_coach_elite_monthly / fitlink_coach_elite_annual
 *
 * ── Live products (App Store Connect, created 2026-08-18) ────────────────────
 *   fitlink_athlete_monthly      $19.99/mo   (7-day trial)   → client_premium
 *   fitlink_athlete_annual       $149.99/yr  (7-day trial)   → client_premium
 *   fitlink_coach_elite_monthly  $29.99/mo                   → coach_elite
 *   fitlink_coach_elite_annual   $249/yr                     → coach_elite
 * Prices are documentation only — the app renders priceString from the
 * offering exclusively, never these numbers.
 */

// Platform-split SDK: the base module is web-safe, `.native.ts` carries the
// real package. react-native-purchases cannot be imported on web at all.
import { Purchases, LOG_LEVEL } from './revenuecat-sdk';
import { Platform, NativeModules } from 'react-native';

// ─── API Keys ─────────────────────────────────────────────────────────────────
// Replace these with your real keys from app.revenuecat.com → Project Settings → API Keys
const RC_IOS_KEY     = 'appl_uxVliITLpaYeSvYwsXSnkeGIkAg';
const RC_ANDROID_KEY = 'goog_REPLACE_WITH_YOUR_ANDROID_KEY';

// ─── Entitlement Identifiers ──────────────────────────────────────────────────
// Must match EXACTLY what you create in the RC dashboard
export const ENTITLEMENT_CLIENT_PREMIUM = 'client_premium';
export const ENTITLEMENT_COACH_ELITE    = 'coach_elite';

// ─── Offering Identifiers ─────────────────────────────────────────────────────
export const OFFERING_DEFAULT = 'default';
export const OFFERING_COACH   = 'coach';

// ─── Native module guard ──────────────────────────────────────────────────────
// react-native-purchases requires a custom dev build with native code compiled in.
// In Expo Go or an old dev client the native module will be null — guard every call.
export const isRevenueCatAvailable = !!NativeModules.RNPurchases;

// ─── Initialize ───────────────────────────────────────────────────────────────
let initialized = false;

export function initRevenueCat(userId?: string) {
  if (!isRevenueCatAvailable) {
    if (__DEV__) {
      console.warn(
        '[RevenueCat] Native module not found — rebuild the dev client with:\n' +
        '  npx expo run:ios  OR  npx expo run:android\n' +
        'RevenueCat features will be disabled until then.'
      );
    }
    return;
  }

  if (initialized) return;

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  const apiKey = Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY;
  Purchases.configure({ apiKey, appUserID: userId ?? null });
  initialized = true;

  if (__DEV__) {
    console.log(`[RevenueCat] Initialized for ${Platform.OS} — user: ${userId ?? 'anonymous'}`);
  }
}

export { Purchases };
