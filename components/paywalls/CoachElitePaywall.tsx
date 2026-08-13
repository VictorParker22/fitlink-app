/**
 * CoachElitePaywall — the one screen on the coach side that asks for money.
 *
 * Design turn 24, option 24d: "Elite — priced against the money already on
 * the table." Instead of a feature grid, the screen argues with numbers the
 * coach already recognises — their real monthly take (active plan holders ×
 * plan price × 0.9, the same math as earnings.tsx) — and prices Elite as a
 * fraction of it. When there's no revenue yet, it drops the comparison and
 * states the price plainly rather than inventing projections.
 *
 * Price comes from RevenueCat offerings when available; the $29 figure is a
 * fallback for Expo Go where the native module isn't compiled in. Trial copy
 * renders only when the store product genuinely carries an intro offer.
 *
 * Never navigates while visible — the caller navigates after dismissal via
 * onSuccess (studio's existing paywall-then-navigate success path).
 *
 * Usage:
 *   const { isCoachElite } = useRevenueCat();
 *   if (!isCoachElite) setShowPaywall(true);
 *   <CoachElitePaywall visible={showPaywall} onClose={...} onSuccess={...} />
 */

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PACKAGE_TYPE } from 'react-native-purchases';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { useApp } from '../../context/AppContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

// Must match earnings.tsx: const PLATFORM_FEE = 0.10;
const PLATFORM_FEE = 0.10;

// Fallback when RevenueCat offerings are unavailable (Expo Go).
const FALLBACK_PRICE = 29;
const FALLBACK_PRICE_STRING = '$29';

// Only features actually gated behind isCoachElite (studio.tsx gates go
// live, entering the studio, and scheduling live classes; the broadcast
// screen carries viewer chat and save-to-library; profile.tsx shows the
// Elite badge). Nothing here that nothing gates.
const PERKS = [
  'Unlimited live broadcasts to your clients',
  'Real-time viewer chat while you stream',
  'Save replays to your on-demand library',
  'Elite badge on your coach profile',
];

interface CoachElitePaywallProps {
  visible: boolean;
  /** Coach dismissed without buying. */
  onClose: () => void;
  /**
   * Purchase succeeded (or no store package exists — Expo Go bypass).
   * The caller dismisses the modal and navigates; this component never
   * navigates while visible.
   */
  onSuccess: () => void;
}

