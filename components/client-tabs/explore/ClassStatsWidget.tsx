import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useWorkout } from '../../../context/WorkoutContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

export function ClassStatsWidget() {
  const { workoutHistory } = useWorkout();

  const stats = useMemo(() => {
    if (!workoutHistory || workoutHistory.length === 0) return null;

    const totalClasses = workoutHistory.length;
    let totalSeconds = 0;
    const categoryCounts: Record<string, number> = {};
    const dates = new Set<string>();

    workoutHistory.forEach(entry => {
      totalSeconds += entry.durationSec;

      if (entry.category) {
        categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
      }

      if (entry.completedAt) {
        const dateStr = new Date(entry.completedAt).toISOString().split('T')[0];
        dates.add(dateStr);
      }
    });

    const totalMinutes = Math.round(totalSeconds / 60);

    let topCategory = '-';
    let maxCount = 0;
    for (const [cat, count] of Object.entries(categoryCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topCategory = cat;
      }
    }

    // Calculate current week streak
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (dates.has(dateStr)) {
        streak++;
      } else {
        if (i !== 0) break; // if today is missing, allow streak from yesterday
      }
    }

    return {
      totalClasses,
      totalMinutes,
      topCategory: topCategory !== '-' ? topCategory : 'N/A',
      streak,
    };
  }, [workoutHistory]);

  if (!stats) return null;

  return (
    <View style={styles.containerWrapper}>
      <View style={styles.header}>
        <Text style={styles.tag}>Analytics // your stats</Text>
        <Text style={styles.sectionTitle}>Class stats</Text>
      </View>
      <View style={styles.container}>
        <View style={styles.grid}>
          <View style={styles.pill}>
            <Text style={styles.value}>{stats.totalClasses}</Text>
            <Text style={styles.label}>Classes</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.value}>{stats.totalMinutes}</Text>
            <Text style={styles.label}>Minutes</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{stats.topCategory}</Text>
            <Text style={styles.label}>Top category</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.value}>{stats.streak}</Text>
            <Text style={styles.label}>Day streak</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  containerWrapper: {
    marginBottom: 20,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 2,
    color: CoachColors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    letterSpacing: -0.5,
    color: CoachColors.textPrimary,
  },
  container: {
    marginHorizontal: 16,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    padding: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  pill: {
    width: '45%',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  value: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24,
    letterSpacing: -0.5,
    color: CoachColors.accent,
    marginBottom: 4,
  },
  label: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.5,
    color: CoachColors.textMuted,
    textTransform: 'uppercase',
  },
});
