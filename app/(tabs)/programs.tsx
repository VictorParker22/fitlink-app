import { useMemo, useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, ScrollView, Modal, Switch, Alert as RNAlert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from 'expo-image';
import { useApp, ClassItem } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import BoltEmptyState from '../../components/mascot/BoltEmptyState';
import { isCohort, formatRun, formatDay, parseLocalDay } from '../../lib/cohort';
import { totalWeeks } from '../../lib/passWeeks';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { proxyGifStill } from '../../lib/exercisedb';
import { GhostSlot } from '../../components/wizard/WizardChrome';
import LibraryHeader from '../../components/library/LibraryHeader';
import LibraryTabs from '../../components/library/LibraryTabs';
import PassHero from '../../components/library/PassHero';
import WorkoutGridCard from '../../components/library/WorkoutGridCard';
import DietSpineRow from '../../components/library/DietSpineRow';
import ClassCinemaCard from '../../components/library/ClassCinemaCard';

/**
 * "SEP 8 · 4 WEEKS" — the dated badge that makes a cohort instantly
 * distinguishable from an evergreen pass in a list. Built only from the real
 * start date and a real week count; the duration half is dropped when the
 * track is still empty (totalWeeks floors at 1, which would read as a lie).
 */
const cohortBadgeLabel = (plan: any): string | null => {
  const start = parseLocalDay(plan?.starts_on);
  if (!start) return null;
  const day = formatDay(start)!;
  const weeks: number | null = plan?.duration_weeks
    ?? (plan?.track?.length ? totalWeeks(plan.track, null) : null);
  const text = weeks && weeks > 0 ? `${day} · ${weeks} week${weeks === 1 ? '' : 's'}` : day;
  return text.toUpperCase();
};


type TabType = 'workouts' | 'exercises' | 'diets' | 'plans' | 'classes';

const stripHtml = (html?: string) => {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

const titleCase = (s: string) =>
  s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ─── PassCard — pass card with track progress + Autoflow configuration ──────

function PassCard({
  item,
  workouts,
  onRefresh,
  stats,
}: {
  item: any;
  workouts: any[];
  onRefresh: () => void;
  stats?: { holders: number; avgNode: number };
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(item.autoflow_enabled !== false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(item.autoflow_workout_id ?? null);
  const [welcomeMsg, setWelcomeMsg] = useState<string>(item.autoflow_welcome_message ?? '');
  const [saving, setSaving] = useState(false);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);

  const selectedWorkout = workouts.find(w => w.id === selectedWorkoutId);
  const trackLength = item.track?.length || 0;
  const hasTrack = trackLength > 0;

  // A cohort is a dated pass (lib/cohort.ts). Evergreen passes show nothing here.
  const cohort = isCohort(item);
  const cohortRun = cohort ? formatRun(item) : null;
  const cohortBadge = cohort ? cohortBadgeLabel(item) : null;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('plans')
      .update({
        autoflow_enabled: enabled,
        autoflow_workout_id: selectedWorkoutId,
        autoflow_welcome_message: welcomeMsg.trim() || null,
      })
      .eq('id', item.id);
    setSaving(false);
    if (error) {
      RNAlert.alert('Save failed', error.message);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRefresh();
    }
  };

  const autoflowActive = enabled && !!selectedWorkoutId;
  const avgNodePct = hasTrack && stats ? Math.min(1, stats.avgNode / trackLength) : 0;

  return (
    <View style={passStyles.card}>
      {/* ── Membership face ── */}
      <PassHero item={item} holders={stats?.holders} cohortBadge={cohortBadge} />

      <View style={passStyles.body}>
      {cohortRun ? <Text style={passStyles.cohortRunText} numberOfLines={1}>{cohortRun}</Text> : null}

      {/* Track progress / needs-a-track callout */}
      {hasTrack ? (
        stats && stats.holders > 0 && (
          <View style={passStyles.progressRow}>
            <View style={passStyles.progressTrack}>
              <View style={[passStyles.progressFill, { width: `${avgNodePct * 100}%` }]} />
            </View>
            <Text style={passStyles.progressLabel}>avg node {stats.avgNode} / {trackLength}</Text>
          </View>
        )
      ) : (
        <Text style={passStyles.warningText}>
          {stats && stats.holders > 0
            ? `${stats.holders} athlete${stats.holders === 1 ? '' : 's'} bought this and have nothing to follow. Add workouts to the track.`
            : 'Build a track so athletes have something to follow.'}
        </Text>
      )}

      {!hasTrack && (
        <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
          style={passStyles.buildTrackBtn}
          activeOpacity={0.8}
          onPress={() => router.push(`/pass-track-editor?planId=${item.id}` as any)}
        >
          <Text style={passStyles.buildTrackBtnText}>Build the track</Text>
        </TouchableOpacity>
      )}

      {/* ── Footer actions ── */}
      <View style={passStyles.footer}>
        <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
          style={passStyles.footerBtn}
          activeOpacity={0.7}
          onPress={() => router.push(`/pass-track-editor?planId=${item.id}` as any)}
        >
          <Text style={passStyles.footerBtnAccent}>Edit track</Text>
        </TouchableOpacity>
        <View style={passStyles.footerDivider} />
        <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
          style={passStyles.footerBtn}
          activeOpacity={0.7}
          onPress={() => router.push(`/pass-holders?planId=${item.id}` as any)}
        >
          <Text style={passStyles.footerBtnText}>Holders</Text>
        </TouchableOpacity>
        <View style={passStyles.footerDivider} />
        <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
          style={passStyles.footerBtn}
          activeOpacity={0.7}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpanded(v => !v); }}
        >
          <Text style={[passStyles.footerBtnText, autoflowActive && { color: CoachColors.accent }]}>
            {expanded ? 'Close' : 'Autoflow'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Inline Autoflow Config Panel ── */}
      {expanded && (
        <View style={passStyles.autoflowPanel}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={passStyles.autoflowEyebrow}>Autoflow</Text>
              <Text style={passStyles.autoflowHeading}>When an athlete subscribes</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEnabled(val);
              }}
              accessibilityRole="switch"
              accessibilityLabel="Autoflow when an athlete subscribes"
              trackColor={{ false: CoachColors.borderMuted, true: CoachColors.accentSoft }}
              thumbColor={enabled ? CoachColors.accent : '#555'}
              ios_backgroundColor={CoachColors.borderMuted}
            />
          </View>

          <View style={{ gap: 8, marginTop: 14 }}>
            <Text style={passStyles.autoflowStepLabel}>Auto-assign a workout</Text>
            <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
              style={[passStyles.autoflowPicker, selectedWorkout && passStyles.autoflowPickerFilled]}
              onPress={() => setShowWorkoutPicker(true)}
              activeOpacity={0.8}
            >
              {selectedWorkout ? (
                <>
                  <View style={passStyles.autoflowPickerIcon}>
                    <Ionicons name="barbell-outline" size={18} color={CoachColors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={passStyles.autoflowPickerName} numberOfLines={1}>{selectedWorkout.name}</Text>
                    <Text style={passStyles.autoflowPickerSub}>{selectedWorkout.workout_exercises?.length || 0} exercises</Text>
                  </View>
                  <Ionicons name="chevron-down" size={16} color={CoachColors.textFaint} />
                </>
              ) : (
                <>
                  <View style={passStyles.autoflowPickerIcon}>
                    <Ionicons name="barbell-outline" size={18} color={CoachColors.textFaint} />
                  </View>
                  <Text style={passStyles.autoflowPickerPlaceholder}>Pick a workout to assign</Text>
                  <Ionicons name="chevron-down" size={16} color={CoachColors.textFaint} />
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ gap: 8, marginTop: 14 }}>
            <Text style={passStyles.autoflowStepLabel}>Welcome message</Text>
            <TextInput
              style={passStyles.autoflowInput}
              placeholder="Leave blank to use the default welcome message"
              placeholderTextColor={CoachColors.textFaint}
              value={welcomeMsg}
              onChangeText={setWelcomeMsg}
              multiline
              textAlignVertical="top"
              maxLength={400}
            />
          </View>

          <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
            style={[passStyles.autoflowSaveBtn, saving && { opacity: 0.6 }]}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={passStyles.autoflowSaveBtnText}>{saving ? 'Saving…' : 'Save autoflow'}</Text>
          </TouchableOpacity>
        </View>
      )}
      </View>

      {/* ── Workout Picker Sheet ── */}
      <Modal
        visible={showWorkoutPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWorkoutPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowWorkoutPicker(false)} />
          {/* A Modal inherits no safe area — the sheet supplies its own bottom clearance. */}
          <View style={[passStyles.pickerSheet, { paddingBottom: insets.bottom + 20 }]}>
            {/* A backdrop tap is not a discoverable dismiss on its own — HIG
                wants a visible close control on every sheet. */}
            <View style={passStyles.pickerSheetHead}>
              <Text style={[passStyles.pickerSheetTitle, { flex: 1, marginBottom: 0 }]}>Select a workout to assign</Text>
              <TouchableOpacity
                onPress={() => setShowWorkoutPicker(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close workout picker"
              >
                <Ionicons name="close" size={25} color={CoachColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {workouts.map(w => (
                <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                  key={w.id}
                  style={[passStyles.pickerRow, selectedWorkoutId === w.id && passStyles.pickerRowActive]}
                  onPress={() => { setSelectedWorkoutId(w.id); setShowWorkoutPicker(false); }}
                >
                  <View style={[passStyles.autoflowPickerIcon, { width: 40, height: 40, borderRadius: 10 }]}>
                    <Ionicons name="barbell-outline" size={20} color={CoachColors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={passStyles.pickerRowName} numberOfLines={1}>{w.name}</Text>
                    <Text style={passStyles.pickerRowSub}>{w.workout_exercises?.length || 0} exercises</Text>
                  </View>
                  {selectedWorkoutId === w.id && <Ionicons name="checkmark-circle" size={20} color={CoachColors.accent} />}
                </TouchableOpacity>
              ))}
              {workouts.length === 0 && (
                <Text style={passStyles.pickerEmptyText}>
                  No workouts in your library yet.{'\n'}Create one in the Workouts tab first.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const passStyles = StyleSheet.create({
  card: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 24, borderCurve: 'continuous', overflow: 'hidden',
  },
  body: { paddingHorizontal: 16, paddingBottom: 12 },
  cohortRunText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 12 },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  progressTrack: { flex: 1, height: 5, borderRadius: 999, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous' },
  progressLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textSecondary },

  warningText: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.warning, marginTop: 12, lineHeight: 20 },

  buildTrackBtn: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 10, alignItems: 'center', marginTop: 12,
  },
  buildTrackBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.accent },

  footer: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, marginTop: 14, paddingTop: 4 },
  footerBtn: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  footerBtnAccent: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.accent },
  footerBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textSecondary },
  footerDivider: { width: 1, backgroundColor: CoachColors.borderMuted, marginVertical: 8 },

  autoflowPanel: { borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, marginTop: 12, paddingTop: 14 },
  autoflowEyebrow: { fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 2 },
  autoflowHeading: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  autoflowStepLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textMuted },
  autoflowPicker: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CoachColors.bg, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border, padding: 12,
  },
  autoflowPickerFilled: { borderColor: 'rgba(198,242,78,0.3)' },
  autoflowPickerIcon: { width: 32, height: 32, borderRadius: 8, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center' },
  autoflowPickerName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  autoflowPickerSub: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },
  autoflowPickerPlaceholder: { flex: 1, fontFamily: CoachFonts.bodyMedium, fontSize: 14, color: CoachColors.textFaint },
  autoflowInput: {
    backgroundColor: CoachColors.bg, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border,
    padding: 12, minHeight: 89, fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textPrimary, lineHeight: 20,
  },
  autoflowSaveBtn: { backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  autoflowSaveBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.onAccent },

  pickerSheet: {
    backgroundColor: CoachColors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: CoachColors.border, padding: 20, maxHeight: '70%', // paddingBottom applied inline from the real bottom inset (Modal).
  },
  pickerSheetTitle: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.textMuted, textAlign: 'center', marginBottom: 16 },
  pickerSheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, borderCurve: 'continuous', padding: 12, marginBottom: 10,
  },
  pickerRowActive: { borderColor: 'rgba(198,242,78,0.35)', backgroundColor: CoachColors.accentSofter },
  pickerRowName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  pickerRowSub: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
  pickerEmptyText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, textAlign: 'center', paddingVertical: 24 },
});

