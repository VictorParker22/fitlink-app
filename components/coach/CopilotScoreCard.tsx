import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCopilotAnalytics } from '../../hooks/useCopilotAnalytics';
import { Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
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
    return top.replace('_', ' ');
  }, [analytics.tapsByCategory]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
         <PrecisionIcons.Activity size={16} color={CoachColors.accent} />
         <Text style={styles.title}>Copilot analytics</Text>
      </View>
      <View style={styles.statsRow}>
         <View style={styles.statBox}>
            <Text style={styles.statVal}>{actionRate}%</Text>
            <Text style={styles.statLabel}>Action rate</Text>
         </View>
         <View style={styles.divider} />
         <View style={styles.statBox}>
            <Text style={[styles.statVal, styles.statValCategory]} numberOfLines={1} adjustsFontSizeToFit>{topCategory}</Text>
            <Text style={styles.statLabel}>Top acted category</Text>
         </View>
         <View style={styles.divider} />
         <View style={styles.statBox}>
            <Text style={styles.statVal}>{analytics.taps}</Text>
            <Text style={styles.statLabel}>Total actions</Text>
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
    backgroundColor: CoachColors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
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
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: Spacing.md,
  },
  statVal: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24.5,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  statValCategory: {
    textTransform: 'capitalize',
  },
  statLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
