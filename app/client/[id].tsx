// ─── Helpers ─────────────────────────────────────────────────────────────────
function toTitleCase(str: string) {
  return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return raw;
}
function formatRelativeTime(date: Date) {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return 'just now';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

import { useState, useMemo, useCallback, useEffect, useRef, type ReactElement } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity,
  Linking, Modal, Dimensions, Image as RNImage, Platform,
  KeyboardAvoidingView, Animated as RNAnimated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeIn, FadeInDown, FadeInUp,
  useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay,
  useAnimatedProps,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as EImage } from 'expo-image';
import * as Haptics from 'expo-haptics';

import { useApp } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { supabase } from '../../lib/supabase';
import { countSetFeels, analyzeFeelCounts, FeelCounts } from '../../lib/setFeel';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import ClientHabitGrid from '../../components/dashboard/ClientHabitGrid';
import BoltEmptyState from '../../components/mascot/BoltEmptyState';
import { LineChart } from 'react-native-gifted-charts';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

type AssignMode = 'enroll' | 'workout' | 'diet' | null;
type TabType = 'overview' | 'health' | 'programs' | 'progress';

/** Coach-authored check-in question, as stored in clients.checkin_questions
 *  JSONB. Shape must match what the athlete-side WeeklyCheckIn renders —
 *  see supabase/migrations/add_checkin_questions.sql. */
