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
 * 4. Create an Offering called "default" with packages:
 *      • $monthly  → monthly product
 *      • $annual   → annual product
 *
 * ── Product IDs (configure in App Store Connect / Google Play) ───────────────
 *   fitlink_client_monthly   — $19.99/mo
 *   fitlink_client_annual    — $149.99/yr  (save 37%)
 *   fitlink_coach_monthly    — $39.99/mo
 *   fitlink_coach_annual     — $299.99/yr  (save 37%)
 */

import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform, NativeModules } from 'react-native';

// ─── API Keys ─────────────────────────────────────────────────────────────────
// Replace these with your real keys from app.revenuecat.com → Project Settings → API Keys
const RC_IOS_KEY     = 'appl_REPLACE_WITH_YOUR_IOS_KEY';
const RC_ANDROID_KEY = 'goog_REPLACE_WITH_YOUR_ANDROID_KEY';

// ─── Entitlement Identifiers ──────────────────────────────────────────────────
// Must match EXACTLY what you create in the RC dashboard
export const ENTITLEMENT_CLIENT_PREMIUM = 'client_premium';
export const ENTITLEMENT_COACH_ELITE    = 'coach_elite';

// ─── Offering Identifiers ─────────────────────────────────────────────────────
export const OFFERING_DEFAULT = 'default';

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
