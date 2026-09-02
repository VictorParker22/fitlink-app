/**
 * SoloPaywall — the one screen on the athlete side that asks for money.
 *
 * Canvas "FitLink Solo Mode", paywall board: photographic hero (session-bg
 * under the sanctioned gradient scrim), the promise in four checkable lines,
 * two plan cards with Annual featured, and the signature honest exit —
 * "Or find a real coach — free". Solo is software; a human coach is the
 * better product, and the paywall says so out loud.
 *
 * Prices come EXCLUSIVELY from the default (athlete) offering's packages'
 * priceString — never hardcoded (lib/revenuecat.ts header: the dollar
 * figures there are documentation only). Savings % is computed from the
 * real store prices. Trial copy renders only when the store product
 * genuinely carries a free intro offer (product.introPrice, price === 0).
 *
 * Mirrors CoachElitePaywall's contract exactly: {visible, onClose,
 * onSuccess}; purchase success calls onSuccess and the CALLER navigates —
 * except the find-a-coach link, which is a deliberate exit from the funnel
 * (router.push then onClose). Same web behavior (no store in a browser →
 * state the truth, no dead button), same NO PACKAGE, NO GRANT rule with
 * the __DEV__-only bypass.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
// PACKAGE_TYPE is a runtime enum, so it comes from the platform-split module —
// react-native-purchases cannot be imported on web at all.
import { PACKAGE_TYPE } from '../../lib/revenuecat-sdk';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { useAlert } from '../../context/AlertContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import CardImage from '../ui/CardImage';
import PaywallLegal from './PaywallLegal';

// The promise — only what solo mode actually does (canvas paywall board).
const PROMISES = [
  'A season built from your intake — and rebuilt when your life changes',
  'Every check-in read and answered, grounded in your lifts, sleep and steps',
  'Meals matched to your macros, not a generic plan',
  'When you outgrow solo, your whole history travels with you to a real coach',
];

interface SoloPaywallProps {
  visible: boolean;
  /** Athlete dismissed without buying. */
  onClose: () => void;
  /**
   * Purchase succeeded (or no store package exists — __DEV__ bypass only).
   * The caller dismisses the modal and navigates; this component never
   * navigates while visible, except the deliberate find-a-coach exit.
   */
  onSuccess: () => void;
}