interface CoachQuestion {
  id: string;
  prompt: string;
  context?: string;
  type: 'choice' | 'scale' | 'text';
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const Q_TYPES: { key: CoachQuestion['type']; label: string; hint: string }[] = [
  { key: 'choice', label: 'Choice', hint: 'They pick one option' },
  { key: 'scale',  label: 'Scale',  hint: 'They pick a number'   },
  { key: 'text',   label: 'Text',   hint: 'They write a reply'   },
];

function newQuestionId() {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function questionMeta(q: CoachQuestion) {
  if (q.type === 'choice') return `Choice · ${(q.options || []).length} options`;
  if (q.type === 'scale')  return `Scale · ${q.min ?? 1}–${q.max ?? 10}${q.unit ? ` ${q.unit}` : ''}`;
  return 'Text reply';
}

const { width: W } = Dimensions.get('window');

const TABS: { key: TabType; label: string }[] = [
  { key: 'overview',  label: 'Overview'  },
  { key: 'health',    label: 'Health'    },
  { key: 'programs',  label: 'Programs'  },
  { key: 'progress',  label: 'Progress'  },
];
const TAB_W = (W - 32) / TABS.length;

// Animated ring (for engagement score widget)
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function ClientDetailScreen() {
  const { id }      = useLocalSearchParams<{ id: string }>();
  const router      = useRouter();

  /**
   * Never navigate while a native Modal is still on screen — the documented
   * iOS freeze in this codebase. Callers dismiss the sheet first; this waits
   * for the dismissal animation to land before pushing.
   */
  const dismissThenGo = (route: string) => {
    setTimeout(() => router.push(route as any), 300);
  };
  const { showAlert } = useAlert();
  const reduced     = useReducedMotion();
  const {
    getClientById, getClientSessions, getClientWorkouts, getClientDiets,
    getClientProgress, workouts, diets, assignWorkout, assignDietPlan, plans,
    notifications, upgradeClientToPlan, extendClientTrial, getClientHealthSnapshot,
    requestHealthAccess, meals, refreshClients,
  } = useApp();

  const [activeTab,        setActiveTab]        = useState<TabType>('overview');
  const [assignMode,       setAssignMode]       = useState<AssignMode>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showQuickAdd,     setShowQuickAdd]     = useState(false);
  const [editingNotes,     setEditingNotes]     = useState(false);
  const [notesText,        setNotesText]        = useState('');
  const [notesSaving,      setNotesSaving]      = useState(false);
  const [lastMessage,      setLastMessage]      = useState<{ text: string; time: string } | null>(null);
  const [viewerPhoto,      setViewerPhoto]      = useState<string | null>(null);

  // Check-in question authoring (in-screen overlay, not a native Modal)
  const [showCqEditor, setShowCqEditor] = useState(false);
  const [cqList,       setCqList]       = useState<CoachQuestion[]>([]);
  const [cqSaving,     setCqSaving]     = useState(false);
  const [cqEditing,    setCqEditing]    = useState<number | 'new' | null>(null);
  const [qId,      setQId]      = useState('');
  const [qPrompt,  setQPrompt]  = useState('');
  const [qContext, setQContext] = useState('');
  const [qType,    setQType]    = useState<CoachQuestion['type']>('choice');
  const [qOptions, setQOptions] = useState('');
  const [qMin,     setQMin]     = useState('1');
  const [qMax,     setQMax]     = useState('10');
  const [qStep,    setQStep]    = useState('1');
  const [qUnit,    setQUnit]    = useState('');

  // Nutrition review — real meal logs, last 7 days (null = still loading)
  const [mealLogs, setMealLogs] = useState<any[] | null>(null);

  // How training felt — per-set feel ratings the athlete logged in strength
  // sessions (client_workout_logs.exercises JSONB), last 7 days. null until
  // loaded; the card only renders with >= 3 rated sets in the window.
  const [feelCounts, setFeelCounts] = useState<FeelCounts | null>(null);

  const client          = getClientById(id || '');
  const sessions        = getClientSessions(id || '');
  const assignedWorkouts = getClientWorkouts(id || '');
  const assignedDiets   = getClientDiets(id || '');
  const progressLogs    = getClientProgress(id || '');
  const healthSnapshot  = getClientHealthSnapshot(id || '');

  const upcomingSessions  = sessions.filter(s => s.status === 'upcoming' && new Date(s.date) > new Date());
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const planName          = plans.find(p => p.id === client?.plan_id)?.name;

  // ── Computed stats ──
  const engagementScore = useMemo(() => {
    const thirtyAgo   = new Date(Date.now() - 30 * 86400000);
    const fourteenAgo = new Date(Date.now() - 14 * 86400000);
    const recent      = sessions.filter(s => { const d = new Date(s.date); return d > thirtyAgo && d < new Date(); });
    const sr          = recent.length ? recent.filter(s => s.status === 'completed').length / recent.length : 0;
    const pr          = progressLogs.some(l => new Date(l.date) > fourteenAgo) ? 1 : 0;
    const score       = Math.round((sr * 0.5 + pr * 0.5) * 100);
    if (score >= 80) return { score, label: 'On Track', color: CoachColors.accent };
    if (score >= 50) return { score, label: 'Needs Check-in', color: CoachColors.warning };
    return              { score, label: 'At Risk', color: CoachColors.danger };
  }, [sessions, progressLogs]);

  const streak = useMemo(() => {
    if (!progressLogs.length) return 0;
    const sorted = [...progressLogs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    let count = 0; let prev = new Date(); prev.setHours(0,0,0,0);
    for (const log of sorted) {
      const d = new Date(log.date); d.setHours(0,0,0,0);
      if (Math.round((prev.getTime()-d.getTime())/86400000) <= 1) { count++; prev = d; } else break;
    }
    return count;
  }, [progressLogs]);

  const clientSince = useMemo(() => {
    if (!client?.created_at) return null;
    const months = Math.floor((Date.now() - new Date(client.created_at).getTime()) / (30*86400000));
    if (months < 1) return 'New';
    if (months < 12) return `${months}mo`;
    return `${Math.floor(months/12)}yr`;
  }, [client?.created_at]);

  const weightChartData = useMemo(() =>
    [...progressLogs].filter(l => l.weight != null).reverse().map(l => ({
      value: l.weight as number,
      label: new Date(l.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })), [progressLogs]);
  const weightDelta = weightChartData.length >= 2
    ? (weightChartData[weightChartData.length-1].value - weightChartData[0].value).toFixed(1) : null;

  const clientUnread = useMemo(() =>
    notifications.filter(n => !n.is_read && n.type === 'message' && (n.metadata as any)?.client_id === client?.id).length,
  [notifications, client?.id]);

  // ── Tab underline animation ──
  const underlineX = useSharedValue(0);
  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineX.value }],
  }));

  // ── Engagement arc ──
  const RING_R = 36;
  const RING_STROKE = 4;
  const CIRC = 2 * Math.PI * RING_R;
  const arcProg = useSharedValue(0);
  const arcAnimProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC * (1 - arcProg.value),
  }));
  useEffect(() => {
    if (reduced) {
      arcProg.value = engagementScore.score / 100;
      return;
    }
    arcProg.value = withDelay(400, withTiming(engagementScore.score / 100, { duration: 900 }));
  }, [engagementScore.score, reduced]);

  // ── Effects ──
  useEffect(() => { if (client?.notes) setNotesText(client.notes); }, [client?.id]);
  useEffect(() => {
    if (!client?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: c } = await supabase.from('conversations').select('id').eq('client_id', client.id).maybeSingle();
        if (!c || cancelled) return;
        const { data: m } = await supabase.from('messages').select('content,created_at').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!cancelled && m) setLastMessage({ text: m.content, time: formatRelativeTime(new Date(m.created_at)) });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [client?.id]);

  // Meal logs for the nutrition card — last 7 calendar days, real rows only.
  useEffect(() => {
    if (!client?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0];
        const { data, error } = await supabase
          .from('client_meal_logs')
          .select('*')
          .eq('client_id', client.id)
          .gte('logged_date', since);
        if (!cancelled) setMealLogs(error ? [] : (data || []));
      } catch {
        if (!cancelled) setMealLogs([]);
      }
    })();
    return () => { cancelled = true; };
  }, [client?.id]);

  // Set-feel ratings from the athlete's strength logs, last 7 days. Read-only
  // via the trainer RLS policy on client_workout_logs; any failure just means
  // the card stays hidden — never a fabricated summary.
  useEffect(() => {
    if (!client?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const since = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data, error } = await supabase
          .from('client_workout_logs')
          .select('exercises, created_at')
          .eq('client_id', client.id)
          .gte('created_at', since);
        if (cancelled || error || !data) return;
        if (!cancelled) setFeelCounts(countSetFeels(data));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [client?.id]);

  // Compact difficulty summary — only from real ratings, only when there are
  // enough of them (>= 3 rated sets) to say anything honest.
  const feelSummary = useMemo(() => {
    const a = analyzeFeelCounts(feelCounts);
    if (!a) return null;
    const topPhrase = a.top === 'easy' ? 'mostly felt easy'
      : a.top === 'right' ? 'mostly felt right'
      : a.top === 'grind' ? 'mostly grinds'
      : 'mostly failed reps';
    const hardTail = (a.top === 'easy' || a.top === 'right') && a.hard > 0
      ? `, ${a.hard} hard`
      : '';
    return {
      line: `Last week: ${a.rated} rated set${a.rated === 1 ? '' : 's'} — ${topPhrase}${hardTail}`,
      heavy: a.heavy,
    };
  }, [feelCounts]);

  // ── Nutrition summary — planned vs logged kcal from real data ──
  const activeDietPlan = assignedDiets[0]?.diet || null;
  const nutrition = useMemo(() => {
    if (!mealLogs) return null; // still loading — render nothing rather than a guess
    const dpms = activeDietPlan?.diet_plan_meals || [];
    const dpmById: Record<string, any> = {};
    dpms.forEach((dpm: any) => { dpmById[dpm.id] = dpm; });
    const mealById: Record<string, any> = {};
    (meals || []).forEach((m: any) => { mealById[m.id] = m; });

    // Planned kcal per day = the assigned plan's meal list at listed servings.
    const plannedRaw = dpms.reduce((sum: number, dpm: any) =>
      sum + (dpm.meals?.calories || 0) * (dpm.servings || 1), 0);
    const plannedPerDay = plannedRaw > 0 ? Math.round(plannedRaw) : null;

    const perDay: Record<string, number> = {};
    let swapCount = 0;
    for (const row of mealLogs) {
      let kcal = 0;
      if (row.swapped_meal_id) {
        // Athlete ate an approved swap (or a rest-day meal) — count the meal
        // that was actually eaten, resolved against the meals library.
        swapCount += 1;
        kcal = mealById[row.swapped_meal_id]?.calories || 0;
      } else if (row.diet_plan_meal_id) {
        const dpm = dpmById[row.diet_plan_meal_id];
        kcal = (dpm?.meals?.calories || 0) * (dpm?.servings || 1);
      }
      if (row.logged_date) perDay[row.logged_date] = (perDay[row.logged_date] || 0) + kcal;
    }

    const dayRows = Object.keys(perDay).sort().reverse().map((key) => ({
      key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      logged: Math.round(perDay[key]),
    }));

    return { daysLogged: dayRows.length, swapCount, plannedPerDay, dayRows };
  }, [mealLogs, activeDietPlan, meals]);

  const handleTabChange = useCallback((tab: TabType, i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (reduced) underlineX.value = i * TAB_W;
    else underlineX.value = withSpring(i * TAB_W, { damping: 20, stiffness: 260 });
    setActiveTab(tab);
  }, [underlineX, reduced]);

  const saveNotes = useCallback(async () => {
    if (!client?.id) return;
    setNotesSaving(true);
    // .update() RESOLVES with { error } — it never throws, so the old catch was
    // dead code and a failed save still closed the editor as if it had worked.
    const { error } = await supabase.from('clients').update({ notes: notesText }).eq('id', client.id);
    setNotesSaving(false);
    if (error) {
      showAlert({ type: 'error', title: 'Note not saved', message: error.message || 'Failed to save note. Your text is still here — try again.' });
      return; // stay in the editor so the note isn't lost
    }
    setEditingNotes(false);
  }, [notesText, client?.id, showAlert]);

  const startConversation = useCallback(async () => {
    try {
      const { data: existing } = await supabase.from('conversations').select('id').eq('client_id', client!.id).maybeSingle();
      if (existing) { router.push(`/chat/${existing.id}` as any); return; }
      const { data: { user } } = await supabase.auth.getUser();
      const { data: nc, error } = await supabase.from('conversations').insert({ trainer_id: user!.id, client_id: client!.id }).select().single();
      if (error) throw error;
      router.push(`/chat/${nc.id}` as any);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Could not open chat' });
    }
  }, [client?.id, router, showAlert]);

  const handleAssign = useCallback(async (itemId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      if (assignMode === 'workout') {
        await assignWorkout(itemId, client!.id, today);
        showAlert({ type: 'success', title: 'Workout Assigned', message: 'Added to their plan.' });
      } else {
        await assignDietPlan(itemId, client!.id, today);
        showAlert({ type: 'success', title: 'Diet Assigned', message: 'Added to their plan.' });
      }
      setAssignMode(null);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Failed', message: err.message || 'Could not assign' });
    }
  }, [assignMode, client?.id, assignWorkout, assignDietPlan, showAlert]);

  // ── Check-in question authoring ──
  const openCqEditor = () => {
    const existing = Array.isArray((client as any)?.checkin_questions) ? (client as any).checkin_questions : [];
    setCqList(existing.filter((q: any) => q && typeof q.prompt === 'string' && q.prompt.trim()));
    setCqEditing(null);
    setShowCqEditor(true);
  };

  const openQForm = (target: number | 'new') => {
    if (target === 'new') {
      setQId(newQuestionId()); setQPrompt(''); setQContext(''); setQType('choice');
      setQOptions(''); setQMin('1'); setQMax('10'); setQStep('1'); setQUnit('');
    } else {
      const q = cqList[target];
      setQId(q.id); setQPrompt(q.prompt); setQContext(q.context || ''); setQType(q.type);
      setQOptions((q.options || []).join('\n'));
      setQMin(String(q.min ?? 1)); setQMax(String(q.max ?? 10));
      setQStep(String(q.step ?? 1)); setQUnit(q.unit || '');
    }
    setCqEditing(target);
  };

  const commitQuestion = () => {
    const prompt = qPrompt.trim();
    if (!prompt) {
      showAlert({ type: 'error', title: 'Missing question', message: 'Write the question first.' });
      return;
    }
    const q: CoachQuestion = { id: qId || newQuestionId(), prompt, type: qType };
    if (qContext.trim()) q.context = qContext.trim();
    if (qType === 'choice') {
      const options = qOptions.split('\n').map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) {
        showAlert({ type: 'error', title: 'Needs options', message: 'Give at least two options, one per line.' });
        return;
      }
      q.options = options;
    } else if (qType === 'scale') {
      const min = parseFloat(qMin), max = parseFloat(qMax), step = parseFloat(qStep);
      q.min = Number.isFinite(min) ? min : 1;
      q.max = Number.isFinite(max) ? max : 10;
      q.step = Number.isFinite(step) && step > 0 ? step : 1;
      if (q.max <= q.min) {
        showAlert({ type: 'error', title: 'Check the range', message: 'Max has to be higher than min.' });
        return;
      }
      if (qUnit.trim()) q.unit = qUnit.trim();
    }
    if (cqEditing === 'new') setCqList([...cqList, q]);
    else if (typeof cqEditing === 'number') setCqList(cqList.map((old, i) => (i === cqEditing ? q : old)));
    setCqEditing(null);
  };

  const moveQuestion = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cqList.length) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = [...cqList];
    [next[i], next[j]] = [next[j], next[i]];
    setCqList(next);
  };

  const removeQuestion = (i: number) => setCqList(cqList.filter((_, idx) => idx !== i));

  const saveCheckinQuestions = async () => {
    if (!client?.id || cqSaving) return;
    setCqSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ checkin_questions: cqList.length > 0 ? cqList : null })
        .eq('id', client.id);
      if (error) {
        // 42703 — column not migrated yet; tell the coach instead of crashing.
        if (error.code === '42703') {
          showAlert({ type: 'error', title: 'Not available yet', message: 'Custom check-in questions need the latest database update. Standard questions still run.' });
          return;
        }
        throw error;
      }
      await refreshClients?.();
      setShowCqEditor(false);
      showAlert({
        type: 'success',
        title: 'Saved',
        message: cqList.length > 0
          ? `${toTitleCase(client.name).split(' ')[0]} will get these at the next check-in.`
          : 'Back to the standard questions.',
      });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Could not save questions.' });
    } finally {
      setCqSaving(false);
    }
  };

  if (!client) {
    return (
      <SafeAreaView style={s.root}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <Ionicons name="person-outline" size={52} color={CoachColors.border} />
          <Text style={s.emptyStateTitle}>Client not found</Text>
          <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={s.outlineBtn} onPress={() => router.back()}>
            <Text style={s.outlineBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const STATUS = {
    active:   { dot: CoachColors.accent, label: 'Active'    },
    trial:    { dot: CoachColors.warning, label: 'Trial'     },
    inactive: { dot: CoachColors.textFaint, label: 'Inactive'  },
  } as const;
  const statusKey = (client.status as keyof typeof STATUS) in STATUS ? client.status as keyof typeof STATUS : 'inactive';
  const status = STATUS[statusKey];

  // ── Attention banner — "attention leads": trial ending / expired takes
  // priority; otherwise an active client who has gone quiet (At Risk
  // engagement) surfaces the same way. Rendered above the stat row so it's
  // the first thing a coach sees, not buried under aggregate numbers.
  let attentionBanner: ReactElement | null = null;
  if (client.status === 'trial') {
    const trialEnd  = client.trial_end_date ? new Date(client.trial_end_date) : new Date(new Date(client.created_at).getTime() + 20 * 86400000);
    const daysLeft  = Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000));
    const totalDays = Math.ceil((trialEnd.getTime() - new Date(client.created_at).getTime()) / 86400000);
    const pct       = Math.min(1, (totalDays - daysLeft) / Math.max(totalDays, 1));
    const isExp     = daysLeft === 0;
    attentionBanner = (
      <View style={s.trialBanner}>
        <View style={s.trialLeft}>
          <Text style={[s.trialTitle, isExp && { color: CoachColors.danger }]}>
            {isExp ? 'Trial expired' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in trial`}
          </Text>
          <View style={s.trialTrack}>
            <View style={[s.trialFill, { width: `${pct * 100}%` as any, backgroundColor: isExp ? CoachColors.danger : daysLeft <= 5 ? CoachColors.warning : CoachColors.accent }]} />
          </View>
        </View>
        <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} style={s.trialUpgradeBtn} onPress={() => setShowUpgradeModal(true)} accessibilityRole="button" accessibilityLabel="Upgrade from trial">
          <Text style={s.trialUpgradeText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (client.status === 'active' && engagementScore.label === 'At Risk') {
    attentionBanner = (
      <View style={s.trialBanner}>
        <View style={s.trialLeft}>
          <Text style={[s.trialTitle, { color: CoachColors.danger }]}>Gone quiet</Text>
          <Text style={s.quietSub}>Low session activity in the last 30 days</Text>
        </View>
        <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} style={s.quietNudgeBtn} onPress={startConversation} accessibilityRole="button" accessibilityLabel="Send a nudge message">
          <Text style={s.quietNudgeText}>Nudge</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* NAV BAR */}
      <SafeAreaView edges={['top']}>
        <View style={s.nav}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={24} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.navTitle} numberOfLines={1}>{toTitleCase(client.name)}</Text>
          <TouchableOpacity onPress={() => router.push(`/edit-client/${id}` as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Edit client">
            <Ionicons name="ellipsis-horizontal" size={22} color={CoachColors.textPrimary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ══════════════ HERO ══════════════ */}
        <Animated.View entering={reduced ? undefined : FadeIn.duration(400)} style={s.hero}>
          {/* Avatar */}
          <Avatar name={client.name} size="xl" imageUrl={client.avatar_url} />

          {/* Status row — name already shown in nav bar */}
          <View style={s.heroStatusRow}>
            <View style={[s.statusDot, { backgroundColor: status.dot }]} />
            <Text style={s.heroStatusText}>{status.label}</Text>
            {planName && (
              <>
                <Text style={s.heroDivider}>·</Text>
                <Text style={s.heroStatusText}>{toTitleCase(planName)}</Text>
              </>
            )}
            {clientSince && (
              <>
                <Text style={s.heroDivider}>·</Text>
                <Text style={s.heroStatusText}>{clientSince}</Text>
              </>
            )}
          </View>

          {/* Attention leads — trial ending / gone quiet shown before aggregate stats */}
          {attentionBanner}

          {/* Aggregate stats — demoted: smaller, quieter than the attention banner above */}
          <View style={s.statRow}>
            <View style={s.statBlock} accessible={true} accessibilityLabel={`${completedSessions.length} completed session${completedSessions.length === 1 ? '' : 's'}`}>
              <Text style={s.statNum} numberOfLines={1} adjustsFontSizeToFit>{completedSessions.length}</Text>
              <Text style={s.statLabel}>Sessions</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statBlock} accessible={true} accessibilityLabel={streak > 0 ? `${streak} day streak` : 'No streak'}>
              <Text style={[s.statNum, streak === 0 && { color: CoachColors.textFaint }]} numberOfLines={1} adjustsFontSizeToFit>
                {streak > 0 ? streak : '0'}
              </Text>
              <Text style={s.statLabel}>{streak > 0 ? 'Day streak' : 'No streak'}</Text>
            </View>
            {/* Engagement score — plain stat, no heavy ring; keeps status color since it's a signal, not decoration */}
            <View style={s.statDivider} />
            <View style={s.statBlock} accessible={true} accessibilityLabel={`Engagement ${engagementScore.score} percent, ${engagementScore.label}`}>
              <Text style={[s.statNum, { color: engagementScore.color }]} numberOfLines={1} adjustsFontSizeToFit>
                {engagementScore.score}%
              </Text>
              <Text style={s.statLabel}>{engagementScore.label}</Text>
            </View>
          </View>

          {/* Primary actions */}
          <View style={s.heroActions}>
            <TouchableOpacity style={s.actionPrimary} onPress={startConversation} activeOpacity={0.85}>
              {clientUnread > 0 && (
                <View style={s.unreadDot}><Text style={s.unreadDotText}>{clientUnread > 9 ? '9+' : clientUnread}</Text></View>
              )}
              <Ionicons name="chatbubble-ellipses" size={17} color={CoachColors.onAccent} />
              <Text style={s.actionPrimaryText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionSecondary} onPress={() => router.push(`/book-session?clientId=${client.id}` as any)} activeOpacity={0.85}>
              <Ionicons name="calendar-outline" size={17} color={CoachColors.textPrimary} />
              <Text style={s.actionSecondaryText}>Book Session</Text>
            </TouchableOpacity>
          </View>

          {/* Icon tray */}
          <View style={s.iconTray}>
            {[
              ...(client.phone ? [{ icon: 'call-outline', label: 'Call', action: () => Linking.openURL(`tel:${client.phone}`) }] : []),
              ...(client.email ? [{ icon: 'mail-outline', label: 'Email', action: () => Linking.openURL(`mailto:${client.email}`) }] : []),
              { icon: 'trending-up-outline', label: 'Progress', action: () => handleTabChange('progress', 3) },
              client.status === 'trial'
                ? { icon: 'arrow-up-circle-outline', label: 'Upgrade', action: () => setShowUpgradeModal(true) }
                : { icon: 'ribbon-outline', label: 'Enroll', action: () => setAssignMode('enroll') },
            ].map(item => (
              <TouchableOpacity key={item.label} style={s.iconTrayItem} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); item.action(); }} activeOpacity={0.65}>
                <Ionicons name={item.icon as any} size={20} color={CoachColors.textSecondary} />
                <Text style={s.iconTrayLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* ══════════════ TAB BAR ══════════════ */}
        <View style={s.tabRow}>
          {TABS.map((tab, i) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                key={tab.key}
                style={[s.tabItem, { width: TAB_W }]}
                onPress={() => handleTabChange(tab.key, i)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityLabel={`${tab.label} tab`}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[s.tabLabel, isActive && s.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
          <Animated.View style={[s.tabUnderline, underlineStyle, { width: TAB_W }]} />
        </View>

        {/* ══════════════════════════════════════════════════
            TAB: OVERVIEW
        ══════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(280)} style={s.tabBody}>

            {/* Coach Notes */}
            <Text style={s.sectionLabel}>Coach Notes</Text>
            <View style={s.notesWrap}>
              {editingNotes ? (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <TextInput
                    value={notesText}
                    onChangeText={setNotesText}
                    multiline
                    style={s.notesInput}
                    placeholder="Private note — only visible to you…"
                    placeholderTextColor={CoachColors.textFaint}
                    autoFocus
                  />
                  <View style={s.notesActionsRow}>
                    <TouchableOpacity onPress={() => setEditingNotes(false)}>
                      <Text style={s.notesCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={s.notesSaveBtn} onPress={saveNotes} disabled={notesSaving}>
                      <Text style={s.notesSaveBtnText}>{notesSaving ? 'Saving…' : 'Save'}</Text>
                    </TouchableOpacity>
                  </View>
                </KeyboardAvoidingView>
              ) : (
                <TouchableOpacity onPress={() => setEditingNotes(true)} activeOpacity={0.7}>
                  <Text style={notesText ? s.notesText : s.notesPlaceholder}>
                    {notesText || 'Tap to add a private coaching note…'}
                  </Text>
                  <View style={s.notesEditRow}>
                    <Ionicons name="pencil-outline" size={12} color={CoachColors.textFaint} />
                    <Text style={s.notesEditLabel}>Private · Only you can see this</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Check-in questions */}
            <Text style={s.sectionLabel}>Check-in questions</Text>
            {(() => {
              const saved: CoachQuestion[] = Array.isArray((client as any).checkin_questions)
                ? (client as any).checkin_questions.filter((q: any) => q && typeof q.prompt === 'string' && q.prompt.trim())
                : [];
              return (
                <TouchableOpacity style={s.block} onPress={openCqEditor} activeOpacity={0.7}>
                  <View style={s.blockRow}>
                    <Ionicons name="chatbox-ellipses-outline" size={18} color={saved.length > 0 ? CoachColors.accent : CoachColors.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.blockRowText}>
                        {saved.length > 0 ? `${saved.length} custom question${saved.length === 1 ? '' : 's'}` : 'Standard questions'}
                      </Text>
                      <Text style={s.blockRowSub}>
                        {saved.length > 0 ? 'Asked in their weekly check-in' : 'The standard four run until you write your own'}
                      </Text>
                    </View>
                    <Text style={s.changeLink}>{saved.length > 0 ? 'Edit' : 'Write'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })()}

            {/* How training felt — the athlete's own per-set ratings, last 7
                days. Hidden entirely below 3 rated sets. One accessible
                element so a screen reader gets the whole story in one pass. */}
            {feelSummary && (
              <>
                <Text style={s.sectionLabel}>How training felt</Text>
                <View
                  style={s.block}
                  accessible={true}
                  accessibilityLabel={`How training felt. ${feelSummary.line}.${feelSummary.heavy ? ' Heavy week — consider easing volume.' : ''}`}
                >
                  <View style={s.blockRow}>
                    <Ionicons name="pulse-outline" size={18} color={feelSummary.heavy ? CoachColors.warning : CoachColors.accent} />
                    <Text style={s.blockRowText}>{feelSummary.line}</Text>
                  </View>
                  {feelSummary.heavy && (
                    <>
                      <View style={s.blockDivider} />
                      <View style={s.blockRow}>
                        <Ionicons name="alert-circle-outline" size={18} color={CoachColors.warning} />
                        <Text style={[s.blockRowText, { color: CoachColors.warning }]}>Heavy week — consider easing volume</Text>
                      </View>
                    </>
                  )}
                </View>
              </>
            )}

            {/* Nutrition — real meal logs vs the assigned plan, last 7 days */}
            {nutrition && (
              <>
                <Text style={s.sectionLabel}>Nutrition, last 7 days</Text>
                {nutrition.daysLogged === 0 ? (
                  <View style={s.block}>
                    <View style={s.blockRow}>
                      <Ionicons name="nutrition-outline" size={18} color={CoachColors.textSecondary} />
                      <Text style={s.blockRowLabel}>
                        {activeDietPlan ? 'No meals logged this week' : 'No diet plan assigned, no meals logged'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={s.block}>
                    <View style={s.blockRow}>
                      <Ionicons name="nutrition-outline" size={18} color={CoachColors.accent} />
                      <Text style={s.blockRowLabel}>Days logged</Text>
                      <Text style={s.blockRowValue}>{nutrition.daysLogged} of 7</Text>
                    </View>
                    {nutrition.swapCount > 0 && (
                      <>
                        <View style={s.blockDivider} />
                        <View style={s.blockRow}>
                          <Ionicons name="swap-horizontal-outline" size={18} color={CoachColors.textSecondary} />
                          <Text style={s.blockRowLabel}>Swaps used</Text>
                          <Text style={s.blockRowValue}>{nutrition.swapCount}</Text>
                        </View>
                      </>
                    )}
                    {nutrition.dayRows.map((d) => (
                      <View key={d.key}>
                        <View style={s.blockDivider} />
                        <View style={s.nutriDayRow}>
                          <Text style={s.nutriDayLabel}>{d.label}</Text>
                          <Text style={s.nutriDayVal}>
                            {nutrition.plannedPerDay
                              ? `${d.logged.toLocaleString()} / ${nutrition.plannedPerDay.toLocaleString()} kcal`
                              : `${d.logged.toLocaleString()} kcal logged`}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {/* Next Session */}
            <Text style={s.sectionLabel}>Upcoming Session</Text>
            {upcomingSessions.length > 0 ? (() => {
              const sess = upcomingSessions[0];
              const dt   = new Date(sess.date);
              const daysUntil = Math.ceil((dt.getTime()-Date.now())/86400000);
              return (
                <TouchableOpacity
                  style={s.sessionCard}
                  onPress={() => router.push(`/book-session?clientId=${client.id}` as any)}
                  activeOpacity={0.8}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`${sess.type}, ${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, ${sess.duration} minutes, ${daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`}. Double tap to manage booking`}
                >
                  <View style={s.sessionDateCol}>
                    <Text style={s.sessionDay}>{dt.toLocaleDateString('en-US',{weekday:'short'}).toUpperCase()}</Text>
                    <Text style={s.sessionDayNum}>{dt.getDate()}</Text>
                    <Text style={s.sessionMonth}>{dt.toLocaleDateString('en-US',{month:'short'}).toUpperCase()}</Text>
                  </View>
                  <View style={s.sessionInfo}>
                    <Text style={s.sessionType}>{sess.type}</Text>
                    <Text style={s.sessionTime}>{dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} · {sess.duration} min</Text>
                    <Text style={[s.sessionCountdown, daysUntil===0 && {color:CoachColors.accent}]}>
                      {daysUntil===0 ? 'Today' : daysUntil===1 ? 'Tomorrow' : `In ${daysUntil} days`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={CoachColors.textFaint} />
                </TouchableOpacity>
              );
            })() : (
              <TouchableOpacity style={s.emptyRow} onPress={() => router.push(`/book-session?clientId=${client.id}` as any)} activeOpacity={0.7}>
                <Text style={s.emptyRowText}>No upcoming sessions</Text>
                <Text style={s.emptyRowCta}>Book one →</Text>
              </TouchableOpacity>
            )}

            {/* Last Message */}
            <Text style={s.sectionLabel}>Messages</Text>
            <TouchableOpacity
              style={s.messageRow}
              onPress={startConversation}
              activeOpacity={0.7}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={lastMessage
                ? `Last message, ${lastMessage.text}, ${lastMessage.time}${clientUnread > 0 ? `, ${clientUnread} unread` : ''}. Double tap to open conversation`
                : 'Start conversation'}
            >
              <View style={s.messageAvatarWrap}>
                <Avatar name={client.name} size="sm" imageUrl={client.avatar_url} />
                {clientUnread > 0 && <View style={s.msgBadge}><Text style={s.msgBadgeText}>{clientUnread}</Text></View>}
              </View>
              <View style={{ flex: 1 }}>
                {lastMessage
                  ? <><Text style={s.messageText} numberOfLines={1}>{lastMessage.text}</Text><Text style={s.messageTime}>{lastMessage.time}</Text></>
                  : <Text style={s.messageEmpty}>Start conversation →</Text>
                }
              </View>
              <Ionicons name="chevron-forward" size={16} color={CoachColors.textFaint} />
            </TouchableOpacity>

            {/* Contact */}
            {(client.email || client.phone) && (
              <>
                <Text style={s.sectionLabel}>Contact</Text>
                <View style={s.block}>
                  {client.phone && (
                    <TouchableOpacity style={s.blockRow} onPress={() => Linking.openURL(`tel:${client.phone}`)} activeOpacity={0.7}>
                      <Ionicons name="call-outline" size={18} color={CoachColors.textSecondary} />
                      <Text style={s.blockRowText}>{formatPhone(client.phone)}</Text>
                      <Ionicons name="chevron-forward" size={14} color={CoachColors.textFaint} />
                    </TouchableOpacity>
                  )}
                  {client.email && client.phone && <View style={s.blockDivider} />}
                  {client.email && (
                    <TouchableOpacity style={s.blockRow} onPress={() => Linking.openURL(`mailto:${client.email}`)} activeOpacity={0.7}>
                      <Ionicons name="mail-outline" size={18} color={CoachColors.textSecondary} />
                      <Text style={s.blockRowText} numberOfLines={1}>{client.email}</Text>
                      <Ionicons name="chevron-forward" size={14} color={CoachColors.textFaint} />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {/* Assessment */}
            {client.assessment_data && Object.keys(client.assessment_data).length > 0 ? (() => {
              const d = client.assessment_data;
              const fitnessGoals: string[] = d.fitness_goals || (d.fitness_goal ? [d.fitness_goal] : []);
              const trainingStyles: string[] = d.training_styles || [];
              const activities: string[] = d.activities || [];
              const commitDays: number = d.commit_days || d.weekly_workout_goal || 0;

              return (
                <>
                  {(d.weight || d.height || d.age || d.gender) && (
                    <>
                      <Text style={s.sectionLabel}>Body Stats</Text>
                      <View style={s.block}>
                        {[
                          d.weight && { icon: 'scale-outline',    label: 'Weight', val: String(typeof d.weight==='object'?d.weight.value:d.weight) },
                          d.height && { icon: 'resize-outline',   label: 'Height', val: String(typeof d.height==='object'?d.height.value:d.height) },
                          d.age    && { icon: 'calendar-outline', label: 'Age',    val: String(d.age) },
                          d.gender && { icon: 'person-outline',   label: 'Gender', val: String(d.gender) },
                        ].filter(Boolean).map((row: any, i, arr) => (
                          <View key={row.label}>
                            <View style={s.blockRow}>
                              <Ionicons name={row.icon} size={18} color={CoachColors.textSecondary} />
                              <Text style={s.blockRowLabel}>{row.label}</Text>
                              <Text style={s.blockRowValue}>{row.val}</Text>
                            </View>
                            {i < arr.length-1 && <View style={s.blockDivider} />}
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  {fitnessGoals.length > 0 && (
                    <>
                      <Text style={s.sectionLabel}>Goals</Text>
                      <View style={s.chipWrap}>
                        {fitnessGoals.map((g,i) => (
                          <View key={i} style={s.chip}><Text style={s.chipText}>{g}</Text></View>
                        ))}
                      </View>
                    </>
                  )}

                  {commitDays > 0 && (
                    <>
                      <Text style={s.sectionLabel}>Weekly Commitment</Text>
                      <View style={s.commitRow}>
                        {[1,2,3,4,5,6,7].map(day => (
                          <View key={day} style={[s.commitBar, day <= commitDays && s.commitBarActive]} />
                        ))}
                        <Text style={s.commitText}>{commitDays}× per week</Text>
                      </View>
                    </>
                  )}

                  {trainingStyles.length > 0 && (
                    <>
                      <Text style={s.sectionLabel}>Training Style</Text>
                      <View style={s.chipWrap}>
                        {trainingStyles.map((ts,i) => (
                          <View key={i} style={s.chip}><Text style={s.chipText}>{ts}</Text></View>
                        ))}
                      </View>
                    </>
                  )}

                  {activities.length > 0 && (
                    <>
                      <Text style={s.sectionLabel}>Activities</Text>
                      <View style={s.chipWrap}>
                        {activities.map((a,i) => (
                          <View key={i} style={s.chip}><Text style={s.chipText}>{a}</Text></View>
                        ))}
                      </View>
                    </>
                  )}
                </>
              );
            })() : (
              <View style={s.emptyBlock}>
                <Text style={s.emptyBlockTitle}>No assessment yet</Text>
                <Text style={s.emptyBlockSub}>Client hasn't completed their onboarding profile.</Text>
              </View>
            )}

            {client.goals && (
              <>
                <Text style={s.sectionLabel}>Client Goals</Text>
                <View style={s.notesWrap}><Text style={s.notesText}>{client.goals}</Text></View>
              </>
            )}
          </Animated.View>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: HEALTH
        ══════════════════════════════════════════════════ */}
        {activeTab === 'health' && (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(280)} style={s.tabBody}>
            <ClientHabitGrid clientId={id || ''} />

            {healthSnapshot ? (
              <>
                <Text style={s.sectionLabel}>Today's Metrics</Text>
                <View style={s.block}>
                  {[
                    { icon: 'footsteps-outline',  label: 'Steps',          value: (healthSnapshot.steps||0).toLocaleString() },
                    { icon: 'heart-outline',       label: 'Avg Heart Rate', value: healthSnapshot.heart_rate_avg ? `${healthSnapshot.heart_rate_avg} bpm` : '—' },
                    { icon: 'pulse-outline',       label: 'Resting HR',     value: healthSnapshot.resting_heart_rate ? `${healthSnapshot.resting_heart_rate} bpm` : '—' },
                    { icon: 'water-outline',       label: 'Blood Oxygen',   value: healthSnapshot.blood_oxygen ? `${healthSnapshot.blood_oxygen}%` : '—' },
                    { icon: 'analytics-outline',   label: 'Blood Pressure', value: (healthSnapshot.blood_pressure_systolic && healthSnapshot.blood_pressure_diastolic) ? `${healthSnapshot.blood_pressure_systolic}/${healthSnapshot.blood_pressure_diastolic} mmHg` : '—' },
                  ].map((row, i, arr) => (
                    <View key={row.label}>
                      <View style={s.blockRow}>
                        <Ionicons name={row.icon as any} size={18} color={CoachColors.textSecondary} />
                        <Text style={s.blockRowLabel}>{row.label}</Text>
                        <Text style={s.blockRowValue}>{row.value}</Text>
                      </View>
                      {i < arr.length-1 && <View style={s.blockDivider} />}
                    </View>
                  ))}
                </View>
                <Text style={s.syncNote}>Synced {healthSnapshot.synced_at ? new Date(healthSnapshot.synced_at).toLocaleDateString() : 'N/A'}</Text>
              </>
            ) : (
              <BoltEmptyState
                pose="help"
                title="Health data not shared"
                subtitle="Ask the client to connect Apple Health or Google Fit."
                actionLabel={!(client as any).health_sharing_requested ? "Request Health Access" : "Request pending…"}
                onAction={!(client as any).health_sharing_requested ? async () => {
                  try { await requestHealthAccess(client.id); showAlert({ type: 'success', title: 'Request Sent', message: `Sent to ${client.name}.` }); }
                  catch { showAlert({ type: 'error', title: 'Error', message: 'Failed to send request.' }); }
                } : undefined}
              />
            )}
          </Animated.View>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: PROGRAMS
        ══════════════════════════════════════════════════ */}
        {activeTab === 'programs' && (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(280)} style={s.tabBody}>

            {/* Active Plan */}
            <Text style={s.sectionLabel}>Current Program</Text>
            {(() => {
              const activePlan = plans.find(p => p.id === client.plan_id);
              if (!activePlan) return (
                <BoltEmptyState
                  pose="welcome"
                  title="Not enrolled in a program"
                  subtitle="Assign a program to structure their training."
                  actionLabel="Enroll now →"
                  onAction={() => setAssignMode('enroll')}
                />
              );
              const nodes  = activePlan.track || [];
              const wCount = nodes.filter(n => n.type === 'workout').length;
              const dCount = nodes.filter(n => n.type === 'diet').length;
              const billing = new Date(client.created_at);
              while (billing < new Date()) billing.setDate(billing.getDate()+30);
              return (
                <View style={s.block}>
                  <View style={s.blockRow}>
                    <Ionicons name="ribbon-outline" size={18} color={CoachColors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.blockRowText}>{activePlan.name}</Text>
                      <Text style={s.blockRowSub}>{wCount} workouts · {dCount} diets · ${activePlan.price}/{activePlan.period==='monthly'?'mo':activePlan.period}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setAssignMode('enroll')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={s.changeLink}>Change</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.blockDivider} />
                  <View style={s.blockRow}>
                    <Ionicons name="card-outline" size={18} color={CoachColors.textSecondary} />
                    <Text style={s.blockRowLabel}>Next billing</Text>
                    <Text style={s.blockRowValue}>{billing.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</Text>
                  </View>
                </View>
              );
            })()}

            {/* Track */}
            {(() => {
              const activePlan = plans.find(p => p.id === client.plan_id);
              if (!activePlan?.track?.length) return null;
              return (
                <>
                  <Text style={s.sectionLabel}>Program Track</Text>
                  <View style={s.block}>
                    {activePlan.track.sort((a,b) => a.order-b.order).slice(0,6).map((node, i, arr) => {
                      const w = workouts.find(w => w.id === node.id);
                      const d = diets.find(d => d.id === node.id);
                      const color = node.type==='workout' ? CoachColors.accent : node.type==='diet' ? CoachColors.textSecondary : CoachColors.accent;
                      const icon  = node.type==='workout' ? 'barbell-outline' : node.type==='diet' ? 'nutrition-outline' : 'flag-outline';
                      const name  = w?.name || d?.name || node.label || 'Milestone';
                      return (
                        <View key={i}>
                          <View style={s.blockRow}>
                            <Ionicons name={icon as any} size={18} color={color} />
                            <View style={{ flex: 1 }}>
                              <Text style={s.blockRowText}>{name}</Text>
                              <Text style={s.blockRowSub}>Step {node.order+1}</Text>
                            </View>
                          </View>
                          {i < arr.length-1 && <View style={s.blockDivider} />}
                        </View>
                      );
                    })}
                    {activePlan.track.length > 6 && (
                      <TouchableOpacity style={s.viewAllRow} onPress={() => router.push(`/plan/${activePlan.id}` as any)}>
                        <Text style={s.viewAllText}>View all {activePlan.track.length} items</Text>
                        <Ionicons name="chevron-forward" size={13} color={CoachColors.accent} />
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              );
            })()}

            {/* Bonus Workouts */}
            {assignedWorkouts.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Bonus Workouts</Text>
                <View style={s.block}>
                  {assignedWorkouts.map((item, i) => (
                    <View key={item.assignment.id}>
                      <TouchableOpacity style={s.blockRow} onPress={() => router.push(`/workout/${item.workout.id}` as any)} activeOpacity={0.7}>
                        <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="barbell-outline" size={16} color={CoachColors.textSecondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.blockRowText}>{item.workout.name}</Text>
                          <Text style={s.blockRowSub}>{item.workout.workout_exercises?.length || 0} exercises</Text>
                        </View>
                        <Text style={[s.statusTag, item.assignment.status==='completed' ? s.tagDone : s.tagPending]}>{item.assignment.status}</Text>
                      </TouchableOpacity>
                      {i < assignedWorkouts.length-1 && <View style={s.blockDivider} />}
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Diets */}
            {assignedDiets.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Diet Plans</Text>
                <View style={s.block}>
                  {assignedDiets.map((item, i) => (
                    <View key={item.assignment.id}>
                      <TouchableOpacity style={s.blockRow} onPress={() => router.push(`/diet/${item.diet.id}` as any)} activeOpacity={0.7}>
                        <Ionicons name="nutrition-outline" size={18} color={CoachColors.textSecondary} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.blockRowText}>{item.diet.name}</Text>
                          <Text style={s.blockRowSub}>{item.diet.diet_plan_meals?.length || 0} meals</Text>
                        </View>
                        <Text style={[s.statusTag, item.assignment.status==='completed' ? s.tagDone : s.tagPending]}>{item.assignment.status}</Text>
                      </TouchableOpacity>
                      {i < assignedDiets.length-1 && <View style={s.blockDivider} />}
                    </View>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity style={s.addBtn} onPress={() => setAssignMode('enroll')} activeOpacity={0.7}>
              <Ionicons name="add" size={17} color={CoachColors.accent} />
              <Text style={s.addBtnText}>Assign workout or diet plan</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ══════════════════════════════════════════════════
            TAB: PROGRESS
        ══════════════════════════════════════════════════ */}
        {activeTab === 'progress' && (
          <Animated.View entering={reduced ? undefined : FadeInDown.duration(280)} style={s.tabBody}>

            {/* Weight chart */}
            {weightChartData.length >= 2 && (
              <>
                <View style={s.sectionHeaderRow}>
                  <Text style={s.sectionLabel}>Weight</Text>
                  <TouchableOpacity onPress={() => router.push(`/client/${client.id}/progress` as any)}>
                    <Text style={s.seeAll}>Full history →</Text>
                  </TouchableOpacity>
                </View>
                <View style={s.chartBlock}>
                  <View style={s.chartTopRow}>
                    <Text style={s.chartBigNum}>{weightChartData[weightChartData.length-1].value} lbs</Text>
                    {weightDelta !== null && (
                      <View style={[s.deltaBadge, { backgroundColor: Number(weightDelta)<=0 ? CoachColors.accentSoft : CoachColors.dangerSoft }]}>
                        <Text style={[s.deltaBadgeText, { color: Number(weightDelta)<=0 ? CoachColors.accent : CoachColors.danger }]}>
                          {Number(weightDelta)>=0 ? '+' : ''}{weightDelta} lbs
                        </Text>
                      </View>
                    )}
                  </View>
                  <LineChart
                    data={weightChartData}
                    // A new weight log arriving over realtime (AppContext
                    // client_progress subscription) redraws the line animated
                    // instead of snapping to the new point.
                    animateOnDataChange
                    onDataChangeAnimationDuration={600}
                    width={W - 64}
                    height={96}
                    spacing={Math.max(28, Math.floor((W-80)/weightChartData.length))}
                    initialSpacing={12}
                    color={CoachColors.accent}
                    thickness={2}
                    dataPointsColor={CoachColors.accent}
                    dataPointsRadius={3}
                    hideRules
                    hideYAxisText
                    xAxisColor={CoachColors.borderMuted}
                    yAxisColor="transparent"
                    xAxisLabelTextStyle={{ color: CoachColors.textFaint, fontSize: 9, fontFamily: CoachFonts.body }}
                    startFillColor={CoachColors.accentSoft}
                    endFillColor="transparent"
                    areaChart
                    pointerConfig={{
                      pointerStripHeight: 80,
                      pointerStripColor: CoachColors.borderMuted,
                      pointerStripWidth: 1,
                      pointerColor: CoachColors.accent,
                      radius: 5,
                      pointerLabelWidth: 72,
                      pointerLabelHeight: 28,
                      pointerLabelComponent: (items: any[]) => (
                        <View style={{ backgroundColor: CoachColors.surface, padding: 5, borderRadius: 6 }}>
                          <Text style={{ color: CoachColors.textPrimary, fontSize: 11, fontFamily: CoachFonts.bodySemiBold }}>{items[0]?.value} lbs</Text>
                        </View>
                      ),
                    }}
                  />
                </View>
              </>
            )}

            {/* Progress photos */}
            {(() => {
              const photologs = progressLogs.filter((p: any) => p.photos?.length > 0).sort((a:any,b:any) => new Date(a.date).getTime()-new Date(b.date).getTime());
              if (!photologs.length) return null;
              return (
                <>
                  <Text style={s.sectionLabel}>Progress Photos</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {photologs.map((log: any, idx: number) => {
                      const isLatest = idx === photologs.length-1;
                      return (
                        <TouchableOpacity
                          key={log.id}
                          style={s.photoThumb}
                          onPress={() => setViewerPhoto(log.photos[0])}
                          activeOpacity={0.85}
                          accessible={true}
                          accessibilityRole="button"
                          accessibilityLabel={`Progress photo, ${new Date(log.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${log.weight ? `, ${Number(log.weight).toFixed(0)} pounds` : ''}${isLatest ? ', latest' : ''}. Double tap to view full screen`}
                        >
                          <EImage source={{ uri: log.photos[0] }} style={s.photoThumbImg} contentFit="cover" transition={200} />
                          <LinearGradient colors={['transparent','rgba(0,0,0,0.85)']} style={s.photoGrad} />
                          <View style={s.photoFooter}>
                            <Text style={s.photoDate}>{new Date(log.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</Text>
                            {log.weight ? <Text style={s.photoWeight}>{Number(log.weight).toFixed(0)} lbs</Text> : null}
                          </View>
                          {isLatest && <View style={s.photoLatest}><Text style={s.photoLatestText}>LATEST</Text></View>}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              );
            })()}

            {/* Logs */}
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionLabel}>Check-ins</Text>
              <TouchableOpacity onPress={() => router.push(`/client/${client.id}/log-progress` as any)}>
                <Text style={s.seeAll}>+ Add</Text>
              </TouchableOpacity>
            </View>
            {progressLogs.length === 0 ? (
              <View style={s.emptyBlock}>
                <Text style={s.emptyBlockTitle}>No check-ins yet</Text>
                <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={s.emptyBlockBtn} onPress={() => router.push(`/client/${client.id}/log-progress` as any)}>
                  <Text style={s.emptyBlockBtnText}>Log First Check-In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.block}>
                {progressLogs.slice(0,6).map((log, i) => (
                  <View key={log.id}>
                    <TouchableOpacity style={s.blockRow} onPress={() => router.push(`/client/${client.id}/progress` as any)} activeOpacity={0.7}>
                      <View style={s.logDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.blockRowText}>{log.weight ? `${log.weight} lbs` : 'Check-in'}</Text>
                        <Text style={s.blockRowSub}>{new Date(log.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</Text>
                      </View>
                      {(log as any).photos?.length > 0 && <Ionicons name="camera-outline" size={15} color={CoachColors.textMuted} />}
                      <Ionicons name="chevron-forward" size={14} color={CoachColors.textFaint} />
                    </TouchableOpacity>
                    {i < Math.min(progressLogs.length,6)-1 && <View style={s.blockDivider} />}
                  </View>
                ))}
                {progressLogs.length > 6 && (
                  <TouchableOpacity style={s.viewAllRow} onPress={() => router.push(`/client/${client.id}/progress` as any)}>
                    <Text style={s.viewAllText}>View all {progressLogs.length} check-ins</Text>
                    <Ionicons name="chevron-forward" size={13} color={CoachColors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Sessions */}
            <Text style={s.sectionLabel}>Recent Sessions</Text>
            {sessions.length > 0 ? (
              <View style={s.block}>
                {sessions.slice(0,5).map((session, i) => {
                  const dt = new Date(session.date);
                  const sc = session.status==='completed' ? CoachColors.accent : session.status==='cancelled' ? CoachColors.danger : CoachColors.textSecondary;
                  return (
                    <View key={session.id}>
                      <View style={s.blockRow}>
                        <View style={[s.sessionDot, { backgroundColor: sc }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.blockRowText}>{dt.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</Text>
                          <Text style={s.blockRowSub}>{dt.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} · {session.type} · {session.duration}m</Text>
                        </View>
                        <Text style={[s.statusTag, session.status==='completed' ? s.tagDone : session.status==='cancelled' ? s.tagCancelled : s.tagPending]}>
                          {session.status}
                        </Text>
                      </View>
                      {i < Math.min(sessions.length,5)-1 && <View style={s.blockDivider} />}
                    </View>
                  );
                })}
              </View>
            ) : (
              <TouchableOpacity style={s.emptyBlock} onPress={() => router.push(`/book-session?clientId=${client.id}` as any)} activeOpacity={0.7}>
                <Text style={s.emptyBlockTitle}>No sessions yet</Text>
                <Text style={s.emptyBlockCta}>Book first session →</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}
      </ScrollView>

      {/* ── Photo Viewer ── */}
      <Modal visible={!!viewerPhoto} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewerPhoto(null)}>
        <View style={s.photoViewerBg}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setViewerPhoto(null)} activeOpacity={1} />
          {viewerPhoto && <EImage source={{ uri: viewerPhoto }} style={s.photoViewerImg} contentFit="contain" />}
          <TouchableOpacity style={s.photoViewerClose} onPress={() => setViewerPhoto(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Close photo">
            <Ionicons name="close" size={20} color={CoachColors.textPrimary} />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Assign Modal ── */}
      <Modal visible={assignMode !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setAssignMode(null); setShowQuickAdd(false); }}>
        <SafeAreaView style={[s.root, { backgroundColor: CoachColors.bg }]}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => { setAssignMode(null); setShowQuickAdd(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <Text style={s.modalNavTitle}>
              {assignMode==='enroll' ? 'Enroll in Program' : `Assign ${assignMode==='workout'?'Workout':'Diet Plan'}`}
            </Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
            {assignMode === 'enroll' && (
              <>
                <Text style={s.modalHint}>Select a program to enroll {client.name}.</Text>
                {plans.length === 0 ? (
                  <View style={s.emptyBlock}>
                    <Text style={s.emptyBlockTitle}>No programs yet</Text>
                    <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={s.emptyBlockBtn} onPress={() => { setAssignMode(null); dismissThenGo('/create-plan'); }}>
                      <Text style={s.emptyBlockBtnText}>Create Program</Text>
                    </TouchableOpacity>
                  </View>
                ) : plans.map(plan => {
                  const isActive = client.plan_id === plan.id;
                  const wC = plan.track?.filter(n => n.type==='workout').length || 0;
                  const dC = plan.track?.filter(n => n.type==='diet').length || 0;
                  return (
                    <TouchableOpacity key={plan.id} style={[s.modalPlanRow, isActive && s.modalPlanRowActive]} activeOpacity={0.8}
                      onPress={async () => {
                        if (isActive) return;
                        try { await upgradeClientToPlan(client.id, plan.id); setAssignMode(null); showAlert({ type: 'success', title: 'Enrolled!', message: `${client.name} is now on ${plan.name}.` }); }
                        catch (err: any) { showAlert({ type: 'error', title: 'Error', message: err.message||'Failed' }); }
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.modalPlanName}>{plan.name}</Text>
                        <Text style={s.modalPlanMeta}>${plan.price}/{plan.period==='monthly'?'mo':plan.period}{wC>0?` · ${wC}w`:''}{dC>0?`+${dC}d`:''}</Text>
                      </View>
                      {isActive
                        ? <Text style={s.activePlanTag}>Active</Text>
                        : <Text style={s.enrollTag}>Enroll →</Text>}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={s.quickAddToggle} onPress={() => setShowQuickAdd(!showQuickAdd)} activeOpacity={0.7}>
                  <Text style={s.quickAddToggleText}>Quick-assign individual item</Text>
                  <Ionicons name={showQuickAdd ? 'chevron-up' : 'chevron-down'} size={14} color={CoachColors.textMuted} />
                </TouchableOpacity>
                {showQuickAdd && (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[s.quickAddBtn, { flex: 1 }]} onPress={() => setAssignMode('workout')} activeOpacity={0.8}>
                      <Ionicons name="barbell-outline" size={17} color={CoachColors.accent} />
                      <Text style={s.quickAddBtnText}>Workout</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.quickAddBtn, { flex: 1 }]} onPress={() => setAssignMode('diet')} activeOpacity={0.8}>
                      <Ionicons name="nutrition-outline" size={17} color={CoachColors.textSecondary} />
                      <Text style={s.quickAddBtnText}>Diet Plan</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
            {(assignMode === 'workout' || assignMode === 'diet') && (
              <>
                <TouchableOpacity style={s.quickAddBtn} onPress={() => { const m=assignMode; setAssignMode(null); dismissThenGo(m==='workout'?'/create-workout':'/create-diet'); }} activeOpacity={0.8}>
                  <Ionicons name="add" size={18} color={CoachColors.accent} />
                  <Text style={s.quickAddBtnText}>Create new {assignMode==='workout'?'workout':'diet plan'}</Text>
                </TouchableOpacity>
                {(assignMode==='workout'?workouts:diets).map((item: any) => {
                  const isW = assignMode==='workout';
                  const taken = isW
                    ? assignedWorkouts.some(aw => aw.workout.id===item.id && aw.assignment.status==='assigned')
                    : assignedDiets.some(ad => ad.diet.id===item.id && ad.assignment.status==='assigned');
                  return (
                    <TouchableOpacity key={item.id} style={[s.modalPlanRow, { opacity: taken ? 0.45 : 1 }]}
                      onPress={() => !taken && handleAssign(item.id)} disabled={taken} activeOpacity={0.7}>
                      <Ionicons name={isW ? 'barbell-outline' : 'nutrition-outline'} size={18} color={isW ? CoachColors.accent : CoachColors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.modalPlanName}>{item.name}</Text>
                        <Text style={s.modalPlanMeta}>{isW ? `${item.workout_exercises?.length||0} exercises` : `${item.diet_plan_meals?.length||0} meals`}</Text>
                      </View>
                      {taken ? <Text style={s.activePlanTag}>Assigned</Text> : <Text style={s.enrollTag}>Add →</Text>}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity style={{ flexDirection:'row', alignItems:'center', gap:6, paddingVertical:14, justifyContent:'center' }} onPress={() => setAssignMode('enroll')} activeOpacity={0.7}>
                  <Ionicons name="arrow-back" size={14} color={CoachColors.textMuted} />
                  <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textMuted }}>Back to programs</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Upgrade Modal ── */}
      <Modal visible={showUpgradeModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowUpgradeModal(false)}>
        <SafeAreaView style={[s.root, { backgroundColor: CoachColors.bg }]}>
          <View style={s.modalNav}>
            <TouchableOpacity onPress={() => setShowUpgradeModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={22} color={CoachColors.textPrimary} /></TouchableOpacity>
            <Text style={s.modalNavTitle}>Choose a Plan</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text style={s.modalHint}>Upgrade {client.name} from trial to a full membership.</Text>
            {plans.length === 0 ? (
              <View style={s.emptyBlock}>
                <Text style={s.emptyBlockTitle}>No plans yet</Text>
                <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={s.emptyBlockBtn} onPress={() => { setShowUpgradeModal(false); dismissThenGo('/create-plan'); }}>
                  <Text style={s.emptyBlockBtnText}>Create Plan</Text>
                </TouchableOpacity>
              </View>
            ) : plans.map(plan => (
              <TouchableOpacity key={plan.id} style={s.modalPlanRow} activeOpacity={0.8}
                onPress={async () => {
                  try { await upgradeClientToPlan(client.id, plan.id); setShowUpgradeModal(false); showAlert({ type: 'success', title: 'Upgraded!', message: `${client.name} is now on ${plan.name}.` }); }
                  catch (err: any) { showAlert({ type: 'error', title: 'Error', message: err.message||'Failed' }); }
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.modalPlanName}>{plan.name}</Text>
                  <Text style={s.modalPlanMeta}>${plan.price} / {plan.period==='monthly'?'month':plan.period}</Text>
                </View>
                <Text style={s.enrollTag}>Select →</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Check-in question editor — in-screen overlay, not a native Modal ── */}
      {showCqEditor && (
        <View style={s.cqOverlay}>
          <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <View style={s.cqHeader}>
                <TouchableOpacity
                  onPress={() => (cqEditing !== null ? setCqEditing(null) : setShowCqEditor(false))}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={cqEditing !== null ? 'Back to question list' : 'Close'}
                >
                  <Ionicons name={cqEditing !== null ? 'chevron-back' : 'close'} size={24} color={CoachColors.textPrimary} />
                </TouchableOpacity>
                <Text style={s.cqTitle} numberOfLines={1}>
                  {cqEditing === null ? 'Check-in questions' : cqEditing === 'new' ? 'New question' : 'Edit question'}
                </Text>
                {cqEditing === null ? (
                  <TouchableOpacity onPress={saveCheckinQuestions} disabled={cqSaving} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={[s.cqSaveLink, cqSaving && { color: CoachColors.textFaint }]}>{cqSaving ? 'Saving…' : 'Save'}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 40 }} />
                )}
              </View>

              <ScrollView contentContainerStyle={s.cqBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {cqEditing === null ? (
                  <>
                    <Text style={s.cqHint}>
                      Asked in {toTitleCase(client.name).split(' ')[0]}'s weekly check-in, in your name.
                    </Text>

                    {cqList.length === 0 && (
                      <View style={s.emptyBlock}>
                        <Text style={s.emptyBlockTitle}>No custom questions yet</Text>
                        <Text style={s.emptyBlockSub}>
                          The standard four ratings run each week until you write questions here. Anything you add replaces them for this client only.
                        </Text>
                      </View>
                    )}

                    {cqList.map((q, i) => (
                      <View key={q.id} style={s.cqRow}>
                        <TouchableOpacity style={{ flex: 1 }} onPress={() => openQForm(i)} activeOpacity={0.7}>
                          <Text style={s.cqRowPrompt}>{q.prompt}</Text>
                          {!!q.context && <Text style={s.cqRowContext} numberOfLines={1}>{q.context}</Text>}
                          <Text style={s.cqRowMeta}>{questionMeta(q)}</Text>
                        </TouchableOpacity>
                        <View style={s.cqRowActions}>
                          <TouchableOpacity onPress={() => moveQuestion(i, -1)} disabled={i === 0} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel="Move up">
                            <Ionicons name="chevron-up" size={18} color={i === 0 ? CoachColors.borderMuted : CoachColors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => moveQuestion(i, 1)} disabled={i === cqList.length - 1} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel="Move down">
                            <Ionicons name="chevron-down" size={18} color={i === cqList.length - 1 ? CoachColors.borderMuted : CoachColors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => removeQuestion(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel="Remove question">
                            <Ionicons name="trash-outline" size={16} color={CoachColors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}

                    <TouchableOpacity style={s.addBtn} onPress={() => openQForm('new')} activeOpacity={0.7}>
                      <Ionicons name="add" size={17} color={CoachColors.accent} />
                      <Text style={s.addBtnText}>Add question</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={s.cqFieldLabel}>Question</Text>
                    <TextInput
                      style={s.cqInput}
                      value={qPrompt}
                      onChangeText={setQPrompt}
                      placeholder="How are the knees holding up?"
                      placeholderTextColor={CoachColors.textFaint}
                      multiline
                    />

                    <Text style={s.cqFieldLabel}>Why you're asking (optional)</Text>
                    <TextInput
                      style={s.cqInput}
                      value={qContext}
                      onChangeText={setQContext}
                      placeholder="Shown under the question so it doesn't feel random"
                      placeholderTextColor={CoachColors.textFaint}
                      multiline
                    />

                    <Text style={s.cqFieldLabel}>Answer type</Text>
                    <View style={s.cqTypeRow}>
                      {Q_TYPES.map((t) => (
                        <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                          key={t.key}
                          style={[s.cqTypeChip, qType === t.key && s.cqTypeChipActive]}
                          onPress={() => setQType(t.key)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel={`${t.label} — ${t.hint}`}
                        >
                          <Text style={[s.cqTypeChipText, qType === t.key && s.cqTypeChipTextActive]}>{t.label}</Text>
                          <Text style={s.cqTypeChipHint}>{t.hint}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {qType === 'choice' && (
                      <>
                        <Text style={s.cqFieldLabel}>Options, one per line</Text>
                        <TextInput
                          style={[s.cqInput, { minHeight: 88 }]}
                          value={qOptions}
                          onChangeText={setQOptions}
                          placeholder={'Fine\nAchy\nBad'}
                          placeholderTextColor={CoachColors.textFaint}
                          multiline
                        />
                      </>
                    )}

                    {qType === 'scale' && (
                      <View style={s.cqScaleRow}>
                        {[
                          { label: 'Min',  value: qMin,  set: setQMin  },
                          { label: 'Max',  value: qMax,  set: setQMax  },
                          { label: 'Step', value: qStep, set: setQStep },
                        ].map((f) => (
                          <View key={f.label} style={{ flex: 1 }}>
                            <Text style={s.cqFieldLabel}>{f.label}</Text>
                            <TextInput
                              style={s.cqInput}
                              value={f.value}
                              onChangeText={(t) => f.set(t.replace(/[^0-9.\-]/g, ''))}
                              keyboardType="decimal-pad"
                              placeholderTextColor={CoachColors.textFaint}
                            />
                          </View>
                        ))}
                        <View style={{ flex: 1.4 }}>
                          <Text style={s.cqFieldLabel}>Unit (optional)</Text>
                          <TextInput
                            style={s.cqInput}
                            value={qUnit}
                            onChangeText={setQUnit}
                            placeholder="hours"
                            placeholderTextColor={CoachColors.textFaint}
                          />
                        </View>
                      </View>
                    )}

                    <TouchableOpacity style={s.cqCommitBtn} onPress={commitQuestion} activeOpacity={0.85}>
                      <Text style={s.cqCommitBtnText}>{cqEditing === 'new' ? 'Add to list' : 'Update question'}</Text>
                    </TouchableOpacity>
                    <Text style={s.cqFormHint}>Nothing is sent until you save the list.</Text>
                  </>
                )}
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: CoachColors.bg },
  scrollContent: { paddingBottom: 100 },

  // NAV
  nav:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  navTitle:      { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, flex: 1, textAlign: 'center' },

  // HERO
  hero:          { alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 20, gap: 10 },
  heroName:      { fontFamily: CoachFonts.headingBold, fontSize: 30, color: CoachColors.textPrimary, letterSpacing: -0.5, marginTop: 8 },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot:     { width: 7, height: 7, borderRadius: 3.5 },
  heroStatusText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textSecondary },
  heroDivider:   { fontSize: 13, color: CoachColors.textFaint, fontFamily: CoachFonts.body },

  // STAT ROW (Strava-style)
  // Demoted: smaller and quieter than the attention banner above it.
  statRow:       { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 2, marginBottom: 2 },
  statBlock:     { flex: 1, alignItems: 'center', gap: 3 },
  statNum:       { fontFamily: CoachFonts.headingSemiBold, fontSize: 19, color: CoachColors.textSecondary, letterSpacing: -0.5 },
  statLabel:     { fontFamily: CoachFonts.body, fontSize: 10.5, color: CoachColors.textFaint, textAlign: 'center' },
  statDivider:   { width: 1, height: 36, backgroundColor: CoachColors.borderMuted },

  // Engagement ring (compact, inside stat block)
  engageWrap:    { width: 80, height: 80 },
  engageNum:     { fontFamily: CoachFonts.headingBold, fontSize: 20, letterSpacing: -0.5 },

  // PRIMARY ACTIONS
  heroActions:   { flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 },
  actionPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CoachColors.accent, borderRadius: 14, paddingVertical: 14 },
  actionPrimaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.onAccent },
  actionSecondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CoachColors.borderMuted, borderRadius: 14, paddingVertical: 14 },
  actionSecondaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  // minHeight so the unread count is not clipped at large Dynamic Type sizes.
  unreadDot:     { position: 'absolute', top: -4, right: -4, minWidth: 18, minHeight: 18, borderRadius: 9, backgroundColor: CoachColors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: CoachColors.bg },
  // onAccent (dark ink) on the solid danger fill: 5.75:1. textPrimary was 2.82:1.
  unreadDotText: { fontFamily: CoachFonts.headingBold, fontSize: 9, color: CoachColors.onAccent },

  // ICON TRAY
  iconTray:      { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 6 },
  iconTrayItem:  { alignItems: 'center', gap: 5, padding: 10 },
  iconTrayLabel: { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textMuted },

  // TRIAL BANNER
  trialBanner:      { flexDirection: 'row', alignItems: 'center', gap: 16, width: '100%', backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 14, padding: 16 },
  trialLeft:         { flex: 1, gap: 8 },
  trialTitle:        { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  quietSub:          { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 2 },
  quietNudgeBtn:     { backgroundColor: CoachColors.danger, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  quietNudgeText:    { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },
  trialTrack:        { height: 3, backgroundColor: CoachColors.borderMuted, borderRadius: 2, overflow: 'hidden' },
  trialFill:         { height: '100%', borderRadius: 2 },
  trialUpgradeBtn:   { backgroundColor: CoachColors.accent, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  trialUpgradeText:  { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.onAccent },

  // TAB BAR
  tabRow:        { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted, position: 'relative' },
  tabItem:       { alignItems: 'center', paddingVertical: 12 },
  tabLabel:      { fontFamily: CoachFonts.bodyMedium, fontSize: 14, color: CoachColors.textMuted },
  tabLabelActive: { fontFamily: CoachFonts.bodySemiBold, color: CoachColors.textPrimary },
  tabUnderline:  { position: 'absolute', bottom: -1, height: 2, backgroundColor: CoachColors.accent, borderRadius: 1 },

  // TAB CONTENT
  tabBody:       { paddingHorizontal: 16, paddingTop: 20, gap: 6 },

  // SECTION LABELS — title case, subtle secondary colour
  sectionLabel:  { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, letterSpacing: 0.3, color: CoachColors.textMuted, marginTop: 14, marginBottom: 6 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  seeAll:        { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.accent },

  // BLOCK (main list container, like iOS Settings)
  block:         { backgroundColor: CoachColors.surface, borderRadius: 16, overflow: 'hidden' },
  blockRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  blockDivider:  { height: 1, backgroundColor: CoachColors.borderMuted, marginLeft: 46 },
  blockRowText:  { fontFamily: CoachFonts.bodyMedium, fontSize: 15, color: CoachColors.textPrimary, flex: 1 },
  blockRowLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 15, color: CoachColors.textSecondary, flex: 1 },
  blockRowValue: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  blockRowSub:   { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 2 },
  changeLink:    { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.accent },
  viewAllRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted },
  viewAllText:   { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.accent },
  addBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 16 },
  addBtnText:    { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.accent },

  // STATUS TAGS
  statusTag:     { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden', textTransform: 'capitalize' },
  tagDone:       { backgroundColor: CoachColors.accentSoft, color: CoachColors.accent },
  tagPending:    { backgroundColor: 'rgba(155,160,149,0.14)', color: CoachColors.textSecondary },
  tagCancelled:  { backgroundColor: CoachColors.dangerSoft, color: CoachColors.danger },

  // NOTES
  notesWrap:        { backgroundColor: CoachColors.surface, borderRadius: 16, padding: 16, gap: 10 },
  notesInput:       { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textPrimary, minHeight: 72, textAlignVertical: 'top', lineHeight: 22 },
  notesText:        { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary, lineHeight: 22 },
  notesPlaceholder: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textFaint, lineHeight: 22, fontStyle: 'italic' },
  notesEditRow:     { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  notesEditLabel:   { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textFaint },
  notesActionsRow:  { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, paddingTop: 8 },
  notesCancelText:  { fontFamily: CoachFonts.bodyMedium, fontSize: 14, color: CoachColors.textMuted },
  notesSaveBtn:     { backgroundColor: CoachColors.accent, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  notesSaveBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.onAccent },

  // SESSION CARD (next session)
  sessionCard:    { backgroundColor: CoachColors.surface, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 18 },
  sessionDateCol: { alignItems: 'center', minWidth: 44 },
  sessionDay:     { fontFamily: CoachFonts.bodySemiBold, fontSize: 10, color: CoachColors.textMuted, letterSpacing: 0.5 },
  sessionDayNum:  { fontFamily: CoachFonts.headingBold, fontSize: 32, color: CoachColors.textPrimary, lineHeight: 36 },
  sessionMonth:   { fontFamily: CoachFonts.bodySemiBold, fontSize: 10, color: CoachColors.textMuted, letterSpacing: 0.5 },
  sessionInfo:    { flex: 1, gap: 3 },
  sessionType:    { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary },
  sessionTime:    { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary },
  sessionCountdown: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.warning, marginTop: 4 },

  // MESSAGE ROW
  messageRow:      { backgroundColor: CoachColors.surface, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  messageAvatarWrap: { position: 'relative' },
  // minHeight so the unread count is not clipped at large Dynamic Type sizes.
  msgBadge:        { position: 'absolute', top: -3, right: -3, minWidth: 17, minHeight: 17, borderRadius: 9, backgroundColor: CoachColors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 2, borderColor: CoachColors.bg },
  // onAccent on the solid danger fill — see unreadDotText.
  msgBadgeText:    { fontFamily: CoachFonts.headingBold, fontSize: 9, color: CoachColors.onAccent },
  messageText:     { fontFamily: CoachFonts.bodyMedium, fontSize: 15, color: CoachColors.textPrimary },
  messageTime:     { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 2 },
  messageEmpty:    { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textFaint, fontStyle: 'italic' },

  // CHIPS
  chipWrap:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { backgroundColor: CoachColors.surface, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8 },
  chipText:    { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textSecondary },

  // COMMITMENT BARS
  commitRow:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  commitBar:       { width: 26, height: 32, borderRadius: 6, backgroundColor: CoachColors.borderMuted },
  commitBarActive: { backgroundColor: CoachColors.accent },
  commitText:      { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textSecondary, marginLeft: 8 },

  // EMPTY STATES
  emptyRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CoachColors.surface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 18 },
  emptyRowText:  { fontFamily: CoachFonts.bodyMedium, fontSize: 15, color: CoachColors.textFaint },
  emptyRowCta:   { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.accent },
  emptyBlock:    { backgroundColor: CoachColors.surface, borderRadius: 16, padding: 24, alignItems: 'center', gap: 8 },
  emptyBlockTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textSecondary, textAlign: 'center' },
  emptyBlockSub:   { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint, textAlign: 'center', lineHeight: 18 },
  emptyBlockCta:   { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.accent, marginTop: 4 },
  emptyBlockBtn:   { backgroundColor: CoachColors.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  emptyBlockBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.onAccent },
  emptyStateTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 18, color: CoachColors.textSecondary },
  outlineBtn:    { borderWidth: 1, borderColor: CoachColors.border, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  outlineBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },

  // SYNC NOTE
  syncNote:      { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textFaint, textAlign: 'right', marginTop: 4 },

  // CHART
  chartBlock:    { backgroundColor: CoachColors.surface, borderRadius: 16, paddingTop: 16, paddingHorizontal: 16, overflow: 'hidden' },
  chartTopRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  chartBigNum:   { fontFamily: CoachFonts.headingBold, fontSize: 28, color: CoachColors.textPrimary, letterSpacing: -1 },
  deltaBadge:    { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  deltaBadgeText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13 },

  // PROGRESS PHOTOS
  photoThumb:    { width: 120, height: 170, borderRadius: 14, overflow: 'hidden', backgroundColor: CoachColors.surface },
  photoThumbImg: { width: '100%', height: '100%' },
  photoGrad:     { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70 },
  photoFooter:   { position: 'absolute', bottom: 10, left: 10, right: 10 },
  photoDate:     { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textPrimary },
  photoWeight:   { fontFamily: CoachFonts.body, fontSize: 10, color: CoachColors.textSecondary, marginTop: 2 },
  photoLatest:   { position: 'absolute', top: 8, right: 8, backgroundColor: CoachColors.accent, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  photoLatestText: { fontFamily: CoachFonts.headingBold, fontSize: 7, color: CoachColors.onAccent, letterSpacing: 0.5 },

  // LOG DOT
  logDot:        { width: 8, height: 8, borderRadius: 4, backgroundColor: CoachColors.accent },
  sessionDot:    { width: 8, height: 8, borderRadius: 4 },

  // PHOTO VIEWER
  photoViewerBg:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  photoViewerImg:   { width: W, height: W * 1.3 },
  photoViewerClose: { position: 'absolute', top: 56, right: 20, width: 36, height: 36, borderRadius: 18, backgroundColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center' },

  // MODAL NAV
  modalNav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  modalNavTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary },
  modalHint:     { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary, lineHeight: 20, marginBottom: 4 },
  modalPlanRow:  { backgroundColor: CoachColors.surface, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  modalPlanRowActive: { borderWidth: 1.5, borderColor: CoachColors.accent },
  modalPlanName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary },
  modalPlanMeta: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 2 },
  activePlanTag: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.accent },
  enrollTag:     { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.accent },
  quickAddToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 4 },
  quickAddToggleText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14, color: CoachColors.textMuted },
  quickAddBtn:   { backgroundColor: CoachColors.surface, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  quickAddBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },

  // NUTRITION (last 7 days)
  nutriDayRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  nutriDayLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textSecondary },
  nutriDayVal:   { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },

  // CHECK-IN QUESTION EDITOR (in-screen overlay)
  cqOverlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: CoachColors.bg, zIndex: 50 },
  cqHeader:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  cqTitle:       { flex: 1, fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, textAlign: 'center' },
  cqSaveLink:    { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.accent },
  cqBody:        { padding: 16, paddingBottom: 48, gap: 10 },
  cqHint:        { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, lineHeight: 19, marginBottom: 4 },
  cqRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CoachColors.surface, borderRadius: 14, padding: 14 },
  cqRowPrompt:   { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary, lineHeight: 20 },
  cqRowContext:  { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 2 },
  cqRowMeta:     { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textFaint, marginTop: 4 },
  cqRowActions:  { alignItems: 'center', gap: 10 },
  cqFieldLabel:  { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textMuted, marginTop: 8, marginBottom: 6 },
  cqInput:       { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 12, padding: 13, fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textPrimary, textAlignVertical: 'top' },
  cqTypeRow:     { flexDirection: 'row', gap: 8 },
  cqTypeChip:    { flex: 1, borderWidth: 1, borderColor: CoachColors.borderMuted, backgroundColor: CoachColors.surface, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, gap: 3 },
  cqTypeChipActive: { borderColor: CoachColors.accent, borderWidth: 1.5 },
  cqTypeChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textSecondary },
  cqTypeChipTextActive: { color: CoachColors.accent },
  cqTypeChipHint: { fontFamily: CoachFonts.body, fontSize: 10.5, color: CoachColors.textFaint, lineHeight: 14 },
  cqScaleRow:    { flexDirection: 'row', gap: 8 },
  cqCommitBtn:   { backgroundColor: CoachColors.accent, borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  cqCommitBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.onAccent },
  cqFormHint:    { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textFaint, textAlign: 'center', marginTop: 10 },
});
