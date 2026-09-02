import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import BoltEmptyState from '../components/mascot/BoltEmptyState';
import { usePaymentSplit, coachKeeps, bpsToPercentLabel } from '../lib/platformFee';

/**
 * Passes — the business lens on the same plans the Library's Passes tab
 * manages. The Library (programs.tsx) owns creation, track editing and the
 * Autoflow config; this screen answers "what is each pass worth?".
 *
 * Fixes over the previous version: the price-derived DIAMOND/GOLD/SILVER
 * "tier" theatre is gone (it encoded nothing real), "YOUR EMPIRE" is gone,
 * and every revenue figure now subtracts the coach's REAL split (platform fee
 * plus any org share, from lib/platformFee.ts — the same function Stripe
 * uses) exactly as earnings.tsx does — the old screen showed gross dressed
 * up as take-home. While the split is still loading the figures read "—"
 * rather than guessing 10%. All counts come from real client rows.
 */

export default function SubscriptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { plans, clients, trainer, refreshData } = useApp();
  const { split } = usePaymentSplit(trainer?.id);
  const feeLabel = split ? bpsToPercentLabel(split.platformFeeBps + split.orgShareBps) : null;
  const keepLabel = split ? bpsToPercentLabel(split.coachKeepsBps) : null;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  }, [refreshData]);

  // Same holder definition as earnings.tsx: anyone not inactive counts.
  const holdersOf = useCallback(
    (planId: string) => clients.filter(c => c.plan_id === planId && c.status !== 'inactive'),
    [clients],
  );

  const breakdown = useMemo(() => {
    return plans
      .map(plan => {
        const holders = holdersOf(plan.id);
        const active = holders.filter(h => h.status === 'active').length;
        const trial = holders.filter(h => h.status === 'trial').length;
        const gross = Number(plan.price) * holders.length;
        const net = split ? coachKeeps(gross, split) : 0;
        return { plan, holders: holders.length, active, trial, gross, net };
      })
      .sort((a, b) => b.net - a.net);
  }, [plans, holdersOf, split]);

  const totalNet = useMemo(() => breakdown.reduce((s, b) => s + b.net, 0), [breakdown]);
  const totalHolders = useMemo(() => breakdown.reduce((s, b) => s + b.holders, 0), [breakdown]);
  const totalTrial = useMemo(() => breakdown.reduce((s, b) => s + b.trial, 0), [breakdown]);

  const formatWhole = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const formatCurrency = (n: number) => `$${n.toFixed(2)}`;
  // Net figures only exist once the split is known.
  const fmtNet = (n: number) => (split ? formatWhole(n) : '—');

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.textSecondary} />}
      >
        {/* ── Header ── */}
        <View style={st.header}>
          <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={st.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={19} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.headerTitle}>Passes</Text>
            <Text style={st.headerSub}>What each pass brings in</Text>
          </View>
          <TouchableOpacity hitSlop={4}
            onPress={() => router.push('/create-plan' as any)}
            style={st.addBtn}
            accessibilityRole="button"
            accessibilityLabel="Create a pass"
          >
            <Ionicons name="add" size={22} color={CoachColors.onAccent} />
          </TouchableOpacity>
        </View>

        {plans.length === 0 ? (
          <BoltEmptyState
            pose="welcome"
            title="No passes yet"
            subtitle={keepLabel ? `Create a pass to start charging athletes monthly. You keep ${keepLabel} of every payment.` : 'Create a pass to start charging athletes monthly.'}
            actionLabel="Create a pass"
            onAction={() => router.push('/create-plan' as any)}
          />
        ) : (
          <>
            {/* ── Headline ── */}
            <View style={st.headlineCard}>
              <Text style={st.headlineLabel}>Monthly recurring</Text>
              <Text style={st.headlineValue}>{fmtNet(totalNet)}</Text>
              <Text style={st.headlineDesc}>
                From {totalHolders} pass holder{totalHolders === 1 ? '' : 's'} across {plans.length} pass{plans.length === 1 ? '' : 'es'}, after the {feeLabel ?? 'platform'} fee.
                {totalTrial > 0 ? ` ${totalTrial} of them ${totalTrial === 1 ? 'is' : 'are'} still on a trial.` : ''}
              </Text>
            </View>

            {/* ── Per-pass breakdown ── */}
            <Text style={st.sectionTitle}>By pass</Text>
            <Text style={st.sectionDesc}>Tap a pass for pricing and details. Tracks and Autoflow live in the Library.</Text>

            {breakdown.map(({ plan, holders, active, trial, net }) => {
              const share = totalNet > 0 ? (net / totalNet) * 100 : 0;
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={st.passCard}
                  activeOpacity={0.85}
                  onPress={() => router.push({ pathname: '/plan-detail', params: { planId: plan.id } } as any)}
                  accessibilityRole="button"
                >
                  <View style={st.passTopRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.passName} numberOfLines={1}>{plan.name}</Text>
                      <Text style={st.passMeta}>
                        {formatCurrency(Number(plan.price))} / {plan.period || 'monthly'}
                        {holders === 0
                          ? ' · no holders yet'
                          : ` · ${active} active${trial > 0 ? ` · ${trial} on trial` : ''}`}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={st.passNet}>{fmtNet(net)}</Text>
                      <Text style={st.passNetSub}>/mo after fee</Text>
                    </View>
                  </View>

                  <View style={st.barTrack}>
                    <View style={[st.barFill, { width: `${Math.max(share, holders > 0 ? 2 : 0)}%` }]} />
                  </View>

                  <View style={st.passFooter}>
                    <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }}
                      style={st.footerBtn}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/pass-holders?planId=${plan.id}` as any)}
                      accessibilityRole="button"
                    >
                      <Text style={st.footerBtnText}>Holders</Text>
                    </TouchableOpacity>
                    <View style={st.footerDivider} />
                    <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }}
                      style={st.footerBtn}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/pass-track-editor?planId=${plan.id}` as any)}
                      accessibilityRole="button"
                    >
                      <Text style={st.footerBtnText}>Edit track</Text>
                    </TouchableOpacity>
                    <View style={st.footerDivider} />
                    <View style={st.footerBtn}>
                      <Text style={st.footerBtnAccent}>Details</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={st.footnote}>
              Revenue here matches Earnings: holder count × price, minus the {feeLabel ? `${feeLabel} ` : ''}platform fee.
            </Text>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  // paddingBottom is applied inline from the real bottom inset (pushed route: no tab bar).
  scrollContent: { paddingHorizontal: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 21.5,
    letterSpacing: -0.3,
    color: CoachColors.textPrimary,
  },
  headerSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headlineCard: {
    marginTop: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 18,
  },
  headlineLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    letterSpacing: 0.6,
  },
  headlineValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 40.5,
    letterSpacing: -0.5,
    color: CoachColors.accent,
    marginTop: 9,
  },
  headlineDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    marginTop: 8,
    lineHeight: 20,
  },

  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginTop: 22,
    marginBottom: 4,
  },
  sectionDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    lineHeight: 20,
    marginBottom: 12,
  },

  passCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
    marginBottom: 10,
  },
  passTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  passName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  passMeta: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 2,
  },
  passNet: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
  },
  passNetSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textFaint,
    marginTop: 1,
  },
  barTrack: {
    height: 5,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.borderMuted,
    marginTop: 12,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  passFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  footerBtn: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  footerDivider: { width: 1, height: 14, backgroundColor: CoachColors.borderMuted },
  footerBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },
  footerBtnAccent: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.accent,
  },

  footnote: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textFaint,
    lineHeight: 19,
    marginTop: 8,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 260,
  },
  emptyCta: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: 18,
  },
  emptyCtaText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15,
    color: CoachColors.onAccent,
  },
});
