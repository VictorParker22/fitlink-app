import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppBusiness, useAppClients, useAppPlans } from '../../../context/AppContext';
import { useRenderCount } from '../../../lib/devRenderCount';
import { usePaymentSplit, coachKeeps } from '../../../lib/platformFee';
import RollingNumber from '../../RollingNumber';
import CardImage from '../../ui/CardImage';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { activeOf } from './homeSignals';

/**
 * Revenue + passes + library — one line each, demoted to the bottom. Each
 * card is its own memo so a library edit does not redraw the revenue line.
 */

/** Monthly net earnings. Business (trainer id → split), plans, clients. */
const RevenueCard = React.memo(function RevenueCard() {
  useRenderCount('RevenueCard');
  const router = useRouter();
  const { trainer } = useAppBusiness();
  const { clients } = useAppClients();
  const { plans } = useAppPlans();
  const activeClients = activeOf(clients);

  // Monthly earnings (net, after the coach's REAL split) — same calc as
  // Earnings. null while the split is unknown: the card shows "—" rather
  // than a guessed 90% (lib/platformFee.ts).
  const { split } = usePaymentSplit(trainer?.id);
  const monthlyEarnings = useMemo<number | null>(() => {
    if (!split) return null;
    const active = activeOf(clients);
    let total = 0;
    plans.forEach(p => {
      const subs = active.filter(c => c.plan_id === p.id).length;
      total += coachKeeps(Number(p.price || 0) * subs, split);
    });
    return total;
  }, [clients, plans, split]);
  const monthlyEarningsLabel = monthlyEarnings == null ? '—' : `$${monthlyEarnings.toFixed(0)}`;

  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long' });

  return (
    <TouchableOpacity
      style={styles.revenueCard}
      activeOpacity={0.8}
      onPress={() => router.push('/earnings')}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${monthLabel} revenue, ${monthlyEarningsLabel}, ${activeClients.length} active athletes. Double tap to open earnings`}
    >
      <View>
        <Text style={styles.revenueMonth}>{monthLabel}</Text>
        <View style={styles.revenueValueRow}>
          <RollingNumber
            text={monthlyEarningsLabel}
            style={styles.revenueValue}
          />
          <Text style={styles.revenueValue} numberOfLines={1}> · {activeClients.length} active</Text>
        </View>
      </View>
      <Text style={styles.revenueLink}>Revenue →</Text>
    </TouchableOpacity>
  );
});

/** Pass count and how many athletes hold one. Plans + clients. */
const PassesCard = React.memo(function PassesCard() {
  useRenderCount('PassesCard');
  const router = useRouter();
  const { clients } = useAppClients();
  const { plans } = useAppPlans();
  const activeClients = activeOf(clients);

  return (
    <TouchableOpacity
      style={styles.revenueCard}
      activeOpacity={0.8}
      onPress={() => router.push('/(tabs)/programs' as any)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${plans.length} pass${plans.length === 1 ? '' : 'es'}, ${activeClients.filter(c => c.plan_id).length} athlete${activeClients.filter(c => c.plan_id).length === 1 ? '' : 's'} holding one. Double tap to manage passes`}
    >
      <View style={styles.footerLeft}>
        <View style={styles.footerThumb}>
          <CardImage
            source={require('../../../assets/images/card-season-pass.jpg')}
            scrim="none"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.revenueMonth}>{plans.length} pass{plans.length === 1 ? '' : 'es'}</Text>
          <Text style={styles.revenueValue}>
            {activeClients.filter(c => c.plan_id).length} athlete{activeClients.filter(c => c.plan_id).length === 1 ? '' : 's'} holding one
          </Text>
        </View>
      </View>
      <Text style={styles.revenueLink}>Manage →</Text>
    </TouchableOpacity>
  );
});

/** Workout library size. Plans slice only. */
const LibraryCard = React.memo(function LibraryCard() {
  useRenderCount('LibraryCard');
  const router = useRouter();
  const { workouts } = useAppPlans();

  return (
    <TouchableOpacity
      style={styles.revenueCard}
      activeOpacity={0.8}
      onPress={() => router.push('/(tabs)/programs?tab=workouts' as any)}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`Library, ${workouts.length} workout${workouts.length === 1 ? '' : 's'} on file. Double tap to browse`}
    >
      <View style={styles.footerLeft}>
        <View style={styles.footerThumb}>
          <CardImage
            source={require('../../../assets/images/card-new-workout.jpg')}
            scrim="none"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.revenueMonth}>Library</Text>
          <Text style={styles.revenueValue}>
            {workouts.length} workout{workouts.length === 1 ? '' : 's'} on file
          </Text>
        </View>
      </View>
      <Text style={styles.revenueLink}>Browse →</Text>
    </TouchableOpacity>
  );
});

const FooterCards = React.memo(function FooterCards() {
  useRenderCount('FooterCards');
  return (
    <View style={styles.footerCards}>
      <RevenueCard />
      <PassesCard />
      <LibraryCard />
    </View>
  );
});

export default FooterCards;

const styles = StyleSheet.create({
  // Revenue + Passes
  footerCards: {
    marginHorizontal: 20,
    marginTop: 24,
    gap: 10,
  },
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    // 14 was off the radius scale — migrated to the 16 card stop while touching.
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  footerThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  revenueMonth: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textFaint,
  },
  revenueValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  revenueValue: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  revenueLink: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
});
