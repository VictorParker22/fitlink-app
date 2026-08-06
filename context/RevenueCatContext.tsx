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
import {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';
import {
  Purchases,
  initRevenueCat,
  isRevenueCatAvailable,
  ENTITLEMENT_CLIENT_PREMIUM,
  ENTITLEMENT_COACH_ELITE,
  OFFERING_DEFAULT,
} from '../lib/revenuecat';
import { useAuth } from './AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RevenueCatContextType {
  isLoading: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  isClientPremium: boolean;
  isCoachElite: boolean;
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; restored: boolean; error?: string }>;
  refreshCustomerInfo: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const RevenueCatContext = createContext<RevenueCatContextType | null>(null);

export function RevenueCatProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);

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
      } catch (err) {
        if (__DEV__) console.warn('[RevenueCat] Init error:', err);
      } finally {
        setIsLoading(false);
      }
    })();

    const listener = Purchases.addCustomerInfoUpdateListener((info) => {
      setCustomerInfo(info);
    });

    return () => listener.remove();
  }, [user?.id]);

  // ── Purchase a package ──
  const purchasePackage = useCallback(
    async (pkg: PurchasesPackage): Promise<{ success: boolean; error?: string }> => {
      try {
        const { customerInfo: info } = await Purchases.purchasePackage(pkg);
        setCustomerInfo(info);
        return { success: true };
      } catch (err: any) {
        // User cancelled — not an error we need to surface
        if (err?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
          return { success: false };
        }
        if (__DEV__) console.warn('[RevenueCat] Purchase error:', err);
        return { success: false, error: err?.message || 'Purchase failed. Please try again.' };
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
        isClientPremium,
        isCoachElite,
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