// ─── PassesEmpty — empty state when the coach has no passes yet ─────────────

function PassesEmpty({ onBuildFirst }: { onBuildFirst: () => void }) {
  return (
    <View style={passEmptyStyles.wrap}>
      <View style={passEmptyStyles.card}>
        <Text style={passEmptyStyles.cardTitle}>A pass is a season{'\n'}your athlete plays through</Text>
        <Text style={passEmptyStyles.cardBody}>
          They buy it once, then follow the track you build — workouts, meal plans, check-ins with you, milestones along the way.
        </Text>
        <TouchableOpacity style={passEmptyStyles.cta} activeOpacity={0.85} onPress={onBuildFirst}>
          <Text style={passEmptyStyles.ctaText}>Build your first pass</Text>
        </TouchableOpacity>
        <Text style={passEmptyStyles.ctaHint}>Takes about 10 minutes with 3 workouts</Text>
      </View>

      <Text style={passEmptyStyles.sectionLabel}>A track, roughly</Text>
      <View style={passEmptyStyles.ghostTrack}>
        {[
          { num: '1', title: 'A workout', sub: 'from your library' },
          { num: '2', title: 'A meal plan', sub: 'for that week' },
          { num: '3', title: 'A milestone', sub: 'to mark progress' },
        ].map((row, i, arr) => (
          <View key={row.num} style={passEmptyStyles.ghostRow}>
            <View style={passEmptyStyles.ghostRail}>
              <View style={passEmptyStyles.ghostMarker}>
                <Text style={passEmptyStyles.ghostMarkerText}>{row.num}</Text>
              </View>
              {i < arr.length - 1 && <View style={passEmptyStyles.ghostLine} />}
            </View>
            <View style={{ paddingBottom: 14 }}>
              <Text style={passEmptyStyles.ghostTitle}>{row.title}</Text>
              <Text style={passEmptyStyles.ghostSub}>{row.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const passEmptyStyles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 10 },
  card: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 16, borderCurve: 'continuous', padding: 18 },
  cardTitle: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary, lineHeight: 27 },
  cardBody: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, marginTop: 9, lineHeight: 21.5 },
  cta: { backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  ctaText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },
  ctaHint: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint, textAlign: 'center', marginTop: 9 },

  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 26, marginBottom: 10,
  },
  ghostTrack: { opacity: 0.55 },
  ghostRow: { flexDirection: 'row', gap: 14 },
  ghostRail: { alignItems: 'center' },
  ghostMarker: {
    width: 30, height: 30, borderRadius: 15, borderCurve: 'continuous', borderWidth: 1.5, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  ghostMarkerText: { fontFamily: CoachFonts.headingBold, fontSize: 13.5, color: CoachColors.textSecondary },
  ghostLine: { width: 2, flex: 1, backgroundColor: CoachColors.borderMuted, marginVertical: 4 },
  ghostTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  ghostSub: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 1 },
});


