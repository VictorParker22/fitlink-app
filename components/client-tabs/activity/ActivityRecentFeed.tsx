import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize, Spacing, Radius } from '../../../constants/theme';
import { getCategoryColor } from '../../../data/categoryColors';
import { useTheme } from '../../../context/ThemeContext';

interface ActivityRecentFeedProps {
  workouts: any[];
  sessions: any[];
  progressLogs: any[];
  onPressWorkout?: (id: string) => void;
}

export const ActivityRecentFeed: React.FC<ActivityRecentFeedProps> = ({
  workouts = [],
  sessions = [],
  progressLogs = [],
  onPressWorkout,
}) => {
  const { colors } = useTheme();

  const mergedFeed = [
    ...workouts.filter((w) => w.status === 'completed').map((w) => ({
      id: w.id,
      type: 'workout' as const,
      name: w.workouts?.name || 'Workout',
      category: w.workouts?.category || 'General',
      date: new Date(w.completed_at || w.date),
      duration: `${Math.round((w.duration_seconds || 0) / 60)} min`,
      isCoachAssigned: !!w.isCoachAssigned,
    })),
    ...sessions.filter((s) => s.status === 'completed').map((s) => ({
      id: s.id,
      type: 'session' as const,
      name: `${s.type || 'Session'} with ${s.trainer?.name || 'Coach'}`,
      category: s.type || 'General',
      date: new Date(s.date),
      duration: `${s.duration || 0} min`,
      isCoachAssigned: true,
    })),
    ...progressLogs.map((p) => ({
      id: p.id,
      type: 'log' as const,
      name: 'Progress Check-in',
      category: 'Other',
      date: new Date(p.date),
      duration: '',
      isCoachAssigned: false,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 8);

  const getRelativeDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const handlePress = (item: any) => {
    if (item.type === 'workout' && onPressWorkout) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPressWorkout(item.id);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.tagHeader}>ACTIVITY // RECENT HISTORY</Text>
      <View style={styles.divider} />

      {mergedFeed.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="barbell-outline" size={48} color="rgba(255,255,255,0.25)" />
          </View>
          <Text style={styles.emptyText}>
            No recent activity yet. Complete your first workout to see it here.
          </Text>
        </View>
      ) : (
        <View style={styles.feedContainer}>
          {mergedFeed.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, borderTopColor: getCategoryColor(item.category) }]}
              onPress={() => handlePress(item)}
              disabled={item.type !== 'workout' || !onPressWorkout}
              activeOpacity={0.7}
            >
              <View style={styles.contentArea}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.metaRow}>
                  {item.isCoachAssigned ? (
                    <View style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
                      <Text style={[styles.pillText, { color: colors.accent }]}>Coach</Text>
                    </View>
                  ) : (
                    <View style={[styles.pill, { borderWidth: 1, borderColor: colors.border }]}>
                      <Text style={[styles.pillText, { color: colors.textSecondary }]}>Logged</Text>
                    </View>
                  )}
                  {item.duration ? <Text style={styles.metaText}>{item.duration}</Text> : null}
                  {item.duration ? <Text style={styles.metaDot}>•</Text> : null}
                  <Text style={styles.metaText}>{getRelativeDate(item.date)}</Text>
                </View>
              </View>
              <View style={styles.navButtonContainer}>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: Spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 16,
    maxWidth: '80%',
  },
  feedContainer: {
    flexDirection: 'column',
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderTopWidth: 3,
    borderRadius: Radius.md,
  },
  contentArea: {
    flex: 1,
    paddingLeft: 4,
  },
  itemName: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.base,
    color: '#FFF',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
  },
  metaText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.4)',
  },
  metaDot: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.2)',
    marginHorizontal: 6,
  },
  navButtonContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
