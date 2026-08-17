import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import type { TrackNode } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import PassPublishedOverlay from '../components/coach/PassPublishedOverlay';
import { formatRun, formatDeadline, parseLocalDay } from '../lib/cohort';
import { useAndroidBack } from '../hooks/useAndroidBack';

// ─────────────────────────────────────────────────────────────────────────────
// Turn 19 — "Creating a pass": a 5-step season builder.
// The argument: nobody hand-places 18 nodes. Coaches think in weeks and
// repeat. So the flow asks for one week, expands it into the season, then
// lets you vary it. Every stat shown is computed from real data or omitted.
// ─────────────────────────────────────────────────────────────────────────────

type DayNode = { kind: 'workout' | 'diet' | 'checkin' | 'live' | 'rest'; id?: string; name?: string };
// A day holds a stack of nodes — a workout AND a meal plan on the same day is
// the normal case, not a conflict. 'rest' is exclusive: it marks the day as a
// deliberate rest day (distinct from simply unplanned) and produces no track node.
type SeasonWeek = { days: DayNode[][]; label: string; isRest?: boolean };

const WEEK_LENGTHS = [4, 6, 8, 12, 16];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const STEP_LABELS = ['Basics', 'Weekly rhythm', 'Season map', 'Price and start', 'Preview'];

// ── Cohort dates ─────────────────────────────────────────────────────────────
// A cohort starts on one fixed day for everyone (lib/cohort.ts). The default
// start sits far enough out that there is real time to sell it; the coach moves
// it freely from there.
const DEFAULT_COHORT_LEAD_DAYS = 14;

const atMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
/** `YYYY-MM-DD` in LOCAL time — the shape of a Postgres `date` column. */
const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PROMISE_MAX = 90;
// Must match earnings.tsx: const PLATFORM_FEE = 0.10;
const PLATFORM_FEE = 0.10;

const NUM_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];

const TOOL_META: Record<DayNode['kind'], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  workout: { label: 'Workout', icon: 'barbell-outline' },
  diet: { label: 'Meal plan', icon: 'nutrition-outline' },
  checkin: { label: 'Check-in', icon: 'chatbubble-ellipses-outline' },
  live: { label: 'Live session', icon: 'videocam-outline' },
  rest: { label: 'Rest', icon: 'moon-outline' },
};

const dotColor = (kind: DayNode['kind']) => {
  if (kind === 'workout') return CoachColors.accent;
  if (kind === 'diet') return CoachColors.textSecondary;
  if (kind === 'rest') return CoachColors.borderMuted;
  return CoachColors.textFaint; // check-in / live session
};

const emptyDays = (): DayNode[][] => Array.from({ length: 7 }, () => []);

const isRestDay = (day: DayNode[]) => day.some(n => n.kind === 'rest');
// Nodes that become real track content — rest markers don't.
const deliverable = (day: DayNode[]) => day.filter(n => n.kind !== 'rest');

