import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../../constants/theme';
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
    Alert.alert('Complete Workout', `Mark "${name}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: '✅ Complete', onPress: () => markWorkoutComplete(id) },
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
      if (d.toDateString() === today.toDateString()) label = 'TODAY';
      else if (d.toDateString() === tomorrow.toDateString()) label = 'TOMORROW';
      else if (d.toDateString() === yesterday.toDateString()) label = 'YESTERDAY';
      else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
      if (!groups[label]) groups[label] = [];
      groups[label].push(w);
    });
    return Object.entries(groups).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  const totalCompleted = workouts.filter((w: any) => w.status === 'completed').length;
  const totalAssigned = workouts.filter((w: any) => w.status === 'assigned').length;

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'upcoming', label: 'UPCOMING', count: totalAssigned },
    { key: 'completed', label: 'COMPLETED', count: totalCompleted },
    { key: 'all', label: 'ALL', count: workouts.length },
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
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          <Text style={s.backBtnText}>EXPLORE</Text>
        </TouchableOpacity>

        <View style={s.headerStats}>
          <View style={[s.miniStat, { borderColor: '#22C55E' }]}>
            <Ionicons name="checkmark-circle" size={12} color="#22C55E" />
            <Text style={[s.miniStatText, { color: '#22C55E' }]}>{totalCompleted}</Text>
          </View>
          <View style={[s.miniStat, { borderColor: '#4D94FF' }]}>
            <Ionicons name="flash" size={12} color="#4D94FF" />
            <Text style={[s.miniStatText, { color: '#4D94FF' }]}>{totalAssigned}</Text>
          </View>
        </View>
      </View>

      <Text style={s.pageTitleTag}>YOUR PROGRAM</Text>
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
              <Text style={[s.tabBadgeText, tab === t.key && { color: '#000000' }]}>{t.count}</Text>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4D94FF" />}
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
                <Text style={s.emptyCtaText}>Browse Catalog</Text>
                <Ionicons name="arrow-forward" size={14} color="#000" />
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
                    <Ionicons name="flash" size={10} color="#000000" />
                    <Text style={s.activeBadgeText}>TODAY'S MISSION</Text>
                  </View>
                  <Text style={s.exerciseCountTag}>{exercises.length} EXERCISES</Text>
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
                    <Ionicons name="play" size={14} color="#000000" />
                    <Text style={s.startBtnText}>START SESSION →</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.completeQuickBtn}
                    onPress={() => handleComplete(workout.id, workout.workouts?.name || 'Workout')}
                  >
                    <Ionicons name="checkmark" size={16} color="#22C55E" />
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
                  workout.status === 'completed' && { borderColor: '#22C55E', backgroundColor: '#0C1C12' },
                  workout.status === 'skipped' && { borderColor: '#27272A', backgroundColor: '#141418' },
                ]}>
                  <Text style={[
                    s.statusPillText,
                    workout.status === 'completed' && { color: '#22C55E' },
                    workout.status === 'skipped' && { color: 'rgba(255,255,255,0.4)' },
                  ]}>
                    {workout.status.toUpperCase()}
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
                        <Text style={s.startBtnSmallText}>START WORKOUT →</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.skipBtnSmall}
                        onPress={() => handleSkip(workout.id)}
                      >
                        <Text style={s.skipBtnSmallText}>SKIP</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
              {/* §4 Accent line — client blue for assigned, green for done */}
              <View style={[
                s.accentLine,
                { backgroundColor: workout.status === 'completed' ? '#22C55E' : workout.status === 'skipped' ? '#1C1C1E' : '#5B7FFF' }
              ]} />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  // §2 Layer 0 true black
  container: { flex: 1, backgroundColor: '#000000', paddingHorizontal: 20 },
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    paddingHorizontal: 14,
    // §14 44pt min height
    height: 44,
    borderRadius: 12,
  },
  backBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  headerStats: { flexDirection: 'row', gap: 8 },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    // §14 44pt height
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  miniStatText: { fontFamily: FontFamily.bodyBold, fontSize: 13 },
  pageTitleTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  // §1 Hero page title: 32px, tight tracked
  pageTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 20,
    lineHeight: 36,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
  },
  tabTextActive: { color: '#000000' },
  tabBadge: {
    backgroundColor: '#111113',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tabBadgeActive: { backgroundColor: 'rgba(0,0,0,0.12)' },
  tabBadgeText: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: '#FFFFFF' },
  listContent: { paddingBottom: 120 },
  sectionHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },

  // ── Mission Card (Today's workout) ──
  missionCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#5B7FFF',    // §3 unified client blue
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
    backgroundColor: '#5B7FFF',  // §3 client blue
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  exerciseCountTag: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
  },
  // §1 Mission name: 30px hero, tight tracked
  missionName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 30,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 16,
    lineHeight: 34,
  },
  missionActions: { flexDirection: 'row', gap: 10 },
  startBtn: {
    flex: 1,
    height: 44,   // §14 exact 44pt
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
    letterSpacing: 0.5,
  },
  completeQuickBtn: {
    width: 44,
    height: 44,   // §14 exact 44pt
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Standard Card ──
  standardCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  cardDateText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 3,
  },
  statusPill: {
    borderWidth: 1,
    borderColor: '#5B7FFF',        // §3 unified client blue
    backgroundColor: 'rgba(91,127,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#5B7FFF',              // §3 unified client blue
    letterSpacing: 1,
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
    borderTopColor: '#1C1C1E',
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
    backgroundColor: '#111113',   // §11 Layer 2
    justifyContent: 'center',
    alignItems: 'center',
  },
  exNumText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  exNameText: {
    flex: 1,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  exSetsText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  // §14 44pt minimum
  startBtnSmall: {
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startBtnSmallText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#000000',
    letterSpacing: 0.5,
  },
  skipBtnSmall: {
    height: 44,   // §14
    paddingHorizontal: 16,
    backgroundColor: '#111113',  // §11 Layer 2
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipBtnSmallText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },

  // ── Empty State — §8 opinionated, §16 always CTA ──
  emptyState: {
    alignItems: 'flex-start',
    paddingTop: 32,
    paddingBottom: 40,
  },
  emptyHero: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 8,
    lineHeight: 36,
  },
  emptySub: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 18,
    marginBottom: 20,
  },
  // §14 min 44pt CTA
  emptyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
  },
  // Legacy — kept for compatibility, now unused visually
  emptyIcon: { display: 'none' },
  emptyTitle: { display: 'none' },
});
