// UNMOUNTED — `conversions`/`conversionRate` have no data source: a trial's
// status row is overwritten in place on conversion, leaving no audit/event row
// to count. Mount this once a trial-conversion event exists in the schema.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCountUp } from '../../hooks/useCountUp';
import { Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { PrecisionIcons } from '../icons/PrecisionIcons';

interface Props {
  activeTrials: number;
  conversions: number;
  conversionRate: number;
}

export const TrialConversionPipeline: React.FC<Props> = ({ activeTrials, conversions, conversionRate }) => {
  const displayTrials = useCountUp(activeTrials, 800);
  const displayConversions = useCountUp(conversions, 800);
  const displayRate = useCountUp(conversionRate, 800);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <PrecisionIcons.Activity size={16} color={CoachColors.accent} />
        <Text style={styles.title}>Trial conversion pipeline</Text>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
           <Text style={styles.statVal}>{displayTrials}</Text>
           <Text style={styles.statLabel}>Active trials</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
           <Text style={styles.statVal}>{displayConversions}</Text>
           <Text style={styles.statLabel}>Conversions</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
           <Text style={styles.statVal}>{displayRate}%</Text>
           <Text style={styles.statLabel}>Win rate</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
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
    fontFamily: CoachFonts.mono,
    fontSize: 31.5,
    color: CoachColors.textPrimary,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
