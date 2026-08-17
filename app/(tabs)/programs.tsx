import { useMemo, useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, ScrollView, Modal, Image as RNImage, Switch, Alert as RNAlert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useApp, ClassItem } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { Spacing, Radius } from '../../constants/theme';
import { getCategoryColor } from '../../data/categoryColors';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import BoltEmptyState from '../../components/mascot/BoltEmptyState';
import { isCohort, formatRun, formatDay, parseLocalDay } from '../../lib/cohort';
import { totalWeeks } from '../../lib/passWeeks';

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

const formatMuscleGroups = (groups: string[]) => {
  const unique = Array.from(new Set(groups.filter(Boolean).map((g) => titleCase(g.trim()))));
  return unique.slice(0, 3).join(' · ');
};

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
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(item.autoflow_enabled !== false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(item.autoflow_workout_id ?? null);
  const [welcomeMsg, setWelcomeMsg] = useState<string>(item.autoflow_welcome_message ?? '');
  const [saving, setSaving] = useState(false);
  const [showWorkoutPicker, setShowWorkoutPicker] = useState(false);

  const selectedWorkout = workouts.find(w => w.id === selectedWorkoutId);
  const trackLength = item.track?.length || 0;
  const hasTrack = trackLength > 0;
  const subtitle = `$${item.price} / ${item.period || 'monthly'}${hasTrack ? ` · ${trackLength} node${trackLength === 1 ? '' : 's'}` : ' · track not built yet'}`;

  // A cohort is a dated pass (lib/cohort.ts). Evergreen passes show nothing here.
  const cohort = isCohort(item);
  const cohortRun = cohort ? formatRun(item) : null;
  const cohortBadge = cohort ? cohortBadgeLabel(item) : null;

  const workoutCount = (item.track || []).filter((n: any) => n.type === 'workout').length;
  const dietCount = (item.track || []).filter((n: any) => n.type === 'diet').length;
  const milestoneCount = (item.track || []).filter((n: any) => n.type === 'milestone').length;

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
      {/* ── Main row ── */}
      <View style={passStyles.cardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={passStyles.cardTitleRow}>
            <Text style={passStyles.cardTitle} numberOfLines={1}>{item.name}</Text>
            {cohortBadge && (
              <View
                style={passStyles.cohortTag}
                accessible
                accessibilityLabel={`Cohort. ${cohortRun ?? cohortBadge}`}
              >
                <Text style={passStyles.cohortTagText}>{cohortBadge}</Text>
              </View>
            )}
          </View>
          <Text style={passStyles.cardSubtitle} numberOfLines={1}>{subtitle}</Text>
          {cohortRun ? <Text style={passStyles.cardSubtitle} numberOfLines={1}>{cohortRun}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          {hasTrack ? (
            <View style={[passStyles.badge, autoflowActive && passStyles.badgeActive]}>
              <Text style={[passStyles.badgeText, autoflowActive && passStyles.badgeTextActive]}>
                {autoflowActive ? 'Autoflow on' : 'Autoflow off'}
              </Text>
            </View>
          ) : (
            <View style={passStyles.badgeWarning}>
              <Text style={passStyles.badgeWarningText}>Needs a track</Text>
            </View>
          )}
          {stats && (
            <Text style={passStyles.holderCount}>{stats.holders} holder{stats.holders === 1 ? '' : 's'}</Text>
          )}
        </View>
      </View>

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

      {hasTrack && (
        <View style={passStyles.metaRow}>
          {workoutCount > 0 && (
            <View style={passStyles.metaItem}>
              <Ionicons name="barbell-outline" size={15} color={CoachColors.textSecondary} />
              <Text style={passStyles.metaText}>{workoutCount} workout{workoutCount === 1 ? '' : 's'}</Text>
            </View>
          )}
          {dietCount > 0 && (
            <View style={passStyles.metaItem}>
              <Ionicons name="nutrition-outline" size={15} color={CoachColors.textSecondary} />
              <Text style={passStyles.metaText}>{dietCount} meal plan{dietCount === 1 ? '' : 's'}</Text>
            </View>
          )}
          {milestoneCount > 0 && (
            <View style={passStyles.metaItem}>
              <Ionicons name="trophy-outline" size={15} color={CoachColors.textSecondary} />
              <Text style={passStyles.metaText}>{milestoneCount} milestone{milestoneCount === 1 ? '' : 's'}</Text>
            </View>
          )}
        </View>
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

      {/* ── Workout Picker Sheet ── */}
      <Modal
        visible={showWorkoutPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWorkoutPicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowWorkoutPicker(false)} />
          <View style={passStyles.pickerSheet}>
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
  card: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 16, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textPrimary, flexShrink: 1 },
  cardSubtitle: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 3 },
  cohortTag: {
    paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)',
    backgroundColor: 'rgba(198,242,78,0.08)', flexShrink: 0,
  },
  cohortTagText: { fontFamily: CoachFonts.bodyBold, fontSize: 10.5, color: CoachColors.accent, letterSpacing: 0.7 },
  badge: {
    borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeActive: { borderColor: 'rgba(198,242,78,0.35)', backgroundColor: CoachColors.accentSofter },
  badgeText: { fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint, letterSpacing: 0.3 },
  badgeTextActive: { color: CoachColors.accent },
  badgeWarning: {
    borderWidth: 1, borderColor: 'rgba(224,184,78,0.4)', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeWarningText: { fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.warning, letterSpacing: 0.3 },
  holderCount: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  progressTrack: { flex: 1, height: 5, borderRadius: 999, backgroundColor: CoachColors.borderMuted, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 999 },
  progressLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textSecondary },

  warningText: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.warning, marginTop: 12, lineHeight: 20 },

  metaRow: { flexDirection: 'row', gap: 14, marginTop: 14, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary },

  buildTrackBtn: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
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
    backgroundColor: CoachColors.bg, borderRadius: 12, borderWidth: 1, borderColor: CoachColors.border, padding: 12,
  },
  autoflowPickerFilled: { borderColor: 'rgba(198,242,78,0.3)' },
  autoflowPickerIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center' },
  autoflowPickerName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  autoflowPickerSub: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },
  autoflowPickerPlaceholder: { flex: 1, fontFamily: CoachFonts.bodyMedium, fontSize: 14, color: CoachColors.textFaint },
  autoflowInput: {
    backgroundColor: CoachColors.bg, borderRadius: 12, borderWidth: 1, borderColor: CoachColors.border,
    padding: 12, minHeight: 89, fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textPrimary, lineHeight: 20,
  },
  autoflowSaveBtn: { backgroundColor: CoachColors.accent, borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  autoflowSaveBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.onAccent },

  pickerSheet: {
    backgroundColor: CoachColors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: CoachColors.border, padding: 20, paddingBottom: 40, maxHeight: '70%',
  },
  pickerSheetTitle: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.textMuted, textAlign: 'center', marginBottom: 16 },
  pickerSheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, padding: 12, marginBottom: 10,
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
  card: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 16, padding: 18 },
  cardTitle: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary, lineHeight: 27 },
  cardBody: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, marginTop: 9, lineHeight: 21.5 },
  cta: { backgroundColor: CoachColors.accent, borderRadius: 999, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
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
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: CoachColors.border,
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

  const renderWorkoutItem = ({ item }: { item: typeof workouts[0] }) => {
    const exerciseCount = item.workout_exercises?.length || 0;
    const statLine = `${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''} · On-demand`;

    const muscleGroups = (item.workout_exercises?.map((we: any) => we.exercises?.muscle_group).filter(Boolean) || []) as string[];
    const muscleSummary = muscleGroups.length > 0 ? formatMuscleGroups(muscleGroups) : 'Full body';

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/workout/${item.id}` as any)}
      >
        <View style={styles.thumbnailContainer}>
          <Ionicons name="barbell-outline" size={22} color={CoachColors.textSecondary} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>{muscleSummary}</Text>
          <Text style={styles.rowDescription} numberOfLines={1}>{statLine}</Text>
        </View>
        <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => handleDeleteWorkout(item.id, item.name)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={18} color={CoachColors.danger} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderExerciseItem = ({ item }: { item: typeof exercises[0] }) => {
    const equipmentLabel = item.equipment ? titleCase(item.equipment) : 'Bodyweight';
    const subtitle = `${titleCase(item.muscle_group)} · ${equipmentLabel}`;
    const desc = stripHtml(item.instructions) || 'No instructions provided.';

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/create-exercise?editId=${item.id}` as any)}
      >
        <View style={styles.thumbnailContainer}>
          <Ionicons
            name={item.is_custom ? 'person-outline' : 'globe-outline'}
            size={20}
            color={CoachColors.textSecondary}
          />
        </View>
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
    );
  };

  const renderDietItem = ({ item }: { item: typeof diets[0] }) => {
    const mealCount = item.diet_plan_meals?.length || 0;
    let totalCals = 0;
    (item.diet_plan_meals || []).forEach(m => {
      if (m.meals) totalCals += m.meals.calories * (m.servings || 1);
    });
    const CATEGORY_LABELS: Record<string, string> = {
      'balanced': 'Balanced',
      'high-protein': 'High protein',
      'keto': 'Keto',
      'vegan': 'Vegan',
      'weight-loss': 'Weight loss',
      'custom': 'Custom',
    };
    const catLabel = item.category ? (CATEGORY_LABELS[item.category] || 'Custom') : 'Nutrition';
    const subtitle = `${mealCount} meal${mealCount !== 1 ? 's' : ''} · ${Math.round(totalCals)} cal · ${catLabel}`;
    const desc = item.description || 'Nutritional meal plan details.';

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/diet/${item.id}` as any)}
      >
        <View style={styles.thumbnailContainer}>
          <Ionicons name="nutrition-outline" size={22} color={CoachColors.textSecondary} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
          <Text style={styles.rowDescription} numberOfLines={2}>{desc}</Text>
        </View>
        <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => handleDeleteDiet(item.id, item.name)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={18} color={CoachColors.danger} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderPlanItem = ({ item }: { item: typeof plans[0] }) => {
    return <PassCard item={item} workouts={workouts} onRefresh={refreshPlans} stats={planStats[item.id]} />;
  };

  const renderClassItem = ({ item }: { item: ClassItem }) => {
    const statusColors = {
      'DRAFT': CoachColors.textMuted,
      'PUBLISHED': CoachColors.accent,
      'ARCHIVED': CoachColors.warning
    };
    const statusColor = statusColors[item.status as keyof typeof statusColors] || CoachColors.textMuted;
    const categoryColor = item.category ? getCategoryColor(item.category) : CoachColors.textPrimary;

    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/class/${item.id}` as any)}
        onLongPress={() => handleDeleteClass(item.id, item.title)}
      >
        <View style={styles.thumbnailContainer}>
          {item.thumbnail_url ? (
            <RNImage source={{ uri: item.thumbnail_url }} style={{ width: 44, height: 44, borderRadius: Radius.xs }} />
          ) : (
            <Ionicons name="videocam-outline" size={25} color={CoachColors.textPrimary} />
          )}
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title.toUpperCase()}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <View style={[styles.pillBadge, { borderColor: categoryColor }]}>
              <Text style={[styles.pillBadgeText, { color: categoryColor }]}>{item.category?.toUpperCase() || 'UNCATEGORIZED'}</Text>
            </View>
            <View style={[styles.pillBadge, { borderColor: CoachColors.border }]}>
              <Text style={[styles.pillBadgeText, { color: CoachColors.textPrimary }]}>{item.difficulty?.toUpperCase() || 'ALL LEVELS'}</Text>
            </View>
            <View style={[styles.pillBadge, { borderColor: CoachColors.border }]}>
              <Text style={[styles.pillBadgeText, { color: CoachColors.textPrimary }]}>{item.duration_minutes || 0} MIN</Text>
            </View>
            <View style={[styles.pillBadge, { borderColor: statusColor }]}>
              <Text style={[styles.pillBadgeText, { color: statusColor }]}>{item.status?.toUpperCase() || 'DRAFT'}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="play-outline" size={13} color={CoachColors.textMuted} />
              <Text style={styles.rowDescription}>{item.take_count || 0}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="star-outline" size={13} color={CoachColors.textMuted} />
              <Text style={styles.rowDescription}>{(item.avg_rating || 0).toFixed(1)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={13} color={CoachColors.textMuted} />
              <Text style={styles.rowDescription}>{item.total_watch_minutes || 0}M</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => handleDeleteClass(item.id, item.title)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={18} color={CoachColors.danger} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

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
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>{isPassesTab ? 'Passes' : 'Library'}</Text>
            {isPassesTab && (
              <Text style={styles.headerSub}>
                {plans.length} pass{plans.length === 1 ? '' : 'es'}
                {totalHolders > 0 ? ` · ${totalHolders} athletes holding one` : ''}
              </Text>
            )}
          </View>
          <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
            style={styles.headerAddBtn}
            onPress={handleHeaderAdd}
            accessibilityRole="button"
            accessibilityLabel={
              activeTab === 'plans' ? 'New pass' :
              activeTab === 'workouts' ? 'New workout' :
              activeTab === 'diets' ? 'New meal plan' :
              activeTab === 'exercises' ? 'New exercise' :
              'New class'
            }
          >
            <Ionicons name="add" size={20} color={CoachColors.onAccent} />
            <Text style={styles.headerAddText}>New</Text>
          </TouchableOpacity>
        </View>

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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.togglesContainer}>
            {(['plans', 'workouts', 'diets', 'classes', 'exercises'] as TabType[]).map((tab) => (
              <TouchableOpacity hitSlop={{ top: 7, bottom: 7 }}
                key={tab}
                style={[styles.toggleBtn, activeTab === tab && styles.toggleBtnActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(tab);
                  setSearchQuery('');
                  setActiveCategory('All');
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.toggleText, activeTab === tab && styles.toggleTextActive]}>
                  {TAB_LABEL[tab]} {TAB_COUNT[tab]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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

        {/* Flat List Content */}
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
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 130 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={CoachColors.textPrimary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.xl }} />}
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
                onAction={() => setShowAddActionSheet(true)}
              />
            )
          }
        />
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
          <View style={styles.actionSheetContent} onStartShouldSetResponder={() => true}>
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

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 29,
    color: CoachColors.textPrimary,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    marginTop: 2,
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    marginTop: 2,
  },
  headerAddText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14.5,
    color: CoachColors.onAccent,
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
  togglesContainer: {
    paddingHorizontal: 20,
    gap: 10,
  },
  toggleBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  toggleBtnActive: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
  },
  toggleText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
  },
  toggleTextActive: {
    color: CoachColors.onAccent,
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
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
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
  actionBtn: {
    padding: 8,
    justifyContent: 'center',
    alignSelf: 'center',
  },

  // Badges
  customBadge: {
    backgroundColor: CoachColors.accentSofter,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.35)',
    borderRadius: Radius.xs,
    marginLeft: 8,
  },
  customBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.accent,
    letterSpacing: 0.3,
  },
  popularBadge: {
    backgroundColor: CoachColors.warningSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: CoachColors.warning,
    borderRadius: Radius.xs,
    marginLeft: 8,
  },
  popularBadgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 9,
    color: CoachColors.warning,
    letterSpacing: 0.5,
  },
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: Radius.xs,
    backgroundColor: CoachColors.surface,
  },
  pillBadgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 9,
    letterSpacing: 0.5,
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
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: CoachColors.border,
  },
  dragHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
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
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    marginBottom: 10,
  },
  actionSheetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
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
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  closeSheetText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
  },
});
