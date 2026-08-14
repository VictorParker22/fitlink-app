// components/dashboard/RevenueIntelligenceCard.tsx
// Business intelligence card: actual earnings → at-risk → conversion funnel.

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrecisionIcons } from '../icons/PrecisionIcons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

const useCountUp = (target: number, duration: number = 1200) => {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    startTime.current = null;
    if (target === 0) {
      setValue(0);
      return;
    }
    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      setValue(Math.floor(progress * target));
      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate);
      }
    };
    rafId.current = requestAnimationFrame(animate);
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [target, duration]);

  return value;
};

export const RevenueIntelligenceCard: React.FC = () => {
  const router = useRouter();
  const { clients, plans, activeClients, trialClients } = useApp();

  const revenue = useMemo(() => {
    // Actual MRR from active paying clients (gross plan revenue)
    const actual = plans.reduce((sum, plan) => {
      const count = activeClients.filter(c => c.plan_id === plan.id && c.status === 'active').length;
      return sum + Number(plan.price ?? 0) * count;
    }, 0);

    // Average plan price (fallback for trials without an assigned plan)
    const planCount = plans.filter(p => Number(p.price ?? 0) > 0).length;
    const avgPrice = planCount > 0
      ? plans.reduce((sum, p) => sum + Number(p.price ?? 0), 0) / planCount
      : 0;

    // At-risk = plan value of trial clients who haven't converted
    const atRisk = trialClients.reduce((sum, client) => {
      const plan = plans.find(p => p.id === client.plan_id);
      return sum + Number(plan?.price ?? avgPrice);
    }, 0);

    // Funnel counts
    const leads = clients.length;
    const trials = trialClients.length;
    const active = activeClients.filter(c => c.status === 'active').length;

    return { actual, atRisk, leads, trials, active };
  }, [clients, plans, activeClients, trialClients]);

  const animActual = useCountUp(revenue.actual);
  const animAtRisk = useCountUp(revenue.atRisk);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => router.push('/earnings' as any)}
      activeOpacity={0.85}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <PrecisionIcons.TrendingUp size={14} color={CoachColors.accent} />
          <Text style={styles.headerTitle}>Revenue</Text>
        </View>
        <Text style={styles.tapHint}>Full report</Text>
      </View>

      {/* Main figure */}
      <View style={styles.figureRow}>
        <View>
          <Text style={styles.figureLabel}>This month</Text>
          <Text style={styles.figureValue}>${animActual.toFixed(0)}</Text>
        </View>
      </View>

      {/* At-risk row */}
      {revenue.atRisk > 0 && (
        <View style={styles.riskRow}>
          <PrecisionIcons.Shield size={13} color={CoachColors.warning} />
          <Text style={styles.riskText}>
            ${animAtRisk.toFixed(0)} at risk — {revenue.trials} trial{revenue.trials !== 1 ? 's' : ''} pending upgrade
          </Text>
        </View>
      )}

      {/* Conversion funnel */}
      <View style={styles.funnelRow}>
        {[
          { label: 'Clients', value: revenue.leads },
          { label: 'Trials', value: revenue.trials },
          { label: 'Active', value: revenue.active },
        ].map((item, i, arr) => (
          <React.Fragment key={item.label}>
            <View style={styles.funnelItem}>
              <Text style={styles.funnelValue}>{item.value}</Text>
              <Text style={styles.funnelLabel}>{item.label}</Text>
            </View>
            {i < arr.length - 1 && (
              <Ionicons name="chevron-forward" size={12} color={CoachColors.textFaint} />
            )}
          </React.Fragment>
        ))}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  tapHint: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.accent,
  },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 12,
  },
  figureLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  figureValue: {
    fontFamily: CoachFonts.mono,
    fontSize: 26,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoachColors.warningSoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
  },
  riskText: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.warning,
    flex: 1,
  },
  funnelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  funnelItem: {
    alignItems: 'center',
    gap: 1,
  },
  funnelValue: {
    fontFamily: CoachFonts.mono,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  funnelLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 10,
    color: CoachColors.textMuted,
  },
});
