import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCopilotAnalytics } from '../../hooks/useCopilotAnalytics';
import { FontFamily, Radius, Spacing } from '../../constants/theme';
import { PrecisionIcons } from '../icons/PrecisionIcons';

export const CopilotScoreCard: React.FC = () => {
  const { analytics } = useCopilotAnalytics();

  const totalInteractions = analytics.taps + analytics.dismisses;
  const actionRate = totalInteractions === 0 ? 0 : Math.round((analytics.taps / totalInteractions) * 100);

  const topCategory = useMemo(() => {
    let top = 'none';
    let max = 0;
    for (const [cat, count] of Object.entries(analytics.tapsByCategory)) {
      if (count && count > max) {
        max = count;
        top = cat;
      }
    }
    return top.replace('_', ' ').toUpperCase();
  }, [analytics.tapsByCategory]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
         <PrecisionIcons.Activity size={16} color="#30D158" />
         <Text style={styles.title}>Copilot Analytics</Text>
      </View>
      <View style={styles.statsRow}>
         <View style={styles.statBox}>
            <Text style={styles.statVal}>{actionRate}%</Text>
            <Text style={styles.statLabel}>ACTION RATE</Text>
         </View>
         <View style={styles.divider} />
         <View style={styles.statBox}>
            <Text style={styles.statVal} numberOfLines={1} adjustsFontSizeToFit>{topCategory}</Text>
            <Text style={styles.statLabel}>TOP ACTED CATEGORY</Text>
         </View>
         <View style={styles.divider} />
         <View style={styles.statBox}>
            <Text style={styles.statVal}>{analytics.taps}</Text>
            <Text style={styles.statLabel}>TOTAL ACTIONS</Text>
         </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: Spacing.md,
  },
  statVal: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
});
