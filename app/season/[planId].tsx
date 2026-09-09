/**
 * /season/[planId] — the season editor (canvas "Season Editor").
 *
 * One screen replaces the wizard-in-edit-mode and the node-by-node roadmap.
 * The grid IS the pass: weeks down, days across, every week visible; a lime
 * rail on a week marks where a holder is right now. Two ways to add: pick an
 * item in the library rail and tap days ("paint"; "Every week" paints the
 * same weekday across the season), or tap a day with nothing selected and
 * use the day sheet (what's there, search, create, "do this every week").
 *
 * Nothing saves by itself. Edits accumulate against the live track; the
 * header badge counts them; Publish opens the review (changes with their
 * week and who is affected, one switch to tell holders) and publishes in
 * place through lib/passPublish.ts — holders keep their current week. You
 * stay on the grid; the header says Published; a card says who got it.
 *
 * Every sheet here is an in-screen overlay, never a native Modal: a Modal
 * over an in-flight navigation is the documented iOS freeze.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useApp } from '../../context/AppContext';
import type { TrackNode } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { supabase } from '../../lib/supabase';
import { seasonToTrack, trackToSeason, emptyDays, type DayNode, type SeasonWeek } from '../../lib/passSeason';
import { liveHoldersFor, publishPlanTrack, describeChanges, sendUpdateMessages, notifyHoldersOfUpdate, type LiveHolder } from '../../lib/passPublish';
import { diffTracks, isOnLatestTrack, type TrackDiffEntry } from '../../lib/passWeeks';
import { goBackOr, COACH_HOME } from '../../lib/nav';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Brush = { kind: 'workout' | 'diet'; id: string; name: string } | { kind: 'rest' } | { kind: 'checkin' } | { kind: 'live' };
type Mode = 'every' | 'this';

const initialsOf = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export default function SeasonEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { plans, workouts, diets, classes, clients, updatePlanTrack, refreshPlans } = useApp();
  const { user } = useAuth();
  const { showAlert } = useAlert();

  const plan = plans.find((p) => p.id === planId);
  const durationWeeks = plan?.duration_weeks ?? null;

  const names = useMemo(() => ({
    workoutName: (id: string) => workouts.find((w: any) => w.id === id)?.name,
    dietName: (id: string) => diets.find((d: any) => d.id === id)?.name,
  }), [workouts, diets]);

  // ── The map (edited) vs the live track (baseline) ─────────────────────────
  const [weeks, setWeeks] = useState<SeasonWeek[]>([]);
  const [finalMilestones, setFinalMilestones] = useState<string[]>([]);
  const [baseline, setBaseline] = useState<TrackNode[]>([]);
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!plan || loadedForRef.current === plan.id) return;
    loadedForRef.current = plan.id;
    const track = [...(plan.track ?? [])].sort((a, b) => a.order - b.order);
    const season = trackToSeason(track, durationWeeks, names);
    // A pass with no track yet: an empty week per declared week.
    const wk = season.weeks.length > 0 ? season.weeks : Array.from({ length: Math.max(1, durationWeeks ?? 4) }, () => ({ days: emptyDays(), label: '', isRest: false }));
    setWeeks(wk);
    setFinalMilestones(season.finalMilestones);
    setBaseline(track);
  }, [plan, durationWeeks, names]);

  const newTrack = useMemo(() => seasonToTrack(weeks, finalMilestones), [weeks, finalMilestones]);
  const changes: TrackDiffEntry[] = useMemo(() => diffTracks(baseline, newTrack, durationWeeks), [baseline, newTrack, durationWeeks]);
  const reorderOnly = changes.length === 0 && !isOnLatestTrack(baseline, newTrack) && baseline.length > 0;
  const dirty = changes.length > 0 || reorderOnly;

  // ── Holders ───────────────────────────────────────────────────────────────
  const [holders, setHolders] = useState<LiveHolder[]>([]);
  const loadHolders = useCallback(async () => {
    if (!plan) return;
    const { data } = await supabase
      .from('client_plan_enrollments')
      .select('id, client_id, track_position, status, track_snapshot, started_at, sync_with_plan, updated_at, plan_id, created_at')
      .eq('plan_id', plan.id);
    setHolders(liveHoldersFor((data ?? []) as any, clients as any, plan.track ?? [], durationWeeks));
  }, [plan, clients, durationWeeks]);
  useEffect(() => { loadHolders(); }, [loadHolders]);
  const holdersByWeek = useMemo(() => {
    const m = new Map<number, LiveHolder[]>();
    holders.forEach((h) => { const list = m.get(h.week) ?? []; list.push(h); m.set(h.week, list); });
    return m;
  }, [holders]);
  const maxActiveWeek = holders.length > 0 ? Math.max(...holders.map((h) => h.week)) : 0;

  // ── Brush ─────────────────────────────────────────────────────────────────
  const [brush, setBrush] = useState<Brush | null>(null);
  const [mode, setMode] = useState<Mode>('every');
  const [daySheet, setDaySheet] = useState<{ week: number; day: number } | null>(null);
  const [library, setLibrary] = useState(false);
  const [query, setQuery] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notify, setNotify] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ moved: number; expected: number; note: string } | null>(null);

  const applyToDay = useCallback((weekIndex: number, dayIndex: number, b: Brush, toggle = true) => {
    setWeeks((prev) => prev.map((wk, w) => {
      if (w !== weekIndex) return wk;
      const days = wk.days.map((d, j) => {
        if (j !== dayIndex) return d;
        if (b.kind === 'rest') return d.some((n) => n.kind === 'rest') && toggle ? [] : [{ kind: 'rest' as const }];
        const same = d.find((n) => n.kind === b.kind && ('id' in b ? n.id === b.id : true));
        if (same && toggle) return d.filter((n) => n !== same);
        const kept = d.filter((n) => n.kind !== 'rest' && n.kind !== b.kind);
        const node: DayNode = b.kind === 'workout' || b.kind === 'diet' ? { kind: b.kind, id: b.id, name: b.name } : { kind: b.kind };
        return [...kept, node];
      });
      return { ...wk, days, isRest: false };
    }));
  }, []);

  const paint = useCallback((weekIndex: number, dayIndex: number) => {
    if (!brush) { setDaySheet({ week: weekIndex, day: dayIndex }); return; }
    Haptics.selectionAsync().catch(() => {});
    if (mode === 'this') { applyToDay(weekIndex, dayIndex, brush); return; }
    // Every week: paint the same weekday on every training week; if the tapped
    // day already has it, this is a remove across the season.
    const has = weeks[weekIndex]?.days[dayIndex]?.some((n) => n.kind === brush.kind && ('id' in brush ? n.id === brush.id : true));
    setWeeks((prev) => prev.map((wk) => {
      if (wk.isRest) return wk;
      const days = wk.days.map((d, j) => {
        if (j !== dayIndex) return d;
        if (brush.kind === 'rest') return has ? [] : [{ kind: 'rest' as const }];
        if (has) return d.filter((n) => !(n.kind === brush.kind && ('id' in brush ? n.id === brush.id : true)));
        const kept = d.filter((n) => n.kind !== 'rest' && n.kind !== brush.kind);
        const node: DayNode = brush.kind === 'workout' || brush.kind === 'diet' ? { kind: brush.kind, id: brush.id, name: brush.name } : { kind: brush.kind };
        return [...kept, node];
      });
      return { ...wk, days };
    }));
  }, [brush, mode, weeks, applyToDay]);

  const copyDayForward = useCallback((weekIndex: number, dayIndex: number) => {
    setWeeks((prev) => prev.map((wk, w) => (w > weekIndex && !wk.isRest ? { ...wk, days: wk.days.map((d, j) => (j === dayIndex ? prev[weekIndex].days[dayIndex].map((n) => ({ ...n })) : d)) } : wk)));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const toggleRestWeek = useCallback((weekIndex: number) => {
    setWeeks((prev) => prev.map((wk, w) => (w === weekIndex ? { ...wk, isRest: !wk.isRest, days: wk.isRest ? wk.days : emptyDays() } : wk)));
  }, []);

  const addWeek = useCallback(() => setWeeks((prev) => [...prev, { days: emptyDays(), label: '', isRest: false }]), []);
  const removeLastWeek = useCallback(() => {
    if (weeks.length <= 1) return;
    const last = weeks.length - 1;
    if (holdersByWeek.has(last + 1)) { showAlert({ type: 'warning', title: 'Someone is in that week', message: 'Move them along or wait until they finish before removing it.' }); return; }
    setWeeks((prev) => prev.slice(0, -1));
  }, [weeks.length, holdersByWeek, showAlert]);

  // "Create a workout for this day": leave, come back, drop it in.
  const pendingDayRef = useRef<{ week: number; day: number } | null>(null);
  const knownWorkoutIds = useRef<Set<string>>(new Set());
  useEffect(() => { if (knownWorkoutIds.current.size === 0) workouts.forEach((w: any) => knownWorkoutIds.current.add(w.id)); }, [workouts]);
  useFocusEffect(useCallback(() => {
    const pending = pendingDayRef.current;
    if (!pending) return;
    const fresh = workouts.find((w: any) => !knownWorkoutIds.current.has(w.id));
    workouts.forEach((w: any) => knownWorkoutIds.current.add(w.id));
    pendingDayRef.current = null;
    if (fresh) {
      applyToDay(pending.week, pending.day, { kind: 'workout', id: fresh.id, name: fresh.name }, false);
      setDaySheet(pending);
    }
  }, [workouts, applyToDay]));

  // ── Publish ───────────────────────────────────────────────────────────────
  const labelOf = useCallback((n: TrackNode) =>
    n.type === 'workout' ? (names.workoutName(n.id ?? '') ?? 'a workout')
    : n.type === 'diet' ? (names.dietName(n.id ?? '') ?? 'a meal plan')
    : (n.label ?? 'a milestone'), [names]);

  const blastNote = (c: TrackDiffEntry): { text: string; warn: boolean } | null => {
    if (c.kind === 'removed' && c.week <= maxActiveWeek) {
      const inside = holders.filter((h) => h.week === c.week && h.client);
      if (inside.length > 0) return { text: `${inside.map((h) => h.client!.name.split(' ')[0]).join(' and ')} ${inside.length === 1 ? 'is' : 'are'} in week ${c.week} now — they keep it`, warn: true };
      return null;
    }
    if (c.kind === 'added' && c.week > maxActiveWeek) return { text: `Nobody has reached week ${c.week} yet`, warn: false };
    return null;
  };

  const publish = useCallback(async () => {
    if (!plan || publishing || !dirty) return;
    setPublishing(true);
    try {
      const summary = describeChanges(changes, labelOf);
      if (holders.length === 0 || reorderOnly) {
        await updatePlanTrack(plan.id, newTrack);
        await refreshPlans?.();
        setBaseline(newTrack);
        setReviewOpen(false);
        setPublished({ moved: 0, expected: 0, note: holders.length === 0 ? 'Saved. Nobody is inside yet, so nothing else changes.' : 'Saved. A reorder inside the weeks; nobody inside notices a change.' });
      } else {
        const outcome = await publishPlanTrack({ planId: plan.id, oldTrack: baseline, newTrack, changes, holders, audience: 'everyone', durationWeeks, summary });
        await refreshPlans?.();
        const ids = holders.map((h) => h.enrollment.client_id);
        let failed = 0;
        if (notify) {
          failed = await sendUpdateMessages(user!.id, ids, `I've updated ${plan.name}: ${summary}. Your current week stays as it is.`);
          await notifyHoldersOfUpdate(ids, plan.name, summary);
        }
        const kept = holders.filter((h) => changes.some((c) => c.kind === 'removed' && c.week === h.week)).map((h) => h.client?.name.split(' ')[0]).filter(Boolean);
        const parts = [notify ? (failed > 0 ? `${failed} did not get the message.` : 'Each got your note and a notification.') : 'Nobody was messaged.'];
        if (kept.length > 0) parts.push(`${kept.join(' and ')} keep${kept.length === 1 ? 's' : ''} their current week as it was.`);
        if (outcome.versionWarning) parts.push(`Version history was not recorded: ${outcome.versionWarning}`);
        setBaseline(newTrack);
        setReviewOpen(false);
        setPublished({ moved: outcome.moved, expected: outcome.expected, note: parts.join(' ') });
        loadHolders();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Not published', message: `The pass was left exactly as it was — nothing changed for anyone. ${err?.message ?? ''}` });
    } finally {
      setPublishing(false);
    }
  }, [plan, publishing, dirty, changes, labelOf, holders, reorderOnly, updatePlanTrack, refreshPlans, newTrack, baseline, durationWeeks, notify, user, loadHolders, showAlert]);

  const leave = useCallback(() => {
    if (!dirty) { goBackOr(router, COACH_HOME); return; }
    showAlert({
      type: 'confirm',
      title: 'Leave without publishing?',
      message: `${changes.length || 'Your'} change${changes.length === 1 ? '' : 's'} to ${plan?.name ?? 'this season'} will be lost.`,
      buttons: [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => goBackOr(router, COACH_HOME) },
      ],
    });
  }, [dirty, changes.length, plan?.name, router, showAlert]);
  useAndroidBack(useCallback(() => {
    if (daySheet) { setDaySheet(null); return true; }
    if (library) { setLibrary(false); return true; }
    if (reviewOpen) { setReviewOpen(false); return true; }
    if (published) { setPublished(null); return true; }
    leave();
    return true;
  }, [daySheet, library, reviewOpen, published, leave]));

  if (!plan) {
    return (
      <View style={[st.container, st.center, { paddingTop: insets.top }]}>
        <Text style={st.emptyTitle}>This pass is not here</Text>
        <TouchableOpacity style={st.outlineBtn} onPress={() => goBackOr(router, COACH_HOME)}><Text style={st.outlineBtnText}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  // ── Library rail: newest first, what the coach paints with ────────────────
  const rail: Brush[] = useMemo(() => {
    const ws = [...workouts].sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))).slice(0, 12).map((w: any) => ({ kind: 'workout' as const, id: w.id, name: w.name }));
    const ds = [...diets].sort((a: any, b: any) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))).slice(0, 6).map((d: any) => ({ kind: 'diet' as const, id: d.id, name: d.name }));
    return [...ws, ...ds];
  }, [workouts, diets]);
  const countIn = (b: Brush) => ('id' in b ? newTrack.filter((n) => n.id === b.id).length : 0);
  const isBrush = (a: Brush | null, b: Brush) => !!a && a.kind === b.kind && ('id' in a && 'id' in b ? a.id === b.id : !('id' in a) && !('id' in b));

  const q = query.trim().toLowerCase();
  const searchResults: Brush[] = q
    ? [
        ...workouts.filter((w: any) => w.name.toLowerCase().includes(q)).map((w: any) => ({ kind: 'workout' as const, id: w.id, name: w.name })),
        ...diets.filter((d: any) => d.name.toLowerCase().includes(q)).map((d: any) => ({ kind: 'diet' as const, id: d.id, name: d.name })),
      ]
    : [];

  const sheetWeek = daySheet ? weeks[daySheet.week] : null;
  const sheetDay = daySheet && sheetWeek ? sheetWeek.days[daySheet.day] : [];

  return (
    <View style={st.container}>
      {/* ── Header ── */}
      <View style={[st.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={st.circleBtn} onPress={leave} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{plan.name}</Text>
          <Text style={st.headerSub}>{weeks.length} week{weeks.length === 1 ? '' : 's'} · {holders.length} inside{dirty ? '' : published ? ' · published' : ' · live'}</Text>
        </View>
        <TouchableOpacity
          style={[st.publishBtn, !dirty && st.publishBtnIdle]}
          onPress={() => (dirty ? setReviewOpen(true) : undefined)}
          disabled={!dirty}
          accessibilityRole="button"
          accessibilityLabel={dirty ? `Publish ${changes.length} changes` : 'Nothing to publish'}
        >
          {dirty ? (
            <>
              <Text style={st.publishText}>Publish</Text>
              <View style={st.publishBadge}><Text style={st.publishBadgeText}>{changes.length || '↕'}</Text></View>
            </>
          ) : (
            <>
              <Ionicons name="checkmark" size={15} color={C.accent} />
              <Text style={st.publishIdleText}>{published ? 'Published' : 'Live'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Details chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chipsRow} style={{ flexGrow: 0 }}>
        <TouchableOpacity style={st.chip} onPress={() => router.push({ pathname: '/create-plan', params: { editId: plan.id } } as any)} accessibilityRole="button">
          <Text style={st.chipText}>Details · ${Number(plan.price)}/{plan.period === 'year' ? 'yr' : 'mo'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.chip} onPress={() => router.push({ pathname: '/pass-versions', params: { planId: plan.id } } as any)} accessibilityRole="button">
          <Text style={st.chipText}>Versions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.chip} onPress={() => router.push({ pathname: '/pass-holders', params: { planId: plan.id } } as any)} accessibilityRole="button">
          <Text style={st.chipText}>Holders · {holders.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.chip} onPress={() => router.push({ pathname: '/pass-track-editor', params: { planId: plan.id } } as any)} accessibilityRole="button">
          <Text style={st.chipText}>Roadmap</Text>
        </TouchableOpacity>
      </ScrollView>

      {published && (
        <View style={st.publishedCard}>
          <View style={st.publishedMark}><Ionicons name="checkmark" size={18} color={C.onAccent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.publishedTitle}>{published.expected > 0 ? `${published.moved} of ${published.expected} athlete${published.expected === 1 ? '' : 's'} moved to the new season` : 'Saved'}</Text>
            <Text style={st.publishedSub}>{published.note}</Text>
          </View>
          <TouchableOpacity onPress={() => setPublished(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Dismiss">
            <Ionicons name="close" size={18} color={C.textFaint} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── The grid ── */}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 250 }} showsVerticalScrollIndicator={false}>
        <View style={st.gridHead}>
          <View style={{ width: 34 }} />
          {DAY_LETTERS.map((l, i) => <Text key={i} style={st.dayLetter}>{l}</Text>)}
        </View>
        {weeks.map((wk, w) => {
          const here = holdersByWeek.get(w + 1) ?? [];
          const label = wk.label;
          return (
            <View key={w} style={st.weekRow}>
              <Pressable onLongPress={() => toggleRestWeek(w)} style={[st.weekCell, here.length > 0 && st.weekCellHere]} accessibilityRole="button" accessibilityLabel={`Week ${w + 1}${here.length ? `, ${here.length} athletes here` : ''}. Long press to toggle rest week.`}>
                <Text style={st.weekNum}>W{w + 1}</Text>
                {here.length > 0 ? (
                  <Text style={st.weekHere} numberOfLines={1}>{here.slice(0, 2).map((h) => initialsOf(h.client?.name ?? 'A').slice(0, 1)).join('·')}{here.length > 2 ? '+' : ''}</Text>
                ) : label ? <Text style={st.weekLabel} numberOfLines={1}>{label}</Text> : null}
              </Pressable>
              {wk.isRest ? (
                <TouchableOpacity style={st.restRow} onPress={() => toggleRestWeek(w)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`Week ${w + 1} is a rest week. Tap to make it a training week.`}>
                  <Ionicons name="moon-outline" size={14} color={C.textFaint} />
                  <Text style={st.restText}>{label ? `${label} · ` : ''}Rest week · tap to use it</Text>
                </TouchableOpacity>
              ) : wk.days.map((day, d) => {
                const hasWorkout = day.some((n) => n.kind === 'workout');
                const hasDiet = day.some((n) => n.kind === 'diet');
                const other = day.filter((n) => n.kind !== 'workout' && n.kind !== 'diet' && n.kind !== 'rest').length;
                const rest = day.some((n) => n.kind === 'rest');
                const brushHere = brush && day.some((n) => n.kind === brush.kind && ('id' in brush ? n.id === brush.id : true));
                const filled = hasWorkout || hasDiet || other > 0;
                return (
                  <Pressable
                    key={d}
                    onPress={() => paint(w, d)}
                    onLongPress={() => setDaySheet({ week: w, day: d })}
                    style={({ pressed }) => [st.cell, filled && st.cellFilled, brushHere && st.cellBrush, brush && !filled && st.cellTarget, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Week ${w + 1} ${DAY_NAMES[d]}: ${day.length === 0 ? 'empty' : day.map((n) => n.name ?? n.kind).join(', ')}`}
                  >
                    {hasWorkout && <View style={st.barWorkout} />}
                    {hasDiet && <View style={st.barDiet} />}
                    {other > 0 && <View style={st.dotOther} />}
                    {rest && <Ionicons name="moon-outline" size={12} color={C.textFaint} />}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <TouchableOpacity style={st.outlineBtn} onPress={addWeek} accessibilityRole="button"><Ionicons name="add" size={16} color={C.textPrimary} /><Text style={st.outlineBtnText}>Week</Text></TouchableOpacity>
          {weeks.length > 1 && (
            <TouchableOpacity style={st.outlineBtn} onPress={removeLastWeek} accessibilityRole="button"><Ionicons name="remove" size={16} color={C.textSecondary} /><Text style={[st.outlineBtnText, { color: C.textSecondary }]}>Last week</Text></TouchableOpacity>
          )}
        </View>
        <Text style={st.hint}>Pick something below, then tap days. Tap a day with nothing picked to see what is on it. Long-press a week number for a rest week.</Text>
      </ScrollView>

      {/* ── Library rail ── */}
      <View style={[st.rail, { paddingBottom: insets.bottom + 10 }]}>
        <View style={st.railHead}>
          <Text style={st.railEyebrow}>{brush ? 'Painting with' : 'Paint with'}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['every', 'this'] as Mode[]).map((m) => (
              <TouchableOpacity key={m} style={[st.modeChip, mode === m && st.modeChipOn]} onPress={() => setMode(m)} accessibilityRole="button" accessibilityState={{ selected: mode === m }}>
                <Text style={[st.modeText, mode === m && st.modeTextOn]}>{m === 'every' ? 'Every week' : 'This week'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 16 }}>
          {rail.map((b) => {
            const on = isBrush(brush, b);
            const n = countIn(b);
            return (
              <TouchableOpacity key={`${b.kind}:${'id' in b ? b.id : b.kind}`} style={[st.railCard, on && st.railCardOn]} onPress={() => setBrush(on ? null : b)} activeOpacity={0.8} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={b.kind === 'diet' ? 'nutrition-outline' : 'barbell-outline'} size={13} color={on ? C.accent : C.textFaint} />
                  <Text style={[st.railKind, on && { color: C.accent }]}>{on ? 'SELECTED' : b.kind === 'diet' ? 'MEAL PLAN' : 'WORKOUT'}</Text>
                </View>
                <Text style={st.railName} numberOfLines={1}>{'name' in b ? b.name : b.kind}</Text>
                <Text style={st.railSub}>{n > 0 ? `in ${n} day${n === 1 ? '' : 's'}` : 'not in the season yet'}</Text>
              </TouchableOpacity>
            );
          })}
          {rail.length === 0 && <Text style={st.railSub}>No workouts or meal plans in your library yet.</Text>}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TouchableOpacity style={st.railBtn} onPress={() => router.push('/create-workout' as any)} accessibilityRole="button"><Ionicons name="add" size={14} color={C.textPrimary} /><Text style={st.railBtnText}>New workout</Text></TouchableOpacity>
          <TouchableOpacity style={st.railBtn} onPress={() => { setQuery(''); setLibrary(true); }} accessibilityRole="button"><Ionicons name="search-outline" size={14} color={C.textPrimary} /><Text style={st.railBtnText}>All {workouts.length + diets.length}</Text></TouchableOpacity>
          <TouchableOpacity style={[st.railBtn, isBrush(brush, { kind: 'rest' }) && st.railBtnOn]} onPress={() => setBrush(isBrush(brush, { kind: 'rest' }) ? null : { kind: 'rest' })} accessibilityRole="button"><Ionicons name="moon-outline" size={14} color={isBrush(brush, { kind: 'rest' }) ? C.onAccent : C.textSecondary} /><Text style={[st.railBtnText, isBrush(brush, { kind: 'rest' }) && { color: C.onAccent }]}>Rest</Text></TouchableOpacity>
        </View>
      </View>

      {/* ── Day sheet ── */}
      {daySheet && sheetWeek && (
        <View style={st.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setDaySheet(null)} accessibilityLabel="Close" />
          <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={st.grabber} />
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={st.sheetTitle}>Week {daySheet.week + 1} · {DAY_NAMES[daySheet.day]}</Text>
              <Text style={st.sheetMeta}>{(holdersByWeek.get(daySheet.week + 1) ?? []).length > 0 ? `${(holdersByWeek.get(daySheet.week + 1) ?? []).length} here now` : 'Nobody here yet'}</Text>
            </View>
            <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={st.sheetEyebrow}>On this day</Text>
              {sheetDay.length === 0 ? <Text style={st.sheetEmpty}>Nothing yet.</Text> : sheetDay.map((n, i) => (
                <View key={i} style={st.sheetRow}>
                  <View style={st.sheetIcon}><Ionicons name={n.kind === 'diet' ? 'nutrition-outline' : n.kind === 'workout' ? 'barbell-outline' : n.kind === 'rest' ? 'moon-outline' : n.kind === 'live' ? 'videocam-outline' : 'chatbubble-ellipses-outline'} size={17} color={n.kind === 'workout' ? C.accent : C.textSecondary} /></View>
                  <Text style={st.sheetRowName} numberOfLines={1}>{n.name ?? (n.kind === 'checkin' ? 'Check-in' : n.kind === 'live' ? 'Live session' : n.kind === 'rest' ? 'Rest day' : n.label ?? 'Milestone')}</Text>
                  {n.kind === 'workout' && n.id && (
                    <TouchableOpacity style={st.sheetRowBtn} onPress={() => router.push({ pathname: '/create-workout', params: { editId: n.id } } as any)} accessibilityRole="button" accessibilityLabel="Edit workout"><Ionicons name="create-outline" size={16} color={C.textSecondary} /></TouchableOpacity>
                  )}
                  <TouchableOpacity style={st.sheetRowBtn} onPress={() => setWeeks((prev) => prev.map((wk, w) => (w === daySheet.week ? { ...wk, days: wk.days.map((d, j) => (j === daySheet.day ? d.filter((x) => x !== n) : d)) } : wk)))} accessibilityRole="button" accessibilityLabel="Remove"><Ionicons name="close" size={16} color={C.danger} /></TouchableOpacity>
                </View>
              ))}

              <Text style={st.sheetEyebrow}>Add</Text>
              <View style={st.searchBox}>
                <Ionicons name="search-outline" size={16} color={C.textFaint} />
                <TextInput style={st.searchInput} placeholder="Search workouts and meal plans" placeholderTextColor={C.textFaint} value={query} onChangeText={setQuery} selectionColor={C.accent} />
              </View>
              {(q ? searchResults : rail.slice(0, 6)).map((b) => (
                <TouchableOpacity key={`s:${b.kind}:${'id' in b ? b.id : b.kind}`} style={st.sheetRow} onPress={() => { applyToDay(daySheet.week, daySheet.day, b, false); Haptics.selectionAsync().catch(() => {}); }} activeOpacity={0.7} accessibilityRole="button">
                  <View style={st.sheetIcon}><Ionicons name={b.kind === 'diet' ? 'nutrition-outline' : 'barbell-outline'} size={17} color={C.textSecondary} /></View>
                  <Text style={st.sheetRowName} numberOfLines={1}>{'name' in b ? b.name : b.kind}</Text>
                  <Ionicons name="add" size={18} color={C.accent} />
                </TouchableOpacity>
              ))}
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {([{ kind: 'checkin' as const, label: 'Check-in' }, { kind: 'live' as const, label: 'Live session' }, { kind: 'rest' as const, label: 'Rest day' }]).map((x) => (
                  <TouchableOpacity key={x.kind} style={st.smallChip} onPress={() => applyToDay(daySheet.week, daySheet.day, { kind: x.kind } as Brush, false)} accessibilityRole="button"><Text style={st.smallChipText}>{x.label}</Text></TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={st.createRow} onPress={() => { pendingDayRef.current = daySheet; setDaySheet(null); setTimeout(() => router.push('/create-workout' as any), 250); }} accessibilityRole="button">
                <Ionicons name="add" size={16} color={C.accent} /><Text style={st.createText}>Create a workout for this day</Text>
              </TouchableOpacity>
              {daySheet.week < weeks.length - 1 && (
                <TouchableOpacity style={st.repeatRow} onPress={() => { copyDayForward(daySheet.week, daySheet.day); }} activeOpacity={0.8} accessibilityRole="button">
                  <View style={{ flex: 1 }}>
                    <Text style={st.repeatTitle}>Do this on every {DAY_NAMES[daySheet.day]}</Text>
                    <Text style={st.repeatSub}>Weeks {daySheet.week + 2}–{weeks.length} get the same day. Rest weeks stay rest.</Text>
                  </View>
                  <Ionicons name="copy-outline" size={18} color={C.accent} />
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Library search (pick a brush) ── */}
      {library && (
        <View style={st.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => setLibrary(false)} accessibilityLabel="Close" />
          <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={st.grabber} />
            <Text style={st.sheetTitle}>Paint with…</Text>
            <View style={st.searchBox}>
              <Ionicons name="search-outline" size={16} color={C.textFaint} />
              <TextInput style={st.searchInput} placeholder="Search workouts and meal plans" placeholderTextColor={C.textFaint} value={query} onChangeText={setQuery} selectionColor={C.accent} autoFocus />
            </View>
            <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
              {(q ? searchResults : [
                ...workouts.map((w: any) => ({ kind: 'workout' as const, id: w.id, name: w.name })),
                ...diets.map((d: any) => ({ kind: 'diet' as const, id: d.id, name: d.name })),
              ]).map((b) => (
                <TouchableOpacity key={`l:${b.kind}:${'id' in b ? b.id : b.kind}`} style={st.sheetRow} onPress={() => { setBrush(b); setLibrary(false); }} activeOpacity={0.7} accessibilityRole="button">
                  <View style={st.sheetIcon}><Ionicons name={b.kind === 'diet' ? 'nutrition-outline' : 'barbell-outline'} size={17} color={C.textSecondary} /></View>
                  <Text style={st.sheetRowName} numberOfLines={1}>{'name' in b ? b.name : b.kind}</Text>
                  <Text style={st.sheetMeta}>{countIn(b) > 0 ? `in ${countIn(b)}` : ''}</Text>
                </TouchableOpacity>
              ))}
              {classes.filter((c: any) => c.status === 'published').length > 0 && q === '' && (
                <Text style={[st.sheetEyebrow, { marginTop: 10 }]}>Classes go on a day from the day sheet</Text>
              )}
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Publish review ── */}
      {reviewOpen && (
        <View style={st.overlay}>
          <Pressable style={{ flex: 1 }} onPress={() => (publishing ? undefined : setReviewOpen(false))} accessibilityLabel="Close" />
          <View style={[st.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={st.grabber} />
            <Text style={st.sheetTitle}>{reorderOnly ? `Reorder inside ${plan.name}` : `${changes.length} change${changes.length === 1 ? '' : 's'} to ${plan.name}`}</Text>
            <Text style={st.sheetSub}>
              {holders.length === 0
                ? 'Nobody is inside yet. This just updates the pass.'
                : reorderOnly
                  ? 'Nobody inside notices a reorder within a week.'
                  : `${holders.length} ${holders.length === 1 ? 'person is' : 'people are'} inside. Everyone gets the new season from where they stand; nobody's current week changes under them.`}
            </Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {changes.map((c, i) => {
                const note = blastNote(c);
                return (
                  <View key={i} style={st.changeRow}>
                    <Text style={[st.changeSign, { color: c.kind === 'added' ? C.accent : C.warning }]}>{c.kind === 'added' ? '+' : '−'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={st.changeName} numberOfLines={1}>{labelOf(c.node)}</Text>
                      <Text style={[st.changeWeek, note?.warn && { color: C.warning }]}>Week {c.week}{note ? ` · ${note.text}` : ''}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            {holders.length > 0 && !reorderOnly && (
              <TouchableOpacity style={st.notifyRow} onPress={() => setNotify((v) => !v)} activeOpacity={0.8} accessibilityRole="switch" accessibilityState={{ checked: notify }}>
                <View style={{ flex: 1 }}>
                  <Text style={st.repeatTitle}>Tell them what changed</Text>
                  <Text style={st.repeatSub}>“I've updated {plan.name}: {describeChanges(changes, labelOf)}.” A note in each thread and a push.</Text>
                </View>
                <View style={[st.switch, notify && st.switchOn]}><View style={[st.knob, notify && st.knobOn]} /></View>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={st.keepBtn} onPress={() => setReviewOpen(false)} disabled={publishing} accessibilityRole="button"><Text style={st.keepText}>Keep editing</Text></TouchableOpacity>
              <TouchableOpacity style={[st.primaryBtn, publishing && { opacity: 0.5 }]} onPress={publish} disabled={publishing} accessibilityRole="button">
                {publishing ? <ActivityIndicator size="small" color={C.onAccent} /> : <Text style={st.primaryText}>{holders.length === 0 || reorderOnly ? 'Save' : `Publish to ${holders.length} athlete${holders.length === 1 ? '' : 's'}`}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  emptyTitle: { fontFamily: F.headingSemiBold, fontSize: 19, color: C.textPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 10 },
  circleBtn: { width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous', backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary },
  headerSub: { fontFamily: F.body, fontSize: 12, color: C.textSecondary, marginTop: 1 },
  publishBtn: { height: 40, paddingHorizontal: 14, borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', gap: 6 },
  publishBtnIdle: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border },
  publishText: { fontFamily: F.bodyBold, fontSize: 14, color: C.onAccent },
  publishIdleText: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textSecondary },
  publishBadge: { backgroundColor: C.onAccent, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  publishBadgeText: { fontFamily: F.bodyBold, fontSize: 12, color: C.accent },
  chipsRow: { paddingHorizontal: 16, paddingTop: 12, gap: 8, flexDirection: 'row' },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 7, paddingHorizontal: 12 },
  chipText: { fontFamily: F.bodyMedium, fontSize: 12.5, color: C.textPrimary },
  publishedCard: { marginHorizontal: 16, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1A2213', borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)', borderRadius: 16, borderCurve: 'continuous', padding: 12 },
  publishedMark: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  publishedTitle: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textPrimary },
  publishedSub: { fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: C.textSecondary, marginTop: 2 },
  gridHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 },
  dayLetter: { flex: 1, textAlign: 'center', fontFamily: F.bodyBold, fontSize: 11, color: C.textFaint },
  weekRow: { flexDirection: 'row', alignItems: 'stretch', gap: 4, marginTop: 6 },
  weekCell: { width: 34, justifyContent: 'center', paddingLeft: 9 },
  weekCellHere: { borderLeftWidth: 3, borderLeftColor: C.accent, paddingLeft: 6 },
  weekNum: { fontFamily: F.mono, fontSize: 12, color: C.textPrimary },
  weekHere: { fontFamily: F.body, fontSize: 9.5, color: C.accent },
  weekLabel: { fontFamily: F.body, fontSize: 9, color: C.textFaint },
  cell: { flex: 1, height: 54, borderRadius: 10, borderCurve: 'continuous', backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center', gap: 3 },
  cellFilled: { backgroundColor: '#1A2213', borderColor: 'rgba(198,242,78,0.35)' },
  cellBrush: { borderWidth: 2, borderColor: C.accent },
  cellTarget: { borderStyle: 'dashed', borderColor: 'rgba(198,242,78,0.5)' },
  barWorkout: { width: 22, height: 6, borderRadius: 3, backgroundColor: C.accent },
  barDiet: { width: 14, height: 6, borderRadius: 3, backgroundColor: C.textSecondary },
  dotOther: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.textFaint },
  restRow: { flex: 1, height: 40, borderRadius: 10, borderCurve: 'continuous', backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  restText: { fontFamily: F.body, fontSize: 13, color: C.textSecondary },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 999, borderCurve: 'continuous', borderWidth: 1, borderColor: C.border },
  outlineBtnText: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textPrimary },
  hint: { fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: C.textFaint, marginTop: 12 },
  rail: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 10, paddingHorizontal: 16, backgroundColor: 'rgba(16,18,16,0.98)', borderTopWidth: 1, borderTopColor: C.borderMuted },
  railHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  railEyebrow: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: C.textFaint },
  modeChip: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: C.border },
  modeChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  modeText: { fontFamily: F.bodySemiBold, fontSize: 11.5, color: C.textSecondary },
  modeTextOn: { color: C.onAccent, fontFamily: F.bodyBold },
  railCard: { width: 148, borderRadius: 14, borderCurve: 'continuous', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingVertical: 10, paddingHorizontal: 12, gap: 3 },
  railCardOn: { backgroundColor: '#1A2213', borderWidth: 2, borderColor: C.accent },
  railKind: { fontFamily: F.bodyBold, fontSize: 11, color: C.textFaint },
  railName: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textPrimary },
  railSub: { fontFamily: F.body, fontSize: 11.5, color: C.textSecondary },
  railBtn: { flex: 1, height: 36, borderRadius: 999, borderCurve: 'continuous', borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  railBtnOn: { backgroundColor: C.accent, borderColor: C.accent },
  railBtnText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textPrimary },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,7,6,0.72)', justifyContent: 'flex-end', zIndex: 30 },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderCurve: 'continuous', borderWidth: 1, borderColor: C.border, paddingHorizontal: 20, paddingTop: 12, gap: 10 },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontFamily: F.headingBold, fontSize: 22, color: C.textPrimary },
  sheetSub: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textSecondary },
  sheetMeta: { fontFamily: F.body, fontSize: 12.5, color: C.textSecondary },
  sheetEyebrow: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: C.textFaint, marginTop: 8, marginBottom: 6 },
  sheetEmpty: { fontFamily: F.body, fontSize: 14, color: C.textMuted },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, borderCurve: 'continuous', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  sheetIcon: { width: 36, height: 36, borderRadius: 10, borderCurve: 'continuous', backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center' },
  sheetRowName: { flex: 1, fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  sheetRowBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: 12, borderCurve: 'continuous', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, marginBottom: 8 },
  searchInput: { flex: 1, fontFamily: F.body, fontSize: 14.5, color: C.textPrimary },
  smallChip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  smallChipText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textPrimary },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, paddingHorizontal: 14, marginTop: 10 },
  createText: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.accent },
  repeatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, borderCurve: 'continuous', padding: 12, marginTop: 10 },
  repeatTitle: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textPrimary },
  repeatSub: { fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: C.textSecondary, marginTop: 2 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 12, borderCurve: 'continuous', paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  changeSign: { fontFamily: F.headingBold, fontSize: 20, width: 22, textAlign: 'center' },
  changeName: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  changeWeek: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 2 },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, borderCurve: 'continuous', padding: 12, marginTop: 12 },
  switch: { width: 46, height: 28, borderRadius: 14, backgroundColor: C.border, justifyContent: 'center', padding: 3 },
  switchOn: { backgroundColor: C.accent },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.textPrimary },
  knobOn: { backgroundColor: C.onAccent, alignSelf: 'flex-end' },
  keepBtn: { minHeight: 52, paddingHorizontal: 22, borderRadius: 999, borderCurve: 'continuous', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  keepText: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  primaryBtn: { flex: 1, minHeight: 52, borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: F.bodyBold, fontSize: 16, color: C.onAccent },
});
