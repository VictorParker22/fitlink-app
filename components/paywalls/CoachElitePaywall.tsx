/**
 * CoachElitePaywall — the one screen on the coach side that asks for money.
 *
 * Design turn 24, option 24d: "Elite — priced against the money already on
 * the table." Instead of a feature grid, the screen argues with numbers the
 * coach already recognises — their real monthly take (active plan holders ×
 * plan price × their real split from lib/platformFee.ts) — and prices Elite as a
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
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
// PACKAGE_TYPE is a runtime enum, so it comes from the platform-split module —
// react-native-purchases cannot be imported on web at all.
import { PACKAGE_TYPE } from '../../lib/revenuecat-sdk';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { useApp } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { usePaymentSplit } from '../../lib/platformFee';
import PaywallLegal from './PaywallLegal';

// Fallback when RevenueCat offerings are unavailable (Expo Go).
const FALLBACK_PRICE = 29;
const FALLBACK_PRICE_STRING = '$29';

// Only features actually gated behind Elite (studio.tsx gates broadcasting;
// the roster cap lives in add-client + the trg_roster_cap trigger; the AI
// assistant is gated on the coach home and 402s server-side; the 5% fee is
// payment_split_for_trainer reading trainers.elite_until). Nothing here
// that nothing gates.
//
// The fee perk is built at render time from the coach's REAL split
// (lib/platformFee.ts): the "90% → 95%" comparison is only true for an
// independent coach on the standard 10% fee. A coach on an org seat pays no
// platform fee of their own (the gym is billed per seat), so quoting them a
// percentage they have never paid would be a fabricated number on the money
// screen. While the split is still loading, or failed to load, no figure is
// shown — INVARIANTS §4: never guess a number a coach prices around.
const PERKS_BEFORE_FEE = ['Unlimited athletes — the free plan holds 5'];
const PERKS_AFTER_FEE = [
  'AI coach assistant across your whole roster',
  'Live broadcasts with viewer chat and replays',
  'Elite badge on your coach profile',
];
const FEE_PERK_STANDARD = 'Keep 95% of every sale — the fee drops to 5%';
const FEE_PERK_NO_FIGURE = 'A lower platform fee on every sale';

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
  // The COACH offering, not the athlete default — the two audiences buy
  // different products and the packages would otherwise collide.
  const { coachOfferings: offerings, purchasePackage, restorePurchases, storeStatus } = useRevenueCat();
  const { plans, activeClients, trainer } = useApp();
  const { split } = usePaymentSplit(trainer?.id);
  const { showAlert } = useAlert();

  // Fee perk copy: percentages only when the coach is actually on the
  // standard 10% fee (1000 bps). Org-seat coaches (0 bps) and an unresolved
  // split both get the perk without a figure.
  const feePerk = split?.platformFeeBps === 1000 ? FEE_PERK_STANDARD : FEE_PERK_NO_FIGURE;
  const perks = [...PERKS_BEFORE_FEE, feePerk, ...PERKS_AFTER_FEE];
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // No store in a browser: RevenueCat purchases are native-only, so offerings
  // are null and the fallback price below would be a number we made up. On web
  // the screen states what Elite is and where to buy it — never a price we
  // cannot source, and never a button that silently grants or does nothing.
  const isWeb = Platform.OS === 'web';

  // ── Store packages ─────────────────────────────────────────────────────────
  const monthlyPkg =
    offerings?.availablePackages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ??
    offerings?.availablePackages?.[0];
  const annualPkg = offerings?.availablePackages.find(
    (p) => p.packageType === PACKAGE_TYPE.ANNUAL,
  );

  const [term, setTerm] = useState<'monthly' | 'annual'>('monthly');
  const pkg = term === 'annual' && annualPkg ? annualPkg : monthlyPkg;

  const monthlyPrice = monthlyPkg?.product.price ?? FALLBACK_PRICE;
  const monthlyPriceString = monthlyPkg?.product.priceString ?? FALLBACK_PRICE_STRING;
  const annualPrice = annualPkg?.product.price ?? null;
  const annualPriceString = annualPkg?.product.priceString ?? null;

  // Savings % derived from the real store prices — never hardcoded.
  const annualSavingsPct =
    annualPrice !== null && monthlyPrice > 0
      ? Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100)
      : null;
  // The comparison copy quotes the monthly price, so its math must too —
  // annual only ever makes that argument stronger.
  const elitePrice = monthlyPrice;
  const priceString = monthlyPriceString;

  // Trial copy only when the selected store product genuinely has a free intro offer.
  const intro = pkg?.product.introPrice;
  const hasTrial = !!intro && intro.price === 0;
  const trialLabel = hasTrial
    ? `${intro!.periodNumberOfUnits}-${intro!.periodUnit.toLowerCase()} free trial`
    : null;

  // ── The coach's real numbers — the same split Stripe applies ──────────────
  // Empty until the split resolves: a take-home figure computed against a
  // guessed fee is exactly the number this file must never show.
  const planBreakdown = useMemo(() => {
    if (!split) return [];
    const keepRatio = split.coachKeepsBps / 10000;
    return plans
      .map((plan) => {
        const holders = activeClients.filter((c) => c.plan_id === plan.id).length;
        const net = Number(plan.price || 0) * holders * keepRatio;
        return { plan, holders, net };
      })
      .filter((row) => row.holders > 0)
      .sort((a, b) => b.net - a.net);
  }, [plans, activeClients, split]);

  const monthlyNet = useMemo(
    () => planBreakdown.reduce((sum, row) => sum + row.net, 0),
    [planBreakdown],
  );

  // Show the comparison only when it's honest and it argues FOR the price:
  // real revenue exists and Elite is a minority share of it.
  const pctOfTake = monthlyNet > 0 ? (elitePrice / monthlyNet) * 100 : null;
  const showComparison = !isWeb && pctOfTake !== null && pctOfTake < 50;
  const pctLabel =
    pctOfTake === null ? null : pctOfTake < 1 ? 'under 1%' : `about ${Math.round(pctOfTake)}%`;

  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

  // ── Purchase / restore ─────────────────────────────────────────────────────
  const handlePurchase = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!pkg) {
      // NO PACKAGE, NO GRANT.
      //
      // This used to call onSuccess() here, with a comment explaining it as an
      // Expo Go convenience. But the condition is not "we are in Expo Go" — it
      // is "there is no purchasable package", which is ALSO true in a shipped
      // build whenever offerings fail to load, or the RevenueCat offering has
      // not been configured yet. The caller's onSuccess navigates straight to
      // /broadcast/setup, so a network blip handed a coach the Elite feature
      // for free. Not web-specific: it fired on iOS and Android too.
      //
      // The dev convenience is kept, but gated on __DEV__ so it cannot ship.
      if (__DEV__) {
        console.warn('[CoachElitePaywall] No package — granting in dev only.');
        onSuccess();
        return;
      }
      showAlert({
        type: 'error',
        title: 'Not available right now',
        message: `We couldn't load Elite pricing. Nothing has been charged.${storeStatus ? `

${storeStatus}` : ''}`,
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
      showAlert({ type: 'info', title: 'Nothing to restore', message: 'No previous Elite purchase was found for this account.' });
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
                {isWeb
                  ? 'Elite adds live broadcasts, viewer chat and replays on top of everything you already run for free.'
                  : `Elite is ${priceString} a month. It adds live broadcasts, viewer chat and replays on top of everything you already run for free.`}
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
              {!isWeb && !annualPkg && <Text style={s.elitePrice}>{priceString} a month</Text>}
            </View>

            {/* Term selector — only when the store actually offers both */}
            {!isWeb && annualPkg && (
              <View style={s.termGroup}>
                <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                  style={[s.termRow, term === 'monthly' && s.termRowActive]}
                  onPress={() => setTerm('monthly')}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityLabel={`Monthly, ${monthlyPriceString} per month`}
                  accessibilityState={{ selected: term === 'monthly' }}
                >
                  <View style={[s.termRadio, term === 'monthly' && s.termRadioActive]}>
                    {term === 'monthly' && <View style={s.termRadioDot} />}
                  </View>
                  <Text style={s.termLabel}>Monthly</Text>
                  <Text style={s.termPrice}>{monthlyPriceString}/mo</Text>
                </TouchableOpacity>
                <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                  style={[s.termRow, term === 'annual' && s.termRowActive]}
                  onPress={() => setTerm('annual')}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityLabel={`Annual, ${annualPriceString} per year${annualSavingsPct && annualSavingsPct > 0 ? `, save ${annualSavingsPct} percent` : ''}`}
                  accessibilityState={{ selected: term === 'annual' }}
                >
                  <View style={[s.termRadio, term === 'annual' && s.termRadioActive]}>
                    {term === 'annual' && <View style={s.termRadioDot} />}
                  </View>
                  <Text style={s.termLabel}>Annual</Text>
                  {annualSavingsPct !== null && annualSavingsPct > 0 && (
                    <View style={s.termSaveChip}>
                      <Text style={s.termSaveText}>Save {annualSavingsPct}%</Text>
                    </View>
                  )}
                  <Text style={s.termPrice}>{annualPriceString}/yr</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={s.perkList}>
              {perks.map((perk) => (
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

        {/* Pinned footer. On web there is nothing to press: purchases and
            restores both require the native store. Say so plainly. */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {isWeb ? (
            <Text style={s.webNoteText}>
              Subscriptions are managed in the FitLink app. Open it on your phone to go Elite or
              restore a purchase.
            </Text>
          ) : (
          <>
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
                {hasTrial
                  ? 'Start free trial'
                  : term === 'annual' && annualPriceString
                    ? `Go Elite — ${annualPriceString}/year`
                    : `Go Elite — ${priceString}/month`}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={s.footerNote}>
            {hasTrial
              ? `${trialLabel}, then ${term === 'annual' && annualPriceString ? `${annualPriceString}/year` : `${priceString}/month`} · cancel any time`
              : 'Cancel any time'}
          </Text>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
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
          </>
          )}
          <PaywallLegal style={s.legal} />
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
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  closeText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted },

  // Web: no store, no price, no purchase button — just the truth.
  webNoteText: {
    fontFamily: CoachFonts.body, fontSize: 14.5, lineHeight: 21.5,
    color: CoachColors.textSecondary, textAlign: 'center', paddingHorizontal: 8,
  },

  title: {
    fontFamily: CoachFonts.headingBold, fontSize: 30, lineHeight: 37,
    color: CoachColors.textPrimary, marginTop: 20,
  },
  sub: {
    fontFamily: CoachFonts.body, fontSize: 15, lineHeight: 23.5,
    color: CoachColors.textSecondary, marginTop: 9,
  },

  numbersCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 20, borderCurve: 'continuous', padding: 17, marginTop: 20,
  },
  numbersEyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  numbersRows: { marginTop: 14, gap: 10 },
  numbersRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  numbersPlan: {
    flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary,
  },
  numbersHolders: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted },
  numbersNet: {
    fontFamily: CoachFonts.mono, fontSize: 14, color: CoachColors.textSecondary,
    minWidth: 64, textAlign: 'right', fontVariant: ['tabular-nums'],
  },
  numbersTotalRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  numbersTotalLabel: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted },
  numbersTotalValue: { fontFamily: CoachFonts.headingBold, fontSize: 21.5, color: CoachColors.textPrimary, fontVariant: ['tabular-nums'] },

  eliteCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: 'rgba(198,242,78,0.22)',
    borderRadius: 20, borderCurve: 'continuous', padding: 18, marginTop: 12,
  },
  eliteTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  eliteTitle: { fontFamily: CoachFonts.headingBold, fontSize: 26, color: CoachColors.textPrimary },
  elitePrice: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, fontVariant: ['tabular-nums'] },
  termGroup: { gap: 8, marginBottom: 14 },
  termRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 12, borderCurve: 'continuous',
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: CoachColors.bg,
  },
  termRowActive: { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSoft },
  termRadio: {
    width: 18, height: 18, borderRadius: 9, borderCurve: 'continuous', borderWidth: 1.5,
    borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center',
  },
  termRadioActive: { borderColor: CoachColors.accent },
  termRadioDot: { width: 9, height: 9, borderRadius: 4.5, borderCurve: 'continuous', backgroundColor: CoachColors.accent },
  termLabel: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  termPrice: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textSecondary, fontVariant: ['tabular-nums'] },
  termSaveChip: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 8, paddingVertical: 3,
  },
  termSaveText: { fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.onAccent },
  perkList: { marginTop: 16, gap: 11 },
  perkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  perkText: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 15, lineHeight: 21.5,
    color: CoachColors.textPrimary,
  },
  eliteFootnote: {
    fontFamily: CoachFonts.body, fontSize: 14, lineHeight: 21.5, color: CoachColors.textSecondary,
    marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(198,242,78,0.14)',
  },

  freeCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 15, marginTop: 12,
  },
  freeTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  freeBody: {
    fontFamily: CoachFonts.body, fontSize: 14, lineHeight: 21.5,
    color: CoachColors.textMuted, marginTop: 5,
  },

  footer: {
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, backgroundColor: CoachColors.bg,
  },
  legal: { marginTop: 8 },
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
});
