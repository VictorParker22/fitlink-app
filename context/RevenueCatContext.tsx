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
  type PropsWithChildren,
} from 'react';
import * as Haptics from 'expo-haptics';
// PURCHASES_ERROR_CODE is a runtime enum, so it comes from the platform-split
// module (base = web-safe stub, `.native.ts` = the real SDK). The rest are
// types and are erased at compile time.
import { PURCHASES_ERROR_CODE } from '../lib/revenuecat-sdk';
import type {
  PurchasesOffering,
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
import { useAuth } from './AuthContext';
import { layers } from '../lib/layers';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RevenueCatContextType {
  isLoading: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  /** The "coach" offering — Coach Elite packages. Separate because one
   *  offering cannot carry two audiences' monthly products at once. */
  coachOfferings: PurchasesOffering | null;
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
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [coachOfferings, setCoachOfferings] = useState<PurchasesOffering | null>(null);
  const [storeStatus, setStoreStatus] = useState<string | null>(null);

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

    (async () => {
      try {
        initRevenueCat(user?.id);

        if (user?.id) {
          await Purchases.logIn(user.id);
        }

        const [info, offeringsResult] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);

        setCustomerInfo(info);

        const defaultOffering = offeringsResult.current ?? offeringsResult.all[OFFERING_DEFAULT] ?? null;
        setOfferings(defaultOffering);
        setCoachOfferings(offeringsResult.all[OFFERING_COACH] ?? null);

        // Diagnose an empty store precisely. The three usual causes look
        // identical from the paywall (no price) but need different fixes.
        const ids = Object.keys(offeringsResult.all);
        const pkgCount = defaultOffering?.availablePackages.length ?? 0;
        if (ids.length === 0) {
          setStoreStatus('RevenueCat returned no offerings. Check the app API key and that an offering named "default" is marked current.');
        } else if (!defaultOffering) {
          setStoreStatus(`Offerings found (${ids.join(', ')}) but none is current or named "default".`);
        } else if (pkgCount === 0) {
          setStoreStatus(`Offering "${defaultOffering.identifier}" has no packages. The store rejected its products: in App Store Connect check the Paid Applications agreement, product status "Ready to Submit", and identifiers matching RevenueCat.`);
        } else {
          setStoreStatus(null);
        }
      } catch (err: any) {
        if (__DEV__) console.warn('[RevenueCat] Init error:', err);
        setStoreStatus(`Store error: ${err?.message ?? String(err)}`);
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
        const { customerInfo: info, transaction } = await Purchases.purchasePackage(pkg) as any;
        setCustomerInfo(info);
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
    []
  );

  // ── Restore purchases ──
  const restorePurchases = useCallback(async (): Promise<{
    success: boolean;
    restored: boolean;
    error?: string;
  }> => {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      const hasActive =
        Object.keys(info.entitlements.active).length > 0;
      if (hasActive) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return { success: true, restored: hasActive };
    } catch (err: any) {
      if (__DEV__) console.warn('[RevenueCat] Restore error:', err);
      return { success: false, restored: false, error: err?.message || 'Restore failed.' };
    }
  }, []);

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
        offerings,
        coachOfferings,
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