export default function CoachElitePaywall({ visible, onClose, onSuccess }: CoachElitePaywallProps) {
  const insets = useSafeAreaInsets();
  const { offerings, purchasePackage, restorePurchases } = useRevenueCat();
  const { plans, activeClients } = useApp();
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // ── Store package ──────────────────────────────────────────────────────────
  const pkg =
    offerings?.availablePackages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ??
    offerings?.availablePackages?.[0];

  const elitePrice = pkg?.product.price ?? FALLBACK_PRICE;
  const priceString = pkg?.product.priceString ?? FALLBACK_PRICE_STRING;

  // Trial copy only when the store product genuinely has a free intro offer.
  const intro = pkg?.product.introPrice;
  const hasTrial = !!intro && intro.price === 0;
  const trialLabel = hasTrial
    ? `${intro!.periodNumberOfUnits}-${intro!.periodUnit.toLowerCase()} free trial`
    : null;

  // ── The coach's real numbers — same math as earnings.tsx ──────────────────
  const planBreakdown = useMemo(() => {
    return plans
      .map((plan) => {
        const holders = activeClients.filter((c) => c.plan_id === plan.id).length;
        const net = Number(plan.price || 0) * holders * (1 - PLATFORM_FEE);
        return { plan, holders, net };
      })
      .filter((row) => row.holders > 0)
      .sort((a, b) => b.net - a.net);
  }, [plans, activeClients]);

  const monthlyNet = useMemo(
    () => planBreakdown.reduce((sum, row) => sum + row.net, 0),
    [planBreakdown],
  );

  // Show the comparison only when it's honest and it argues FOR the price:
  // real revenue exists and Elite is a minority share of it.
  const pctOfTake = monthlyNet > 0 ? (elitePrice / monthlyNet) * 100 : null;
  const showComparison = pctOfTake !== null && pctOfTake < 50;
  const pctLabel =
    pctOfTake === null ? null : pctOfTake < 1 ? 'under 1%' : `about ${Math.round(pctOfTake)}%`;

  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

  // ── Purchase / restore ─────────────────────────────────────────────────────
  const handlePurchase = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!pkg) {
      // Expo Go — native purchases unavailable. Same bypass studio always had.
      onSuccess();
      return;
    }
    setPurchasing(true);
    const { success, error } = await purchasePackage(pkg);
    setPurchasing(false);
    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } else if (error) {
      Alert.alert('Purchase failed', error);
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
      Alert.alert('Restore failed', error);
    } else {
      Alert.alert('Nothing to restore', 'No previous Elite purchase was found for this account.');
    }
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
          contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, 20) + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header row */}
          <View style={s.headerRow}>
            <Text style={s.eyebrow}>Your plan</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {/* Headline — priced against the money already on the table */}
          {showComparison ? (
            <>
              <Text style={s.title}>You take home {money(monthlyNet)} a month through FitLink</Text>
              <Text style={s.sub}>
                Elite is {priceString} — {pctLabel} of that. It adds the live side of your
                business: broadcasts, viewer chat and replays.
              </Text>
            </>
          ) : (
            <>
              <Text style={s.title}>Going live is an Elite feature</Text>
              <Text style={s.sub}>
                Elite is {priceString} a month. It adds live broadcasts, viewer chat and replays
                on top of everything you already run for free.
              </Text>
            </>
          )}

          {/* The coach's real numbers */}
          {showComparison && (
            <View style={s.numbersCard}>
              <Text style={s.numbersEyebrow}>Your numbers today</Text>
              <View style={s.numbersRows}>
                {planBreakdown.slice(0, 3).map(({ plan, holders, net }) => (
                  <View key={plan.id} style={s.numbersRow}>
                    <Text style={s.numbersPlan} numberOfLines={1}>{plan.name}</Text>
                    <Text style={s.numbersHolders}>
                      {holders} {holders === 1 ? 'athlete' : 'athletes'}
                    </Text>
                    <Text style={s.numbersNet}>{money(net)}/mo</Text>
                  </View>
                ))}
              </View>
              <View style={s.numbersTotalRow}>
                <Text style={s.numbersTotalLabel}>Your monthly take, after fees</Text>
                <Text style={s.numbersTotalValue}>{money(monthlyNet)}</Text>
              </View>
            </View>
          )}

          {/* Elite card */}
          <View style={s.eliteCard}>
            <View style={s.eliteTitleRow}>
              <Text style={s.eliteTitle}>Elite</Text>
              <Text style={s.elitePrice}>{priceString} a month</Text>
            </View>
            <View style={s.perkList}>
              {PERKS.map((perk) => (
                <View key={perk} style={s.perkRow}>
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={CoachColors.accent}
                    style={{ marginTop: 1 }}
                  />
                  <Text style={s.perkText}>{perk}</Text>
                </View>
              ))}
            </View>
            {showComparison && (
              <Text style={s.eliteFootnote}>
                Next to {money(monthlyNet)} a month, that's {pctLabel} of what you already take home.
              </Text>
            )}
          </View>

          {/* What stays free */}
          <View style={s.freeCard}>
            <Text style={s.freeTitle}>What stays free, forever</Text>
            <Text style={s.freeBody}>
              Your clients, plans, programs and messages. Cancelling Elite never touches any of
              it — it only pauses live broadcasting.
            </Text>
          </View>
        </ScrollView>

        {/* Pinned footer */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <TouchableOpacity
            style={[s.cta, purchasing && s.ctaDisabled]}
            onPress={handlePurchase}
            disabled={purchasing || restoring}
            activeOpacity={0.85}
          >
            {purchasing ? (
              <ActivityIndicator color={CoachColors.onAccent} />
            ) : (
              <Text style={s.ctaText}>
                {hasTrial ? 'Start free trial' : `Go Elite — ${priceString}/month`}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={s.footerNote}>
            {hasTrial
              ? `${trialLabel}, then ${priceString}/month · cancel any time`
              : 'Cancel any time'}
          </Text>
          <TouchableOpacity
            onPress={handleRestore}
            disabled={restoring || purchasing}
            style={s.restoreBtn}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={CoachColors.textFaint} />
            ) : (
              <Text style={s.restoreText}>Restore purchases</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  closeText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },

  title: {
    fontFamily: CoachFonts.headingBold, fontSize: 27, lineHeight: 33,
    color: CoachColors.textPrimary, marginTop: 20,
  },
  sub: {
    fontFamily: CoachFonts.body, fontSize: 13.5, lineHeight: 21,
    color: CoachColors.textSecondary, marginTop: 9,
  },

  numbersCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 20, padding: 17, marginTop: 20,
  },
  numbersEyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  numbersRows: { marginTop: 14, gap: 10 },
  numbersRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  numbersPlan: {
    flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary,
  },
  numbersHolders: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
  numbersNet: {
    fontFamily: CoachFonts.mono, fontSize: 12.5, color: CoachColors.textSecondary,
    minWidth: 64, textAlign: 'right',
  },
  numbersTotalRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  numbersTotalLabel: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
  numbersTotalValue: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textPrimary },

  eliteCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: 'rgba(198,242,78,0.22)',
    borderRadius: 20, padding: 18, marginTop: 12,
  },
  eliteTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  eliteTitle: { fontFamily: CoachFonts.headingBold, fontSize: 23, color: CoachColors.textPrimary },
  elitePrice: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary },
  perkList: { marginTop: 16, gap: 11 },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  perkText: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 13.5, lineHeight: 19,
    color: CoachColors.textPrimary,
  },
  eliteFootnote: {
    fontFamily: CoachFonts.body, fontSize: 12.5, lineHeight: 19, color: CoachColors.textSecondary,
    marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(198,242,78,0.14)',
  },

  freeCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 16, padding: 15, marginTop: 12,
  },
  freeTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },
  freeBody: {
    fontFamily: CoachFonts.body, fontSize: 12.5, lineHeight: 19,
    color: CoachColors.textMuted, marginTop: 5,
  },

  footer: {
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#1E211D', backgroundColor: CoachColors.bg,
  },
  cta: {
    backgroundColor: CoachColors.accent, borderRadius: 999, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { fontFamily: CoachFonts.bodyBold, fontSize: 15, color: CoachColors.onAccent },
  footerNote: {
    fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textFaint,
    textAlign: 'center', marginTop: 10,
  },
  restoreBtn: { alignItems: 'center', paddingVertical: 8, marginTop: 2 },
  restoreText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textMuted,
    textDecorationLine: 'underline',
  },
});
