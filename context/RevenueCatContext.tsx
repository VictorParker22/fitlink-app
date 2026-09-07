/**
 * context/RevenueCatContext.tsx
 *
 * Global subscription state for both clients and coaches.
 *
 * Exposes:
 *   isClientPremium   — client has active "client_premium" entitlement
 *   isCoachElite      — coach has active "coach_elite" entitlement
 *   offerings         — current RC offerings (packages with prices)
 *   customerInfo      — raw RC CustomerInfo object
 *   purchasePackage   — buy a specific package
 *   restorePurchases  — restore prior purchases (required by App Store guidelines)
 *   isLoading         — initial fetch in progress
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type PropsWithChildren,
} from 'react';
import * as Haptics from 'expo-haptics';
// PURCHASES_ERROR_CODE is a runtime enum, so it comes from the platform-split
// module (base = web-safe stub, `.native.ts` = the real SDK). The rest are
// types and are erased at compile time.
import { PURCHASES_ERROR_CODE } from '../lib/revenuecat-sdk';
import type {
  PurchasesPackage,
  CustomerInfo,
} from '../lib/revenuecat-sdk';
import {
  Purchases,
  initRevenueCat,
  isRevenueCatAvailable,
  ENTITLEMENT_CLIENT_PREMIUM,
  ENTITLEMENT_COACH_ELITE,
  OFFERING_DEFAULT,
  OFFERING_COACH,
} from '../lib/revenuecat';
import { pickPlan, storeDiagnostic, ALL_PRODUCT_IDS, type StorePlan } from '../lib/storePlans';
import { confirmEntitlement } from '../lib/entitlement';
import { useAuth } from './AuthContext';

/**
 * The RevenueCat identity MUST equal the signed-in Supabase user id, always.
 * On 2026-09-07 an athlete's purchase was credited to the coach account that
 * had signed out minutes earlier, because the SDK kept the previous identity.
 * Every purchase and restore goes through this first; sign-out resets to a
 * fresh anonymous id so nothing can carry over.
 */
async function ensureIdentity(userId: string | undefined): Promise<void> {
  if (!isRevenueCatAvailable) return;
  const current = await Purchases.getAppUserID().catch(() => '');
  if (userId) {
    if (current !== userId) await Purchases.logIn(userId);
    return;
  }
  const anonymous = await Purchases.isAnonymous().catch(() => true);
  if (!anonymous) await Purchases.logOut().catch(() => {});
}

/** A plan is the pair of packages one audience can buy. */
export type Plan = StorePlan<PurchasesPackage>;
const EMPTY_PLAN: Plan = { monthly: null, annual: null };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * When the store hands back nothing, ask the phone what it can see: its
 * storefront country, whether it may pay at all, and which of our product
 * identifiers StoreKit/Play actually return. Each probe fails on its own.
 */
async function diagnoseStore(): Promise<string> {
  const [sf, canPay, products] = await Promise.all([
    withTimeout(Purchases.getStorefront(), 8000).catch(() => null),
    withTimeout(Purchases.canMakePayments(), 8000).catch(() => null),
    withTimeout(Purchases.getProducts(ALL_PRODUCT_IDS), 12000).catch(() => null),
  ]);
  return storeDiagnostic({
    country: sf?.countryCode ?? null,
    canPay,
    tried: ALL_PRODUCT_IDS,
    fetched: products ? products.map((p) => p.identifier) : null,
  });
}
import { layers } from '../lib/layers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RevenueCatContextType {
  isLoading: boolean;
  customerInfo: CustomerInfo | null;
  /** Athlete products (fitlink_athlete_monthly/annual → client_premium),
   *  picked by PRODUCT IDENTIFIER across every offering. Never by package
   *  type: the dashboard once carried the coach products in the default
   *  offering's standard slots. See lib/storePlans.ts. */
  athletePlan: Plan;
  /** Coach Elite products (fitlink_coach_elite_monthly/annual → coach_elite). */
  coachPlan: Plan;
  isClientPremium: boolean;
  isCoachElite: boolean;
  /** Plain-language reason the store has no prices, or null when it does.
   *  Shown on the paywalls' fallback card so a misconfiguration is
   *  diagnosable from the phone instead of a silent empty offering. */
  storeStatus: string | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; restored: boolean; error?: string }>;
  refreshCustomerInfo: () => Promise<void>;
}

// ─── Purchase error taxonomy ──────────────────────────────────────────────────

type PurchaseFailure = { reason: string; message: string; retryable: boolean };

/** Name of the PURCHASES_ERROR_CODE member for a raw SDK code, or 'UNKNOWN'. */
function errorCodeName(code: unknown): string {
  const hit = Object.entries(PURCHASES_ERROR_CODE).find(([, v]) => String(v) === String(code));
  return hit ? hit[0] : 'UNKNOWN';
}