export default function ProgramsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const { workouts, exercises, diets, plans, classes, refreshData, refreshPlans, deleteWorkout, deleteDietPlan, deleteClass } = useApp();
  const { showAlert } = useAlert();
  const { tab: initialTabParam } = useLocalSearchParams<{ tab?: string }>();

  const VALID_TABS: TabType[] = ['plans', 'workouts', 'diets', 'classes', 'exercises'];
  const initialTab = VALID_TABS.includes(initialTabParam as TabType) ? (initialTabParam as TabType) : 'plans';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [showAddActionSheet, setShowAddActionSheet] = useState(false);
  const [planStats, setPlanStats] = useState<Record<string, { holders: number; avgNode: number }>>({});

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // Aggregate holder counts + average track position per pass, for the Passes tab.
  useEffect(() => {
    if (plans.length === 0) {
      setPlanStats({});
      return;
    }
    let cancelled = false;
    (async () => {
      const planIds = plans.map(p => p.id);
      const { data, error } = await supabase
        .from('client_plan_enrollments')
        .select('plan_id, track_position, status')
        .in('plan_id', planIds);
      if (cancelled || error || !data) return;
      const grouped: Record<string, { holders: number; sum: number; count: number }> = {};
      data.forEach((row: any) => {
        const g = grouped[row.plan_id] || (grouped[row.plan_id] = { holders: 0, sum: 0, count: 0 });
        g.holders += 1;
        if (row.status !== 'completed') {
          g.sum += row.track_position || 0;
          g.count += 1;
        }
      });
      const result: Record<string, { holders: number; avgNode: number }> = {};
      Object.entries(grouped).forEach(([planId, g]) => {
        result[planId] = { holders: g.holders, avgNode: g.count > 0 ? Math.round(g.sum / g.count) : 0 };
      });
      if (!cancelled) setPlanStats(result);
    })();
    return () => { cancelled = true; };
  }, [plans]);

  const categories = useMemo(() => {
    if (activeTab !== 'exercises') return ['All'];
    const set = new Set<string>();
    exercises.forEach(e => {
      if (e.category) set.add(e.category);
      if (e.muscle_group) set.add(e.muscle_group);
    });
    return ['All', ...Array.from(set).sort()];
  }, [exercises, activeTab]);

  const filteredExercises = useMemo(() => {
    if (activeTab !== 'exercises') return [];
    let list = exercises;
    if (activeCategory !== 'All') {
      list = list.filter(e => e.category === activeCategory || e.muscle_group === activeCategory);
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.muscle_group.toLowerCase().includes(q) ||
        (e.category && e.category.toLowerCase().includes(q))
    );
  }, [exercises, searchQuery, activeCategory, activeTab]);

  const filteredWorkouts = useMemo(() => {
    if (activeTab !== 'workouts') return [];
    if (!searchQuery.trim()) return workouts;
    const q = searchQuery.toLowerCase();
    return workouts.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.description?.toLowerCase().includes(q)
    );
  }, [workouts, searchQuery, activeTab]);

  const filteredDiets = useMemo(() => {
    if (activeTab !== 'diets') return [];
    if (!searchQuery.trim()) return diets;
    const q = searchQuery.toLowerCase();
    return diets.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q)
    );
  }, [diets, searchQuery, activeTab]);

  const filteredPlans = useMemo(() => {
    if (activeTab !== 'plans') return [];
    if (!searchQuery.trim()) return plans;
    const q = searchQuery.toLowerCase();
    return plans.filter((p) => p.name.toLowerCase().includes(q));
  }, [plans, searchQuery, activeTab]);

  const filteredClasses = useMemo(() => {
    if (activeTab !== 'classes') return [];
    if (!searchQuery.trim()) return classes;
    const q = searchQuery.toLowerCase();
    return classes.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [classes, searchQuery, activeTab]);

  const handleDeleteWorkout = (id: string, name: string) => {
    showAlert({
      type: 'warning',
      title: 'Delete Workout',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorkout(id);
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete workout' });
            }
          }
        }
      ]
    });
  };

  const handleDeleteDiet = (id: string, name: string) => {
    showAlert({
      type: 'warning',
      title: 'Delete Diet Plan',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDietPlan(id);
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete diet plan' });
            }
          }
        }
      ]
    });
  };

  const handleDeleteClass = (id: string, title: string) => {
    showAlert({
      type: 'warning',
      title: 'Delete Class',
      message: `Are you sure you want to delete "${title}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClass(id);
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete class' });
            }
          }
        }
      ]
    });
  };

  const currentData = useMemo(() => {
    switch (activeTab) {
      case 'workouts': return filteredWorkouts;
      case 'exercises': return filteredExercises;
      case 'diets': return filteredDiets;
      case 'plans': return filteredPlans;
      case 'classes': return filteredClasses;
    }
  }, [activeTab, filteredWorkouts, filteredExercises, filteredDiets, filteredPlans, filteredClasses]);

  const handleActionSheetNavigate = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAddActionSheet(false);
    // Native Modal must finish dismissing before we navigate — pushing with
    // it open leaves the sheet above the new screen and can wedge touches.
    setTimeout(() => router.push(route as any), 350);
  };

  const renderWorkoutItem = ({ item, index }: { item: typeof workouts[0]; index: number }) => (
    <View style={{ flex: 1 }}>
      <WorkoutGridCard
        item={item}
        onPress={() => router.push(`/workout/${item.id}` as any)}
        onDelete={() => handleDeleteWorkout(item.id, item.name)}
      />
    </View>
  );

  const renderExerciseItem = ({ item, index }: { item: typeof exercises[0]; index: number }) => {
    const equipmentLabel = item.equipment ? titleCase(item.equipment) : 'Bodyweight';
    const subtitle = `${titleCase(item.muscle_group)} · ${equipmentLabel}`;
    const desc = stripHtml(item.instructions) || 'No instructions provided.';
    const stillUrl = proxyGifStill(item.image_url);

    return (
      <View>
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/create-exercise?editId=${item.id}` as any)}
      >
        {stillUrl ? (
          <View style={styles.exerciseThumbTile}>
            <ExpoImage
              source={{ uri: stillUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={120}
              recyclingKey={item.id}
              accessible={false}
            />
          </View>
        ) : (
          <View style={styles.thumbnailContainer}>
            <Ionicons
              name={item.is_custom ? 'person-outline' : 'globe-outline'}
              size={20}
              color={CoachColors.textSecondary}
            />
          </View>
        )}
        <View style={styles.textContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
            {item.is_custom && (
              <View style={styles.customBadge}>
                <Text style={styles.customBadgeText}>Custom</Text>
              </View>
            )}
          </View>
          <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
          <Text style={styles.rowDescription} numberOfLines={2}>{desc}</Text>
        </View>
      </TouchableOpacity>
      </View>
    );
  };

  const renderDietItem = ({ item, index }: { item: typeof diets[0]; index: number }) => (
    <View>
      <DietSpineRow
        item={item}
        onPress={() => router.push(`/diet/${item.id}` as any)}
        onDelete={() => handleDeleteDiet(item.id, item.name)}
      />
    </View>
  );

  const renderPlanItem = ({ item, index }: { item: typeof plans[0]; index: number }) => (
    <View>
      <PassCard item={item} workouts={workouts} onRefresh={refreshPlans} stats={planStats[item.id]} />
    </View>
  );

  const renderClassItem = ({ item, index }: { item: ClassItem; index: number }) => (
    <View>
      <ClassCinemaCard
        item={item}
        onPress={() => router.push(`/class/${item.id}` as any)}
        onDelete={() => handleDeleteClass(item.id, item.title)}
      />
    </View>
  );

  const isPassesTab = activeTab === 'plans';
  const totalHolders = useMemo(
    () => Object.values(planStats).reduce((sum, s) => sum + s.holders, 0),
    [planStats]
  );

  const TAB_LABEL: Record<TabType, string> = {
    plans: 'Passes',
    workouts: 'Workouts',
    diets: 'Meal plans',
    classes: 'Classes',
    exercises: 'Exercises',
  };
  const TAB_COUNT: Record<TabType, number> = {
    plans: plans.length,
    workouts: workouts.length,
    diets: diets.length,
    classes: classes.length,
    exercises: exercises.length,
  };
  const ADD_LABEL: Record<TabType, string> = {
    plans: 'New pass',
    workouts: 'New workout',
    diets: 'New meal plan',
    classes: 'New class',
    exercises: 'New exercise',
  };
  // Spacing-scale gaps per layout: tight for grids/spines, roomier for cards
  // and the dense exercise list.
  const sepHeight = activeTab === 'workouts' || activeTab === 'diets' ? 12
    : activeTab === 'exercises' ? 24
    : 20;
  // Every tab has exactly one obvious thing "+ New" should create, except
  // Classes — that tab covers both on-demand and live, so it's the only one
  // that still needs a chooser.
  const handleHeaderAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (activeTab) {
      case 'plans':
        router.push('/create-plan' as any);
        break;
      case 'workouts':
        router.push('/create-workout' as any);
        break;
      case 'diets':
        router.push('/create-diet' as any);
        break;
      case 'exercises':
        router.push('/create-exercise' as any);
        break;
      case 'classes':
        setShowAddActionSheet(true);
        break;
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <LibraryHeader onAdd={handleHeaderAdd} addLabel={ADD_LABEL[activeTab]} />

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={20} color={CoachColors.textFaint} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${TAB_LABEL[activeTab].toLowerCase()}`}
            placeholderTextColor={CoachColors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            selectionColor={CoachColors.accent}
          />
          {searchQuery !== '' && (
            <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }} onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.filtersWrapper}>
          <LibraryTabs
            tabs={(['plans', 'workouts', 'diets', 'classes', 'exercises'] as TabType[]).map((tab) => ({
              key: tab,
              label: TAB_LABEL[tab],
              count: TAB_COUNT[tab],
            }))}
            active={activeTab}
            onSelect={(tab) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab as TabType);
              setSearchQuery('');
              setActiveCategory('All');
            }}
            reduceMotion={reduceMotion}
          />
        </View>

        {activeTab === 'exercises' && (
          <View style={styles.categorySubWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categorySubScroll}>
              {categories.map((cat) => (
                <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }}
                  key={cat}
                  style={[styles.catTag, activeCategory === cat && styles.catTagActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveCategory(cat);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.catTagText, activeCategory === cat && styles.catTagTextActive]}>
                    {cat === 'All' ? cat : titleCase(cat)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Results Counter Info */}
        <View style={styles.resultsInfoRow}>
          <Text style={styles.resultsText}>
            {isPassesTab
              ? `${currentData?.length || 0} passes${totalHolders > 0 ? ` · ${totalHolders} athletes holding one` : ''}`
              : `${currentData?.length || 0} ${TAB_LABEL[activeTab].toLowerCase()}`}
          </Text>
        </View>

        {/* Flat List Content — PassCard's autoflow panel embeds a multiline
            "welcome message" input and a Save button inside these rows, so the
            list needs a KAV to keep the focused row above the keyboard. */}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Keyed by tab so content crossfades (and the list remounts — required
            anyway to switch numColumns). Crossfade skipped under Reduce Motion. */}
        <View key={activeTab} style={{ flex: 1 }}>
        <FlatList keyboardShouldPersistTaps="handled"
          data={currentData as any}
          keyExtractor={(item: any) => item.id}
          renderItem={
            (activeTab === 'workouts' ? renderWorkoutItem :
            activeTab === 'exercises' ? renderExerciseItem :
            activeTab === 'diets' ? renderDietItem :
            activeTab === 'classes' ? renderClassItem :
            renderPlanItem) as any
          }
          numColumns={activeTab === 'workouts' ? 2 : 1}
          {...(activeTab === 'workouts' ? { columnWrapperStyle: { gap: 12 } } : null)}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 130 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={CoachColors.textPrimary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: sepHeight }} />}
          ListFooterComponent={
            (currentData?.length || 0) > 0 ? (
              <View style={{ marginTop: sepHeight }}>
                <GhostSlot label={ADD_LABEL[activeTab]} onPress={handleHeaderAdd} height={56} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            isPassesTab ? (
              !searchQuery ? (
                <PassesEmpty onBuildFirst={() => router.push('/create-plan' as any)} />
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={45} color={CoachColors.textFaint} />
                  <Text style={styles.emptyTitle}>No passes found</Text>
                  <Text style={styles.emptyText}>Try a different search.</Text>
                </View>
              )
            ) : searchQuery ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={45} color={CoachColors.textFaint} />
                <Text style={styles.emptyTitle}>No {TAB_LABEL[activeTab].toLowerCase()} found</Text>
                <Text style={styles.emptyText}>Try a different search.</Text>
              </View>
            ) : (
              <BoltEmptyState
                pose="help"
                title={`No ${TAB_LABEL[activeTab].toLowerCase()} yet`}
                subtitle="Everything you build lives here, ready to assign to any athlete."
                actionLabel="Create your first"
                onAction={handleHeaderAdd}
              />
            )
          }
        />
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Action Sheet Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showAddActionSheet}
        onRequestClose={() => setShowAddActionSheet(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAddActionSheet(false)}
        >
          {/* A Modal inherits no safe area — the sheet supplies its own bottom clearance. */}
          <View style={[styles.actionSheetContent, { paddingBottom: insets.bottom + 20 }]} onStartShouldSetResponder={() => true}>
            <View style={styles.dragHandle} />
            <Text style={styles.actionSheetTitle}>New class</Text>

            <TouchableOpacity
              style={styles.actionSheetItem}
              onPress={() => handleActionSheetNavigate('/create-class')}
            >
              <View style={[styles.actionSheetIconWrap, { backgroundColor: CoachColors.accentSofter }]}>
                <Ionicons name="videocam-outline" size={22} color={CoachColors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionSheetItemTitle}>On-demand class</Text>
                <Text style={styles.actionSheetItemSubtitle}>Record and publish video classes</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionSheetItem}
              onPress={() => handleActionSheetNavigate('/create-live-class')}
            >
              <View style={[styles.actionSheetIconWrap, { backgroundColor: CoachColors.dangerSoft }]}>
                <Ionicons name="radio-outline" size={22} color={CoachColors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionSheetItemTitle}>Live virtual class</Text>
                <Text style={styles.actionSheetItemSubtitle}>Broadcast real-time sessions to clients</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeSheetBtn}
              onPress={() => setShowAddActionSheet(false)}
            >
              <Text style={styles.closeSheetText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  clearBtn: {
    padding: 4,
  },

  // Tabs
  filtersWrapper: {
    paddingVertical: 16,
  },

  // Exercise Sub-categories
  categorySubWrapper: {
    marginBottom: 12,
  },
  categorySubScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  catTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
  },
  catTagActive: {
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accent,
  },
  catTagText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    color: CoachColors.textSecondary,
  },
  catTagTextActive: {
    color: CoachColors.onAccent,
    fontFamily: CoachFonts.bodyBold,
  },

  // Results Label
  resultsInfoRow: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  resultsText: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textFaint,
  },

  // List Rows
  // paddingBottom is applied inline from the real bottom inset + tab-bar height.
  listContent: {
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  thumbnailContainer: {
    width: 48,
    height: 48,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
  },
  rowTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
    marginBottom: 3,
  },
  rowSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textMuted,
    marginBottom: 3,
  },
  rowDescription: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textFaint,
    lineHeight: 18,
  },
  // First-frame ExerciseDB demo thumbnail — the gifs ship on a white plate,
  // so the tile wears the off-white token to blend the crop edge.
  exerciseThumbTile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: CoachColors.textPrimary,
    marginRight: 14,
  },

  // Badges
  customBadge: {
    backgroundColor: CoachColors.accentSofter,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.35)',
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    marginLeft: 8,
  },
  customBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.accent,
    letterSpacing: 0.3,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
    marginTop: 8,
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },

  // Action Sheet Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  actionSheetContent: {
    backgroundColor: CoachColors.surface,
    borderTopLeftRadius: Radius.sm,
    borderTopRightRadius: Radius.sm,
    padding: 20,
    // paddingBottom applied inline from the real bottom inset (Modal).
    borderTopWidth: 1,
    borderColor: CoachColors.border,
  },
  dragHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.border,
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionSheetTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textMuted,
    marginBottom: 16,
    textAlign: 'center',
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: CoachColors.bg,
    padding: 14,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    marginBottom: 10,
  },
  actionSheetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetItemTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
    marginBottom: 2,
  },
  actionSheetItemSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textMuted,
  },
  closeSheetBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.bg,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  closeSheetText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
  },
});