export default function CreatePassScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { createPlan, updatePlan, updatePlanTrack, workouts, diets, plans, trainer, activeClients } = useApp();
  const { showAlert } = useAlert();

  // ── Edit mode (plan-detail pushes /create-plan?editId=<plan.id>) ──────────
  // The plan is the coach's own, already in context — no fetch. If editId
  // points at nothing (stale link, plan deleted) we fall back to create mode
  // rather than render a half-prefilled form.
  const params = useLocalSearchParams<{ editId?: string }>();
  const editId = typeof params.editId === 'string' ? params.editId : undefined;
  const editingPlan = useMemo(
    () => (editId ? plans.find(p => p.id === editId) ?? null : null),
    [editId, plans]
  );
  const isEdit = !!editingPlan;

  // ── Flow state ──
  const [step, setStep] = useState(1);
  // Pass cover (Phase 2, COACH_IDENTITY_PLAN.md). Uploaded on pick so the
  // coach sees the real, already-hosted image before publishing — never a
  // local preview that could silently fail to upload at save time.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showAlert({ type: 'warning', title: 'Permission needed', message: 'Photo library access is needed to add a cover.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [16, 10], quality: 0.75, base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const b64 = asset.base64;
    if (!b64) return;
    setCoverUploading(true);
    const ext = (asset.uri.split('.').pop() || 'jpg').toLowerCase();
    // coach-media requires the first path segment to be the uploader's uid.
    // Timestamped name: each pass gets its own object, so re-covering one
    // pass never rewrites another's image.
    const fileName = `${user!.id}/pass-${Date.now()}.${ext}`;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const { error } = await supabase.storage.from('coach-media').upload(fileName, bytes.buffer, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: true,
    });
    setCoverUploading(false);
    if (error) {
      showAlert({ type: 'error', title: 'Upload failed', message: error.message || 'Could not upload the cover.' });
      return;
    }
    const { data } = supabase.storage.from('coach-media').getPublicUrl(fileName);
    setCoverUrl(data.publicUrl);
  };
  const [saving, setSaving] = useState(false);

  // ── Step 1 — Basics ──
  const [name, setName] = useState('');
  const [promise, setPromise] = useState('');
  const [weeks, setWeeks] = useState(8);
  const [startWeekOne, setStartWeekOne] = useState(true);

  // ── Step 2 — Weekly rhythm ──
  const [weekTemplate, setWeekTemplate] = useState<DayNode[][]>(emptyDays());
  const [selectedTool, setSelectedTool] = useState<DayNode['kind'] | null>('workout');

  // ── Step 3 — Season map ──
  const [seasonWeeks, setSeasonWeeks] = useState<SeasonWeek[]>([]);
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [progressiveNote, setProgressiveNote] = useState(false);
  const [finalMilestones, setFinalMilestones] = useState<string[]>([]);
  const [milestoneInput, setMilestoneInput] = useState('');
  const [showMilestoneInput, setShowMilestoneInput] = useState(false);

  // ── Step 4 — Price + product type ──
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const [priceText, setPriceText] = useState('');

  // Evergreen (athlete-paced, the default and the old behaviour) vs cohort
  // (one fixed start day for everyone).
  const [productType, setProductType] = useState<'evergreen' | 'cohort'>('evergreen');
  const [startsOn, setStartsOn] = useState<Date>(() => addDays(atMidnight(new Date()), DEFAULT_COHORT_LEAD_DAYS));
  const [enrollmentCloses, setEnrollmentCloses] = useState<Date>(() => addDays(atMidnight(new Date()), DEFAULT_COHORT_LEAD_DAYS - 1));
  // Once the coach sets a deadline by hand it stops trailing the start date.
  const [deadlineEdited, setDeadlineEdited] = useState(false);
  const [capacityText, setCapacityText] = useState('');
  const [datePicker, setDatePicker] = useState<'start' | 'deadline' | null>(null);

  // ── Step 5 — Preview + publish ──
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  // Set after a successful publish — drives the celebration overlay.
  const [published, setPublished] = useState<{ offersSent: number } | null>(null);

  // Content picker (used by step 2 template and step 3 week editor)
  const [picker, setPicker] = useState<{ dayIndex: number; weekIndex: number | null; kind: 'workout' | 'diet' } | null>(null);

  // ── Edit mode: prefill once from the existing plan ────────────────────────
  // A ref, not mount-only: plans can still be loading on first render, so the
  // prefill runs the first time the plan is actually available — and never
  // again, so a re-render after save can't clobber in-progress typing.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!editingPlan || prefilledRef.current) return;
    prefilledRef.current = true;
    setName(editingPlan.name);
    setPromise(editingPlan.description || '');
    if (editingPlan.duration_weeks) setWeeks(editingPlan.duration_weeks);
    setPriceText(String(editingPlan.price));
    setPeriod(editingPlan.period === 'year' ? 'year' : 'month');
    const ss = editingPlan.season_settings;
    if (ss && typeof ss.start_at_week_one === 'boolean') setStartWeekOne(ss.start_at_week_one);
    if (ss && typeof ss.progressive_note === 'boolean') setProgressiveNote(ss.progressive_note);
    // cover_url exists in the DB (coach_identity_media.sql) but not on the
    // Plan interface yet — same access shape plan-detail.tsx already uses.
    setCoverUrl((editingPlan as any).cover_url ?? null);
    const start = parseLocalDay(editingPlan.starts_on);
    if (start) {
      setProductType('cohort');
      setStartsOn(start);
      const closes = parseLocalDay(editingPlan.enrollment_closes);
      if (closes) { setEnrollmentCloses(closes); setDeadlineEdited(true); }
      else setEnrollmentCloses(addDays(start, -1));
      setCapacityText(editingPlan.capacity && editingPlan.capacity > 0 ? String(editingPlan.capacity) : '');
    }
  }, [editingPlan]);

  // ── Edit mode skips the track steps ───────────────────────────────────────
  // The pass-track-editor owns track editing (with its blast-radius flow), so
  // an edit here never rebuilds or resaves the track. Rather than show steps
  // 2–3 read-only — dead UI that implies editability — the wizard simply walks
  // 1 → 4 → 5. This is the smallest change: every step keeps its number, only
  // the walk order differs.
  const stepSequence = useMemo(() => (isEdit ? [1, 4, 5] : [1, 2, 3, 4, 5]), [isEdit]);
  const goNextStep = () => {
    const i = stepSequence.indexOf(step);
    if (i >= 0 && i < stepSequence.length - 1) { setEditingWeek(null); setStep(stepSequence[i + 1]); }
  };

  // ── Real enrollment stats for the coach's existing passes ──
  const [planStats, setPlanStats] = useState<Record<string, { holders: number; completed: number }>>({});
  useEffect(() => {
    if (plans.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('client_plan_enrollments')
        .select('plan_id, status')
        .in('plan_id', plans.map(p => p.id));
      if (cancelled || error || !data) return;
      const stats: Record<string, { holders: number; completed: number }> = {};
      data.forEach((row: any) => {
        const g = stats[row.plan_id] || (stats[row.plan_id] = { holders: 0, completed: 0 });
        g.holders += 1;
        if (row.status === 'completed') g.completed += 1;
      });
      if (!cancelled) setPlanStats(stats);
    })();
    return () => { cancelled = true; };
  }, [plans]);

  const price = Number(priceText) || 0;

  // ── Cohort dates, validation and preview ────────────────────────────────
  const isCohort = productType === 'cohort';
  const capacity = (() => {
    const n = parseInt(capacityText.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0; // 0 ⇒ unlimited
  })();

  const setStartDate = (next: Date) => {
    const day = atMidnight(next);
    setStartsOn(day);
    // The deadline defaults to the day before the start, and keeps tracking it
    // until the coach moves it themselves.
    if (!deadlineEdited) setEnrollmentCloses(addDays(day, -1));
  };

  const cohortErrors = useMemo(() => {
    if (!isCohort) return { start: null as string | null, deadline: null as string | null, any: false };
    const today = atMidnight(new Date()).getTime();
    const start = atMidnight(startsOn).getTime();
    const deadline = atMidnight(enrollmentCloses).getTime();
    // Editing a cohort that already started must not dead-end the whole save:
    // an unchanged stored start date is allowed through; MOVING it into the
    // past is still an error.
    const startUnchanged = isEdit
      && !!editingPlan?.starts_on
      && toISODate(startsOn) === String(editingPlan.starts_on).slice(0, 10);
    const startErr = start <= today && !startUnchanged
      ? 'A cohort has to start in the future — everyone begins on this day.'
      : null;
    const deadlineUnchanged = isEdit
      && !!editingPlan?.enrollment_closes
      && toISODate(enrollmentCloses) === String(editingPlan.enrollment_closes).slice(0, 10);
    let deadlineErr: string | null = null;
    if (deadline > start) deadlineErr = 'Enrollment has to close on or before the start date.';
    else if (deadline < today && !deadlineUnchanged) deadlineErr = 'That deadline has already passed — nobody could join.';
    return { start: startErr, deadline: deadlineErr, any: !!(startErr || deadlineErr) };
  }, [isCohort, startsOn, enrollmentCloses, isEdit, editingPlan]);

  // "Sep 8 – Sep 29 · Closes Aug 31 · 12 spots" — every part from real input.
  const cohortSummary = useMemo(() => {
    if (!isCohort || cohortErrors.any) return null;
    const shape = {
      starts_on: toISODate(startsOn),
      enrollment_closes: toISODate(enrollmentCloses),
      capacity: capacity || null,
      duration_weeks: weeks,
    };
    return [
      formatRun(shape),
      formatDeadline(shape),
      capacity > 0 ? `${capacity} spot${capacity === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' · ');
  }, [isCohort, cohortErrors.any, startsOn, enrollmentCloses, capacity, weeks]);

  // ── Market prices — real, platform-wide. The plans table is readable by
  // every authenticated user by design (the marketplace policy in
  // supabase/migrations/20260723070000_plans_client_read_policy.sql), so this
  // comparison is grounded in what other coaches actually charge, not a guess.
  const [marketPrices, setMarketPrices] = useState<{ month: number[]; year: number[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('price, period, trainer_id')
        .gt('price', 0);
      if (cancelled || error || !data) return;
      const others = data.filter((p: any) => p.trainer_id !== user?.id);
      setMarketPrices({
        month: others.filter((p: any) => p.period !== 'year').map((p: any) => Number(p.price)).sort((a: number, b: number) => a - b),
        year: others.filter((p: any) => p.period === 'year').map((p: any) => Number(p.price)).sort((a: number, b: number) => a - b),
      });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const bumpPrice = (delta: number) => {
    setPriceText(String(Math.max(0, (Number(priceText) || 0) + delta)));
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Derived data — all from real sources, or absent
  // ─────────────────────────────────────────────────────────────────────────

  // Reference pass = the coach's most-held existing pass (if any).
  const referencePass = useMemo(() => {
    if (plans.length === 0) return null;
    let best = plans[0];
    let bestHolders = planStats[best.id]?.holders ?? 0;
    plans.forEach(p => {
      const h = planStats[p.id]?.holders ?? 0;
      if (h > bestHolders) { best = p; bestHolders = h; }
    });
    return { plan: best, holders: bestHolders };
  }, [plans, planStats]);

  // Step 1 context line: only parts we can actually compute.
  const seasonContextLine = useMemo(() => {
    if (!referencePass) return null;
    const { plan } = referencePass;
    const stats = planStats[plan.id];
    const parts: string[] = [];
    if (plan.duration_weeks) parts.push(`Your ${plan.name} pass runs ${plan.duration_weeks} weeks.`);
    if (stats && stats.holders > 0) {
      const pct = Math.round((stats.completed / stats.holders) * 100);
      parts.push(`${pct}% of the athletes who took ${plan.name} finished it.`);
    }
    return parts.length > 0 ? parts.join(' ') : null;
  }, [referencePass, planStats]);

  const templateNodes = weekTemplate.flatMap(deliverable);
  const templateCounts = useMemo(() => {
    const c = { workout: 0, diet: 0, checkin: 0, live: 0 };
    templateNodes.forEach(n => { if (n.kind !== 'rest') c[n.kind] += 1; });
    return c;
  }, [weekTemplate]);
  const templateTrainingDays = weekTemplate.filter(d => d.some(n => n.kind === 'workout')).length;

  // Full track generation from the season map.
  const buildTrack = useCallback((): TrackNode[] => {
    const nodes: Omit<TrackNode, 'order'>[] = [];
    seasonWeeks.forEach((wk, i) => {
      const label = wk.label.trim();
      if (label) nodes.push({ type: 'milestone', label: `Week ${i + 1}: ${label}` });
      else if (wk.isRest) nodes.push({ type: 'milestone', label: `Week ${i + 1}: Rest week` });
      wk.days.forEach(day => {
        day.forEach(d => {
          if (d.kind === 'workout' && d.id) nodes.push({ type: 'workout', id: d.id });
          else if (d.kind === 'diet' && d.id) nodes.push({ type: 'diet', id: d.id });
          else if (d.kind === 'checkin') nodes.push({ type: 'milestone', label: 'Check-in' });
          else if (d.kind === 'live') nodes.push({ type: 'milestone', label: 'Live session' });
          // 'rest' is a rhythm marker, not deliverable content — no node.
        });
      });
    });
    finalMilestones.forEach(m => nodes.push({ type: 'milestone', label: m }));
    return nodes.map((n, i) => ({ ...n, order: i }));
  }, [seasonWeeks, finalMilestones]);

  const trackCounts = useMemo(() => {
    // Edit mode never rebuilds the track — the preview counts what the pass
    // already contains.
    const track: TrackNode[] = editingPlan ? (editingPlan.track ?? []) : buildTrack();
    let w = 0, m = 0, c = 0, ms = 0;
    track.forEach(n => {
      if (n.type === 'workout') w += 1;
      else if (n.type === 'diet') m += 1;
      else if (n.type === 'milestone' && n.label === 'Check-in') c += 1;
      else ms += 1;
    });
    return { workouts: w, meals: m, checkins: c, milestones: ms, total: track.length };
  }, [buildTrack, editingPlan]);

  // ─────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────

  const goBack = () => {
    const i = stepSequence.indexOf(step);
    if (i <= 0) { router.back(); return; }
    setEditingWeek(null);
    setStep(stepSequence[i - 1]);
  };

  // Android hardware back walks the wizard back a step instead of popping the
  // whole screen and discarding every step the coach has filled in.
  useAndroidBack(useCallback(() => {
    const i = stepSequence.indexOf(step);
    if (i <= 0) return false;
    setEditingWeek(null);
    setStep(stepSequence[i - 1]);
    return true;
  }, [step, stepSequence]));

  const expandToSeason = () => {
    // week template × N — everything below is the coach's to edit.
    setSeasonWeeks(Array.from({ length: weeks }, () => ({
      days: weekTemplate.map(d => [...d]),
      label: '',
    })));
    setEditingWeek(null);
    setStep(3);
  };

  const updateDay = (weekIndex: number | null, dayIndex: number, update: (day: DayNode[]) => DayNode[]) => {
    if (weekIndex === null) {
      setWeekTemplate(prev => prev.map((d, i) => (i === dayIndex ? update(d) : d)));
    } else {
      setSeasonWeeks(prev => prev.map((wk, i) =>
        i === weekIndex ? { ...wk, days: wk.days.map((d, j) => (j === dayIndex ? update(d) : d)), isRest: false } : wk
      ));
    }
  };

  // One node of each kind per day, stacked — a workout and a meal plan
  // coexist. Tapping with a kind the day already has removes just that kind.
  // Rest is exclusive: it clears the day, and adding anything clears rest.
  const handleDayTap = (weekIndex: number | null, dayIndex: number, day: DayNode[]) => {
    if (!selectedTool) return;
    if (selectedTool === 'rest') {
      updateDay(weekIndex, dayIndex, d => (isRestDay(d) ? [] : [{ kind: 'rest' }]));
      return;
    }
    if (day.some(n => n.kind === selectedTool)) {
      updateDay(weekIndex, dayIndex, d => d.filter(n => n.kind !== selectedTool));
      return;
    }
    if (selectedTool === 'workout' || selectedTool === 'diet') {
      setPicker({ dayIndex, weekIndex, kind: selectedTool });
    } else {
      updateDay(weekIndex, dayIndex, d => [...d.filter(n => n.kind !== 'rest'), { kind: selectedTool }]);
    }
  };

  const handlePickContent = (id: string, itemName: string) => {
    if (!picker) return;
    const { weekIndex, dayIndex, kind } = picker;
    updateDay(weekIndex, dayIndex, d => [
      ...d.filter(n => n.kind !== 'rest' && n.kind !== kind),
      { kind, id, name: itemName },
    ]);
    setPicker(null);
  };

  // "No X yet" is a dead end — let the coach create one right here.
  // RN Modals are presented natively ABOVE the whole app, so the sheet must
  // be fully dismissed before we push a route — navigating with it open
  // leaves the modal covering the new screen and wedges touch handling on
  // the way back. We stash the day target, close the sheet, navigate after
  // the dismissal settles, and re-open the sheet when focus returns — the
  // new item is in the list because the library refreshes through AppContext.
  const pendingPickerRef = useRef<{ dayIndex: number; weekIndex: number | null; kind: 'workout' | 'diet' } | null>(null);

  const handleCreateFromPicker = () => {
    if (!picker) return;
    const route = picker.kind === 'diet' ? '/create-diet' : '/create-workout';
    pendingPickerRef.current = picker;
    setPicker(null);
    setTimeout(() => router.push(route as any), 350);
  };

  useFocusEffect(
    useCallback(() => {
      if (!pendingPickerRef.current) return;
      const pending = pendingPickerRef.current;
      pendingPickerRef.current = null;
      // Let the back transition finish before re-presenting a native modal.
      const t = setTimeout(() => setPicker(pending), 300);
      return () => clearTimeout(t);
    }, [])
  );

  const addRestWeek = () => {
    setSeasonWeeks(prev => [...prev, { days: emptyDays(), label: '', isRest: true }]);
  };

  const addFinalMilestone = () => {
    const label = milestoneInput.trim();
    if (!label) return;
    setFinalMilestones(prev => [...prev, label]);
    setMilestoneInput('');
    setShowMilestoneInput(false);
  };

  const toggleClient = (id: string) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Publish sends a real chat message from the coach — not a system
  // notification — into each selected client's conversation.
  /** Returns how many offers actually reached a conversation. */
  const sendOffers = async (planName: string): Promise<number> => {
    const content = `I just opened a new season: ${planName}${promise.trim() ? ` — ${promise.trim()}` : ''}`;
    const { data: convs } = await supabase.from('conversations').select('id, client_id');
    let sent = 0;
    for (const clientId of selectedClientIds) {
      let convId = (convs || []).find((c: any) => c.client_id === clientId)?.id;
      if (!convId) {
        const { data: created, error } = await supabase
          .from('conversations')
          .insert({ trainer_id: user!.id, client_id: clientId })
          .select()
          .single();
        // Non-fatal — the pass is still created; a single failed offer
        // shouldn't sink the publish. But it must not be counted as sent.
        if (error || !created) continue;
        convId = created.id;
      }
      // Resolves with { error }; it does not throw.
      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: convId,
        sender_type: 'trainer',
        content,
      });
      if (msgErr) {
        console.error('[CreatePlan] offer message failed:', clientId, msgErr);
        continue;
      }
      const { error: previewErr } = await supabase.from('conversations').update({
        last_message: content,
        last_message_at: new Date().toISOString(),
      }).eq('id', convId);
      if (__DEV__ && previewErr) console.warn('[CreatePlan] conversation preview update failed:', previewErr);
      sent += 1;
    }
    return sent;
  };

  const handleSave = async (publish: boolean) => {
    if (!name.trim()) { showAlert({ type: 'warning', title: 'Missing name', message: 'Give the season a name first.' }); return; }
    if (!price || price <= 0) { showAlert({ type: 'warning', title: 'Missing price', message: 'Set a price before saving.' }); return; }
    if (isCohort && cohortErrors.any) {
      showAlert({
        type: 'warning',
        title: 'Check the cohort dates',
        message: cohortErrors.start || cohortErrors.deadline || 'Fix the dates before saving.',
      });
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editingPlan) {
        // An edit updates the plans row only. The track stays untouched (the
        // pass-track-editor owns it, blast-radius flow included), no offers
        // go out and no celebration shows — an edit is not a launch.
        await updatePlan(editingPlan.id, {
          name: name.trim(),
          price,
          period,
          description: promise.trim() || null,
          cover_url: coverUrl,
          duration_weeks: weeks,
          season_settings: { start_at_week_one: startWeekOne, progressive_note: progressiveNote },
          // Always send the cohort trio so switching cohort ⇄ evergreen
          // persists; updatePlan sheds them on 42703 like createPlan does.
          starts_on: isCohort ? toISODate(startsOn) : null,
          enrollment_closes: isCohort ? toISODate(enrollmentCloses) : null,
          capacity: isCohort && capacity > 0 ? capacity : null,
        });
        router.back();
        return;
      }
      const plan = await createPlan(
        name.trim(), price, period,
        [],            // features replaced by the promise line
        undefined,     // legacy color — default, no UI
        false,         // legacy popular badge — removed
        {
          description: promise.trim() || undefined,
          cover_url: coverUrl,
          duration_weeks: weeks,
          season_settings: { start_at_week_one: startWeekOne, progressive_note: progressiveNote },
          // Cohort columns. createPlan sheds these first on a 42703 (the
          // add_cohort_programs migration hasn't run) and saves the pass
          // anyway — it just stays evergreen until the columns exist.
          ...(isCohort ? {
            starts_on: toISODate(startsOn),
            enrollment_closes: toISODate(enrollmentCloses),
            capacity: capacity > 0 ? capacity : null,
          } : {}),
        }
      );
      const track = buildTrack();
      if (track.length > 0) await updatePlanTrack(plan.id, track);
      // The celebration must report offers that actually landed, not offers we
      // attempted — sendOffers now returns the real count.
      let offersSent = 0;
      if (publish && selectedClientIds.size > 0) offersSent = await sendOffers(name.trim());
      if (publish) {
        if (selectedClientIds.size > 0 && offersSent < selectedClientIds.size) {
          showAlert({
            type: 'warning',
            title: 'Pass published, some offers did not send',
            message: `${offersSent} of ${selectedClientIds.size} athletes got the offer message. You can message the rest from their chat.`,
          });
        }
        // The moment deserves more than a silent pop — celebrate, then leave.
        setPublished({ offersSent });
      } else {
        router.back();
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Could not save', message: err.message || (isEdit ? 'Failed to save the changes' : 'Failed to create the pass') });
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Shared pieces
  // ─────────────────────────────────────────────────────────────────────────

  const renderDayStrip = (days: DayNode[][], weekIndex: number | null) => (
    <View style={s.dayStrip}>
      {days.map((day, i) => {
        const rest = isRestDay(day);
        const hasWorkout = day.some(n => n.kind === 'workout');
        return (
          <TouchableOpacity
            key={i}
            style={[
              s.dayCell,
              day.length > 0 && s.dayCellFilled,
              hasWorkout && s.dayCellWorkout,
              rest && s.dayCellRest,
            ]}
            onPress={() => handleDayTap(weekIndex, i, day)}
            activeOpacity={0.7}
          >
            <Text style={s.dayLetter}>{DAY_LETTERS[i]}</Text>
            {rest ? (
              <>
                <Ionicons name="moon-outline" size={16} color={CoachColors.textFaint} />
                <Text style={[s.dayLabel, { color: CoachColors.textFaint }]}>Rest</Text>
              </>
            ) : day.length === 1 ? (
              <>
                <Ionicons name={TOOL_META[day[0].kind].icon} size={16} color={day[0].kind === 'workout' ? CoachColors.accent : CoachColors.textSecondary} />
                <Text style={s.dayLabel} numberOfLines={2}>
                  {day[0].name || TOOL_META[day[0].kind].label}
                </Text>
              </>
            ) : day.length > 1 ? (
              <View style={s.dayIconStack}>
                {day.map((n, j) => (
                  <Ionicons
                    key={j}
                    name={TOOL_META[n.kind].icon}
                    size={12}
                    color={n.kind === 'workout' ? CoachColors.accent : CoachColors.textSecondary}
                  />
                ))}
              </View>
            ) : (
              <Ionicons name="add" size={18} color={CoachColors.textFaint} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderPalette = () => (
    <View style={s.paletteSection}>
      <Text style={s.eyebrow}>Add to a day</Text>
      <Text style={s.paletteHint}>
        Pick a type, then tap days. A day can hold a workout and a meal plan together — tap again with the same type to remove just that one.
      </Text>
      <View style={s.paletteRow}>
        {(Object.keys(TOOL_META) as DayNode['kind'][]).map(kind => {
          const active = selectedTool === kind;
          return (
            <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
              key={kind}
              style={[s.paletteChip, active && s.paletteChipActive]}
              onPress={() => setSelectedTool(active ? null : kind)}
              activeOpacity={0.7}
            >
              <Ionicons name={TOOL_META[kind].icon} size={17} color={active ? CoachColors.onAccent : CoachColors.textSecondary} />
              <Text style={[s.paletteChipText, active && s.paletteChipTextActive]}>{TOOL_META[kind].label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Steps
  // ─────────────────────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <>
      <Text style={s.title}>Name the season</Text>

      <Text style={s.eyebrow}>Pass name</Text>
      <TextInput
        style={s.nameInput}
        placeholder="e.g. Spring strength block"
        placeholderTextColor={CoachColors.textFaint}
        value={name}
        onChangeText={setName}
        autoCapitalize="sentences"
        selectionColor={CoachColors.accent}
      />

      <View style={s.promiseHeader}>
        <Text style={s.eyebrow}>The promise · one line</Text>
        <Text style={s.charCounter}>{promise.length} / {PROMISE_MAX}</Text>
      </View>
      <TextInput
        style={s.promiseInput}
        placeholder="What an athlete walks away with"
        placeholderTextColor={CoachColors.textFaint}
        value={promise}
        onChangeText={setPromise}
        maxLength={PROMISE_MAX}
        multiline
        selectionColor={CoachColors.accent}
      />

      {/* The pass card photo — the Ladder team-card ground. Optional: the
          athlete-side falls back to the coach's own cover, then to text. */}
      <Text style={s.eyebrow}>Cover photo · optional</Text>
      <TouchableOpacity
        style={s.coverPick}
        onPress={pickCover}
        activeOpacity={0.85}
        disabled={coverUploading}
        accessibilityRole="button"
        accessibilityLabel={coverUrl ? 'Change the pass cover photo' : 'Add a pass cover photo'}
        accessibilityState={{ busy: coverUploading }}
      >
        {coverUrl ? (
          <>
            <Image source={{ uri: coverUrl }} style={s.coverPickImg} resizeMode="cover" />
            <View style={s.coverPickBadge}>
              <Ionicons name="camera" size={14} color={CoachColors.onAccent} />
            </View>
          </>
        ) : (
          <View style={s.coverPickEmpty}>
            {coverUploading ? (
              <ActivityIndicator size="small" color={CoachColors.textMuted} />
            ) : (
              <>
                <Ionicons name="image-outline" size={19} color={CoachColors.textMuted} />
                <Text style={s.coverPickText}>Add a photo — it becomes the pass card</Text>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.eyebrow}>How long is the season</Text>
        <Text style={s.weeksBig}>{weeks} weeks</Text>
        <View style={s.weeksRow}>
          {WEEK_LENGTHS.map(w => (
            <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
              key={w}
              style={[s.weekChip, weeks === w && s.weekChipActive]}
              onPress={() => setWeeks(w)}
              activeOpacity={0.7}
            >
              <Text style={[s.weekChipText, weeks === w && s.weekChipTextActive]}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {seasonContextLine && <Text style={s.contextLine}>{seasonContextLine}</Text>}
      </View>

      <TouchableOpacity style={s.toggleRow} onPress={() => setStartWeekOne(!startWeekOne)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={s.toggleTitle}>Start everyone on week 1</Text>
          <Text style={s.toggleSub}>Off means they join the season already in progress</Text>
        </View>
        <View style={[s.switch, startWeekOne && s.switchOn]}>
          <View style={[s.switchKnob, startWeekOne && s.switchKnobOn]} />
        </View>
      </TouchableOpacity>
    </>
  );

  const renderStep2 = () => {
    const trainingDays = templateTrainingDays;
    return (
      <>
        <Text style={s.title}>What does a normal week look like?</Text>
        <Text style={s.subtitle}>Fill one week. We repeat it across all {weeks} and you edit from there.</Text>

        {renderDayStrip(weekTemplate, null)}
        {renderPalette()}

        {templateNodes.length > 0 && (
          <View style={s.card}>
            <Text style={s.eyebrow}>This week × {weeks}</Text>
            <Text style={s.summaryBig}>{templateNodes.length * weeks} nodes</Text>
            <Text style={s.summaryBreakdown}>
              {[
                templateCounts.workout > 0 ? `${templateCounts.workout * weeks} workouts` : null,
                templateCounts.diet > 0 ? `${templateCounts.diet * weeks} meal plans` : null,
                templateCounts.checkin > 0 ? `${templateCounts.checkin * weeks} check-ins` : null,
                templateCounts.live > 0 ? `${templateCounts.live * weeks} live sessions` : null,
              ].filter(Boolean).join(' · ')}
            </Text>
            {trainingDays > 0 && trainingDays < NUM_WORDS.length && (
              <Text style={s.contextLine}>{NUM_WORDS[trainingDays]} training day{trainingDays === 1 ? '' : 's'} a week.</Text>
            )}
          </View>
        )}
      </>
    );
  };

  const renderStep3 = () => (
    <>
      <Text style={s.title}>{seasonWeeks.length} weeks, laid out</Text>
      <Text style={s.subtitle}>Tap a week to change it. Everything below is yours to edit before anyone sees it.</Text>

      {seasonWeeks.map((wk, i) => {
        const isEditing = editingWeek === i;
        const nodes = wk.days.flat();
        return (
          <View key={i} style={[s.weekRow, isEditing && s.weekRowEditing]}>
            <TouchableOpacity style={s.weekRowHeader} onPress={() => setEditingWeek(isEditing ? null : i)} activeOpacity={0.7}>
              <Text style={s.weekRowNum}>W{i + 1}</Text>
              <View style={s.weekDots}>
                {nodes.length === 0 ? (
                  <Text style={s.weekRestText}>{wk.isRest ? 'Rest week' : 'Empty'}</Text>
                ) : (
                  nodes.map((n, j) => <View key={j} style={[s.dot, { backgroundColor: dotColor(n.kind) }]} />)
                )}
              </View>
              <Text style={s.weekRowLabel} numberOfLines={1}>{wk.label || ''}</Text>
              <Ionicons name={isEditing ? 'chevron-up' : 'chevron-down'} size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>

            {isEditing && (
              <View style={s.weekEditor}>
                {renderDayStrip(wk.days, i)}
                {renderPalette()}
                <Text style={[s.eyebrow, { marginTop: 12 }]}>Week label · optional</Text>
                <TextInput
                  style={s.weekLabelInput}
                  placeholder='e.g. "Baseline", "Deload"'
                  placeholderTextColor={CoachColors.textFaint}
                  value={wk.label}
                  onChangeText={t => setSeasonWeeks(prev => prev.map((w2, j) => (j === i ? { ...w2, label: t } : w2)))}
                  selectionColor={CoachColors.accent}
                />
                <Text style={s.helperText}>A label becomes a milestone athletes see at the start of that week.</Text>
              </View>
            )}
          </View>
        );
      })}

      <View style={s.outlineBtnRow}>
        <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} style={s.outlineBtn} onPress={addRestWeek} activeOpacity={0.7}>
          <Text style={s.outlineBtnText}>+ Rest week</Text>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} style={s.outlineBtn} onPress={() => setShowMilestoneInput(true)} activeOpacity={0.7}>
          <Text style={s.outlineBtnText}>+ Milestone</Text>
        </TouchableOpacity>
      </View>

      {showMilestoneInput && (
        <View style={s.milestoneInputRow}>
          <Ionicons name="trophy-outline" size={18} color={CoachColors.accent} />
          <TextInput
            style={s.milestoneTextInput}
            placeholder="e.g. Season complete"
            placeholderTextColor={CoachColors.textFaint}
            value={milestoneInput}
            onChangeText={setMilestoneInput}
            onSubmitEditing={addFinalMilestone}
            autoFocus
            selectionColor={CoachColors.accent}
          />
          <TouchableOpacity hitSlop={8} onPress={addFinalMilestone} style={s.milestoneAddBtn}>
            <Ionicons name="add" size={18} color={CoachColors.onAccent} />
          </TouchableOpacity>
        </View>
      )}
      {finalMilestones.length > 0 && (
        <View style={s.milestoneChips}>
          {finalMilestones.map((m, i) => (
            <View key={i} style={s.milestoneChip}>
              <Ionicons name="trophy-outline" size={13} color={CoachColors.accent} />
              <Text style={s.milestoneChipText}>{m}</Text>
              <TouchableOpacity onPress={() => setFinalMilestones(prev => prev.filter((_, j) => j !== i))} hitSlop={8}>
                <Ionicons name="close" size={15} color={CoachColors.textFaint} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={s.toggleRow} onPress={() => setProgressiveNote(!progressiveNote)} activeOpacity={0.7}>
        <View style={{ flex: 1 }}>
          <Text style={s.toggleTitle}>Get harder each week</Text>
          <Text style={s.toggleSub}>Athletes are told to add weight each week. A note, not automation.</Text>
        </View>
        <View style={[s.switch, progressiveNote && s.switchOn]}>
          <View style={[s.switchKnob, progressiveNote && s.switchKnobOn]} />
        </View>
      </TouchableOpacity>

      <View style={s.legendRow}>
        <View style={[s.dot, { backgroundColor: CoachColors.accent }]} />
        <Text style={s.legendText}>Workout</Text>
        <View style={[s.dot, { backgroundColor: CoachColors.textSecondary, marginLeft: 12 }]} />
        <Text style={s.legendText}>Meal plan</Text>
        <View style={[s.dot, { backgroundColor: CoachColors.textFaint, marginLeft: 12 }]} />
        <Text style={s.legendText}>Check-in / live</Text>
        <View style={[s.dot, { backgroundColor: CoachColors.borderMuted, marginLeft: 12 }]} />
        <Text style={s.legendText}>Rest</Text>
      </View>
    </>
  );

  const renderStep4 = () => {
    const weeklyApprox = price > 0 ? (period === 'month' ? (price * 12) / 52 : price / 52) : 0;

    // Market meter — percentile of this price among other coaches' passes on
    // the same billing period. Only rendered with 3+ real comparison points;
    // the bands describe positioning, and sale-speed phrasing stays framed as
    // a tendency, never a fake probability.
    const marketPool = marketPrices ? marketPrices[period] : [];
    const marketMeter = (() => {
      if (price <= 0 || marketPool.length < 3) return null;
      const below = marketPool.filter(p => p <= price).length;
      const pct = below / marketPool.length;
      let band: string;
      let note: string;
      let noteColor = CoachColors.textSecondary;
      if (pct <= 0.25) {
        band = 'Below most';
        note = 'An easy yes for athletes — you may be leaving money on the table.';
      } else if (pct <= 0.75) {
        band = 'In range';
        note = 'Priced with the market. Nothing about the number slows a sale.';
        noteColor = CoachColors.accent;
      } else if (pct <= 0.9) {
        band = 'Above most';
        note = 'Premium positioning — first sales tend to come slower up here.';
        noteColor = CoachColors.warning;
      } else {
        band = 'Well above market';
        note = 'Expect a harder sell unless the promise clearly carries it.';
        noteColor = CoachColors.warning;
      }
      return { pct, band, note, noteColor, count: marketPool.length };
    })();
    const sortedPrices = plans.map(p => p.price).filter(p => p > 0).sort((a, b) => a - b);
    const median = sortedPrices.length > 0 ? sortedPrices[Math.floor(sortedPrices.length / 2)] : 0;
    const quickPicks = median > 0
      ? [...new Set([Math.max(5, Math.round(median * 0.75)), median, Math.round(median * 1.5)])]
      : [60, 120, 180];
    const projection = referencePass && referencePass.holders > 0 && price > 0 ? referencePass : null;

    return (
      <>
        <Text style={s.title}>Price and start</Text>

        {/* ── Product type: evergreen vs cohort ── */}
        <Text style={s.eyebrow}>How athletes start</Text>
        {([
          {
            key: 'evergreen' as const,
            title: 'Evergreen — athletes start whenever they buy',
            sub: 'Week 1 begins the day they join. Everyone runs at their own pace.',
          },
          {
            key: 'cohort' as const,
            title: 'Cohort — everyone starts on the same day',
            sub: 'One fixed start date, a deadline to sign up, and an optional seat cap.',
          },
        ]).map(opt => {
          const active = productType === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[s.typeCard, active && s.typeCardActive]}
              onPress={() => setProductType(opt.key)}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.title}
              accessibilityHint={opt.sub}
            >
              <View style={[s.radio, active && s.radioOn]}>
                {active && <View style={s.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.typeTitle}>{opt.title}</Text>
                <Text style={s.typeSub}>{opt.sub}</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {isCohort && (
          <View style={s.cohortBox}>
            <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
              style={s.dateRow}
              onPress={() => setDatePicker('start')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Start date, ${startsOn.toDateString()}. Tap to change.`}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.dateLabel}>Starts on</Text>
                <Text style={s.dateValue}>{startsOn.toDateString()}</Text>
              </View>
              <Ionicons name="calendar-outline" size={19} color={CoachColors.textSecondary} />
            </TouchableOpacity>
            {cohortErrors.start && <Text style={s.errorText}>{cohortErrors.start}</Text>}

            <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
              style={s.dateRow}
              onPress={() => setDatePicker('deadline')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Enrollment closes, ${enrollmentCloses.toDateString()}. Tap to change.`}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.dateLabel}>Enrollment closes</Text>
                <Text style={s.dateValue}>{enrollmentCloses.toDateString()}</Text>
              </View>
              <Ionicons name="calendar-outline" size={19} color={CoachColors.textSecondary} />
            </TouchableOpacity>
            {cohortErrors.deadline
              ? <Text style={s.errorText}>{cohortErrors.deadline}</Text>
              : <Text style={s.helperText}>Defaults to the day before it starts. Move it earlier if you need time to prepare.</Text>}

            <Text style={[s.eyebrow, { marginTop: 16 }]}>Seats</Text>
            <TextInput
              style={s.capacityInput}
              placeholder="Leave empty for unlimited"
              placeholderTextColor={CoachColors.textFaint}
              value={capacityText}
              onChangeText={setCapacityText}
              keyboardType="number-pad"
              selectionColor={CoachColors.accent}
              accessibilityLabel="Seat cap. Leave empty for unlimited."
            />

            {cohortSummary && (
              <View style={s.cohortPreview}>
                <Ionicons name="calendar" size={16} color={CoachColors.accent} />
                <Text style={s.cohortPreviewText}>{cohortSummary}</Text>
              </View>
            )}
          </View>
        )}

        <Text style={[s.eyebrow, { marginTop: 22 }]}>Price</Text>
        <View style={s.segmented}>
          {(['month', 'year'] as const).map(p => (
            <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
              key={p}
              style={[s.segment, period === p && s.segmentActive]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.7}
            >
              <Text style={[s.segmentText, period === p && s.segmentTextActive]}>
                {p === 'month' ? 'Monthly' : 'Yearly'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Any price the coach wants — type it directly or nudge with the
            steppers. Nothing here clamps or restricts the number. */}
        <View style={s.priceDisplay}>
          <TouchableOpacity
            style={s.priceStepBtn}
            onPress={() => bumpPrice(-5)}
            disabled={price <= 0}
            activeOpacity={0.7}
            accessibilityLabel="Lower price by five dollars"
          >
            <Ionicons name="remove" size={22} color={price <= 0 ? CoachColors.textFaint : CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={s.priceCenter}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={s.priceDollar}>$</Text>
              <TextInput
                style={s.priceInput}
                placeholder="0"
                placeholderTextColor={CoachColors.textFaint}
                value={priceText}
                onChangeText={setPriceText}
                keyboardType="decimal-pad"
                selectionColor={CoachColors.accent}
              />
              <Text style={s.pricePeriod}>/{period === 'month' ? 'mo' : 'yr'}</Text>
            </View>
            <Text style={s.priceEditHint}>Tap the number to type any amount</Text>
          </View>
          <TouchableOpacity
            style={s.priceStepBtn}
            onPress={() => bumpPrice(5)}
            activeOpacity={0.7}
            accessibilityLabel="Raise price by five dollars"
          >
            <Ionicons name="add" size={22} color={CoachColors.textPrimary} />
          </TouchableOpacity>
        </View>
        {price > 0 && (
          <Text style={s.priceSubline}>
            About ${weeklyApprox.toFixed(0)} a week across the {weeks}-week season, billed {period === 'month' ? 'monthly' : 'yearly'}.
          </Text>
        )}

        <View style={s.quickPickRow}>
          {quickPicks.map(qp => (
            <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
              key={qp}
              style={[s.weekChip, price === qp && s.weekChipActive]}
              onPress={() => setPriceText(String(qp))}
              activeOpacity={0.7}
            >
              <Text style={[s.weekChipText, price === qp && s.weekChipTextActive]}>${qp}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {marketMeter && (
          <View style={s.card}>
            <View style={s.meterHeader}>
              <Text style={s.eyebrow}>Where this sits</Text>
              <Text style={s.meterBand}>{marketMeter.band}</Text>
            </View>
            <View style={s.meterTrack}>
              <View style={[s.meterZone, { flex: 25 }]} />
              <View style={[s.meterZone, s.meterZoneMid, { flex: 50 }]} />
              <View style={[s.meterZone, { flex: 25 }]} />
              <View style={[s.meterMarker, { left: `${Math.min(97, Math.max(1, marketMeter.pct * 100))}%` }]} />
            </View>
            <View style={s.meterLabels}>
              <Text style={s.meterLabelText}>Cheaper</Text>
              <Text style={s.meterLabelText}>Market range</Text>
              <Text style={s.meterLabelText}>Pricier</Text>
            </View>
            <Text style={[s.contextLine, { color: marketMeter.noteColor }]}>{marketMeter.note}</Text>
            <Text style={s.helperText}>
              Compared with {marketMeter.count} other {period === 'month' ? 'monthly' : 'yearly'} pass{marketMeter.count === 1 ? '' : 'es'} on FitLink. Your price is yours — this is context, not a rule.
            </Text>
          </View>
        )}

        {price > 0 && (
          <View style={s.card}>
            <Text style={s.eyebrow}>You keep</Text>
            <Text style={s.keepBig}>${(price * (1 - PLATFORM_FEE)).toFixed(2)}</Text>
            <Text style={s.keepSub}>per athlete, {period === 'month' ? 'a month' : 'a year'} · ${(price * PLATFORM_FEE).toFixed(2)} platform fee</Text>
            {projection && (
              <Text style={s.contextLine}>
                If {projection.holders} athlete{projection.holders === 1 ? '' : 's'} take it — as many as hold {projection.plan.name} today — that's ${(projection.holders * price * (1 - PLATFORM_FEE)).toFixed(0)} {period === 'month' ? 'a month' : 'a year'}.
              </Text>
            )}
          </View>
        )}

        {plans.length > 0 && (
          <View style={s.card}>
            <Text style={s.eyebrow}>Against your other passes</Text>
            {plans.map(p => {
              const stats = planStats[p.id];
              const nodeCount = p.track?.length ?? 0;
              const meta = [
                p.duration_weeks ? `${p.duration_weeks} weeks` : (nodeCount > 0 ? `${nodeCount} node${nodeCount === 1 ? '' : 's'}` : null),
                stats ? `${stats.holders} holder${stats.holders === 1 ? '' : 's'}` : null,
              ].filter(Boolean).join(' · ');
              return (
                <View key={p.id} style={s.compareRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.compareName} numberOfLines={1}>{p.name}</Text>
                    {meta ? <Text style={s.compareMeta}>{meta}</Text> : null}
                  </View>
                  <Text style={s.comparePrice}>${p.price}/{p.period === 'year' ? 'yr' : 'mo'}</Text>
                </View>
              );
            })}
          </View>
        )}
      </>
    );
  };

  const renderStep5 = () => {
    const firstClient = activeClients[0];
    const initials = (trainer?.name || 'C').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const coachSub = [
      trainer?.specialization,
      activeClients.length > 0 ? `${activeClients.length} athlete${activeClients.length === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' · ');

    return (
      <>
        <Text style={s.title}>What {firstClient ? firstClient.name : 'your athletes'} would see</Text>

        {/* Athlete-facing preview card */}
        <View style={s.previewCard}>
          <View style={s.previewHero}>
            <Text style={s.previewEyebrow}>{weeks}-week season</Text>
            <Text style={s.previewName}>{name || 'Your pass'}</Text>
            {promise.trim() ? <Text style={s.previewPromise}>{promise.trim()}</Text> : null}
            {cohortSummary ? <Text style={s.previewCohort}>{cohortSummary}</Text> : null}
          </View>
          <View style={s.previewBody}>
            <View style={s.coachRow}>
              {trainer?.avatar_url ? (
                <Image source={{ uri: trainer.avatar_url }} style={s.coachAvatar} />
              ) : (
                <View style={s.coachAvatarFallback}><Text style={s.coachInitials}>{initials}</Text></View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.coachName}>Coached by {trainer?.name || 'you'}</Text>
                {coachSub ? <Text style={s.coachSub}>{coachSub}</Text> : null}
              </View>
            </View>

            <View style={s.statRow}>
              {[
                { n: trackCounts.workouts, label: 'workouts' },
                { n: trackCounts.meals, label: 'meal plans' },
                { n: trackCounts.checkins, label: 'check-ins' },
                { n: trackCounts.milestones, label: 'milestones' },
              ].filter(x => x.n > 0).map(x => (
                <View key={x.label} style={s.statCell}>
                  <Text style={s.statNum}>{x.n}</Text>
                  <Text style={s.statLabel}>{x.label}</Text>
                </View>
              ))}
            </View>

            {/* Preview only — inert by design */}
            <View style={s.mockCta}>
              <Text style={s.mockCtaText}>Start the season · ${price || 0}{period === 'month' ? '/mo' : '/yr'}</Text>
            </View>
          </View>
        </View>

        {/* Offers are a launch move — an edit sends none, so the list hides. */}
        {!isEdit && activeClients.length > 0 && (
          <View style={s.card}>
            <Text style={s.eyebrow}>Offer it to someone when it goes live</Text>
            <Text style={s.helperText}>They get a message from you, not a system notification.</Text>
            {activeClients.map(c => {
              const selected = selectedClientIds.has(c.id);
              return (
                <TouchableOpacity key={c.id} style={s.clientRow} onPress={() => toggleClient(c.id)} activeOpacity={0.7}>
                  {c.avatar_url ? (
                    <Image source={{ uri: c.avatar_url }} style={s.clientAvatar} />
                  ) : (
                    <View style={s.clientAvatarFallback}>
                      <Text style={s.clientInitial}>{c.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.clientName}>{c.name}</Text>
                    {c.status === 'trial' ? <Text style={s.clientSub}>On trial</Text> : null}
                  </View>
                  <View style={[s.checkbox, selected && s.checkboxOn]}>
                    {selected && <Ionicons name="checkmark" size={15} color={CoachColors.onAccent} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* True: enrollments freeze track_snapshot at purchase
            (supabase/migrations/20260728_client_plan_enrollments.sql). */}
        <Text style={s.footnote}>
          You can keep editing a live pass. Athletes already inside it keep the version they started on.
        </Text>
      </>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Footer CTA per step
  // ─────────────────────────────────────────────────────────────────────────

  const ctaConfig: Record<number, { label: string; disabled: boolean; onPress: () => void }> = {
    1: { label: isEdit ? 'Set the price' : 'Build the week', disabled: !name.trim(), onPress: goNextStep },
    2: { label: `Expand to ${weeks} weeks`, disabled: templateNodes.length === 0, onPress: expandToSeason },
    3: { label: 'Set the price', disabled: false, onPress: goNextStep },
    4: { label: 'See what athletes see', disabled: !price || price <= 0 || cohortErrors.any, onPress: goNextStep },
  };

  const cta = ctaConfig[step];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity onPress={goBack} style={s.headerBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={step === 1 ? 'close' : 'chevron-back'} size={25} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={s.headerTitle} numberOfLines={1}>{name.trim() || (isEdit ? 'Edit pass' : 'New pass')}</Text>
            <Text style={s.headerSub}>
              {isEdit ? 'Edit pass · ' : ''}Step {stepSequence.indexOf(step) + 1} of {stepSequence.length} · {STEP_LABELS[step - 1]}
            </Text>
          </View>
          <View style={{ width: 32 }} />
        </View>

        {/* Real progress bar — one segment per step in this mode's walk, no fake urgency */}
        <View style={s.progressBar}>
          {stepSequence.map(sv => (
            <View key={sv} style={[s.progressSeg, sv <= step && s.progressSegDone]} />
          ))}
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </ScrollView>

        {/* ── Sticky footer ── */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
          {step < 5 ? (
            <TouchableOpacity
              style={[s.primaryBtn, cta.disabled && { opacity: 0.4 }]}
              onPress={cta.onPress}
              disabled={cta.disabled}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>{cta.label}</Text>
            </TouchableOpacity>
          ) : isEdit ? (
            // Edit mode: one plain save — no draft split, no publish language.
            <TouchableOpacity
              style={[s.primaryBtn, saving && { opacity: 0.5 }]}
              onPress={() => handleSave(false)}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color={CoachColors.onAccent} />
              ) : (
                <Text style={s.primaryBtnText}>Save changes</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={s.footerRow}>
              <TouchableOpacity
                style={[s.draftBtn, saving && { opacity: 0.5 }]}
                onPress={() => handleSave(false)}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={s.draftBtnText}>Draft</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.primaryBtn, { flex: 1 }, saving && { opacity: 0.5 }]}
                onPress={() => handleSave(true)}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={CoachColors.onAccent} />
                ) : (
                  <Text style={s.primaryBtnText}>Publish pass</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ── Content picker sheet (workouts / meal plans) ── */}
      <Modal visible={picker !== null} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <View style={s.sheetBackdrop}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{picker?.kind === 'diet' ? 'Pick a meal plan' : 'Pick a workout'}</Text>
              <TouchableOpacity onPress={() => setPicker(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={CoachColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
              {(picker?.kind === 'diet' ? diets : workouts).length === 0 ? (
                <View style={s.sheetEmptyWrap}>
                  <Text style={s.sheetEmpty}>
                    {picker?.kind === 'diet'
                      ? 'No meal plans in your library yet — build one now and it drops straight into this day when you come back.'
                      : 'No workouts in your library yet — build one now and it drops straight into this day when you come back.'}
                  </Text>
                  <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }} style={s.sheetCreateBtn} onPress={handleCreateFromPicker} activeOpacity={0.85}>
                    <Ionicons name="add" size={18} color={CoachColors.onAccent} />
                    <Text style={s.sheetCreateBtnText}>
                      {picker?.kind === 'diet' ? 'Create a meal plan' : 'Create a workout'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : picker?.kind === 'diet' ? (
                diets.map(d => (
                  <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }} key={d.id} style={s.sheetItem} onPress={() => handlePickContent(d.id, d.name)} activeOpacity={0.7}>
                    <Ionicons name="nutrition-outline" size={20} color={CoachColors.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.sheetItemName} numberOfLines={1}>{d.name}</Text>
                      <Text style={s.sheetItemSub}>{d.diet_plan_meals?.length || 0} meals</Text>
                    </View>
                    <Ionicons name="add" size={20} color={CoachColors.accent} />
                  </TouchableOpacity>
                ))
              ) : (
                workouts.map(w => (
                  <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }} key={w.id} style={s.sheetItem} onPress={() => handlePickContent(w.id, w.name)} activeOpacity={0.7}>
                    <Ionicons name="barbell-outline" size={20} color={CoachColors.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.sheetItemName} numberOfLines={1}>{w.name}</Text>
                      <Text style={s.sheetItemSub}>{w.workout_exercises?.length || 0} exercises</Text>
                    </View>
                    <Ionicons name="add" size={20} color={CoachColors.accent} />
                  </TouchableOpacity>
                ))
              )}
              {(picker?.kind === 'diet' ? diets : workouts).length > 0 && (
                <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }} style={s.sheetCreateRow} onPress={handleCreateFromPicker} activeOpacity={0.7}>
                  <Ionicons name="add" size={18} color={CoachColors.accent} />
                  <Text style={s.sheetCreateRowText}>
                    {picker?.kind === 'diet' ? 'Not here? Create a meal plan' : 'Not here? Create a workout'}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Cohort date pickers ──────────────────────────────────────────────
          Same shape as create-live-class.tsx: a sheet on iOS, the platform
          dialog on Android. Nothing navigates while either is up. */}
      {datePicker !== null && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setDatePicker(null)}>
          <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={() => setDatePicker(null)}>
            <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>{datePicker === 'start' ? 'Start date' : 'Enrollment closes'}</Text>
                <TouchableOpacity
                  onPress={() => setDatePicker(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Done choosing a date"
                >
                  <Text style={s.sheetDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={datePicker === 'start' ? startsOn : enrollmentCloses}
                mode="date"
                display="spinner"
                minimumDate={new Date()}
                textColor={CoachColors.textPrimary}
                themeVariant="dark"
                onChange={(_, selected) => {
                  if (!selected) return;
                  if (datePicker === 'start') setStartDate(selected);
                  else { setDeadlineEdited(true); setEnrollmentCloses(atMidnight(selected)); }
                }}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      {datePicker !== null && Platform.OS !== 'ios' && (
        <DateTimePicker
          value={datePicker === 'start' ? startsOn : enrollmentCloses}
          mode="date"
          display="default"
          minimumDate={new Date()}
          onChange={(_, selected) => {
            const which = datePicker;
            setDatePicker(null);
            if (!selected) return;
            if (which === 'start') setStartDate(selected);
            else { setDeadlineEdited(true); setEnrollmentCloses(atMidnight(selected)); }
          }}
        />
      )}

      {/* ── Publish celebration — in-screen overlay, never a native Modal ── */}
      {published && (
        <PassPublishedOverlay
          planName={name.trim() || 'Your pass'}
          offersSent={published.offersSent}
          onDone={() => router.back()}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },

  // Header + progress
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.textPrimary },
  headerSub: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginTop: 1 },
  progressBar: { flexDirection: 'row', gap: 5, paddingHorizontal: 20, paddingBottom: 14 },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: CoachColors.borderMuted },
  progressSegDone: { backgroundColor: CoachColors.accent },

  // Typography
  title: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary, marginTop: 8, marginBottom: 6 },
  subtitle: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary, lineHeight: 22.5, marginBottom: 18 },
  eyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 8, marginTop: 14,
  },
  helperText: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 6, lineHeight: 19 },
  contextLine: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary, marginTop: 12, lineHeight: 20 },
  footnote: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, lineHeight: 19, marginTop: 16, textAlign: 'center' },

  // Inputs
  coverPick: { marginBottom: 18 },
  coverPickImg: { width: '100%', aspectRatio: 16 / 10, borderRadius: 18, backgroundColor: CoachColors.surface },
  coverPickBadge: {
    position: 'absolute', right: 10, bottom: 10, width: 30, height: 30, borderRadius: 15,
    backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center',
  },
  coverPickEmpty: {
    minHeight: 72, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: CoachColors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16,
  },
  coverPickText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textMuted, flexShrink: 1 },
  nameInput: {
    fontFamily: CoachFonts.bodyMedium, fontSize: 18, color: CoachColors.textPrimary,
    backgroundColor: CoachColors.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 17,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  promiseHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  charCounter: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint, marginBottom: 8 },
  promiseInput: {
    fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textPrimary,
    backgroundColor: CoachColors.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: CoachColors.border, minHeight: 82, textAlignVertical: 'top',
  },

  // Cards
  card: {
    backgroundColor: CoachColors.surface, borderRadius: 16, padding: 16, marginTop: 18,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  weeksBig: { fontFamily: CoachFonts.headingBold, fontSize: 36, color: CoachColors.accent, marginBottom: 12 },
  weeksRow: { flexDirection: 'row', gap: 8 },
  weekChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1, borderColor: CoachColors.border, backgroundColor: CoachColors.bg,
  },
  weekChipActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  weekChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textSecondary },
  weekChipTextActive: { color: CoachColors.onAccent },

  // Toggle
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CoachColors.surface, borderRadius: 16, padding: 16, marginTop: 18,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  toggleTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  toggleSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2, lineHeight: 19 },
  switch: {
    width: 46, height: 27, borderRadius: 14, backgroundColor: CoachColors.borderMuted,
    padding: 3, justifyContent: 'center',
  },
  switchOn: { backgroundColor: CoachColors.accent },
  switchKnob: { width: 21, height: 21, borderRadius: 11, backgroundColor: CoachColors.textFaint },
  switchKnobOn: { backgroundColor: CoachColors.onAccent, alignSelf: 'flex-end' },

  // Day strip
  dayStrip: { flexDirection: 'row', gap: 5, marginTop: 6 },
  dayCell: {
    flex: 1, minHeight: 84, borderRadius: 12, alignItems: 'center', paddingTop: 8, paddingBottom: 6,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    justifyContent: 'flex-start', gap: 5,
  },
  dayCellFilled: { borderColor: CoachColors.border },
  dayCellWorkout: { borderColor: 'rgba(198,242,78,0.35)', backgroundColor: CoachColors.accentSofter },
  dayCellRest: { borderStyle: 'dashed', backgroundColor: CoachColors.bg },
  dayLetter: { fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint },
  dayLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 9.5, color: CoachColors.textSecondary, textAlign: 'center', paddingHorizontal: 2 },
  dayIconStack: { alignItems: 'center', gap: 4, paddingTop: 1 },

  // Palette
  paletteSection: { marginTop: 6 },
  paletteHint: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginBottom: 10 },
  paletteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paletteChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1, borderColor: CoachColors.border, backgroundColor: CoachColors.surface,
  },
  paletteChipActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  paletteChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },
  paletteChipTextActive: { color: CoachColors.onAccent },

  // Step 2 summary
  summaryBig: { fontFamily: CoachFonts.headingBold, fontSize: 29, color: CoachColors.textPrimary },
  summaryBreakdown: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary, marginTop: 4 },

  // Step 3 — season map
  weekRow: {
    backgroundColor: CoachColors.surface, borderRadius: 14, marginBottom: 8,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  weekRowEditing: { borderColor: CoachColors.border },
  weekRowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  weekRowNum: { fontFamily: CoachFonts.headingSemiBold, fontSize: 14.5, color: CoachColors.textPrimary, width: 34 },
  weekDots: { flexDirection: 'row', gap: 5, flex: 1, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  weekRestText: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint },
  weekRowLabel: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, maxWidth: 90, textAlign: 'right' },
  weekEditor: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, paddingTop: 10 },
  weekLabelInput: {
    fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary,
    backgroundColor: CoachColors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  outlineBtnRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  outlineBtn: {
    borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed',
    borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9,
  },
  outlineBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },
  milestoneInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10,
    backgroundColor: CoachColors.surface, borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.25)',
  },
  milestoneTextInput: { flex: 1, fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary, paddingVertical: 14 },
  milestoneAddBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center' },
  milestoneChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  milestoneChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CoachColors.accentSofter, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(198,242,78,0.25)',
  },
  milestoneChipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textPrimary },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, justifyContent: 'center' },
  legendText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },

  // Step 4 — price
  segmented: {
    flexDirection: 'row', backgroundColor: CoachColors.surface, borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: CoachColors.borderMuted, marginTop: 6,
  },
  segment: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 11 },
  segmentActive: { backgroundColor: CoachColors.borderMuted },
  segmentText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textFaint },
  segmentTextActive: { color: CoachColors.textPrimary },
  priceDisplay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 26, gap: 14 },
  priceCenter: { alignItems: 'center' },
  priceStepBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: CoachColors.border, backgroundColor: CoachColors.surface,
  },
  priceDollar: { fontFamily: CoachFonts.headingSemiBold, fontSize: 27, color: CoachColors.textSecondary, marginBottom: 8 },
  priceInput: {
    fontFamily: CoachFonts.headingBold, fontSize: 58, color: CoachColors.textPrimary,
    minWidth: 80, textAlign: 'center', padding: 0,
  },
  pricePeriod: { fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textMuted, marginBottom: 12 },
  priceEditHint: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint, marginTop: 2 },

  // Step 4 — product type + cohort dates
  typeCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: CoachColors.surface, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  typeCardActive: { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter },
  radio: {
    width: 20, height: 20, borderRadius: 10, marginTop: 1,
    borderWidth: 1.5, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: CoachColors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: CoachColors.accent },
  typeTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary, lineHeight: 21.5 },
  typeSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 3, lineHeight: 19 },
  cohortBox: {
    backgroundColor: CoachColors.surface, borderRadius: 16, padding: 16, marginTop: 6,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: CoachColors.border, marginTop: 8,
  },
  dateLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.textFaint,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  dateValue: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary, marginTop: 3 },
  errorText: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.warning, marginTop: 6, lineHeight: 19 },
  capacityInput: {
    fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textPrimary,
    backgroundColor: CoachColors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  cohortPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, paddingTop: 14,
  },
  cohortPreviewText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary, flex: 1 },
  sheetDone: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.accent },

  // Market meter
  meterHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  meterBand: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary },
  meterTrack: {
    flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'visible',
    marginTop: 6, gap: 3,
  },
  meterZone: { backgroundColor: CoachColors.borderMuted, borderRadius: 999 },
  meterZoneMid: { backgroundColor: 'rgba(198,242,78,0.28)' },
  meterMarker: {
    position: 'absolute', top: -3, width: 4, height: 14, borderRadius: 2,
    backgroundColor: CoachColors.accent, marginLeft: -2,
  },
  meterLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  meterLabelText: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textFaint },
  priceSubline: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary, textAlign: 'center', marginTop: 4 },
  quickPickRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16 },
  keepBig: { fontFamily: CoachFonts.headingBold, fontSize: 31.5, color: CoachColors.accent },
  keepSub: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary, marginTop: 3 },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted },
  compareName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  compareMeta: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 1 },
  comparePrice: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textSecondary },

  // Step 5 — preview
  previewCard: {
    borderRadius: 18, overflow: 'hidden', marginTop: 10,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  previewHero: { backgroundColor: CoachColors.accent, padding: 20 },
  previewEyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: 'rgba(16,18,16,0.65)',
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 6,
  },
  previewName: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.onAccent },
  previewPromise: { fontFamily: CoachFonts.body, fontSize: 15, color: 'rgba(16,18,16,0.75)', marginTop: 5, lineHeight: 21.5 },
  previewCohort: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: 'rgba(16,18,16,0.85)', marginTop: 8 },
  previewBody: { backgroundColor: CoachColors.surface, padding: 16, gap: 14 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachAvatar: { width: 40, height: 40, borderRadius: 20 },
  coachAvatarFallback: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  coachInitials: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15.5, color: CoachColors.textSecondary },
  coachName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  coachSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 1 },
  statRow: { flexDirection: 'row', gap: 8 },
  statCell: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    backgroundColor: CoachColors.bg, borderRadius: 12, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  statNum: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textPrimary },
  statLabel: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 2 },
  mockCta: {
    backgroundColor: CoachColors.accent, opacity: 0.55, borderRadius: 999,
    paddingVertical: 13, alignItems: 'center',
  },
  mockCtaText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },

  // Offer list
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted },
  clientAvatar: { width: 36, height: 36, borderRadius: 18 },
  clientAvatarFallback: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  clientInitial: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15.5, color: CoachColors.textSecondary },
  clientName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  clientSub: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 1 },
  checkbox: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },

  // Footer
  footer: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, backgroundColor: CoachColors.bg,
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },
  draftBtn: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, height: 52,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  draftBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary },

  // Picker sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: CoachColors.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 20, paddingTop: 18,
    borderTopWidth: 1, borderColor: CoachColors.border,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textPrimary },
  sheetEmpty: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 21.5 },
  sheetEmptyWrap: { paddingVertical: 22, paddingHorizontal: 8, gap: 16, alignItems: 'center' },
  sheetCreateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  sheetCreateBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },
  sheetCreateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed', borderRadius: 14,
    paddingVertical: 13, marginBottom: 8,
  },
  sheetCreateRowText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.accent },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderRadius: 14, padding: 13, marginBottom: 8,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  sheetItemName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  sheetItemSub: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 1 },
});
