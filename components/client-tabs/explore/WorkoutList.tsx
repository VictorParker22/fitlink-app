import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useClient } from '../../../context/ClientContext';

type TabKey = 'upcoming' | 'completed' | 'all';

interface WorkoutListProps {
  onBackToExplore: () => void;
  onStartActiveWorkout: (workout: any) => void;
}

export default function WorkoutList({ onBackToExplore, onStartActiveWorkout }: WorkoutListProps) {
  const { workouts, markWorkoutComplete, markWorkoutSkipped, refreshData } = useClient();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('upcoming');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const handleComplete = (id: string, name: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Complete workout', `Mark "${name}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => markWorkoutComplete(id) },
    ]);
  };

  const handleSkip = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markWorkoutSkipped(id);
  };

  // Filter + group by date section
  const filtered = useMemo(() => {
    let list = [...workouts];
    if (tab === 'upcoming') list = list.filter((w: any) => w.status === 'assigned');
    else if (tab === 'completed') list = list.filter((w: any) => w.status === 'completed');
    return list;
  }, [workouts, tab]);

  const sections = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach((w: any) => {
      const d = new Date(w.assigned_date);
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      let label: string;
      if (d.toDateString() === today.toDateString()) label = 'Today';
      else if (d.toDateString() === tomorrow.toDateString()) label = 'Tomorrow';
      else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
      else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      if (!groups[label]) groups[label] = [];
      groups[label].push(w);
    });
    return Object.entries(groups).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  const totalCompleted = workouts.filter((w: any) => w.status === 'completed').length;
  const totalAssigned = workouts.filter((w: any) => w.status === 'assigned').length;

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: totalAssigned },
    { key: 'completed', label: 'Completed', count: totalCompleted },
    { key: 'all', label: 'All', count: workouts.length },
  ];

  return (
    <View style={s.container}>
      {/* Top Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={onBackToExplore}
          style={s.backBtn}
          accessibilityLabel="Back to Explore"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={CoachColors.textPrimary} />
          <Text style={s.backBtnText}>Explore</Text>
        </TouchableOpacity>

        <View style={s.headerStats}>
          <View style={[s.miniStat, { borderColor: CoachColors.accent }]}>
            <Ionicons name="checkmark-circle" size={12} color={CoachColors.accent} />
            <Text style={[s.miniStatText, { color: CoachColors.accent }]}>{totalCompleted}</Text>
          </View>
          <View style={[s.miniStat, { borderColor: CoachColors.border }]}>
            <Ionicons name="flash" size={12} color={CoachColors.textSecondary} />
            <Text style={[s.miniStatText, { color: CoachColors.textSecondary }]}>{totalAssigned}</Text>
          </View>
        </View>
      </View>

      <Text style={s.pageTitleTag}>Your program</Text>
      <Text style={s.pageTitle}>Workouts</Text>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, tab === t.key && s.tabActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTab(t.key);
            }}
            activeOpacity={0.7}
          >
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            <View style={[s.tabBadge, tab === t.key && s.tabBadgeActive]}>
              <Text style={[s.tabBadgeText, tab === t.key && { color: CoachColors.onAccent }]}>{t.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Section List */}
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} />}
        ListEmptyComponent={
          <View style={s.emptyState}>
            {/* §8 Opinionated empty copy, not all-caps generic label */}
            <Text style={s.emptyHero}>
              {tab === 'completed' ? 'Nothing yet.' : 'All clear.'}
            </Text>
            <Text style={s.emptySub}>
              {tab === 'completed'
                ? 'Complete your first session to see it here.'
                : tab === 'upcoming'
                  ? 'Your trainer will add workouts soon.'
                  : 'No workouts assigned yet.'}
            </Text>
            {/* §16 CTA always present in empty state */}
            {tab !== 'completed' && (
              <TouchableOpacity
                style={s.emptyCtaBtn}
                onPress={onBackToExplore}
                activeOpacity={0.85}
              >
                <Text style={s.emptyCtaText}>Browse catalog</Text>
                <Ionicons name="arrow-forward" size={14} color={CoachColors.onAccent} />
              </TouchableOpacity>
            )}
          </View>
        }
        renderSectionHeader={({ section: { title } }) => (
          <Text style={s.sectionHeader}>{title}</Text>
        )}
        renderItem={({ item: workout }) => {
          const exercises = workout.workouts?.workout_exercises || [];
          const isExpanded = expandedId === workout.id;
          const isToday = new Date(workout.assigned_date).toDateString() === new Date().toDateString();
          const isAssigned = workout.status === 'assigned';

          // Premium Brutalist Mission Card for Today's assigned workout
          if (isToday && isAssigned) {
            return (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedId(isExpanded ? null : workout.id);
                }}
                style={s.missionCard}
              >
                <View style={s.missionTagRow}>
                  <View style={s.activeBadge}>
                    <Ionicons name="flash" size={10} color={CoachColors.onAccent} />
                    <Text style={s.activeBadgeText}>Today's mission</Text>
                  </View>
                  <Text style={s.exerciseCountTag}>{exercises.length} exercises</Text>
                </View>

                {/* §1 Mission name = hero at 30px */}
                <Text style={s.missionName}>{workout.workouts?.name || 'Workout'}</Text>

                {isExpanded && exercises.length > 0 && (
                  <View style={s.exListContainer}>
                    {exercises.map((ex: any, i: number) => (
                      <View key={i} style={s.exRow}>
                        <View style={s.exNumBox}><Text style={s.exNumText}>{i + 1}</Text></View>
                        <Text style={s.exNameText} numberOfLines={1}>{ex.exercises?.name || 'Exercise'}</Text>
                        <Text style={s.exSetsText}>{ex.sets}×{ex.reps}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={s.missionActions}>
                  <TouchableOpacity
                    style={s.startBtn}
                    onPress={() => onStartActiveWorkout(workout)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="play" size={14} color={CoachColors.onAccent} />
                    <Text style={s.startBtnText}>Start session</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.completeQuickBtn}
                    onPress={() => handleComplete(workout.id, workout.workouts?.name || 'Workout')}
                  >
                    <Ionicons name="checkmark" size={16} color={CoachColors.accent} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }

          // Standard card
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setExpandedId(isExpanded ? null : workout.id)}
              style={s.standardCard}
            >
              <View style={s.cardTop}>
                <View>
                  <Text style={s.cardWorkoutName}>{workout.workouts?.name || 'Workout'}</Text>
                  <Text style={s.cardDateText}>{new Date(workout.assigned_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                </View>
                <View style={[
                  s.statusPill,
                  workout.status === 'completed' && { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter },
                  workout.status === 'skipped' && { borderColor: CoachColors.borderMuted, backgroundColor: CoachColors.bg },
                ]}>
                  <Text style={[
                    s.statusPillText,
                    workout.status === 'completed' && { color: CoachColors.accent },
                    workout.status === 'skipped' && { color: CoachColors.textMuted },
                  ]}>
                    {workout.status}
                  </Text>
                </View>
              </View>

              {isExpanded && (
                <View style={s.exListContainer}>
                  {exercises.map((ex: any, i: number) => (
                    <View key={i} style={s.exRow}>
                      <View style={s.exNumBox}><Text style={s.exNumText}>{i + 1}</Text></View>
                      <Text style={s.exNameText} numberOfLines={1}>{ex.exercises?.name || 'Exercise'}</Text>
                      <Text style={s.exSetsText}>{ex.sets}×{ex.reps}</Text>
                    </View>
                  ))}
                  {isAssigned && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        style={[s.startBtnSmall, { flex: 1 }]}
                        onPress={() => onStartActiveWorkout(workout)}
                      >
                        <Text style={s.startBtnSmallText}>Start workout</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.skipBtnSmall}
                        onPress={() => handleSkip(workout.id)}
                      >
                        <Text style={s.skipBtnSmallText}>Skip</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              {/* §4 Accent line — lime for active states, muted for skipped */}
              <View style={[
                s.accentLine,
                { backgroundColor: workout.status === 'completed' ? CoachColors.accent : workout.status === 'skipped' ? CoachColors.borderMuted : CoachColors.accent }
              ]} />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    paddingHorizontal: 14,
    // §14 44pt min height
    height: 44,
    borderRadius: 12,
  },
  backBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textPrimary,
    letterSpacing: 1.2,
  },
  headerStats: { flexDirection: 'row', gap: 8 },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    // §14 44pt height
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  miniStatText: { fontFamily: CoachFonts.bodyBold, fontSize: 13 },
  pageTitleTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  // §1 Hero page title: 32px, tight tracked
  pageTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 20,
    lineHeight: 36,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: CoachColors.accent },
  tabText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textSecondary,
    letterSpacing: 1,
  },
  tabTextActive: { color: CoachColors.onAccent },
  tabBadge: {
    backgroundColor: CoachColors.bg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tabBadgeActive: { backgroundColor: 'rgba(0,0,0,0.12)' },
  tabBadgeText: { fontFamily: CoachFonts.bodyBold, fontSize: 9, color: CoachColors.textPrimary },
  listContent: { paddingBottom: 120 },
  sectionHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },

  // ── Mission Card (Today's workout) ──
  missionCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    borderRadius: 16,
    padding: 18,
    paddingBottom: 14,
    marginBottom: 12,
    overflow: 'hidden',         // §4 for accent line
  },
  missionTagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.onAccent,
    letterSpacing: 1.2,
  },
  exerciseCountTag: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 1,
  },
  // §1 Mission name: 30px hero, tight tracked
  missionName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 30,
    color: CoachColors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 16,
    lineHeight: 34,
  },
  missionActions: { flexDirection: 'row', gap: 10 },
  startBtn: {
    flex: 1,
    height: 44,   // §14 exact 44pt
    backgroundColor: CoachColors.accent,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
  completeQuickBtn: {
    width: 44,
    height: 44,   // §14 exact 44pt
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Standard Card ──
  standardCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 16,
    paddingBottom: 13,
    marginBottom: 10,
    overflow: 'hidden',  // §4 for accent line
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // §1 Card workout name: 20px — elevated from 16px body-level
  cardWorkoutName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  cardDateText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 11,
    color: CoachColors.textMuted,
    marginTop: 3,
  },
  statusPill: {
    borderWidth: 1,
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSofter,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.accent,
    letterSpacing: 1,
    textTransform: 'capitalize',
  },
  // §4 Accent line — shared
  accentLine: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 3,
  },
  exListContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
    gap: 6,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exNumBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: CoachColors.bg,   // §11 Layer 2
    justifyContent: 'center',
    alignItems: 'center',
  },
  exNumText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textMuted,
  },
  exNameText: {
    flex: 1,
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
  },
  exSetsText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.textMuted,
  },
  // §14 44pt minimum
  startBtnSmall: {
    height: 44,
    backgroundColor: CoachColors.accent,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startBtnSmallText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
  skipBtnSmall: {
    height: 44,   // §14
    paddingHorizontal: 16,
    backgroundColor: CoachColors.bg,  // §11 Layer 2
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipBtnSmallText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    color: CoachColors.textSecondary,
    letterSpacing: 0.5,
  },

  // ── Empty State — §8 opinionated, §16 always CTA ──
  emptyState: {
    alignItems: 'flex-start',
    paddingTop: 32,
    paddingBottom: 40,
  },
  emptyHero: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -0.8,
    marginBottom: 8,
    lineHeight: 36,
  },
  emptySub: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13,
    color: CoachColors.textSecondary,
    lineHeight: 18,
    marginBottom: 20,
  },
  // §14 min 44pt CTA
  emptyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.onAccent,
  },
  // Legacy — kept for compatibility, now unused visually
  emptyIcon: { display: 'none' },
  emptyTitle: { display: 'none' },
});
