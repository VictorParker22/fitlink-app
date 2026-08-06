import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useCountUp } from '../../hooks/useCountUp';
import { FontFamily, Radius, Spacing } from '../../constants/theme';
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
        <PrecisionIcons.Activity size={16} color="#FF9F0A" />
        <Text style={styles.title}>Trial Conversion Pipeline</Text>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
           <Text style={styles.statVal}>{displayTrials}</Text>
           <Text style={styles.statLabel}>ACTIVE TRIALS</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
           <Text style={styles.statVal}>{displayConversions}</Text>
           <Text style={styles.statLabel}>CONVERSIONS</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statBox}>
           <Text style={styles.statVal}>{displayRate}%</Text>
           <Text style={styles.statLabel}>WIN RATE</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
    fontFamily: FontFamily.mono,
    fontSize: 28,
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
