/**
 * find-coach.tsx — the coachless athlete's path (design turn 26, all four).
 *
 * 26a  Intake — one question at a time (WeeklyCheckIn pattern): goal, days a
 *      week, time of day, how they want to be talked to. Held in local state
 *      and written into clients.assessment_data.intake once a client row
 *      exists (it doesn't before the request — coachless athletes have no
 *      client row yet). Goal and days prefill from onboarding when they map
 *      cleanly (auth user_metadata / legacy signup metadata / saved intake),
 *      with a dismissible banner naming exactly what was carried; time and
 *      style are always asked — onboarding never had them.
 * 26b  Matches — every public trainer, ranked on what is REAL: does their
 *      specialization/bio mention the goal, do their working_hours cover the
 *      athlete's days and time of day, do they have published passes and at
 *      what price. No ratings, no athlete counts, no response-time stats, no
 *      compatibility percentages — none of that data exists, so none of it
 *      is shown. Every chip on a card is a derivable fact.
 * 26c  Profile — the coach's real bio, specialization, certifications
 *      (comma string on trainers), working hours, and their published passes
 *      with true week/workout composition (lib/passWeeks). Under the bio, a
 *      fit panel of derived facts (full bar / empty amber bar / row omitted
 *      when unknowable — never a score, INVARIANTS §4); each pass carries a
 *      week strip and a sessions-per-week line, both plain arithmetic on
 *      published data.
 * 26d  Request — a request, not a purchase. Sending it runs the same real
 *      mechanism the pick-a-coach signup path uses: create_client_and_notify
 *      (SECURITY DEFINER RPC → client row + trainer notification), then a
 *      conversation + first message carrying the athlete's answers and note.
 *      No payment anywhere on this path.
 *
 * Fixed dark/lime system (constants/coachDesign.ts). No useTheme().
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { totalWeeks } from '../../lib/passWeeks';
import { useReducedMotion } from '../../lib/useReducedMotion';
import type { TrackNode } from '../../context/AppContext';

// ─── Intake model (26a) ───────────────────────────────────────────────────────

type IntakeAnswers = {
  goal?: string;
  days?: string;
  time?: string;
  style?: string;
};

const INTAKE_QUESTIONS: {
  id: keyof IntakeAnswers;
  prompt: string;
  context: string;
  options: { label: string; sub?: string }[];
}[] = [
  {
    id: 'goal',
    prompt: 'What do you want a coach for?',
    context: 'This decides who we show you — not a directory of everyone.',
    options: [
      { label: 'Get strong in the gym', sub: 'Barbells, progressive overload, real numbers' },
      { label: 'Lose fat and keep muscle', sub: 'Food is most of the work here' },
      { label: 'Train for an event', sub: 'Race, meet or a date on the calendar' },
      { label: 'Come back from an injury', sub: 'Coaches who work alongside physios' },
      { label: 'Start from nothing', sub: 'Never trained properly before' },
    ],
  },
  {
    id: 'days',
    prompt: 'How many days a week can you actually train?',
    context: 'Be honest — a plan you can keep beats a plan you admire.',
    options: [
      { label: '2 days' },
      { label: '3 days' },
      { label: '4 days' },
      { label: '5 or more' },
    ],
  },
  {
    id: 'time',
    prompt: 'When do you usually get to train?',
    context: 'We check this against each coach’s working hours.',
    options: [
      { label: 'Mornings' },
      { label: 'Daytime' },
      { label: 'Evenings' },
      { label: 'It varies' },
    ],
  },
  {
    id: 'style',
    prompt: 'How do you want a coach to talk to you?',
    context: 'This goes to the coach with your request, so they can tell you if they’re the wrong fit.',
    options: [
      { label: 'Push me', sub: 'Direct, expects the numbers' },
      { label: 'Keep it steady', sub: 'Encouragement over pressure' },
      { label: 'Just give me the plan', sub: 'Minimal back and forth' },
    ],
  },
];

// ─── Prefill from onboarding — never re-ask what the athlete already said ────
//
// Sources, in priority order:
//   1. auth user_metadata.intake_goal / intake_days   (onboarding contract)
//   2. auth user_metadata.fitness_goal / commit_days  (legacy signup metadata)
//   3. clientData.assessment_data.intake.goal / days_per_week
// Only answers that map cleanly onto THIS screen's option labels are carried;
// anything ambiguous is asked again — a wrong prefill is worse than a repeat.

const GOAL_PREFILL_MAP: Record<string, string> = {
  'Get stronger on the big lifts': 'Get strong in the gym',
  'Lose fat, keep the strength I have': 'Lose fat and keep muscle',
  'Train around something that hurts': 'Come back from an injury',
  // 'Get back into it after a break' deliberately has NO mapping — the two
  // option sets genuinely differ, so that athlete is asked, not guessed at.
};

function mapPrefillGoal(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  // Already one of this screen's own labels (e.g. a saved marketplace intake).
  if (INTAKE_QUESTIONS[0].options.some((o) => o.label === raw)) return raw;
  return GOAL_PREFILL_MAP[raw];
}

function mapPrefillDays(raw: unknown): string | undefined {
  if (typeof raw === 'string' && INTAKE_QUESTIONS[1].options.some((o) => o.label === raw)) return raw;
  const n = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? parseInt(raw.trim(), 10) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 7) return undefined;
  if (n <= 2) return '2 days';
  if (n === 3) return '3 days';
  if (n === 4) return '4 days';
  return '5 or more';
}

function derivePrefill(user: any, clientData: any): {
  answers: IntakeAnswers;
  carried: string;  // human-readable list of what was carried, '' if nothing
  qIndex: number;   // first unanswered question
} {
  const meta = (user?.user_metadata as any) || {};
  const intake = clientData?.assessment_data?.intake || {};
  const goal = mapPrefillGoal(meta.intake_goal)
    ?? mapPrefillGoal(meta.fitness_goal)
    ?? mapPrefillGoal(intake.goal);
  const days = mapPrefillDays(meta.intake_days)
    ?? mapPrefillDays(meta.commit_days)
    ?? mapPrefillDays(intake.days_per_week);
  const answers: IntakeAnswers = {};
  if (goal) answers.goal = goal;
  if (days) answers.days = days;
  const carried = [goal ? 'Goal' : null, days ? `${days} a week` : null].filter(Boolean).join(' · ');
  let qIndex = 0;
  // Time and style are never asked at onboarding, so this always stops early.
  while (qIndex < INTAKE_QUESTIONS.length && answers[INTAKE_QUESTIONS[qIndex].id] !== undefined) qIndex++;
  return { answers, carried, qIndex };
}

// Keywords per goal, matched against specialization + bio. Purely textual —
// if nothing matches we say nothing, we never invent a fit.
const GOAL_KEYWORDS: Record<string, string[]> = {
  'Get strong in the gym': ['strength', 'powerlifting', 'barbell', 'lifting', 'weightlifting', 'hypertrophy', 'muscle'],
  'Lose fat and keep muscle': ['fat loss', 'weight loss', 'nutrition', 'body composition', 'cutting', 'diet'],
  'Train for an event': ['endurance', 'running', 'marathon', 'triathlon', 'race', 'competition', 'event', 'sport'],
  'Come back from an injury': ['rehab', 'injury', 'physio', 'recovery', 'mobility', 'corrective'],
  'Start from nothing': ['beginner', 'foundation', 'fundamentals', 'general fitness', 'getting started'],
};

// ─── Working-hours helpers (trainers.working_hours JSONB, settings.tsx shape:
//     { Monday: { start: '9:00 AM', end: '5:00 PM', enabled: true }, … }) ─────

type DayHours = { start?: string; end?: string; enabled?: boolean };

function parseHour(t?: string): number | null {
  if (!t || typeof t !== 'string') return null;
  const m = t.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h;
}

function enabledDays(wh: any): { day: string; hours: DayHours }[] {
  if (!wh || typeof wh !== 'object') return [];
  return Object.entries(wh)
    .filter(([, v]: [string, any]) => v && v.enabled)
    .map(([day, hours]) => ({ day, hours: hours as DayHours }));
}

/** Does any enabled day's window cover the athlete's preferred time of day? */
function coversTime(wh: any, timePref?: string): boolean | null {
  const days = enabledDays(wh);
  if (days.length === 0) return null; // not derivable — say nothing
  if (!timePref || timePref === 'It varies') return null;
  return days.some(({ hours }) => {
    const start = parseHour(hours.start);
    const end = parseHour(hours.end);
    if (start === null || end === null) return false;
    if (timePref === 'Mornings') return start <= 9;
    if (timePref === 'Daytime') return start <= 12 && end >= 14;
    if (timePref === 'Evenings') return end >= 18;
    return false;
  });
}

