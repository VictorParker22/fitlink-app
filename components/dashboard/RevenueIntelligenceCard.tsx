// components/dashboard/RevenueIntelligenceCard.tsx
// Upgrades the static "$823" to a full business intelligence card:
// actual earnings → projected → at-risk → conversion funnel.

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PrecisionIcons } from '../icons/PrecisionIcons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { FontFamily, FontSize, Radius, Spacing } from '../../constants/theme';

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
    const PLATFORM_FEE = 0.10; // 10% FitLink platform cut
    const TRIAL_CONVERSION_RATE = 0.60; // industry-standard 60%

    // Actual MRR from active paying clients
    const actual = plans.reduce((sum, plan) => {
      const count = activeClients.filter(c => c.plan_id === plan.id && c.status === 'active').length;
      return sum + Number(plan.price ?? 0) * count * (1 - PLATFORM_FEE);
    }, 0);

    // Average plan price (for projection)
    const planCount   = plans.filter(p => Number(p.price ?? 0) > 0).length;
    const avgPrice    = planCount > 0
      ? plans.reduce((sum, p) => sum + Number(p.price ?? 0), 0) / planCount
      : 0;

    // At-risk = trial clients who haven't converted
    const atRisk = trialClients.reduce((sum, client) => {
      const plan = plans.find(p => p.id === client.plan_id);
      return sum + Number(plan?.price ?? avgPrice) * (1 - PLATFORM_FEE);
    }, 0);

    // Projected = actual + expected trial conversions
    const projected = actual + atRisk * TRIAL_CONVERSION_RATE;

    // Funnel counts
    const leads   = clients.length;
    const trials  = trialClients.length;
    const active  = activeClients.filter(c => c.status === 'active').length;

    return { actual, projected, atRisk, leads, trials, active };
  }, [clients, plans, activeClients, trialClients]);

  const progress = revenue.projected > 0 ? Math.min(revenue.actual / revenue.projected, 1) : 0;
  const uplift   = revenue.actual > 0
    ? Math.round(((revenue.projected - revenue.actual) / revenue.actual) * 100)
    : 0;

  const animActual = useCountUp(revenue.actual);
  const animProjected = useCountUp(revenue.projected);
  const animAtRisk = useCountUp(revenue.atRisk);

  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: progress * 100,
      duration: 1000,
      useNativeDriver: false, // width animation can't use native driver
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [progress, barWidth]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => router.push('/earnings' as any)}
      activeOpacity={0.85}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <PrecisionIcons.TrendingUp size={14} color="#22C55E" />
          <Text style={styles.headerTitle}>Revenue</Text>
        </View>
        <Text style={styles.tapHint}>Full report →</Text>
      </View>

      {/* Main figures */}
      <View style={styles.figureRow}>
        <View>
          <Text style={styles.figureLabel}>This month</Text>
          <Text style={styles.figureValue}>${animActual.toFixed(0)}</Text>
        </View>
        <View style={styles.divider} />
        <View>
          <Text style={styles.figureLabel}>Projected</Text>
          <Text style={[styles.figureValue, { color: '#22C55E' }]}>
            ${animProjected.toFixed(0)}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
      </View>
      {uplift > 0 && (
        <Text style={styles.upliftText}>+{uplift}% upside if trials convert</Text>
      )}

      {/* At-risk row */}
      {revenue.atRisk > 0 && (
        <View style={styles.riskRow}>
          <PrecisionIcons.Shield size={13} color="#FF9500" />
          <Text style={styles.riskText}>
            ${animAtRisk.toFixed(0)} at risk — {revenue.trials} trial{revenue.trials !== 1 ? 's' : ''} pending upgrade
          </Text>
        </View>
      )}

      {/* Conversion funnel */}
      <View style={styles.funnelRow}>
        {[
          { label: 'Clients',  value: revenue.leads  },
          { label: 'Trials',   value: revenue.trials },
          { label: 'Active',   value: revenue.active },
        ].map((item, i, arr) => (
          <React.Fragment key={item.label}>
            <View style={styles.funnelItem}>
              <Text style={styles.funnelValue}>{item.value}</Text>
              <Text style={styles.funnelLabel}>{item.label}</Text>
            </View>
            {i < arr.length - 1 && (
              <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.2)" />
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
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.15)',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  tapHint: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#22C55E',
  },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 12,
  },
  figureLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  figureValue: {
    fontFamily: FontFamily.mono,
    fontSize: 26,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  divider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#22C55E',
  },
  upliftText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 10,
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,149,0,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
  },
  riskText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: '#FF9500',
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
    fontFamily: FontFamily.mono,
    fontSize: 16,
    color: '#FFFFFF',
  },
  funnelLabel: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
});
