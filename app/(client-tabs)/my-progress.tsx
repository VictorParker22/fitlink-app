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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ClientProgressScreen() {
  const router = useRouter();
  const { progressLogs, workouts, sessions, refreshData, logProgress, clientData, mealLogs } = useClient();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const { healthData } = useHealth();

  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

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

        {/* ── READINESS HERO ── */}
        <View style={s.section}>
          <ActivityReadinessHero
            streak={streak}
            workouts={workouts}
            healthSnapshot={healthData}
          />
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

        {/* ── RECENT FEED ── */}
        <View style={s.section}>
          <ActivityRecentFeed
            workouts={workouts}
            sessions={sessions}
            progressLogs={progressLogs}
          />
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
    paddingVertical: 10,
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
});
