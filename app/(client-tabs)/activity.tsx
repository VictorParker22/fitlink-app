/**
 * (client-tabs)/activity.tsx — Activity hub (hidden route, reached from the
 * Today and Progress entry cards).
 *
 * Assembly-only screen: the five finished components in
 * components/client-tabs/activity/* stay unedited; this screen feeds them
 * real data or omits what it can't verify.
 *
 * Data rules (audit invariants):
 * - stepsToday is null unless a health source is connected — never fabricated.
 * - Ring minutes come from on-device workout history (today, local day).
 * - Heatmap = union of device-history days, completed server workouts,
 *   manual client_activities rows, and gym-visit days (inClub).
 * - The feed gets server workouts/sessions/progressLogs plus manual
 *   activities adapter-mapped into the workouts prop shape. Device history is
 *   NOT fed to the feed — completed assignments already appear as server
 *   rows and would double-count.
 * - All date keys are built from LOCAL date parts (lib/streak.ts hazard:
 *   new Date('YYYY-MM-DD') is UTC midnight — the previous local day west of
 *   Greenwich).
 * - client_activities may not exist yet in the linked DB (migration can land
 *   after this code). Every read checks {error}; 42P01 hides the manual-log
 *   affordances quietly and the rest of the screen still renders.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useWorkout } from '../../context/WorkoutContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { Spacing, Radius, FontSize } from '../../constants/theme';
import { ClientRoute } from '../../types/routes';
import { parseLocalDay, localDayString } from '../../lib/streak';

import { ActivityTripleRings } from '../../components/client-tabs/activity/ActivityTripleRings';
import { ActivityWeekStrip } from '../../components/client-tabs/activity/ActivityWeekStrip';
import { ActivityHeatmapCalendar } from '../../components/client-tabs/activity/ActivityHeatmapCalendar';
import { ActivityRecentFeed } from '../../components/client-tabs/activity/ActivityRecentFeed';
import { AddActivityModal } from '../../components/client-tabs/activity/AddActivityModal';

// Health hook: optional module, same guard as health-insights.tsx so the
// screen still works where the native health module isn't available.
let useHealthHook: (() => any) | null = null;
try {
  const mod = require('../../context/HealthContext');
  useHealthHook = mod.useHealth;
} catch {
  useHealthHook = null;
}

interface ManualActivity {
  id: string;
  activity_type: string;
  category: string | null;
  name: string | null;
  duration_minutes: number | null;
  location: string | null;
  notes: string | null;
  activity_date: string; // YYYY-MM-DD
  created_at: string;
}

/** "45min" / "1h 45min" (AddActivityModal's duration format) → minutes. */
function parseDurationToMinutes(duration: string): number | null {
  const m = /(?:(\d+)\s*h\s*)?(\d+)\s*min/.exec(duration || '');
  if (m) return Number(m[1] || 0) * 60 + Number(m[2]);
  const n = parseInt(duration, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { workouts, sessions, progressLogs, mealLogs, clientData } = useClient();
  const { workoutHistory } = useWorkout();

  let healthCtx: any = null;
  if (useHealthHook) {
    try { healthCtx = useHealthHook(); } catch { healthCtx = null; }
  }
  const healthConnected: boolean = healthCtx?.isConnected ?? false;

  const [manualActivities, setManualActivities] = useState<ManualActivity[]>([]);
  const [gymVisits, setGymVisits] = useState<any[]>([]);
  // 42P01 = relation does not exist: the client_activities migration may land
  // after this code ships. Hide manual-log affordances, keep the rest.
  const [manualUnavailable, setManualUnavailable] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Fetch manual activities + gym visits (last 90 days) on focus ──────────
  useFocusEffect(
    useCallback(() => {
      if (!clientData?.id) return;
      let alive = true;

      const since = new Date();
      since.setDate(since.getDate() - 90);

      (async () => {
        const [actRes, visitRes] = await Promise.all([
          supabase
            .from('client_activities')
            .select('*')
            .eq('client_id', clientData.id)
            .gte('activity_date', localDayString(since))
            .order('activity_date', { ascending: false }),
          supabase
            .from('gym_visits')
            .select('id, check_in_time, duration_minutes')
            .eq('client_id', clientData.id)
            .gte('check_in_time', since.toISOString()),
        ]);
        if (!alive) return;

        if (actRes.error) {
          if (actRes.error.code === '42P01') setManualUnavailable(true);
          else if (__DEV__) console.warn('[Activity] client_activities fetch:', actRes.error.message);
        } else {
          setManualUnavailable(false);
          setManualActivities(actRes.data || []);
        }

        if (visitRes.error) {
          if (__DEV__) console.warn('[Activity] gym_visits fetch:', visitRes.error.message);
        } else {
          setGymVisits(visitRes.data || []);
        }
      })();

      return () => { alive = false; };
    }, [clientData?.id])
  );

  // ── Rings ─────────────────────────────────────────────────────────────────
  const todayKey = localDayString();

  const todayWorkoutMinutes = useMemo(() => {
    const secs = (workoutHistory || [])
      .filter((e) => e?.completedAt && localDayString(new Date(e.completedAt)) === todayKey)
      .reduce((sum, e) => sum + (e.durationSec || 0), 0);
    return Math.round(secs / 60);
  }, [workoutHistory, todayKey]);

  // Real steps or nothing — the rings component drops the ring on null.
  const stepsToday: number | null =
    healthConnected && healthCtx?.healthData ? healthCtx.healthData.stepsToday : null;

  // ClientContext fetches meal logs for today only: Record<mealId, true>.
  const mealsLoggedToday = useMemo(
    () => Object.values(mealLogs || {}).filter(Boolean).length,
    [mealLogs]
  );

  // ── Heatmap union ─────────────────────────────────────────────────────────
  const activityMap = useMemo(() => {
    const map: Record<string, { inClub: boolean; progress: number; workoutName?: string; duration?: number }> = {};
    const bump = (
      key: string,
      patch: { inClub?: boolean; workoutName?: string; duration?: number }
    ) => {
      const prev = map[key] || { inClub: false, progress: 0 };
      map[key] = {
        inClub: prev.inClub || !!patch.inClub,
        progress: Math.min(prev.progress + 0.34, 1),
        workoutName: prev.workoutName || patch.workoutName,
        duration: prev.duration || patch.duration,
      };
    };

    // On-device sessions (class/strength/run history) — local day of completion.
    (workoutHistory || []).forEach((e) => {
      if (!e?.completedAt) return;
      bump(localDayString(new Date(e.completedAt)), {
        workoutName: e.classTitle,
        duration: e.durationSec ? Math.round(e.durationSec / 60) : undefined,
      });
    });

    // Completed coach assignments — assigned_date parsed by LOCAL parts.
    (workouts || []).forEach((w: any) => {
      if (w?.status !== 'completed') return;
      const day = parseLocalDay(w.assigned_date || w.completed_at);
      if (!day) return;
      bump(localDayString(day), {
        workoutName: w.workouts?.name,
        duration: w.duration_seconds ? Math.round(w.duration_seconds / 60) : undefined,
      });
    });

    // Manual activities — activity_date is already a local calendar day.
    manualActivities.forEach((a) => {
      const day = parseLocalDay(a.activity_date);
      if (!day) return;
      bump(localDayString(day), {
        workoutName: a.name || a.activity_type,
        duration: a.duration_minutes || undefined,
        inClub: a.location === 'In club',
      });
    });

    // Gym visits — mark the local day as in-club.
    gymVisits.forEach((v: any) => {
      if (!v?.check_in_time) return;
      bump(localDayString(new Date(v.check_in_time)), { inClub: true });
    });

    return map;
  }, [workoutHistory, workouts, manualActivities, gymVisits]);

  // ── Feed / week strip: server rows + manual activities (adapter-mapped) ───
  // Device history is intentionally excluded (completed assignments already
  // arrive as server rows — feeding both would double-count).
  const feedWorkouts = useMemo(() => {
    const manualAsWorkouts = manualActivities.map((a) => ({
      id: a.id,
      status: 'completed' as const,
      // No 'Z' suffix: parses as LOCAL noon, so the feed's toDateString and
      // the week strip's startsWith(dStr) both land on the logged day.
      completed_at: `${a.activity_date}T12:00:00`,
      assigned_date: a.activity_date,
      workouts: { name: a.name || a.activity_type, category: a.category || 'Other' },
      duration_seconds: a.duration_minutes ? a.duration_minutes * 60 : 0,
      isCoachAssigned: false,
    }));
    return [...(workouts || []), ...manualAsWorkouts];
  }, [workouts, manualActivities]);

  // ── Save from AddActivityModal ────────────────────────────────────────────
  const handleSave = useCallback(
    async (data: { type: string; category: string; name: string; duration: string; location: string; notes: string; date: string }) => {
      if (!clientData?.id || saving) return;
      setSaving(true);
      const { data: row, error } = await supabase
        .from('client_activities')
        .insert({
          client_id: clientData.id,
          activity_type: data.type,
          category: data.category,
          name: data.name || data.type,
          duration_minutes: parseDurationToMinutes(data.duration),
          location: data.location,
          notes: data.notes || null,
          activity_date: data.date,
        })
        .select('*')
        .single();
      setSaving(false);

      if (error) {
        if (error.code === '42P01') setManualUnavailable(true);
        else if (__DEV__) console.warn('[Activity] save failed:', error.message);
        setModalVisible(false);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (row) setManualActivities((prev) => [row as ManualActivity, ...prev]);
      setModalVisible(false);
    },
    [clientData?.id, saving]
  );

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.push(ClientRoute.myProgress);
  }, [router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header: back / title / add */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={styles.backBtn}
          onPress={handleBack}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={31} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Activity</Text>
        {!manualUnavailable ? (
          <TouchableOpacity
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={styles.addBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setModalVisible(true);
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Log an activity"
          >
            <Ionicons name="add" size={24} color={CoachColors.onAccent} />
          </TouchableOpacity>
        ) : (
          // Table not migrated yet: keep the header balanced, no dead button.
          <View style={styles.addBtnPlaceholder} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 130 }]}
        showsVerticalScrollIndicator={false}
      >
        <ActivityTripleRings
          todayWorkoutMinutes={todayWorkoutMinutes}
          stepsToday={stepsToday}
          mealsLoggedToday={mealsLoggedToday}
        />

        <ActivityWeekStrip
          workouts={feedWorkouts}
          sessions={sessions || []}
          progressLogs={progressLogs || []}
        />

        <ActivityHeatmapCalendar activityMap={activityMap} workouts={feedWorkouts} />

        <ActivityRecentFeed
          workouts={feedWorkouts}
          sessions={sessions || []}
          progressLogs={progressLogs || []}
        />
      </ScrollView>

      <AddActivityModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        saving={saving}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    alignItems: 'flex-start',
  },
  title: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: FontSize.xl,
    color: CoachColors.textPrimary,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnPlaceholder: {
    width: 40,
    height: 40,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
});