export default function SoloPaywall({ visible, onClose, onSuccess }: SoloPaywallProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The DEFAULT offering — athlete products (fitlink_athlete_monthly/annual
  // → client_premium). The coach offering is a different audience entirely.
  const { offerings, purchasePackage, restorePurchases } = useRevenueCat();
  const { showAlert } = useAlert();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [term, setTerm] = useState<'annual' | 'monthly'>('annual');

  // No store in a browser: RevenueCat purchases are native-only, so offerings
  // are null and any price we rendered would be a number we made up. On web
  // the screen states what solo mode is and where to buy it — never a price
  // we cannot source, and never a button that silently grants or does nothing.
  const isWeb = Platform.OS === 'web';

  // ── Store packages ─────────────────────────────────────────────────────────
  const monthlyPkg =
    offerings?.availablePackages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ??
    offerings?.availablePackages?.[0];
  const annualPkg = offerings?.availablePackages.find(
    (p) => p.packageType === PACKAGE_TYPE.ANNUAL,
  );

  const pkg = term === 'annual' && annualPkg ? annualPkg : monthlyPkg;

  const monthlyPrice = monthlyPkg?.product.price ?? null;
  const monthlyPriceString = monthlyPkg?.product.priceString ?? null;
  const annualPrice = annualPkg?.product.price ?? null;
  const annualPriceString = annualPkg?.product.priceString ?? null;

  // Savings % derived from the real store prices — never hardcoded.
  const annualSavingsPct =
    annualPrice !== null && monthlyPrice !== null && monthlyPrice > 0
      ? Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100)
      : null;

  // Trial copy only when the SELECTED store product genuinely carries a free
  // intro offer. If the store data shows no trial, we render just the price —
  // never a promise the receipt won't honour.
  const intro = pkg?.product.introPrice;
  const hasTrial = !!intro && intro.price === 0;
  const trialPeriod = hasTrial
    ? `${intro!.periodNumberOfUnits} ${intro!.periodUnit.toLowerCase()}${intro!.periodNumberOfUnits === 1 ? '' : 's'}`
    : null;

  const selectedPriceLine =
    term === 'annual' && annualPriceString
      ? `${annualPriceString}/year`
      : monthlyPriceString
        ? `${monthlyPriceString}/month`
        : null;

  // The store genuinely has nothing to sell (offerings failed to load, RC not
  // configured, Expo Go). Same honest state as web: no invented price.
  const hasStore = !isWeb && !!monthlyPkg;

  // ── Purchase / restore ─────────────────────────────────────────────────────
  const handlePurchase = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!pkg) {
      // NO PACKAGE, NO GRANT — see CoachElitePaywall for the incident write-up.
      // "No package" is not "we are in Expo Go"; it is also a shipped build
      // whose offerings failed to load. The dev convenience is gated on
      // __DEV__ so it cannot ship.
      if (__DEV__) {
        console.warn('[SoloPaywall] No package — granting in dev only.');
        onSuccess();
        return;
      }
      showAlert({
        type: 'error',
        title: 'Not available right now',
        message: "We couldn't load solo mode pricing. Check your connection and try again — nothing has been charged.",
      });
      return;
    }
    setPurchasing(true);
    const { success, error } = await purchasePackage(pkg);
    setPurchasing(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } else if (error) {
      showAlert({ type: 'error', title: 'Purchase failed', message: error });
    }
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    const { restored, error } = await restorePurchases();
    setRestoring(false);
    if (restored) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } else if (error) {
      showAlert({ type: 'error', title: 'Restore failed', message: error });
    } else {
      showAlert({ type: 'info', title: 'Nothing to restore', message: 'No previous solo mode purchase was found for this account.' });
    }
  };

  // The honest exit — a human coach is the better product, and it costs the
  // athlete nothing to be coached through FitLink. Deliberate navigation out
  // of the funnel, so this one navigates itself, then closes.
  const handleFindCoach = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(ClientRoute.findCoach);
    onClose();
  };

  const renderPlanCard = (
    which: 'annual' | 'monthly',
    priceString: string | null,
    per: string,
  ) => {
    if (!priceString) return null;
    const selected = term === which;
    const featured = which === 'annual';
    return (
      <TouchableOpacity
        style={[s.planCard, selected && s.planCardSelected]}
        onPress={() => setTerm(which)}
        activeOpacity={0.85}
        accessibilityRole="radio"
        accessibilityLabel={`${which === 'annual' ? 'Annual' : 'Monthly'}, ${priceString} per ${per}${featured && annualSavingsPct && annualSavingsPct > 0 ? `, save ${annualSavingsPct} percent` : ''}`}
        accessibilityState={{ selected }}
      >
        <View style={s.planTopRow}>
          <Text style={s.planLabel}>{which === 'annual' ? 'Annual' : 'Monthly'}</Text>
          {featured && annualSavingsPct !== null && annualSavingsPct > 0 && (
            <View style={s.saveChip}>
              <Text style={s.saveChipText}>Save {annualSavingsPct}%</Text>
            </View>
          )}
        </View>
        <Text style={s.planPrice}>
          {priceString}
          <Text style={s.planPer}>/{per}</Text>
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.container}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Photographic hero — session-bg under the sanctioned gradient
              scrim, kicker + headline sitting on the darkened bottom edge.
              Radius/clip live on this container (DESIGN.md § Imagery). */}
          <View style={s.hero}>
            <CardImage source={require('../../assets/images/session-bg.jpg')} scrim="gradient" />
            <View style={[s.heroTopRow, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={s.closeText}>Close</Text>
              </TouchableOpacity>
            </View>
            <View style={s.heroTextBlock}>
              <Text style={s.kicker}>Fitlink solo</Text>
              <Text style={s.headline}>Train like someone's watching your numbers.</Text>
            </View>
          </View>

          {/* The promise */}
          <View style={s.promiseList}>
            {PROMISES.map((line) => (
              <View key={line} style={s.promiseRow}>
                <Ionicons
                  name="checkmark"
                  size={16}
                  color={CoachColors.accent}
                  style={{ marginTop: 2 }}
                />
                <Text style={s.promiseText}>{line}</Text>
              </View>
            ))}
          </View>

          {/* Plan cards — prices from the store or not at all */}
          {hasStore ? (
            <View style={s.planRow}>
              {renderPlanCard('annual', annualPriceString, 'yr')}
              {renderPlanCard('monthly', monthlyPriceString, 'mo')}
            </View>
          ) : (
            <View style={s.noStoreCard}>
              <Text style={s.noStoreText}>
                {isWeb
                  ? 'Subscriptions are managed in the FitLink app. Open it on your phone to start solo mode or restore a purchase.'
                  : "We couldn't load solo mode pricing right now. Check your connection and pull this screen up again — nothing is charged until you buy."}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Pinned footer */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {!isWeb && (
            <>
              <TouchableOpacity
                style={[s.cta, purchasing && s.ctaDisabled]}
                onPress={handlePurchase}
                disabled={purchasing || restoring}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {purchasing ? (
                  <ActivityIndicator color={CoachColors.onAccent} />
                ) : (
                  <Text style={s.ctaText}>
                    {hasTrial
                      ? 'Start free, cancel any time'
                      : selectedPriceLine
                        ? `Start solo mode — ${selectedPriceLine}`
                        : 'Start solo mode'}
                  </Text>
                )}
              </TouchableOpacity>
              {hasTrial && selectedPriceLine ? (
                <Text style={s.footerNote}>
                  {trialPeriod} free, then {selectedPriceLine} · cancel any time
                </Text>
              ) : selectedPriceLine ? (
                <Text style={s.footerNote}>Cancel any time</Text>
              ) : null}
              <TouchableOpacity
                hitSlop={{ top: 6, bottom: 6 }}
                onPress={handleRestore}
                disabled={restoring || purchasing}
                style={s.restoreBtn}
                accessibilityRole="button"
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={CoachColors.textFaint} />
                ) : (
                  <Text style={s.restoreText}>Restore purchases</Text>
                )}
              </TouchableOpacity>
            </>
          )}
          {/* The signature exit — being coached by a human through FitLink
              costs the athlete nothing, and we say so on our own paywall. */}
          <TouchableOpacity
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={handleFindCoach}
            disabled={purchasing || restoring}
            style={s.coachLink}
            accessibilityRole="button"
            accessibilityLabel="Or find a real coach, free"
          >
            <Text style={s.coachLinkText}>Or find a real coach — free</Text>
          </TouchableOpacity>
          <PaywallLegal style={s.legal} />
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  scroll: { paddingBottom: 24 },

  hero: {
    height: 320,
    justifyContent: 'space-between',
    // Full-bleed at the top; only the bottom corners curve into the page.
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: CoachColors.surface,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20 },
  closeText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  heroTextBlock: { paddingHorizontal: 20, paddingBottom: 20 },
  kicker: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.accent,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  headline: {
    fontFamily: CoachFonts.headingBold, fontSize: 30, lineHeight: 36,
    color: CoachColors.textPrimary, marginTop: 8,
  },

  promiseList: { paddingHorizontal: 20, marginTop: 24, gap: 12 },
  promiseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  promiseText: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 15, lineHeight: 22,
    color: CoachColors.textPrimary,
  },

  planRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginTop: 24 },
  planCard: {
    flex: 1, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 16,
  },
  planCardSelected: { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter },
  planTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  planLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },
  saveChip: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 8, paddingVertical: 3,
  },
  saveChipText: { fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.onAccent },
  planPrice: {
    fontFamily: CoachFonts.headingBold, fontSize: 22, color: CoachColors.textPrimary,
    marginTop: 8, fontVariant: ['tabular-nums'],
  },
  planPer: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted },

  noStoreCard: {
    marginHorizontal: 20, marginTop: 24,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 16,
  },
  noStoreText: {
    fontFamily: CoachFonts.body, fontSize: 14.5, lineHeight: 21.5,
    color: CoachColors.textSecondary,
  },

  footer: {
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, backgroundColor: CoachColors.bg,
  },
  cta: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },
  footerNote: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint,
    textAlign: 'center', marginTop: 10,
  },
  restoreBtn: { alignItems: 'center', paddingVertical: 8, marginTop: 2 },
  restoreText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textMuted,
    textDecorationLine: 'underline',
  },
  coachLink: { alignItems: 'center', paddingVertical: 8, marginTop: 2 },
  coachLinkText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.accent },
  legal: { marginTop: 8 },
});
