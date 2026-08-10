import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { useHealth } from '../../context/HealthContext';
import { Spacing, FontFamily, Radius } from '../../constants/theme';

// ── Activity components ──
import { ActivityReadinessHero } from '../../components/client-tabs/activity/ActivityReadinessHero';
import { ActivityTripleRings } from '../../components/client-tabs/activity/ActivityTripleRings';
import { ActivityHeatmapCalendar } from '../../components/client-tabs/activity/ActivityHeatmapCalendar';
import { ActivityWeekStrip } from '../../components/client-tabs/activity/ActivityWeekStrip';
import { ActivityInsightsBento } from '../../components/client-tabs/activity/ActivityInsightsBento';
import { ActivityRecentFeed } from '../../components/client-tabs/activity/ActivityRecentFeed';
import { ActivityBodyProgress } from '../../components/client-tabs/activity/ActivityBodyProgress';
import { AddActivityModal } from '../../components/client-tabs/activity/AddActivityModal';

// ── Dashboard Extras components ──
import QuickWeightLog from '../../components/client-tabs/home/QuickWeightLog';
import DaySummaryCard from '../../components/client-tabs/home/DaySummaryCard';
import TomorrowPreview from '../../components/client-tabs/home/TomorrowPreview';
import NutritionWidget from '../../components/NutritionWidget';
import HydrationCell from '../../components/client-tabs/home/HydrationCell';
import HabitTracker from '../../components/client-tabs/home/HabitTracker';
import WeeklyCheckIn from '../../components/client-tabs/home/WeeklyCheckIn';
import WelcomeGuide from '../../components/client-tabs/home/WelcomeGuide';
import GymCheckInWidget from '../../components/client-tabs/progress/GymCheckInWidget';
import * as Haptics from 'expo-haptics';
import { ClientRoute } from '../../types/routes';
import { useRef } from 'react';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ClientProgressScreen() {
  const router = useRouter();
  const { progressLogs, workouts, sessions, refreshData, logProgress, clientData, mealLogs, todayWorkout, activeGymVisit, checkInGym, checkOutGym } = useClient();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { healthData } = useHealth();

  const scrollViewRef = useRef<any>(null);
  const weightLogOffsetY = useRef<number>(0);

  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [habitSummary, setHabitSummary] = useState<{
    completedCount: number;
    totalCount: number;
    topIncomplete?: { key: string; label: string; cutoffHour: number | null };
  }>({ completedCount: 0, totalCount: 5 });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // ── Derived dashboard-extras data ──
  const latestWeight = useMemo(() => {
    if (!progressLogs || progressLogs.length === 0) return undefined;
    const withWeight = progressLogs
      .filter((log: any) => log.weight != null)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return withWeight.length > 0 ? Number(withWeight[0].weight) : undefined;
  }, [progressLogs]);

  const weightDelta = useMemo(() => {
    if (!progressLogs || progressLogs.length < 2) return null;
    const withWeight = progressLogs
      .filter((log: any) => log.weight != null)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (withWeight.length < 2) return null;
    const delta = Number(withWeight[0].weight) - Number(withWeight[1].weight);
    if (Math.abs(delta) < 0.1) return null; 
    return delta;
  }, [progressLogs]);

  const goalType = useMemo(() => {
    const g = (clientData?.goals || '').toLowerCase();
    const wantsLose = /lose|cut|deficit|slim/.test(g);
    const wantsGain = /gain|bulk|muscle|mass|build/.test(g);
    if (wantsLose && !wantsGain) return 'lose';
    if (wantsGain && !wantsLose) return 'gain';
    return 'maintain';
  }, [clientData?.goals]);

  const completedDays = useMemo(() => {
    const set = new Set<number>();
    workouts.forEach((w: any) => {
      if (w.status === 'completed') {
        const d = new Date(w.assigned_date).getDay();
        set.add(d === 0 ? 6 : d - 1);
      }
    });
    return Array.from(set);
  }, [workouts]);

  const tomorrowWorkout = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toDateString();
    return workouts.find((w: any) => new Date(w.assigned_date).toDateString() === tomorrowStr && w.status === 'assigned');
  }, [workouts]);

  const isWorkoutCompletedToday = todayWorkout?.status === 'completed';

  // ── Derived data ──

  // Activity map: date string -> { inClub, progress, workoutName, duration }
  const activityMap = useMemo(() => {
    const map: Record<string, { inClub: boolean; progress: number; workoutName?: string; duration?: number }> = {};
    workouts.filter((w: any) => w.status === 'completed' && w.completed_at).forEach((w: any) => {
      const dateStr = new Date(w.completed_at).toISOString().split('T')[0];
      const existing = map[dateStr];
      map[dateStr] = {
        inClub: true,
        progress: existing ? Math.min(existing.progress + 0.5, 1) : 1,
        workoutName: w.workouts?.name || 'Workout',
        duration: w.duration_seconds ? Math.round(w.duration_seconds / 60) : undefined,
      };
    });
    sessions.filter((s: any) => s.status === 'completed' && s.date).forEach((s: any) => {
      const dateStr = new Date(s.date).toISOString().split('T')[0];
      const existing = map[dateStr];
      map[dateStr] = {
        inClub: true,
        progress: existing ? Math.min(existing.progress + 0.5, 1) : 1,
        workoutName: s.type || 'Session',
        duration: s.duration,
      };
    });
    progressLogs.forEach((p: any) => {
      if (p.date) {
        const dateStr = new Date(p.date).toISOString().split('T')[0];
        if (!map[dateStr]) map[dateStr] = { inClub: false, progress: 0.5 };
      }
    });
    return map;
  }, [workouts, sessions, progressLogs]);

  // Today's workout minutes
  const todayStr = new Date().toISOString().split('T')[0];
  const todayWorkoutMinutes = useMemo(() => {
    let mins = 0;
    workouts.filter((w: any) => w.status === 'completed' && w.completed_at).forEach((w: any) => {
      const dateStr = new Date(w.completed_at).toISOString().split('T')[0];
      if (dateStr === todayStr && w.duration_seconds) {
        mins += Math.round(w.duration_seconds / 60);
      }
    });
    sessions.filter((s: any) => s.status === 'completed' && s.date).forEach((s: any) => {
      const dateStr = new Date(s.date).toISOString().split('T')[0];
      if (dateStr === todayStr && s.duration) {
        mins += s.duration;
      }
    });
    return mins;
  }, [workouts, sessions, todayStr]);

  // Today's meals logged
  const mealsLoggedToday = useMemo(() => {
    return Object.keys(mealLogs).length;
  }, [mealLogs]);

  // Streak & monthly stats
  const streak = clientData?.progress?.streak || 0;
  const workoutsThisMonth = clientData?.progress?.workoutsThisMonth || 0;
  const totalWorkouts = clientData?.completed_workouts || 0;

  // ── Modal save handler ──
  const handleSave = useCallback(async (data: { type: string; category: string; name: string; duration: string; location: string; notes: string; date: string }) => {
    setSaving(true);
    try {
      await logProgress({
        notes: `${data.name} | ${data.duration} | ${data.location === 'in_club' ? 'In club' : 'Not in club'}${data.notes ? ` | ${data.notes}` : ''}`,
      });
      showAlert({ type: 'success', title: 'Activity Added!', message: `${data.name} has been logged.` });
      setModalVisible(false);
    } catch {
      showAlert({ type: 'error', title: 'Error', message: 'Failed to save activity.' });
    }
    setSaving(false);
  }, [logProgress, showAlert]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFF" />}
      >
        {/* ── HEADER ── */}
        <View style={s.header}>
          <View>
            <Text style={s.tag}>ACTIVITY // PROGRESS</Text>
            <Text style={s.title}>Activity</Text>
          </View>
          <TouchableOpacity style={s.addBtnWrapper} activeOpacity={0.7} onPress={() => setModalVisible(true)}>
            <LinearGradient colors={['#FFD700', '#FFA500']} style={s.addBtnGradient}>
              <Ionicons name="add" size={18} color="#000" />
              <Text style={s.addBtnText}>Log</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── WELCOME GUIDE ── */}
        <WelcomeGuide visible={true} />

        {/* ── GYM CHECK-IN ── */}
        <GymCheckInWidget
          activeVisit={activeGymVisit}
          checkIn={checkInGym}
          checkOut={checkOutGym}
          activeCalories={healthData?.activeCaloriesToday || 0}
        />

        {/* ── READINESS HERO ── */}
        <View style={s.section}>
          <ActivityReadinessHero
            streak={streak}
            workouts={workouts}
            healthSnapshot={healthData}
          />
        </View>

        <View style={s.divider} />

        {/* ── STAT GRID ── */}
        <View style={s.statGrid}>
          <View style={s.statRow}>
            <TouchableOpacity style={s.statCell} activeOpacity={0.85}>
              <Text style={s.statMicro}>STREAK</Text>
              <Text style={s.statHero}>
                {clientData?.progress?.streak || 0}
                <Text style={s.statUnit}>d</Text>
              </Text>
              <Text style={s.statSub}>
                {(clientData?.progress?.streak || 0) === 0
                  ? (todayWorkout ? 'Start today' : 'Rest day 🌙')
                  : (clientData?.progress?.streak || 0) >= 7
                    ? 'On fire 🔥'
                    : 'Keep it up'}
              </Text>
              <View style={[s.accentLine, { backgroundColor: '#F97316' }]} />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.statCell}
              onPress={() => router.push('/my-progress' as any)}
              activeOpacity={0.85}
            >
              <Text style={s.statMicro}>THIS WEEK</Text>
              <Text style={s.statHero}>
                {completedDays.length}
                <Text style={s.statUnit}>/{workouts.filter((w: any) => {
                  const d = new Date(w.assigned_date);
                  const now = new Date();
                  const weekStart = new Date(now);
                  weekStart.setDate(now.getDate() - now.getDay());
                  return d >= weekStart;
                }).length || 5}</Text>
              </Text>
              <Text style={s.statSub}>workouts done</Text>
              <View style={[s.accentLine, { backgroundColor: '#5B7FFF' }]} />
            </TouchableOpacity>
          </View>

          <View style={s.statRow}>
            <TouchableOpacity
              style={s.statCell}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                scrollViewRef.current?.scrollTo({ y: weightLogOffsetY.current, animated: true });
              }}
            >
              <Text style={s.statMicro}>BODY WEIGHT</Text>
              {latestWeight ? (
                <Text style={s.statHero}>
                  {latestWeight}
                  <Text style={s.statUnit}> lbs</Text>
                </Text>
              ) : (
                <Text style={[s.statHero, { color: 'rgba(255,255,255,0.2)', fontSize: 36 }]}>
                  — —
                </Text>
              )}
              {weightDelta != null && (() => {
                const deltaColor = (() => {
                  if (!weightDelta) return 'rgba(255,255,255,0.4)';
                  if (goalType === 'maintain') return 'rgba(255,255,255,0.4)';
                  if (goalType === 'lose') return weightDelta < 0 ? '#22C55E' : '#FF6B35';
                  return weightDelta > 0 ? '#22C55E' : '#FF6B35';
                })();
                return (
                  <Text style={[
                    s.statSub,
                    { color: deltaColor, fontFamily: FontFamily.headingExtraBold, fontSize: 11 }
                  ]}>
                    {weightDelta < 0 ? '↓' : '↑'} {Math.abs(weightDelta).toFixed(1)} lbs
                  </Text>
                );
              })()}
              <Text style={s.statSub}>
                {latestWeight ? 'last logged' : 'tap to log'}
              </Text>
              <View style={[s.accentLine, { backgroundColor: '#C9A96E' }]} />
            </TouchableOpacity>

            <HydrationCell />
          </View>
        </View>

        <View style={s.divider} />

        {/* ── TRIPLE RINGS ── */}
        <View style={s.section}>
          <ActivityTripleRings
            todayWorkoutMinutes={todayWorkoutMinutes}
            stepsToday={healthData?.stepsToday ?? null}
            mealsLoggedToday={mealsLoggedToday}
          />
        </View>

        <View style={s.divider} />

        {/* ── WEEK STRIP ── */}
        <View style={s.section}>
          <ActivityWeekStrip
            workouts={workouts}
            sessions={sessions}
            progressLogs={progressLogs}
          />
        </View>

        <View style={s.divider} />

        {/* ── DAY SUMMARY & TOMORROW ── */}
        <DaySummaryCard
          workoutCompleted={isWorkoutCompletedToday}
          mealsLoggedCount={(clientData?.progress as any)?.mealsLoggedToday || 0}
          totalMealsGoal={(clientData?.progress as any)?.totalMealsGoal || 4}
          streakDays={clientData?.progress?.streak || 0}
        />
        <TomorrowPreview tomorrowWorkout={tomorrowWorkout} />

        <View style={s.divider} />

        {/* ── HEATMAP CALENDAR ── */}
        <View style={s.section}>
          <ActivityHeatmapCalendar
            activityMap={activityMap}
            workouts={workouts}
          />
        </View>

        <View style={s.divider} />

        {/* ── INSIGHTS BENTO ── */}
        <View style={s.section}>
          <ActivityInsightsBento
            progressLogs={progressLogs}
            healthSnapshot={healthData}
            workoutsThisMonth={workoutsThisMonth}
            streak={streak}
            totalWorkouts={totalWorkouts}
          />
        </View>

        <View style={s.divider} />

        {/* ── NUTRITION & HABITS & CHECK-IN ── */}
        <NutritionWidget />
        <HabitTracker
          clientId={clientData?.id}
          onHabitsChange={(summary) => setHabitSummary(summary)}
        />
        <WeeklyCheckIn />

        <View style={s.divider} />

        {/* ── BODY PROGRESS ── */}
        <View onLayout={(e) => { weightLogOffsetY.current = e.nativeEvent.layout.y; }}>
          <QuickWeightLog latestWeight={latestWeight} unit="lbs" onLogComplete={refreshData} />
        </View>
        <View style={s.divider} />

        {/* ── RECENT FEED ── */}
        <View style={s.section}>
          <ActivityRecentFeed
            workouts={workouts}
            sessions={sessions}
            progressLogs={progressLogs}
          />
        </View>

        <View style={s.divider} />

        {/* ── EXPLORE STRIP ── */}
        <View style={[s.statGrid, { paddingHorizontal: 0 }]}>
          <View style={s.statRow}>
            <TouchableOpacity
              style={[s.statCell, { flex: 1, paddingHorizontal: Spacing.lg }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(ClientRoute.mySessions as any);
              }}
              activeOpacity={0.85}
            >
              <Text style={s.statMicro}>COACHING</Text>
              <Text
                style={[s.statHero, { fontSize: 28, letterSpacing: -0.5 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                Sessions
              </Text>
              <Text style={s.statSub}>View → book → manage</Text>
              <View style={[s.accentLine, { backgroundColor: '#5B7FFF', left: Spacing.lg }]} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.statCell, { flex: 1, paddingHorizontal: Spacing.lg }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(ClientRoute.workouts as any);
              }}
              activeOpacity={0.85}
            >
              <Text style={s.statMicro}>DISCOVER</Text>
              <Text style={[s.statHero, { fontSize: 36, letterSpacing: -1 }]}>Explore</Text>
              <Text style={s.statSub}>Classes • Plans • Coaches</Text>
              <View style={[s.accentLine, { backgroundColor: '#A855F7', left: Spacing.lg }]} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── BODY PROGRESS ── */}
        <View style={s.sectionLast}>
          <ActivityBodyProgress
            progressLogs={progressLogs}
          />
        </View>
      </ScrollView>

      {/* ── ADD ACTIVITY MODAL ── */}
      <AddActivityModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        saving={saving}
      />
    </SafeAreaView>
  );
}

// ── STYLES ──
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scroll: {
    paddingBottom: 120,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  tag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
  },
  addBtnWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  addBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#000',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: 32,
    marginVertical: 4,
  },
  // Sections
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionLast: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing['2xl'],
  },

  // Stat grid — dashboard stat cards
  statGrid: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCell: {
    flex: 1,
    backgroundColor: '#111118',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  statMicro: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statHero: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 44,
    color: '#FFFFFF',
    letterSpacing: -2,
    lineHeight: 46,
  },
  statUnit: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0,
  },
  statSub: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 6,
  },
  accentLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 1.5,
  },
});