function desiredDayCount(days?: string): number | null {
  if (!days) return null;
  const m = days.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Matching (26b) — facts only ─────────────────────────────────────────────

type CoachMatch = {
  trainer: any;
  plans: any[];
  score: number;
  facts: string[];    // green chips — derivable, true, in the athlete's favor
  gaps: string[];     // amber chips — derivable, true, and honest about a mismatch
  goalMatch: boolean;
};

function buildMatch(trainer: any, plans: any[], answers: IntakeAnswers): CoachMatch {
  const facts: string[] = [];
  const gaps: string[] = [];
  let score = 0;

  // Goal ↔ specialization/bio, textual only.
  const hay = `${trainer.specialization || ''} ${trainer.bio || ''}`.toLowerCase();
  const keywords = answers.goal ? GOAL_KEYWORDS[answers.goal] || [] : [];
  const goalMatch = keywords.some((k) => hay.includes(k));
  if (goalMatch) {
    score += 3;
    facts.push('Trains your goal');
  }

  // Schedule — working_hours where the coach has actually set them.
  const days = enabledDays(trainer.working_hours);
  const wanted = desiredDayCount(answers.days);
  if (days.length > 0 && wanted !== null) {
    if (days.length >= wanted) {
      score += 1;
      facts.push(`Works ${days.length} days a week`);
    } else {
      gaps.push(`Only works ${days.length} day${days.length === 1 ? '' : 's'} a week`);
    }
  }
  const timeFit = coversTime(trainer.working_hours, answers.time);
  if (timeFit === true) {
    score += 1;
    if (answers.time) facts.push(answers.time);
  } else if (timeFit === false) {
    gaps.push(`Not available ${(answers.time || '').toLowerCase()}`);
  }

  // Published passes — real plans, real prices.
  if (plans.length > 0) {
    score += 1;
    const cheapest = Math.min(...plans.map((p) => Number(p.price) || Infinity));
    if (Number.isFinite(cheapest)) {
      facts.push(`Passes from $${cheapest}`);
    } else {
      facts.push(`${plans.length} pass${plans.length === 1 ? '' : 'es'} published`);
    }
  }

  return { trainer, plans, score, facts, gaps, goalMatch };
}

// ─── Pass composition (26c) — real track math, same as my-pass ───────────────

function planComposition(plan: any): { weeks: number; workouts: number; hasSeason: boolean } {
  const track: TrackNode[] = Array.isArray(plan.track)
    ? [...plan.track].sort((a: TrackNode, b: TrackNode) => a.order - b.order)
    : [];
  const weeks = totalWeeks(track, plan.duration_weeks);
  const workouts = track.filter((n) => n.type === 'workout').length;
  // totalWeeks floors at 1 even for an empty pass — only call it a season
  // when the plan actually published something (nodes or a declared length).
  const hasSeason = weeks > 0 && (track.length > 0 || (Number(plan.duration_weeks) || 0) > 0);
  return { weeks, workouts, hasSeason };
}

function planSummary(plan: any): string {
  const { weeks, workouts } = planComposition(plan);
  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks} week${weeks === 1 ? '' : 's'}`);
  if (workouts > 0) parts.push(`${workouts} workout${workouts === 1 ? '' : 's'}`);
  return parts.join(' · ') || 'Published pass';
}

function initials(name?: string): string {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function firstName(name?: string): string {
  return (name || '').split(' ')[0] || '';
}

// ─── Fit panel (26c) — derived facts as bars, never a score ──────────────────
//
// INVARIANTS §4: no percentages, no stars, no invented "match" number. Each
// row is a checkable fact rendered FULL (true) or EMPTY with an amber outline
// (false); a fact we cannot derive is not passed in at all — the caller omits
// the row rather than render a false one.

type FitRow = { label: string; ok: boolean };

function FitPanel({ rows }: { rows: FitRow[] }) {
  const reducedMotion = useReducedMotion();
  const anims = useRef(rows.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (reducedMotion) {
      // Reduce Motion: jump straight to final values, no stagger.
      anims.forEach((a) => a.setValue(1));
      return;
    }
    const seq = Animated.stagger(
      80,
      anims.map((a) => Animated.timing(a, { toValue: 1, duration: 450, useNativeDriver: false })),
    );
    seq.start();
    return () => seq.stop();
  }, [reducedMotion, anims]);

  const lined = rows.filter((r) => r.ok).length;
  return (
    <View style={s.fitCard}>
      {rows.map((row, i) => (
        <View key={row.label}>
          {i > 0 && <View style={s.hairline} />}
          <View style={s.fitRow}>
            <Text style={s.fitLabel}>{row.label}</Text>
            <View style={[s.fitTrack, !row.ok && s.fitTrackGap]}>
              {row.ok ? (
                <Animated.View
                  style={[
                    s.fitFill,
                    { width: anims[i].interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                  ]}
                />
              ) : null}
            </View>
          </View>
        </View>
      ))}
      <Text style={s.fitSentence}>
        {lined} of {rows.length} things we can check {lined === 1 ? 'lines' : 'line'} up.
        The rest is a conversation.
      </Text>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

type Step = 'intake' | 'matches' | 'profile' | 'request' | 'sent';

export default function FindCoachScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { clientData, refreshData, pendingCoach, cancelCoachRequest } = useClient();

  const [step, setStep] = useState<Step>('intake');
  // Seed from onboarding once, at mount — the athlete already answered these.
  const [prefill] = useState(() => derivePrefill(user, clientData));
  const [qIndex, setQIndex] = useState(prefill.qIndex);
  const [answers, setAnswers] = useState<IntakeAnswers>(prefill.answers);
  // '' = nothing carried, or the banner was dismissed.
  const [prefillNote, setPrefillNote] = useState(prefill.carried);

  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matches, setMatches] = useState<CoachMatch[]>([]);
  const [selected, setSelected] = useState<CoachMatch | null>(null);

  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // A client row with a trainer is a real coach relationship — this path
  // isn't for them. A client row with NO trainer is a solo row (Solo mode
  // created it): they have no coach yet, so this path still applies, just
  // with a note that their corner survives the pick.
  const alreadyLinked = !!clientData?.trainer_id;
  const soloRow = !!clientData && !clientData.trainer_id;
  // A request already out with a coach: one at a time, and the athlete can
  // withdraw it. Their solo plan is untouched while it is pending.
  const pendingRequest = !alreadyLinked && !!clientData?.requested_trainer_id;
  const [cancelling, setCancelling] = useState(false);

  // ── Load + rank coaches on real data only ─────────────────────────────────
  const loadMatches = useCallback(async (a: IntakeAnswers) => {
    setLoadingMatches(true);
    try {
      const [{ data: trainers }, { data: allPlans }] = await Promise.all([
        supabase
          // The public view: marketplace columns only. Browsing the TABLE
          // used to hand over every coach's email, phone, Stripe account id and
          // push token to any signed-in user.
          .from('trainers_public')
          .select('id, name, specialization, bio, avatar_url, cover_url, certifications, working_hours')
          .order('name'),
        supabase.from('plans').select('*'),
      ]);
      const plansByTrainer = new Map<string, any[]>();
      (allPlans || []).forEach((p: any) => {
        const list = plansByTrainer.get(p.trainer_id) || [];
        list.push(p);
        plansByTrainer.set(p.trainer_id, list);
      });
      const ranked = (trainers || [])
        .map((t: any) => buildMatch(t, plansByTrainer.get(t.id) || [], a))
        .sort((x, y) => y.score - x.score)
        .slice(0, 5);
      setMatches(ranked);
    } catch {
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  const answerQuestion = (value: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const q = INTAKE_QUESTIONS[qIndex];
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    if (qIndex + 1 < INTAKE_QUESTIONS.length) {
      setQIndex(qIndex + 1);
    } else {
      setStep('matches');
      loadMatches(next);
    }
  };

  const goBack = () => {
    if (step === 'intake') {
      if (qIndex > 0) setQIndex(qIndex - 1);
      else router.back();
    } else if (step === 'matches') {
      setStep('intake');
      setQIndex(INTAKE_QUESTIONS.length - 1);
    } else if (step === 'profile') {
      setStep('matches');
    } else if (step === 'request') {
      setStep(selected ? 'profile' : 'matches');
    } else {
      router.back();
    }
  };

  // ── 26d: send the request — the real mechanism ────────────────────────────
  const sendRequest = async () => {
    if (!selected || sending) return;
    setSendError('');
    setSending(true);
    try {
      if (!user) throw new Error('Not signed in');
      if (alreadyLinked) throw new Error('You already have a coach on this account.');

      const athleteName = (user.user_metadata as any)?.name || user.email?.split('@')[0] || 'Athlete';
      const athleteEmail = user.email || '';

      // First message: the athlete's answers plus their note, in the real
      // conversation the coach will reply in. The RPC writes it server-side —
      // athletes cannot insert conversations under RLS, so the old
      // client-side insert never reached the coach.
      const lines = [
        `Hi ${firstName(selected.trainer.name)} — I'd like to train with you.`,
        answers.goal ? `Goal: ${answers.goal}` : null,
        answers.days ? `Days a week: ${answers.days}${answers.time && answers.time !== 'It varies' ? `, ${answers.time.toLowerCase()}` : ''}` : null,
        answers.style ? `Coaching style: ${answers.style}` : null,
        note.trim() ? `\n${note.trim()}` : null,
      ].filter(Boolean);
      const content = lines.join('\n');

      // A REQUEST, not an attachment: the coach must accept before anything
      // about the athlete's plan changes (request_coach RPC).
      const { data: result, error: rpcErr } = await supabase.rpc('request_coach', {
        p_trainer_id: selected.trainer.id,
        p_intake: { ...answers, source: 'marketplace' },
        p_message: content,
        p_name: athleteName,
        p_email: athleteEmail,
      });
      if (rpcErr) throw rpcErr;
      if (!result?.success) {
        throw new Error(
          result?.reason === 'already_coached'
            ? 'You already have a coach on this account.'
            : result?.reason === 'already_pending'
            ? 'You already have a request out. Withdraw it before sending another.'
            : result?.reason || 'Could not send the request'
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refreshData();
      setStep('sent');
    } catch (err: any) {
      setSendError(err?.message || 'Could not send the request. Try again.');
    } finally {
      setSending(false);
    }
  };

  // ── Shared header ──────────────────────────────────────────────────────────
  const Header = ({ title, sub }: { title: string; sub?: string }) => (
    <View style={[s.header, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity hitSlop={5} onPress={goBack} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={21} color={C.textSecondary} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.headerTitle}>{title}</Text>
        {sub ? <Text style={s.headerSub}>{sub}</Text> : null}
      </View>
    </View>
  );

  // ── Already linked: this path isn't for you ───────────────────────────────
  if (pendingRequest && step !== 'sent') {
    const who = pendingCoach?.name ? firstName(pendingCoach.name) : 'the coach';
    const since = clientData?.coach_requested_at ? new Date(clientData.coach_requested_at) : null;
    const days = since ? Math.max(0, Math.floor((Date.now() - since.getTime()) / 86_400_000)) : null;
    return (
      <View style={s.container}>
        <Header title="Find a coach" />
        <View style={s.centerFill}>
          <Ionicons name="paper-plane-outline" size={43} color={C.accent} />
          <Text style={s.emptyTitle}>Request sent to {who}</Text>
          <Text style={s.emptyBody}>
            {days == null ? 'Waiting on their answer.' : days === 0 ? 'Sent today.' : `Sent ${days} day${days === 1 ? '' : 's'} ago.`}
            {' '}Nothing about your plan changes until they accept — your sessions stay exactly as they are.
          </Text>
          <TouchableOpacity
            style={[s.secondaryBtn, { marginTop: 22 }]}
            onPress={async () => {
              if (cancelling) return;
              setCancelling(true);
              const ok = await cancelCoachRequest();
              setCancelling(false);
              if (!ok) setSendError('Could not withdraw the request. Try again.');
            }}
            disabled={cancelling}
            accessibilityRole="button"
            accessibilityLabel="Withdraw request"
          >
            {cancelling ? <ActivityIndicator color={C.textPrimary} /> : <Text style={s.secondaryBtnText}>Withdraw request</Text>}
          </TouchableOpacity>
          {sendError ? <Text style={s.errorText}>{sendError}</Text> : null}
        </View>
      </View>
    );
  }

  if (alreadyLinked && step !== 'sent') {
    return (
      <View style={s.container}>
        <Header title="Find a coach" />
        <View style={s.centerFill}>
          <Ionicons name="people-outline" size={43} color={C.textFaint} />
          <Text style={s.emptyTitle}>You already have a coach</Text>
          <Text style={s.emptyBody}>This path is for athletes who arrived without one.</Text>
        </View>
      </View>
    );
  }

  // ── 26a: intake — one question at a time ──────────────────────────────────
  if (step === 'intake') {
    const q = INTAKE_QUESTIONS[qIndex];
    return (
      <View style={s.container}>
        <Header title="Find a coach" sub={`Question ${qIndex + 1} of ${INTAKE_QUESTIONS.length}`} />
        {soloRow && (
          <View style={s.soloNoteRow}>
            <View style={s.soloNoteDot} />
            <Text style={s.soloNoteText}>
              Your corner keeps everything you logged. Picking a coach adds a human on top.
            </Text>
          </View>
        )}
        <View style={s.progressRow}>
          {INTAKE_QUESTIONS.map((qq, i) => (
            <View
              key={qq.id}
              style={[
                s.progressSeg,
                (answers[qq.id] !== undefined || i < qIndex) && s.progressSegDone,
                i === qIndex && s.progressSegActive,
              ]}
            />
          ))}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>
          {prefillNote ? (
            <View style={s.prefillBanner}>
              <View style={s.prefillTopRow}>
                <Ionicons name="checkmark-circle-outline" size={16} color={C.accent} />
                <Text style={s.prefillText}>
                  Using what you told us at signup — {prefillNote}
                </Text>
                <TouchableOpacity
                  hitSlop={10}
                  onPress={() => setPrefillNote('')}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss"
                >
                  <Ionicons name="close" size={16} color={C.textFaint} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                hitSlop={8}
                onPress={() => {
                  setAnswers({});
                  setQIndex(0);
                  setPrefillNote('');
                }}
                accessibilityRole="button"
                accessibilityLabel="Change answers"
              >
                <Text style={s.prefillAction}>Change answers</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <Text style={s.questionPrompt}>{q.prompt}</Text>
          <Text style={s.questionContext}>{q.context}</Text>
          <View style={{ gap: 9, marginTop: 22 }}>
            {q.options.map((opt) => {
              const active = answers[q.id] === opt.label;
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[s.optionCard, active && s.optionCardActive]}
                  onPress={() => answerQuestion(opt.label)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                >
                  <View style={[s.radio, active && s.radioActive]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.optionLabel}>{opt.label}</Text>
                    {opt.sub ? <Text style={s.optionSub}>{opt.sub}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {qIndex === 0 && (
            <Text style={s.intakeFootnote}>No card needed anywhere on this path — you talk to a human first.</Text>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── 26b: matches — ranked on what's real ──────────────────────────────────
  if (step === 'matches') {
    const echo = [answers.goal, answers.days ? `${answers.days} a week` : null, answers.time?.toLowerCase()]
      .filter(Boolean)
      .join(' · ');
    return (
      <View style={s.container}>
        <Header title="Coaches who fit" sub={echo || undefined} />
        {loadingMatches ? (
          <View style={s.centerFill}>
            <ActivityIndicator size="large" color={C.accent} />
          </View>
        ) : matches.length === 0 ? (
          <View style={s.centerFill}>
            <Ionicons name="people-outline" size={43} color={C.textFaint} />
            <Text style={s.emptyTitle}>No coaches here yet</Text>
            <Text style={s.emptyBody}>When coaches join, they'll show up here matched against your answers.</Text>
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 11 }}>
              {matches.map((m, idx) => (
                <TouchableOpacity
                  key={m.trainer.id}
                  style={[s.matchCard, idx === 0 && m.score > 0 && s.matchCardTop]}
                  activeOpacity={0.85}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelected(m);
                    setStep('profile');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`See ${m.trainer.name}'s profile`}
                >
                  {m.trainer.cover_url ? (
                    <Image
                      source={{ uri: m.trainer.cover_url }}
                      style={s.matchCover}
                      resizeMode="cover"
                    />
                  ) : null}
                  <View style={s.matchHead}>
                    {m.trainer.avatar_url ? (
                      <Image source={{ uri: m.trainer.avatar_url }} style={s.matchAvatar} />
                    ) : (
                      <View style={s.matchAvatarFallback}>
                        <Text style={s.matchAvatarText}>{initials(m.trainer.name)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.matchName}>{m.trainer.name}</Text>
                      {m.trainer.specialization ? (
                        <Text style={s.matchSpec}>{m.trainer.specialization}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.textFaint} />
                  </View>
                  {m.trainer.bio ? (
                    <Text style={s.matchBio} numberOfLines={3}>{m.trainer.bio}</Text>
                  ) : null}
                  {(m.facts.length > 0 || m.gaps.length > 0) && (
                    <View style={s.chipRow}>
                      {m.facts.map((f) => (
                        <View key={f} style={s.factChip}><Text style={s.factChipText}>{f}</Text></View>
                      ))}
                      {m.gaps.map((g) => (
                        <View key={g} style={s.gapChip}><Text style={s.gapChipText}>{g}</Text></View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.honestNote}>
              Ranked on what coaches have actually set up — their focus, their working hours,
              their published passes. No star ratings here, because we don't collect any.
            </Text>
          </ScrollView>
        )}
      </View>
    );
  }

  // ── 26c: coach profile — the concrete things ──────────────────────────────
  if (step === 'profile' && selected) {
    const t = selected.trainer;
    const certs: string[] = typeof t.certifications === 'string'
      ? t.certifications.split(',').map((c: string) => c.trim()).filter(Boolean)
      : [];
    const days = enabledDays(t.working_hours);

    // Fit panel rows — only what is derivable for THIS coach. A missing fact
    // (no working hours set, time preference "It varies") omits the row
    // entirely rather than rendering a false one.
    const wantedDays = desiredDayCount(answers.days);
    const timeFit = coversTime(t.working_hours, answers.time);
    const fitRows: FitRow[] = [];
    // A coach with NO bio and NO specialization cannot keyword-match any
    // goal — but that is UNMEASURED, not a mismatch. An amber "doesn't
    // train your goal" bar would be a false claim about missing data
    // (INVARIANTS §4), so the row is omitted, exactly like the schedule
    // rows when working_hours were never set.
    const goalCheckable = !!`${t.specialization || ''}${t.bio || ''}`.trim();
    if (answers.goal && goalCheckable) fitRows.push({ label: 'Trains your goal', ok: selected.goalMatch });
    if (days.length > 0 && wantedDays !== null) {
      fitRows.push({ label: `Your ${wantedDays} days covered`, ok: days.length >= wantedDays });
    }
    if (timeFit !== null && answers.time) {
      fitRows.push({ label: `${answers.time} availability`, ok: timeFit });
    }
    fitRows.push({ label: 'Published programme', ok: selected.plans.length > 0 });
    return (
      <View style={s.container}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}>
          {/* The coach's own photograph as the hero, when they have one —
              the Ladder team-card move, with the coach's real image instead
              of anything staged. No photo, and the flat block stays: an
              honest colour, never a stock gym. */}
          <View style={[s.profileHero, { paddingTop: insets.top + 10 }, !!t.cover_url && { height: 210 }]}>
            {t.cover_url ? (
              <>
                <Image source={{ uri: t.cover_url }} style={s.profileHeroImg} resizeMode="cover" />
                <View style={s.profileHeroScrim} />
              </>
            ) : null}
            <TouchableOpacity hitSlop={5} onPress={goBack} style={s.backBtnOnHero} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={21} color={C.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={s.profileBody}>
            <View style={s.profileIdRow}>
              {t.avatar_url ? (
                <Image source={{ uri: t.avatar_url }} style={s.profileAvatar} />
              ) : (
                <View style={s.profileAvatarFallback}>
                  <Text style={s.profileAvatarText}>{initials(t.name)}</Text>
                </View>
              )}
              <View style={{ flex: 1, paddingBottom: 4 }}>
                <Text style={s.profileName}>{t.name}</Text>
                {t.specialization ? <Text style={s.profileSpec}>{t.specialization}</Text> : null}
              </View>
            </View>

            {t.bio ? <Text style={s.profileBio}>{t.bio}</Text> : null}

            {fitRows.length > 0 && (
              <>
                <Text style={s.sectionLabel}>How {firstName(t.name)} fits you</Text>
                <FitPanel key={t.id} rows={fitRows} />
              </>
            )}

            {certs.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Certifications</Text>
                <View style={s.chipRow}>
                  {certs.map((c) => (
                    <View key={c} style={s.certChip}><Text style={s.certChipText}>{c}</Text></View>
                  ))}
                </View>
              </>
            )}

            {days.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Working hours</Text>
                <View style={s.hoursCard}>
                  {days.map(({ day, hours }, i) => (
                    <View key={day}>
                      {i > 0 && <View style={s.hairline} />}
                      <View style={s.hoursRow}>
                        <Text style={s.hoursDay}>{day}</Text>
                        <Text style={s.hoursTime}>
                          {hours.start && hours.end ? `${hours.start} – ${hours.end}` : 'Available'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {selected.plans.length > 0 && (
              <>
                <Text style={s.sectionLabel}>
                  Passes · {selected.plans.length} published
                </Text>
                <View style={{ gap: 9 }}>
                  {selected.plans.map((p) => {
                    const { weeks, workouts, hasSeason } = planComposition(p);
                    const shownWeeks = Math.min(weeks, 12);
                    // Arithmetic on published data only — never a promise of
                    // results. Omitted when weeks/workouts/days are missing.
                    const perWeek = weeks > 0 && workouts > 0 ? Math.round(workouts / weeks) : 0;
                    const showLoad = perWeek > 0 && wantedDays !== null && !!answers.days;
                    return (
                      <View key={p.id} style={s.passRow}>
                        <View style={s.passTopRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.passName}>{p.name}</Text>
                            <Text style={s.passMeta}>{planSummary(p)}</Text>
                            {p.description ? (
                              <Text style={s.passDesc} numberOfLines={2}>{p.description}</Text>
                            ) : null}
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={s.passPrice}>${Number(p.price)}</Text>
                            <Text style={s.passPeriod}>{p.period === 'year' ? 'a year' : 'a month'}</Text>
                          </View>
                        </View>
                        {hasSeason && (
                          <View style={s.weekStrip}>
                            {Array.from({ length: shownWeeks }, (_, i) => (
                              <View key={i} style={s.weekSeg} />
                            ))}
                            {weeks > 12 && <Text style={s.weekOverflow}>+{weeks - 12}</Text>}
                          </View>
                        )}
                        {showLoad && (
                          <Text style={s.loadLine}>
                            {perWeek <= (wantedDays as number)
                              ? `≈${perWeek} session${perWeek === 1 ? '' : 's'} a week — fits your ${answers.days}`
                              : `≈${perWeek} sessions a week — more than your ${answers.days}, worth asking about`}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={s.honestNote}>
              Everything above is what {firstName(t.name)} has actually written and published —
              no scores, no averages.
            </Text>
          </View>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + 70 }]}>
          <TouchableOpacity
            style={s.primaryBtn}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setStep('request');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Ask to join ${firstName(t.name)}`}
          >
            <Text style={s.primaryBtnText}>Ask to join</Text>
          </TouchableOpacity>
          <Text style={s.footerHint}>A request, not a purchase — nothing is charged</Text>
        </View>
      </View>
    );
  }

  // ── 26d: the request ───────────────────────────────────────────────────────
  if (step === 'request' && selected) {
    const t = selected.trainer;
    return (
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header title={`Ask ${firstName(t.name)}`} sub="The answer is theirs — this sends a request, not money" />
        <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.summaryCard}>
            <Text style={s.summaryEyebrow}>What {firstName(t.name)} will see</Text>
            <View style={{ gap: 11, marginTop: 13 }}>
              {[
                { k: 'Goal', v: answers.goal },
                { k: 'Days a week', v: answers.days ? `${answers.days}${answers.time && answers.time !== 'It varies' ? `, ${answers.time.toLowerCase()}` : ''}` : undefined },
                { k: 'Coaching style', v: answers.style },
              ].filter((r) => !!r.v).map((r, i) => (
                <View key={r.k}>
                  {i > 0 && <View style={s.hairline} />}
                  <View style={[s.summaryRow, i > 0 && { marginTop: 11 }]}>
                    <Text style={s.summaryKey}>{r.k}</Text>
                    <Text style={s.summaryVal}>{r.v}</Text>
                  </View>
                </View>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => { setStep('intake'); setQIndex(0); }}
              style={s.editRow}
              accessibilityRole="button"
              accessibilityLabel="Edit your answers"
            >
              <Text style={s.editText}>Your answers from a minute ago — edit any of them</Text>
            </TouchableOpacity>
          </View>

          <View style={s.noteCard}>
            <Text style={s.noteLabel}>Anything they should know?</Text>
            <TextInput
              style={s.noteInput}
              placeholder="Where you're stuck, what you've tried, what you're after…"
              placeholderTextColor={C.textFaint}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={500}
              accessibilityLabel="Message to the coach"
            />
          </View>

          <View style={s.promiseCard}>
            <Text style={s.promiseTitle}>Nothing is charged</Text>
            <Text style={s.promiseBody}>
              This starts a conversation, not a subscription. If {firstName(t.name)} takes you on,
              you'll see exactly what a pass contains before any money moves. If it's a no,
              come back here and ask someone else.
            </Text>
          </View>

          {sendError ? (
            <View style={s.errorRow}>
              <Ionicons name="alert-circle" size={18} color={C.danger} />
              <Text style={s.errorText}>{sendError}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + 70 }]}>
          <TouchableOpacity
            style={[s.primaryBtn, sending && { opacity: 0.6 }]}
            onPress={sendRequest}
            disabled={sending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Send request"
          >
            {sending ? (
              <ActivityIndicator size="small" color={C.onAccent} />
            ) : (
              <Text style={s.primaryBtnText}>Send request</Text>
            )}
          </TouchableOpacity>
          <Text style={s.footerHint}>Coaches usually reply within a day — the answer is theirs</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Sent ───────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      <View style={[s.centerFill, { paddingHorizontal: 36 }]}>
        <View style={s.successRing}>
          <Ionicons name="checkmark" size={34} color={C.accent} />
        </View>
        <Text style={s.sentTitle}>
          Sent to {firstName(selected?.trainer?.name) || 'the coach'}
        </Text>
        <Text style={s.sentBody}>
          Your answers and your note are in their inbox. Coaches usually reply within a day —
          and the answer is theirs to give. Until they accept, nothing about your plan changes:
          your sessions stay exactly as they are. If they take you on, we will say so here and
          your programme will come from them.
        </Text>
        <TouchableOpacity
          style={[s.primaryBtn, { alignSelf: 'stretch', marginTop: 26 }]}
          onPress={() => router.back()}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={s.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17, borderCurve: 'continuous', backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: F.headingBold, fontSize: 20, color: C.textPrimary },
  headerSub: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 2 },

  soloNoteRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  soloNoteDot: {
    width: 6, height: 6, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent, marginTop: 6,
  },
  soloNoteText: { flex: 1, fontFamily: F.body, fontSize: 13, lineHeight: 18.5, color: C.textMuted },
  progressRow: {
    flexDirection: 'row', gap: 4, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: C.borderMuted,
  },
  progressSeg: { flex: 1, height: 3, borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.borderMuted },
  progressSegDone: { backgroundColor: C.accent },
  progressSegActive: { backgroundColor: 'rgba(198,242,78,0.45)' },

  // paddingBottom is applied inline from the safe-area inset + floating tab bar.
  body: { padding: 20 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },

  // Intake
  questionPrompt: { fontFamily: F.headingBold, fontSize: 27, lineHeight: 33.5, color: C.textPrimary, marginTop: 6 },
  questionContext: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21.5, color: C.textMuted, marginTop: 9 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 16,
  },
  optionCardActive: { borderColor: C.accent, borderWidth: 1.5, backgroundColor: '#1E211D' },
  radio: { width: 20, height: 20, borderRadius: 10, borderCurve: 'continuous', borderWidth: 1.5, borderColor: '#3E443A' },
  radioActive: { borderWidth: 5.5, borderColor: C.accent, backgroundColor: C.bg },
  optionLabel: { fontFamily: F.bodySemiBold, fontSize: 17, color: C.textPrimary },
  optionSub: { fontFamily: F.body, fontSize: 13.5, color: C.textMuted, marginTop: 3 },
  intakeFootnote: {
    fontFamily: F.body, fontSize: 13, color: C.textFaint,
    textAlign: 'center', marginTop: 18,
  },
  prefillBanner: {
    backgroundColor: C.accentSofter, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 12, borderCurve: 'continuous', padding: 12, marginBottom: 16,
  },
  prefillTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefillText: {
    flex: 1, fontFamily: F.body, fontSize: 13, lineHeight: 19,
    color: C.textSecondary, fontVariant: ['tabular-nums'],
  },
  prefillAction: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.accent, marginTop: 8 },

  // Matches
  matchCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 20, borderCurve: 'continuous', padding: 16,
    // The cover banner needs to reach the card's rounded edge.
    overflow: 'hidden',
  },
  // The Ladder team-card ground, marketplace edition: the coach's real photo
  // as a banner. Bleeds to the card edges (negative margins undo the padding).
  matchCover: {
    marginTop: -16, marginHorizontal: -16, marginBottom: 12,
    width: undefined, aspectRatio: 16 / 7, backgroundColor: C.bg,
  },
  matchCardTop: { borderColor: 'rgba(198,242,78,0.22)' },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matchAvatar: { width: 46, height: 46, borderRadius: 23, borderCurve: 'continuous' },
  matchAvatarFallback: {
    width: 46, height: 46, borderRadius: 23, borderCurve: 'continuous', backgroundColor: '#2A3320',
    alignItems: 'center', justifyContent: 'center',
  },
  matchAvatarText: { fontFamily: F.headingBold, fontSize: 17, color: C.accent },
  matchName: { fontFamily: F.bodyBold, fontSize: 17.5, color: C.textPrimary },
  matchSpec: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 2 },
  matchBio: { fontFamily: F.body, fontSize: 14.5, lineHeight: 22.5, color: C.textSecondary, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  factChip: { backgroundColor: C.accentSoft, borderRadius: 999, borderCurve: 'continuous', paddingHorizontal: 10, paddingVertical: 5 },
  factChipText: { fontFamily: F.bodyBold, fontSize: 12, color: C.accent },
  gapChip: { borderWidth: 1, borderColor: '#3B3227', borderRadius: 999, borderCurve: 'continuous', paddingHorizontal: 10, paddingVertical: 5 },
  gapChipText: { fontFamily: F.bodyBold, fontSize: 12, color: C.warning },
  honestNote: {
    fontFamily: F.body, fontSize: 13, lineHeight: 19, color: C.textFaint,
    marginTop: 18, paddingHorizontal: 2,
  },

  // Profile
  profileHero: { height: 140, backgroundColor: '#1A2113', overflow: 'hidden' },
  // Taller when a real photo fills it — 140pt was sized for a colour block.
  profileHeroImg: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  // Bottom scrim so the avatar that overlaps the hero edge keeps its contrast
  // against any photograph.
  profileHeroScrim: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 70,
    backgroundColor: 'rgba(16,18,16,0.55)',
  },
  backBtnOnHero: {
    width: 34, height: 34, borderRadius: 17, borderCurve: 'continuous', backgroundColor: 'rgba(16,18,16,0.6)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 20,
  },
  profileBody: { paddingHorizontal: 20 },
  profileIdRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 13, marginTop: -26 },
  profileAvatar: { width: 66, height: 66, borderRadius: 33, borderCurve: 'continuous', borderWidth: 3, borderColor: C.bg },
  profileAvatarFallback: {
    width: 66, height: 66, borderRadius: 33, borderCurve: 'continuous', backgroundColor: '#2A3320',
    borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center',
  },
  profileAvatarText: { fontFamily: F.headingBold, fontSize: 23.5, color: C.accent },
  profileName: { fontFamily: F.headingBold, fontSize: 22.5, color: C.textPrimary },
  profileSpec: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 2 },
  profileBio: { fontFamily: F.body, fontSize: 15.5, lineHeight: 24.5, color: C.textSecondary, marginTop: 17 },
  sectionLabel: {
    fontFamily: F.bodyBold, fontSize: 12.5, color: C.textFaint,
    letterSpacing: 1, textTransform: 'uppercase', marginTop: 26, marginBottom: 12,
  },
  certChip: {
    borderWidth: 1, borderColor: C.border, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 12, paddingVertical: 7,
  },
  certChipText: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textSecondary },
  hoursCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 18, borderCurve: 'continuous', padding: 16,
  },
  hoursRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  hoursDay: { fontFamily: F.body, fontSize: 15, color: C.textSecondary },
  hoursTime: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary },
  hairline: { height: 1, backgroundColor: '#21241F' },

  // Fit panel — facts as bars, no score anywhere.
  fitCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 16,
  },
  fitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  fitLabel: {
    flex: 1, fontFamily: F.body, fontSize: 14, color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  fitTrack: {
    width: 96, height: 6, borderRadius: 2, borderCurve: 'continuous',
    backgroundColor: C.borderMuted, overflow: 'hidden',
  },
  // A fact that is checkable and FALSE: empty bar, amber outline — honest,
  // not hidden. (An uncheckable fact never gets a row at all.)
  fitTrackGap: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.warning },
  fitFill: { height: '100%', borderRadius: 2, borderCurve: 'continuous', backgroundColor: C.accent },
  fitSentence: {
    fontFamily: F.body, fontSize: 13, lineHeight: 19, color: C.textMuted,
    marginTop: 12, fontVariant: ['tabular-nums'],
  },
  passRow: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 15,
  },
  passTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // One lime segment per week — the season's physical shape, capped at 12.
  weekStrip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  weekSeg: { width: 14, height: 5, borderRadius: 2, borderCurve: 'continuous', backgroundColor: C.accent },
  weekOverflow: {
    fontFamily: F.bodySemiBold, fontSize: 11, color: C.textMuted,
    marginLeft: 4, fontVariant: ['tabular-nums'],
  },
  loadLine: {
    fontFamily: F.body, fontSize: 13, lineHeight: 19, color: C.textMuted,
    marginTop: 8, fontVariant: ['tabular-nums'],
  },
  passName: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  passMeta: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 2 },
  passDesc: { fontFamily: F.body, fontSize: 13, color: C.textFaint, marginTop: 4, lineHeight: 18 },
  passPrice: { fontFamily: F.headingBold, fontSize: 15.5, color: C.textPrimary },
  passPeriod: { fontFamily: F.body, fontSize: 12, color: C.textMuted, marginTop: 1 },

  // Request
  summaryCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 20, borderCurve: 'continuous', padding: 17,
  },
  summaryEyebrow: {
    fontFamily: F.bodyBold, fontSize: 12.5, color: C.textFaint,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  summaryKey: { flex: 1, fontFamily: F.body, fontSize: 15, color: C.textSecondary },
  summaryVal: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary, maxWidth: '55%', textAlign: 'right' },
  editRow: { marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#21241F' },
  editText: { fontFamily: F.body, fontSize: 13, color: C.textFaint },
  noteCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 20, borderCurve: 'continuous', padding: 17, marginTop: 12,
  },
  noteLabel: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  noteInput: {
    backgroundColor: '#1E211D', borderWidth: 1, borderColor: '#2E322B',
    borderRadius: 13, borderCurve: 'continuous', padding: 13, marginTop: 11, minHeight: 101,
    textAlignVertical: 'top', fontFamily: F.body, fontSize: 14.5,
    color: C.textPrimary, lineHeight: 21.5,
  },
  promiseCard: {
    backgroundColor: '#141613', borderWidth: 1, borderColor: '#1E211D',
    borderRadius: 18, borderCurve: 'continuous', padding: 16, marginTop: 12,
  },
  promiseTitle: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textPrimary },
  promiseBody: { fontFamily: F.body, fontSize: 14, lineHeight: 21.5, color: C.textMuted, marginTop: 5 },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14,
    backgroundColor: C.dangerSoft, borderRadius: 12, borderCurve: 'continuous', padding: 12,
  },
  errorText: { flex: 1, fontFamily: F.body, fontSize: 14, color: C.danger },
  secondaryBtn: {
    minHeight: 50, paddingHorizontal: 22, borderRadius: 999, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.borderMuted, backgroundColor: C.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },

  // Footer
  footer: {
    paddingHorizontal: 20, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#1E211D', backgroundColor: C.bg,
  },
  primaryBtn: {
    backgroundColor: C.accent, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 15, alignItems: 'center',
  },
  primaryBtnText: { fontFamily: F.bodyBold, fontSize: 17, color: C.onAccent },
  footerHint: {
    fontFamily: F.body, fontSize: 12.5, color: C.textFaint,
    textAlign: 'center', marginTop: 10,
  },

  // Sent
  successRing: {
    width: 62, height: 62, borderRadius: 31, borderCurve: 'continuous', borderWidth: 1.5,
    borderColor: 'rgba(198,242,78,0.4)', backgroundColor: C.accentSofter,
    alignItems: 'center', justifyContent: 'center',
  },
  sentTitle: { fontFamily: F.headingBold, fontSize: 23.5, color: C.textPrimary, marginTop: 6 },
  sentBody: {
    fontFamily: F.body, fontSize: 14.5, lineHeight: 22.5, color: C.textMuted,
    textAlign: 'center', marginTop: 4,
  },

  // Empty / guard
  emptyTitle: { fontFamily: F.headingSemiBold, fontSize: 18, color: C.textSecondary },
  emptyBody: {
    fontFamily: F.body, fontSize: 14, color: C.textFaint,
    textAlign: 'center', lineHeight: 20, paddingHorizontal: 30,
  },
});