export function classifyPurchaseError(err: any): PurchaseFailure {
  const name = errorCodeName(err?.code);
  switch (name) {
    case 'PURCHASE_NOT_ALLOWED_ERROR':
      return { reason: 'not_allowed', retryable: false, message: 'Purchases are not allowed on this device. Check Screen Time or parental controls, then try again.' };
    case 'PURCHASE_INVALID_ERROR':
      return { reason: 'payment_invalid', retryable: true, message: 'The store could not take that payment. Check your payment method in your store account and try again.' };
    case 'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR':
      return { reason: 'product_unavailable', retryable: false, message: 'That plan is not available in your store region right now. Nothing has been charged.' };
    case 'PRODUCT_ALREADY_PURCHASED_ERROR':
    case 'RECEIPT_ALREADY_IN_USE_ERROR':
      return { reason: 'already_owned', retryable: false, message: 'This subscription is already active on a store account. Use Restore purchases to bring it here.' };
    case 'NETWORK_ERROR':
    case 'OFFLINE_CONNECTION_ERROR':
      return { reason: 'offline', retryable: true, message: 'No connection to the store. Check your network and try again. Nothing has been charged.' };
    case 'STORE_PROBLEM_ERROR':
      return { reason: 'store_problem', retryable: true, message: 'The store is having trouble right now. Try again in a few minutes. Nothing has been charged.' };
    case 'PAYMENT_PENDING_ERROR':
      return { reason: 'payment_pending', retryable: false, message: 'Your payment is pending approval. Your plan unlocks as soon as the store confirms it.' };
    case 'INVALID_CREDENTIALS_ERROR':
    case 'CONFIGURATION_ERROR':
    case 'INVALID_APP_USER_ID_ERROR':
      return { reason: 'configuration', retryable: false, message: 'Something is misconfigured on our side. Nothing has been charged; please contact support.' };
    default:
      return { reason: name === 'UNKNOWN' ? 'unknown' : name.toLowerCase().replace(/_error$/, ''), retryable: true, message: err?.message || 'Purchase failed. Please try again.' };
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const RevenueCatContext = createContext<RevenueCatContextType | null>(null);

export function RevenueCatProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [athletePlan, setAthletePlan] = useState<Plan>(EMPTY_PLAN);
  const [coachPlan, setCoachPlan] = useState<Plan>(EMPTY_PLAN);
  const [storeStatus, setStoreStatus] = useState<string | null>(null);
  const initRunRef = useRef(0);

  // ── Computed entitlement flags ──
  const isClientPremium = !!customerInfo?.entitlements.active[ENTITLEMENT_CLIENT_PREMIUM];
  const isCoachElite    = !!customerInfo?.entitlements.active[ENTITLEMENT_COACH_ELITE];

  // ── Initialize RC when auth user is known ──
  useEffect(() => {
    // Native module not compiled into this build — skip silently
    if (!isRevenueCatAvailable) {
      setIsLoading(false);
      return;
    }

    // Each session change starts a new run. A run that has been superseded
    // (the app opened signed-out, then the session restored a moment later)
    // must not write its stale, anonymous customer info over the real one —
    // that race is how a paid coach opened the app and saw Elite gone.
    const run = ++initRunRef.current;
    const stale = () => run !== initRunRef.current;

    (async () => {
      try {
        initRevenueCat(user?.id);

        // Identity follows the session both ways: log in as this user, or
        // drop the previous user's identity when nobody is signed in.
        await ensureIdentity(user?.id);
        if (stale()) return;

        const [info, offeringsResult] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);
        if (stale()) return;

        setCustomerInfo(info);

        // Self-heal: a purchase the server never heard about (webhook lag or a
        // gap) is synced on the next launch, without waiting for a 402.
        if (user?.id && Object.keys(info.entitlements.active).length > 0) {
          confirmEntitlement(1).catch(() => null);
        }

        const athlete = pickPlan(offeringsResult, 'athlete', OFFERING_DEFAULT);
        const coach = pickPlan(offeringsResult, 'coach', OFFERING_COACH);
        setAthletePlan(athlete);
        setCoachPlan(coach);

        // Diagnose an empty store precisely. The usual causes look identical
        // from the paywall (no price) but need different fixes.
        const ids = Object.keys(offeringsResult.all);
        const packageCount = ids.reduce((n, id) => n + (offeringsResult.all[id]?.availablePackages.length ?? 0), 0);
        if (ids.length === 0) {
          setStoreStatus('RevenueCat returned no offerings. Check the app API key and that an offering named "default" is marked current.');
        } else if (packageCount === 0) {
          setStoreStatus(
            `Offerings (${ids.join(', ')}) have no packages: the store returned none of their products. ` +
              (await diagnoseStore()),
          );
        } else if (!athlete.monthly && !athlete.annual) {
          setStoreStatus(`No athlete product in offerings (${ids.join(', ')}). Expected ${ALL_PRODUCT_IDS.slice(0, 2).join(' / ')}.`);
        } else {
          setStoreStatus(null);
        }
      } catch (err: any) {
        if (__DEV__) console.warn('[RevenueCat] Init error:', err);
        const diag = await diagnoseStore().catch(() => '');
        setStoreStatus(`Store error: ${err?.message ?? String(err)}${diag ? `\n${diag}` : ''}`);
      } finally {
        setIsLoading(false);
      }
    })();

    const listener = Purchases.addCustomerInfoUpdateListener((info) => {
      setCustomerInfo(info);
    }) as any;

    return () => { if (listener?.remove) listener.remove(); };
  }, [user?.id]);

  // ── Purchase a package ──
  const purchasePackage = useCallback(
    async (pkg: PurchasesPackage): Promise<{ success: boolean; error?: string }> => {
      try {
        if (!user?.id) {
          return { success: false, error: 'Sign in before subscribing so the pass is tied to your account.' };
        }
        await ensureIdentity(user.id);
        const { customerInfo: info, transaction } = await Purchases.purchasePackage(pkg) as any;
        setCustomerInfo(info);
        // Activate server-side NOW. Every paid gate reads clients.premium_until
        // or trainers.elite_until, and the webhook may be late or absent. The
        // paywall waits on this, so the screen it opens is already unlocked.
        await withTimeout(confirmEntitlement(), 12_000).catch(() => null);
        // The paywall that called us owns the success moment (haptic + pulse);
        // firing here too doubled the notification.

        // ── Layers purchase events ───────────────────────────────────────────
        const productId = pkg.product.identifier;
        const revenue  = pkg.product.price;
        const currency = pkg.product.currencyCode ?? 'USD';
        const transactionId = transaction?.transactionIdentifier ?? transaction?.orderId ?? undefined;

        // Determine if this is a fresh subscription, trial, or one-time purchase
        const activeEntitlements = Object.values(info.entitlements.active);
        const isTrial = activeEntitlements.some((e: any) => e?.periodType === 'trial');
        const isSubscription = pkg.packageType !== 'LIFETIME' && pkg.packageType !== 'UNKNOWN';

        layers.track('purchase_success', {
          product_id: productId,
          revenue,
          currency,
          transaction_id: transactionId,
          is_trial: isTrial,
          is_subscription: isSubscription,
          package_type: pkg.packageType,
        });

        if (isTrial) {
          layers.track('trial_start', { product_id: productId, currency });
        } else if (isSubscription) {
          layers.track('subscription_start', { product_id: productId, revenue, currency, transaction_id: transactionId });
        }

        return { success: true };
      } catch (err: any) {
        // User cancelled — not an error we need to surface
        if (err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
          layers.track('purchase_cancelled', { product_id: pkg.product.identifier });
          return { success: false };
        }
        if (__DEV__) console.warn('[RevenueCat] Purchase error:', err);
        // Error taxonomy (roast phase 3): one named reason per failure so
        // the dashboard can tell a store outage from a declined card from a
        // misconfigured product, and the athlete gets a sentence that says
        // what to do rather than the SDK's message.
        const failure = classifyPurchaseError(err);
        layers.track('purchase_failed', { product_id: pkg.product.identifier, reason: failure.reason, code: String(err?.code ?? ''), retryable: failure.retryable });
        return { success: false, error: failure.message };
      }
    },
    [user?.id]
  );

  // ── Restore purchases ──
  const restorePurchases = useCallback(async (): Promise<{
    success: boolean;
    restored: boolean;
    error?: string;
  }> => {
    try {
      if (!user?.id) {
        return { success: false, restored: false, error: 'Sign in before restoring so the pass is tied to your account.' };
      }
      await ensureIdentity(user.id);
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      const hasActive =
        Object.keys(info.entitlements.active).length > 0;
      if (hasActive) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await withTimeout(confirmEntitlement(), 12_000).catch(() => null);
      }
      return { success: true, restored: hasActive };
    } catch (err: any) {
      if (__DEV__) console.warn('[RevenueCat] Restore error:', err);
      return { success: false, restored: false, error: err?.message || 'Restore failed.' };
    }
  }, [user?.id]);

  // ── Manual refresh (e.g., after webhook update) ──
  const refreshCustomerInfo = useCallback(async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch (err) {
      if (__DEV__) console.warn('[RevenueCat] Refresh error:', err);
    }
  }, []);

  return (
    <RevenueCatContext.Provider
      value={{
        isLoading,
        customerInfo,
        athletePlan,
        coachPlan,
        isClientPremium,
        isCoachElite,
        storeStatus,
        purchasePackage,
        restorePurchases,
        refreshCustomerInfo,
      }}
    >
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const ctx = useContext(RevenueCatContext);
  if (!ctx) throw new Error('useRevenueCat must be used within RevenueCatProvider');
  return ctx;
}
