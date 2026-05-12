import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Alert, RefreshControl, Animated as RNAnimated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

type TabKey = 'upcoming' | 'completed' | 'all';

export default function ClientWorkoutsScreen() {
  const { workouts, markWorkoutComplete, markWorkoutSkipped, refreshData } = useClient();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
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
      if (d.toDateString() === today.toDateString()) label = 'Today';
      else if (d.toDateString() === tomorrow.toDateString()) label = 'Tomorrow';
      else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
      else label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      if (!groups[label]) groups[label] = [];
      groups[label].push(w);
    });
    return Object.entries(groups).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  // Stats
  const totalCompleted = workouts.filter((w: any) => w.status === 'completed').length;
  const totalAssigned = workouts.filter((w: any) => w.status === 'assigned').length;
  const totalSkipped = workouts.filter((w: any) => w.status === 'skipped').length;

  const statusConfig: Record<string, { bg: string; text: string; icon: string; label: string }> = {
    assigned: { bg: `${colors.accent}18`, text: colors.accent, icon: 'flash', label: 'Ready' },
    completed: { bg: `${colors.green}18`, text: colors.green, icon: 'checkmark-circle', label: 'Done' },
    skipped: { bg: colors.bgElevated, text: colors.textTertiary, icon: 'close-circle', label: 'Skipped' },
  };

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: totalAssigned },
    { key: 'completed', label: 'Completed', count: totalCompleted },
    { key: 'all', label: 'All', count: workouts.length },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Workouts</Text>
        <View style={styles.headerStats}>
          <View style={[styles.miniStat, { backgroundColor: `${colors.green}15` }]}>
            <Ionicons name="checkmark-circle" size={14} color={colors.green} />
            <Text style={[styles.miniStatText, { color: colors.green }]}>{totalCompleted}</Text>
          </View>
          <View style={[styles.miniStat, { backgroundColor: `${colors.accent}15` }]}>
            <Ionicons name="flash" size={14} color={colors.accent} />
            <Text style={[styles.miniStatText, { color: colors.accent }]}>{totalAssigned}</Text>
          </View>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)} activeOpacity={0.7}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            <View style={[styles.tabBadge, tab === t.key && { backgroundColor: colors.accent }]}>
              <Text style={[styles.tabBadgeText, tab === t.key && { color: '#FFF' }]}>{t.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name={tab === 'completed' ? 'trophy-outline' : 'barbell-outline'} size={40} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>{tab === 'completed' ? 'No completed workouts' : tab === 'upcoming' ? 'No upcoming workouts' : 'No workouts yet'}</Text>
            <Text style={styles.emptyText}>Your trainer will assign workouts to you</Text>
          </View>
        }
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        renderItem={({ item: workout }) => {
          const s = statusConfig[workout.status] || statusConfig.assigned;
          const exercises = workout.workouts?.workout_exercises || [];
          const isExpanded = expandedId === workout.id;
          const isToday = new Date(workout.assigned_date).toDateString() === new Date().toDateString();
          const isAssigned = workout.status === 'assigned';

          // Today's assigned workout gets the premium Mission card
          if (isToday && isAssigned) {
            return (
              <TouchableOpacity activeOpacity={0.88} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpandedId(isExpanded ? null : workout.id); }}>
                <LinearGradient colors={isDark ? ['#1A1A24', '#22222E'] : ['#1C1C21', '#2A2A32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.missionCard}>
                  <View style={[styles.missionAccent, { backgroundColor: colors.accent }]} />
                  <View style={styles.missionHeader}>
                    <View>
                      <Text style={styles.missionLabel}>TODAY'S MISSION</Text>
                      <Text style={styles.missionName}>{workout.workouts?.name || 'Workout'}</Text>
                    </View>
                    <View style={[styles.missionBadge, { backgroundColor: `${colors.accent}25` }]}>
                      <Ionicons name="flash" size={14} color={colors.accent} />
                      <Text style={[styles.missionBadgeText, { color: colors.accent }]}>{exercises.length} exercises</Text>
                    </View>
                  </View>

                  {/* Exercise preview: first 2 visible, rest locked */}
                  <View style={styles.missionExList}>
                    {exercises.slice(0, isExpanded ? exercises.length : 2).map((ex: any, i: number) => (
                      <View key={i} style={styles.missionExRow}>
                        <View style={styles.missionExNum}><Text style={styles.missionExNumText}>{i + 1}</Text></View>
                        <Text style={styles.missionExName}>{ex.exercises?.name || 'Exercise'}</Text>
                        <Text style={styles.missionExSets}>{ex.sets}×{ex.reps}</Text>
                      </View>
                    ))}
                    {!isExpanded && exercises.length > 2 && (
                      <View style={styles.missionExRow}>
                        <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.3)" />
                        <Text style={styles.missionLockText}>{exercises.length - 2} more exercises locked</Text>
                        <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.3)" />
                      </View>
                    )}
                  </View>

                  {/* Actions */}
                  <View style={styles.missionActions}>
                    <TouchableOpacity style={styles.missionCompleteBtn} onPress={() => handleComplete(workout.id, workout.workouts?.name)}>
                      <Ionicons name="checkmark-circle" size={18} color="#FFF" />
                      <Text style={styles.missionCompleteBtnText}>Complete Mission</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.missionSkipBtn} onPress={() => handleSkip(workout.id)}>
                      <Ionicons name="play-skip-forward" size={16} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          }

          // Regular workout card
          return (
            <TouchableOpacity activeOpacity={0.88} onPress={() => setExpandedId(isExpanded ? null : workout.id)}>
              <Card style={styles.workoutCard}>
                <View style={styles.workoutHeader}>
                  <View style={[styles.statusIcon, { backgroundColor: s.bg }]}>
                    <Ionicons name={s.icon as any} size={18} color={s.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workoutName}>{workout.workouts?.name || 'Workout'}</Text>
                    <View style={styles.workoutMetaRow}>
                      <Text style={styles.workoutDate}>{new Date(workout.assigned_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                      <Text style={styles.workoutDot}>·</Text>
                      <Text style={styles.workoutDate}>{exercises.length} exercises</Text>
                      {workout.workouts?.estimated_duration && (
                        <><Text style={styles.workoutDot}>·</Text><Text style={styles.workoutDate}>{workout.workouts.estimated_duration}min</Text></>
                      )}
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusText, { color: s.text }]}>{s.label}</Text>
                  </View>
                </View>

                {/* Expanded exercise list */}
                {isExpanded && exercises.length > 0 && (
                  <View style={styles.exerciseList}>
                    {exercises.map((ex: any, i: number) => (
                      <View key={i} style={styles.exerciseRow}>
                        <View style={styles.exerciseIdx}><Text style={styles.exerciseIdxText}>{i + 1}</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exerciseName}>{ex.exercises?.name || 'Exercise'}</Text>
                          {ex.exercises?.muscle_group && <Text style={styles.exerciseMuscle}>{ex.exercises.muscle_group}</Text>}
                        </View>
                        <View style={styles.exerciseSetsPill}>
                          <Text style={styles.exerciseSetsText}>{ex.sets}×{ex.reps}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Collapsed preview */}
                {!isExpanded && exercises.length > 0 && (
                  <View style={styles.collapsedPreview}>
                    <Text style={styles.collapsedText}>{exercises.slice(0, 3).map((e: any) => e.exercises?.name).filter(Boolean).join(' • ')}{exercises.length > 3 ? ` +${exercises.length - 3}` : ''}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                  </View>
                )}

                {/* Action buttons for assigned */}
                {isExpanded && isAssigned && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.completeBtn} onPress={() => handleComplete(workout.id, workout.workouts?.name)}>
                      <Ionicons name="checkmark" size={16} color="#FFF" />
                      <Text style={styles.completeBtnText}>Complete</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(workout.id)}>
                      <Text style={styles.skipBtnText}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, marginBottom: Spacing.sm },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], letterSpacing: -0.5, color: colors.textPrimary },
  headerStats: { flexDirection: 'row', gap: Spacing.sm },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  miniStatText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  tabBar: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: colors.bgElevated, borderRadius: Radius.md, padding: 3 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.sm },
  tabActive: { backgroundColor: colors.bgCard, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary },
  tabTextActive: { color: colors.textPrimary },
  tabBadge: { backgroundColor: colors.bgHover, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, minWidth: 20, alignItems: 'center' },
  tabBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: colors.textTertiary },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 120 },
  sectionHeader: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.lg, marginBottom: Spacing.sm },

  // Mission card (today's workout)
  missionCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md, overflow: 'hidden' },
  missionAccent: { position: 'absolute', top: 0, left: 0, width: 4, height: '100%' },
  missionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  missionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2 },
  missionName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: '#FFF', marginTop: 4 },
  missionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  missionBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10 },
  missionExList: { marginTop: Spacing.lg, gap: Spacing.sm },
  missionExRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  missionExNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  missionExNumText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  missionExName: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)' },
  missionExSets: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.45)' },
  missionLockText: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' },
  missionActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  missionCompleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, paddingVertical: 12, borderRadius: Radius.md },
  missionCompleteBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#FFF' },
  missionSkipBtn: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },

  // Regular workout card
  workoutCard: { marginBottom: Spacing.sm },
  workoutHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  statusIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  workoutName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  workoutMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  workoutDate: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  workoutDot: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, textTransform: 'capitalize' },

  collapsedPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  collapsedText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, flex: 1, marginRight: Spacing.sm },

  exerciseList: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: Spacing.sm },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  exerciseIdx: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  exerciseIdxText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.textTertiary },
  exerciseName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary },
  exerciseMuscle: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 1 },
  exerciseSetsPill: { backgroundColor: colors.bgElevated, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  exerciseSetsText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textSecondary },

  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  completeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.green, paddingVertical: 10, borderRadius: Radius.md },
  completeBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: '#FFF' },
  skipBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textTertiary },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary },
});
