/**
 * find-coach.tsx — the coachless athlete's path ("FitLink Coach Match").
 *
 * Intake — kept for legacy accounts: one question at a time (goal, days a
 *      week), held in local state and merged into clients.assessment_data
 *      .intake by request_coach. When onboarding already answered BOTH (auth
 *      user_metadata intake_goal_key / intake_goal + intake_days, via
 *      lib/intakeMap.ts) the intake step is skipped entirely: the finder opens
 *      on people. Time of day and coaching style are optional chips on the
 *      request step — nothing scores on them, so they are never required.
 * Matches — "Who should run your week?" A horizontal card pager, one coach
 *      per card, BEST FIT first. Every line on a card is a derived fact from
 *      the coach's real profile and hours (lime check) or an honest gap
 *      (amber dot): does their specialization/bio mention the goal, do their
 *      working_hours cover the athlete's chosen weekdays (intake_training_days)
 *      or day count, do they cover the time of day. No ratings, no athlete
 *      counts, no response-time stats, no compatibility percentages — none of
 *      that data exists, so none of it is shown (INVARIANTS §4).
 * Profile — the same card opened up: bio in full, the fit panel as labelled
 *      bars (full / empty amber / row omitted when unknowable), certifications,
 *      and their published passes with true week/workout composition
 *      (lib/passWeeks).
 * Request — pre-written from the answers, edited in place; time/style are
 *      one-tap chips that append a clause. Sending runs the same real
 *      mechanism as before: request_coach (SECURITY DEFINER RPC → request +
 *      first message + coach notification). A request, not a purchase.
 * Sent — a moment plus a three-step timeline of what happens next; the
 *      drafted week is explicitly kept.
 *
 * Fixed dark/lime system (constants/coachDesign.ts). No useTheme().
 * Motion: constants/motion.ts; Reduce Motion → 200 ms crossfades only, bars
 * at final width, no scaling.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform, useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler, useAnimatedReaction,
  withTiming, withDelay, withSequence, interpolate, Extrapolation, runOnJS,
  FadeIn, FadeInDown, FadeInLeft, type SharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useClientIdentity, useClientTraining } from '../../context/ClientContext';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { Motion, Ease } from '../../constants/motion';
import { ClientRoute } from '../../types/routes';
import { totalWeeks } from '../../lib/passWeeks';
import { useReducedMotion } from '../../lib/useReducedMotion';
import {
  FIND_COACH_GOAL_LABELS, FIND_COACH_DAY_BUCKETS, INTAKE_GOAL_LABELS,
  goalToFindCoachLabel, goalLabelToKey, goalKeyToLabel, daysToFindCoachBucket, daysToNumber,
} from '../../lib/intakeMap';
import type { TrackNode } from '../../context/AppContext';

// ─── Intake model ────────────────────────────────────────────────────────────

type IntakeAnswers = {
  goal?: string;
  days?: string;
  /** Optional — chosen on the request step, never required. */
  time?: string;
  /** Optional — chosen on the request step, never required. */
  style?: string;
};

type IntakeQuestion = {
  id: keyof IntakeAnswers;
  prompt: string;
  context: string;
  options: { label: string; sub?: string }[];
};

// The two questions that decide the ranking. Labels double as stored values
// (assessment_data.intake.goal / .days) — lib/coachMatch.ts and
// lib/intakeMap.ts know this vocabulary, so change it there too.
const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: 'goal',
    prompt: 'What do you want a coach for?',
    context: 'This decides who we show you — not a directory of everyone.',
    options: [
      { label: FIND_COACH_GOAL_LABELS.strength, sub: 'Barbells, progressive overload, real numbers' },
      { label: FIND_COACH_GOAL_LABELS.fat_loss, sub: 'Food is most of the work here' },
      { label: FIND_COACH_GOAL_LABELS.return, sub: 'Trained before, the routine lapsed' },
      { label: 'Train for an event', sub: 'Race, meet or a date on the calendar' },
      { label: FIND_COACH_GOAL_LABELS.pain, sub: 'Coaches who work alongside physios' },
      { label: 'Start from nothing', sub: 'Never trained properly before' },
    ],
  },
  {
    id: 'days',
    prompt: 'How many days a week can you actually train?',
    context: 'Be honest — a plan you can keep beats a plan you admire.',
    options: FIND_COACH_DAY_BUCKETS.map((label) => ({ label })),
  },
];

// Optional context for the coach. Nothing ranks on these, so they live on
// the request step as one-tap chips the athlete can leave empty.
const OPTIONAL_QUESTIONS: IntakeQuestion[] = [
  {
    id: 'time',
    prompt: 'When do you usually train?',
    context: 'Checked against the coach’s working hours if you answer.',
    options: [
      { label: 'Mornings' },
      { label: 'Daytime' },
      { label: 'Evenings' },
      { label: 'It varies' },
    ],
  },
  {
    id: 'style',
    prompt: 'How do you want to be coached?',
    context: 'Goes with your request so they can say if they’re the wrong fit.',
    options: [
      { label: 'Push me' },
      { label: 'Keep it steady' },
      { label: 'Just give me the plan' },
    ],
  },
];

// The clause each optional chip appends to the pre-written message. Toggling
// the chip off removes exactly this sentence again.
const CHIP_CLAUSES: Record<string, string> = {
  Mornings: 'I usually train in the mornings.',
  Daytime: 'I usually train during the day.',
  Evenings: 'I usually train in the evenings.',
  'It varies': 'My training time varies week to week.',
  'Push me': 'Push me — I do better when I’m held to it.',
  'Keep it steady': 'I’d rather keep it steady than go all-out.',
  'Just give me the plan': 'Just give me the plan and I’ll follow it.',
};

const NOTE_MAX = 600;

// ─── Weekdays — intake_training_days ['tue','thu','sat'] ─────────────────────

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
const WEEK_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_SHORT: Record<WeekdayKey, string> = {
  sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
};
const WEEKDAY_FULL: Record<WeekdayKey, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

/**
 * Metadata is athlete-written data: accept only known keys, once each, in
 * week order, never more than seven. Anything else is [] (no preference).
 */
function parseTrainingDays(raw: unknown): WeekdayKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<WeekdayKey>();
  for (const v of raw.slice(0, 14)) {
    const key = String(v ?? '').trim().toLowerCase().slice(0, 3) as WeekdayKey;
    if ((WEEKDAY_KEYS as readonly string[]).includes(key)) seen.add(key);
  }
  return WEEK_ORDER.filter((k) => seen.has(k));
}

/** "Tuesday, Thursday and Saturday" (full) or "Tue · Thu · Sat" (short). */
function listDays(keys: WeekdayKey[], mode: 'full' | 'short'): string {
  if (mode === 'short') return keys.map((k) => WEEKDAY_SHORT[k]).join(' · ');
  const names = keys.map((k) => WEEKDAY_FULL[k]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ─── Prefill from onboarding — never re-ask what the athlete already said ────
//
// Sources, in priority order:
//   1. auth user_metadata.intake_goal_key / intake_goal / intake_days /
//      intake_training_days (the onboarding contract — lib/onboardingDraft.ts,
//      lib/intakeMap.ts)
//   2. auth user_metadata.fitness_goal / commit_days  (legacy signup metadata)
//   3. clientData.assessment_data.intake.goal_key / goal / days_per_week
// Only answers that map cleanly onto THIS screen's option labels are carried;
// anything ambiguous is asked again — a wrong prefill is worse than a repeat.

function mapPrefillGoal(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  // Already one of this screen's own labels (e.g. a saved marketplace intake).
  if (INTAKE_QUESTIONS[0].options.some((o) => o.label === raw)) return raw;
  return goalToFindCoachLabel(raw);
}

type Prefill = {
  answers: IntakeAnswers;
  carried: string;    // human-readable list of what was carried, '' if nothing
  qIndex: number;     // first unanswered question
  complete: boolean;  // goal AND days known — the intake step can be skipped
  goalLabel?: string; // the athlete's own words from onboarding (canonical label)
  daysN?: number;     // integer days a week when the source carried one
  trainingDays: WeekdayKey[]; // chosen weekdays, [] when onboarding did not ask
};

function derivePrefill(user: any, clientData: any): Prefill {
  const meta = (user?.user_metadata as any) || {};
  const intake = clientData?.assessment_data?.intake || {};
  const goal = goalToFindCoachLabel(meta.intake_goal_key)
    ?? mapPrefillGoal(meta.intake_goal)
    ?? mapPrefillGoal(meta.fitness_goal)
    ?? goalToFindCoachLabel(intake.goal_key)
    ?? mapPrefillGoal(intake.goal);
  const daysRaw = [meta.intake_days, meta.commit_days, intake.days_per_week, intake.days]
    .find((v) => daysToFindCoachBucket(v) !== undefined);
  const days = daysToFindCoachBucket(daysRaw);
  const answers: IntakeAnswers = {};
  if (goal) answers.goal = goal;
  if (days) answers.days = days;
  const carried = [goal ? 'Goal' : null, days ? `${days} a week` : null].filter(Boolean).join(' · ');
  let qIndex = 0;
  while (qIndex < INTAKE_QUESTIONS.length && answers[INTAKE_QUESTIONS[qIndex].id] !== undefined) qIndex++;
  const complete = !!goal && !!days;
  // The chips quote the athlete's own words from onboarding when we have
  // them (the canonical label), else this screen's label for the same goal.
  const goalLabel = goalKeyToLabel(meta.intake_goal_key)
    ?? (typeof meta.intake_goal === 'string' && meta.intake_goal.trim() ? meta.intake_goal.trim() : goal);
  const daysN = daysToNumber(daysRaw);
  const trainingDays = parseTrainingDays(meta.intake_training_days ?? intake.training_days);
  return { answers, carried, qIndex, complete, goalLabel, daysN, trainingDays };
}

// Keywords per goal, matched against specialization + bio. Purely textual —
// if nothing matches we say nothing, we never invent a fit.
const GOAL_KEYWORDS: Record<string, string[]> = {
  [FIND_COACH_GOAL_LABELS.strength]: ['strength', 'powerlifting', 'barbell', 'lifting', 'weightlifting', 'hypertrophy', 'muscle'],
  [FIND_COACH_GOAL_LABELS.fat_loss]: ['fat loss', 'weight loss', 'nutrition', 'body composition', 'cutting', 'diet'],
  [FIND_COACH_GOAL_LABELS.return]: ['beginner', 'foundation', 'fundamentals', 'general fitness', 'getting started', 'habit'],
  'Train for an event': ['endurance', 'running', 'marathon', 'triathlon', 'race', 'competition', 'event', 'sport'],
  [FIND_COACH_GOAL_LABELS.pain]: ['rehab', 'injury', 'physio', 'recovery', 'mobility', 'corrective'],
  'Start from nothing': ['beginner', 'foundation', 'fundamentals', 'general fitness', 'getting started'],
};

// ─── Working-hours helpers (trainers.working_hours JSONB, shape:
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

/** Which of the athlete's chosen weekdays the coach has hours on. null when the coach set no hours. */
type DayFit = { ok: boolean; covered: WeekdayKey[]; missing: WeekdayKey[] };

function coversWeekdays(wh: any, wanted: WeekdayKey[]): DayFit | null {
  const days = enabledDays(wh);
  if (days.length === 0 || wanted.length === 0) return null;
  const has = new Set(days.map(({ day }) => day.slice(0, 3).toLowerCase()));
  const covered = wanted.filter((k) => has.has(k));
  const missing = wanted.filter((k) => !has.has(k));
  return { ok: missing.length === 0, covered, missing };
}

// ─── Matching — facts only ───────────────────────────────────────────────────

type CoachMatch = {
  trainer: any;
  plans: any[];
  score: number;
  facts: string[];    // lime check — derivable, true, in the athlete's favor
  gaps: string[];     // amber dot — derivable, true, and honest about a mismatch
  goalMatch: boolean;
  dayFit: DayFit | null; // weekday coverage when both sides named days
};

function buildMatch(trainer: any, plans: any[], answers: IntakeAnswers, trainingDays: WeekdayKey[]): CoachMatch {
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

  // Schedule — working_hours where the coach has actually set them. The
  // athlete's chosen weekdays when onboarding asked for them, else the count.
  const days = enabledDays(trainer.working_hours);
  const wanted = desiredDayCount(answers.days);
  const dayFit = coversWeekdays(trainer.working_hours, trainingDays);
  if (dayFit) {
    if (dayFit.ok) {
      score += 1;
      facts.push(`Works ${listDays(trainingDays, 'full')}`);
    } else {
      gaps.push(`No hours on ${listDays(dayFit.missing, 'full')}`);
    }
  } else if (days.length > 0 && wanted !== null) {
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
    if (answers.time) facts.push(`Works ${answers.time.toLowerCase()}`);
  } else if (timeFit === false) {
    gaps.push(`Hours not set for ${(answers.time || '').toLowerCase()}`);
  }

  // Published passes — real plans, real prices. Shown in the card footer
  // ("N passes · from $X/mo"), so they count for the ranking only here.
  if (plans.length > 0) score += 1;

  return { trainer, plans, score, facts, gaps, goalMatch, dayFit };
}

/** "2 passes · from $49/mo" — price omitted when none is numeric; null with no plans. */
function passLine(plans: any[]): string | null {
  if (plans.length === 0) return null;
  const count = `${plans.length} pass${plans.length === 1 ? '' : 'es'}`;
  const priced = plans.filter((p) => Number.isFinite(Number(p.price)) && Number(p.price) > 0);
  const monthly = priced.filter((p) => p.period !== 'year');
  const pool = monthly.length > 0 ? monthly : priced;
  if (pool.length === 0) return count;
  const cheapest = Math.min(...pool.map((p) => Number(p.price)));
  return `${count} · from $${cheapest}/${monthly.length > 0 ? 'mo' : 'yr'}`;
}

// ─── Pass composition — real track math, same as my-pass ─────────────────────

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

/** "8 weeks · 3 sessions a week · 24 workouts" — each part only when derivable. */
function planSummary(plan: any): string {
  const { weeks, workouts, hasSeason } = planComposition(plan);
  const parts: string[] = [];
  if (hasSeason && weeks > 0) parts.push(`${weeks} week${weeks === 1 ? '' : 's'}`);
  const perWeek = hasSeason && weeks > 0 && workouts > 0 ? Math.round(workouts / weeks) : 0;
  if (perWeek > 0) parts.push(`${perWeek} session${perWeek === 1 ? '' : 's'} a week`);
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

// ─── The pre-written message ─────────────────────────────────────────────────

function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** "get stronger on the big lifts" — the athlete's canonical words, as a verb phrase. */
function goalPhrase(goal?: string): string {
  if (!goal) return '';
  const key = goalLabelToKey(goal);
  return lowerFirst(key ? INTAKE_GOAL_LABELS[key] : goal);
}

/** "Tuesday, Thursday and Saturday" or "3 days a week". */
function daysPhrase(days: string | undefined, trainingDays: WeekdayKey[]): string {
  if (trainingDays.length > 0) return listDays(trainingDays, 'full');
  if (!days) return '';
  return `${days} a week`.replace('5 or more a week', '5 or more days a week');
}

function removeClause(text: string, clause: string): string {
  if (!clause) return text;
  const idx = text.indexOf(clause);
  if (idx < 0) return text;
  return `${text.slice(0, idx).trimEnd()} ${text.slice(idx + clause.length).trimStart()}`.trim();
}

function appendClause(text: string, clause: string): string {
  if (!clause) return text;
  const base = text.trimEnd();
  const next = base ? `${base} ${clause}` : clause;
  // The counter caps at NOTE_MAX; a clause that would overflow is left off the
  // text (the chip still travels with the request in p_intake).
  return next.length <= NOTE_MAX ? next : text;
}

function buildNote(first: string, goal: string, days: string, answers: IntakeAnswers): string {
  let text = `Hi ${first}, I’d like to train with you.`;
  if (goal && days) text += ` I want to ${goal} and I can train ${days}.`;
  else if (goal) text += ` I want to ${goal}.`;
  else if (days) text += ` I can train ${days}.`;
  if (answers.time) text = appendClause(text, CHIP_CLAUSES[answers.time] || '');
  if (answers.style) text = appendClause(text, CHIP_CLAUSES[answers.style] || '');
  return text;
}

/** Split the note so the goal and days phrases can be highlighted wherever they still sit. */
function highlightSegments(text: string, phrases: string[]): { text: string; hit: boolean }[] {
  const marks: { start: number; end: number }[] = [];
  phrases.filter(Boolean).forEach((p) => {
    const idx = text.indexOf(p);
    if (idx >= 0) marks.push({ start: idx, end: idx + p.length });
  });
  marks.sort((a, b) => a.start - b.start);
  const out: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  marks.forEach((m) => {
    if (m.start < cursor) return; // overlapping — keep the first
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start), hit: false });
    out.push({ text: text.slice(m.start, m.end), hit: true });
    cursor = m.end;
  });
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out;
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({ uri, name, size, textSize }: { uri?: string | null; name?: string; size: number; textSize: number }) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={[s.avatar, shape]} contentFit="cover" transition={Motion.quick} />;
  }
  return (
    <View style={[s.avatar, s.avatarFallback, shape]}>
      <Text style={[s.avatarText, { fontSize: textSize }]}>{initials(name)}</Text>
    </View>
  );
}

// ─── Matches — the card pager ────────────────────────────────────────────────

const CARD_GAP = 12;
const CARD_MAX_W = 318;

type CardLine = { text: string; ok: boolean };

function cardLines(m: CoachMatch): CardLine[] {
  return [
    ...m.facts.map((text) => ({ text, ok: true })),
    ...m.gaps.map((text) => ({ text, ok: false })),
  ].slice(0, 3);
}

function CoachCard({
  match, index, count, cardW, scrollX, reduced, onOpen,
}: {
  match: CoachMatch; index: number; count: number; cardW: number;
  scrollX: SharedValue<number>; reduced: boolean; onOpen: () => void;
}) {
  const step = cardW + CARD_GAP;
  const t = match.trainer;
  const lines = cardLines(match);
  const passes = passLine(match.plans);
  const best = index === 0 && match.score > 0;

  // The neighbour sits at 0.55 opacity and grows to full as it centres.
  // Reduce Motion keeps the opacity cue (it is the page indicator) and drops
  // the scale.
  const anim = useAnimatedStyle(() => {
    const range = [(index - 1) * step, index * step, (index + 1) * step];
    const opacity = interpolate(scrollX.value, range, [0.55, 1, 0.55], Extrapolation.CLAMP);
    if (reduced) return { opacity };
    const scale = interpolate(scrollX.value, range, [0.94, 1, 0.94], Extrapolation.CLAMP);
    return { opacity, transform: [{ scale }] };
  }, [index, step, reduced]);

  return (
    <Animated.View style={[s.card, { width: cardW }, anim]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${t.name}, coach ${index + 1} of ${count}. See profile`}
      >
        <View style={s.cardCover}>
          {t.cover_url ? (
            <>
              <Image source={{ uri: t.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={Motion.quick} recyclingKey={t.id} />
              <LinearGradient colors={['rgba(16,18,16,0)', 'rgba(16,18,16,0.88)']} style={s.cardScrim} />
            </>
          ) : (
            <LinearGradient colors={[C.raised, C.surface]} style={StyleSheet.absoluteFill} />
          )}
          {best && (
            <View style={s.bestTag}>
              <Text style={s.bestTagText}>BEST FIT</Text>
            </View>
          )}
          <View style={s.cardIdRow}>
            <Avatar uri={t.avatar_url} name={t.name} size={64} textSize={20} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardName} numberOfLines={1}>{t.name}</Text>
              {t.specialization ? <Text style={s.cardSpec} numberOfLines={1}>{t.specialization}</Text> : null}
            </View>
          </View>
        </View>

        <View style={s.cardBody}>
          {t.bio ? <Text style={s.cardBio} numberOfLines={3}>“{String(t.bio).trim()}”</Text> : null}
          {lines.length > 0 && (
            <View style={{ gap: 8 }}>
              {lines.map((line, i) => (
                <Animated.View
                  key={line.text}
                  style={s.factLine}
                  entering={reduced
                    ? FadeIn.duration(Motion.reduced)
                    : FadeInLeft.duration(240).delay(240 + i * 80).easing(Ease.out)}
                >
                  {line.ok ? (
                    <View style={s.factCheck}>
                      <Ionicons name="checkmark" size={11} color={C.onAccent} />
                    </View>
                  ) : (
                    <View style={s.gapRing}>
                      <View style={s.gapDot} />
                    </View>
                  )}
                  <Text style={[s.factText, !line.ok && s.gapText]} numberOfLines={2}>{line.text}</Text>
                </Animated.View>
              ))}
            </View>
          )}
          <View style={s.cardFoot}>
            <Text style={s.cardFootText} numberOfLines={1}>
              {passes ?? 'No published passes'}
            </Text>
            <Text style={s.cardFootAction}>See profile</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function MatchPager({
  matches, cardW, width, page, reduced, onPage, onOpen,
}: {
  matches: CoachMatch[]; cardW: number; width: number; page: number; reduced: boolean;
  onPage: (i: number) => void; onOpen: (m: CoachMatch) => void;
}) {
  const step = cardW + CARD_GAP;
  const scrollX = useSharedValue(0);
  const count = matches.length;
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => { scrollX.value = e.contentOffset.x; },
  });
  // Page change → selection tick, once per page, on the JS side.
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  const notify = useCallback((i: number) => onPageRef.current(i), []);
  useAnimatedReaction(
    () => Math.min(count - 1, Math.max(0, Math.round(scrollX.value / step))),
    (cur, prev) => {
      if (prev !== null && cur !== prev) runOnJS(notify)(cur);
    },
    [count, step],
  );

  return (
    <Animated.View
      entering={reduced ? FadeIn.duration(Motion.reduced) : FadeInDown.duration(Motion.screen).easing(Ease.out)}
    >
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={step}
        snapToAlignment="start"
        disableIntervalMomentum
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Right padding lets the last card snap to the same left edge as the rest.
        contentContainerStyle={{ paddingLeft: 20, paddingRight: Math.max(20, width - cardW - 20), gap: CARD_GAP }}
        accessibilityLabel={`Coaches, ${page + 1} of ${count}`}
      >
        {matches.map((m, i) => (
          <CoachCard
            key={m.trainer.id}
            match={m}
            index={i}
            count={count}
            cardW={cardW}
            scrollX={scrollX}
            reduced={reduced}
            onOpen={() => onOpen(m)}
          />
        ))}
      </Animated.ScrollView>
      <View style={s.dots} accessible accessibilityLabel={`Coach ${page + 1} of ${count}`}>
        {matches.map((m, i) => (
          <View key={m.trainer.id} style={[s.dot, i === page && s.dotActive]} />
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Fit card — derived facts as bars, never a score ─────────────────────────
//
// INVARIANTS §4: no percentages, no stars, no invented "match" number. Each
// row is a checkable fact rendered as label + value + a bar that FILLS (true)
// or stays EMPTY in amber (false); a fact we cannot derive is not passed in
// at all — the caller omits the row rather than render a false one.

type FitRow = { label: string; value: string; ok: boolean };

const BAR_MS = 450;
const BAR_STAGGER = 80;

function FitBar({ ok, progress, index, total }: { ok: boolean; progress: SharedValue<number>; index: number; total: number }) {
  const totalMs = BAR_MS + BAR_STAGGER * Math.max(0, total - 1);
  const start = (BAR_STAGGER * index) / totalMs;
  const end = (BAR_STAGGER * index + BAR_MS) / totalMs;
  const fill = useAnimatedStyle(() => ({
    width: `${interpolate(progress.value, [start, end], [0, 100], Extrapolation.CLAMP)}%`,
  }), [start, end]);
  return (
    <View style={s.fitTrack}>
      {ok ? <Animated.View style={[s.fitFill, fill]} /> : null}
    </View>
  );
}

function FitCard({ name, rows, reduced }: { name: string; rows: FitRow[]; reduced: boolean }) {
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      // Reduce Motion: bars at final width, the card itself crossfades.
      progress.value = 1;
      return;
    }
    const totalMs = BAR_MS + BAR_STAGGER * Math.max(0, rows.length - 1);
    progress.value = withTiming(1, { duration: totalMs, easing: Ease.out });
  }, [reduced, rows.length, progress]);

  return (
    <Animated.View style={s.fitCard} entering={FadeIn.duration(reduced ? Motion.reduced : Motion.screen)}>
      <Text style={s.mono}>HOW {name.toUpperCase()} FITS YOU</Text>
      <View style={{ gap: 10 }}>
        {rows.map((row, i) => (
          <View key={row.label} accessible accessibilityLabel={`${row.label}: ${row.value}`}>
            <View style={s.fitHead}>
              <Text style={s.fitLabel}>{row.label}</Text>
              <Text style={[s.fitValue, !row.ok && s.fitValueGap]}>{row.value}</Text>
            </View>
            <FitBar ok={row.ok} progress={progress} index={i} total={rows.length} />
          </View>
        ))}
      </View>
      <Text style={s.fitFoot}>
        Facts from {name}’s profile and hours. No ratings, because we don’t collect any.
      </Text>
    </Animated.View>
  );
}

// ─── Sent — the moment and the timeline ──────────────────────────────────────

function SentMoment({
  first, reduced, hasToday, onTrain, onHome,
}: {
  first: string; reduced: boolean; hasToday: boolean; onTrain: () => void; onHome: () => void;
}) {
  // ring IS the scale: 0.6 → 1.06 → 1 over 600 ms; opacity rides the first
  // part of that travel. Reduce Motion: no scale, a 200 ms fade only.
  const ring = useSharedValue(0.6);
  const plane = useSharedValue(0);
  const thread = useSharedValue(reduced ? 1 : 0);
  const [threadH, setThreadH] = useState(0);

  useEffect(() => {
    // The one success haptic on this path — Send itself fires only an impact.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (reduced) {
      ring.value = withTiming(1, { duration: Motion.reduced });
      plane.value = withTiming(1, { duration: Motion.reduced });
      thread.value = 1;
      return;
    }
    ring.value = withSequence(
      withTiming(1.06, { duration: 360, easing: Ease.out }),
      withTiming(1, { duration: 240, easing: Ease.inOut }),
    );
    plane.value = withTiming(1, { duration: Motion.moment, easing: Ease.out });
    thread.value = withDelay(500, withTiming(1, { duration: 900, easing: Ease.out }));
  }, [reduced, ring, plane, thread]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0.6, 0.9], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: reduced ? 1 : ring.value }],
  }), [reduced]);
  const planeStyle = useAnimatedStyle(() => ({
    opacity: plane.value,
    transform: reduced ? [] : [
      { translateX: interpolate(plane.value, [0, 1], [-40, 0]) },
      { translateY: interpolate(plane.value, [0, 1], [30, 0]) },
      { rotate: `${interpolate(plane.value, [0, 1], [-20, 0])}deg` },
    ],
  }), [reduced]);
  const threadStyle = useAnimatedStyle(() => ({ height: thread.value * threadH }), [threadH]);

  const steps = [
    { title: 'Now', body: `Your message and your week are in ${first}’s inbox.`, state: 'done' as const },
    { title: 'Usually within a day', body: `${first} replies in Messages. You can talk before anything changes.`, state: 'next' as const },
    { title: 'When they say yes', body: `Your sessions start coming from ${first}. Everything you logged stays.`, state: 'later' as const },
  ];
  const stepIn = (i: number) => (reduced
    ? FadeIn.duration(Motion.reduced)
    : FadeInDown.duration(Motion.screen).delay(500 + i * 140).easing(Ease.out));

  return (
    <View style={s.sentWrap}>
      <Animated.View style={[s.sentRing, ringStyle]}>
        <Animated.View style={planeStyle}>
          <Ionicons name="paper-plane-outline" size={44} color={C.accent} />
        </Animated.View>
      </Animated.View>
      <Animated.View entering={reduced ? FadeIn.duration(Motion.reduced) : FadeIn.duration(Motion.screen).delay(200)} style={{ alignItems: 'center' }}>
        <Text style={s.sentTitle} accessibilityRole="header">Sent to {first}.</Text>
        <Text style={s.sentBody}>Your drafted week stays exactly as it is until they say yes.</Text>
      </Animated.View>

      <View style={s.timeline}>
        <View
          style={s.timelineRail}
          onLayout={(e: LayoutChangeEvent) => setThreadH(Math.max(0, e.nativeEvent.layout.height - 20))}
        >
          <View style={s.timelineBase} />
          <Animated.View style={[s.timelineThread, threadStyle]} />
        </View>
        <View style={{ flex: 1, gap: 22 }}>
          {steps.map((st, i) => (
            <Animated.View key={st.title} style={s.step} entering={stepIn(i)}>
              {st.state === 'done' ? (
                <View style={s.stepDone}><Ionicons name="checkmark" size={13} color={C.onAccent} /></View>
              ) : (
                <View style={[s.stepRing, st.state === 'later' && s.stepRingLater]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.stepTitle}>{st.title}</Text>
                <Text style={s.stepBody}>{st.body}</Text>
              </View>
            </Animated.View>
          ))}
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {hasToday ? (
        <>
          <TouchableOpacity style={s.primaryBtn} onPress={onTrain} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Train today's session">
            <Text style={s.primaryBtnText}>Train today’s session</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={onHome} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back to Today">
            <Text style={s.ghostBtnText}>Back to Today</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={s.primaryBtn} onPress={onHome} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Back to Today">
          <Text style={s.primaryBtnText}>Back to Today</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

type Step = 'intake' | 'matches' | 'profile' | 'request' | 'sent';

export default function FindCoachScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { user } = useAuth();
  const { clientData, refreshData, pendingCoach, cancelCoachRequest } = useClientIdentity();
  const { todayWorkout } = useClientTraining();

  // Seed from onboarding once, at mount — the athlete already answered these.
  const [prefill] = useState(() => derivePrefill(user, clientData));
  // Both answers known → open on matches; the intake step is only a Change
  // link away. Otherwise open on the first unanswered question.
  const [step, setStep] = useState<Step>(prefill.complete ? 'matches' : 'intake');
  const [skippedIntake, setSkippedIntake] = useState(prefill.complete);
  const [qIndex, setQIndex] = useState(prefill.qIndex);
  const [answers, setAnswers] = useState<IntakeAnswers>(prefill.answers);
  // '' = nothing carried, or the banner was dismissed.
  const [prefillNote, setPrefillNote] = useState(prefill.carried);

  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matches, setMatches] = useState<CoachMatch[]>([]);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<CoachMatch | null>(null);

  const [note, setNote] = useState('');
  const [noteCoachId, setNoteCoachId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // The chosen weekdays only hold while the day count they came with does —
  // an athlete who changes "3 days" to "5 or more" has outgrown ['tue','thu','sat'].
  const trainingDays = answers.days === prefill.answers.days ? prefill.trainingDays : [];

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

  const cardW = Math.min(CARD_MAX_W, width - 40);

  // ── Load + rank coaches on real data only ─────────────────────────────────
  const loadMatches = useCallback(async (a: IntakeAnswers, days: WeekdayKey[]) => {
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
        .map((t: any) => buildMatch(t, plansByTrainer.get(t.id) || [], a, days))
        .sort((x, y) => y.score - x.score)
        .slice(0, 5);
      setMatches(ranked);
      setPage(0);
    } catch {
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  // Intake skipped: the ranking runs straight away on the carried answers.
  useEffect(() => {
    if (prefill.complete) loadMatches(prefill.answers, prefill.trainingDays);
    // Mount-only by design — prefill is fixed at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      loadMatches(next, next.days === prefill.answers.days ? prefill.trainingDays : []);
    }
  };

  // The Change link on the matches header: reopen the two questions with the
  // carried answers still selected, so one tap changes one thing.
  const changeAnswers = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSkippedIntake(false);
    setPrefillNote('');
    setQIndex(0);
    setStep('intake');
  };

  const goBack = () => {
    if (step === 'intake') {
      if (qIndex > 0) setQIndex(qIndex - 1);
      else router.back();
    } else if (step === 'matches') {
      // No intake step was shown on this visit — back leaves the screen.
      if (skippedIntake) router.back();
      else {
        setStep('intake');
        setQIndex(INTAKE_QUESTIONS.length - 1);
      }
    } else if (step === 'profile') {
      setStep('matches');
    } else if (step === 'request') {
      setEditingNote(false);
      setStep(selected ? 'profile' : 'matches');
    } else {
      router.back();
    }
  };

  const openProfile = (m: CoachMatch) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(m);
    setStep('profile');
  };

  const onPageChange = useCallback((i: number) => {
    setPage(i);
    Haptics.selectionAsync();
  }, []);

  // Entering the request step writes the first message once per coach; the
  // athlete's edits survive a trip back to the profile.
  const openRequest = (m: CoachMatch) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(m);
    if (noteCoachId !== m.trainer.id) {
      setNote(buildNote(firstName(m.trainer.name), goalPhrase(answers.goal), daysPhrase(answers.days, trainingDays), answers));
      setNoteCoachId(m.trainer.id);
    }
    setSendError('');
    setEditingNote(false);
    setStep('request');
  };

  // One tap selects, a second tap on the same chip clears it; the chip's
  // sentence follows it into and out of the message.
  const toggleChip = (id: 'time' | 'style', label: string) => {
    Haptics.selectionAsync();
    const prev = answers[id];
    const next = prev === label ? undefined : label;
    setAnswers((a) => ({ ...a, [id]: next }));
    setNote((n) => appendClause(removeClause(n, prev ? CHIP_CLAUSES[prev] || '' : ''), next ? CHIP_CLAUSES[next] || '' : ''));
  };

  // ── Send the request — the real mechanism ─────────────────────────────────
  const sendRequest = async () => {
    if (!selected || sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendError('');
    setSending(true);
    try {
      if (!user) throw new Error('Not signed in');
      if (alreadyLinked) throw new Error('You already have a coach on this account.');

      const athleteName = (user.user_metadata as any)?.name || user.email?.split('@')[0] || 'Athlete';
      const athleteEmail = user.email || '';

      // First message: the pre-written note as the athlete left it, in the
      // real conversation the coach will reply in. The RPC writes it
      // server-side — athletes cannot insert conversations under RLS.
      const content = note.trim()
        || buildNote(firstName(selected.trainer.name), goalPhrase(answers.goal), daysPhrase(answers.days, trainingDays), answers);

      // A REQUEST, not an attachment: the coach must accept before anything
      // about the athlete's plan changes (request_coach RPC).
      // request_coach MERGES this into assessment_data.intake, so the
      // onboarding answers already there survive. goal_key carries the
      // canonical vocabulary (lib/intakeMap.ts) alongside this screen's label.
      const goalKey = goalLabelToKey(answers.goal);
      const { data: result, error: rpcErr } = await supabase.rpc('request_coach', {
        p_trainer_id: selected.trainer.id,
        p_intake: {
          ...answers,
          ...(goalKey ? { goal_key: goalKey } : {}),
          ...(trainingDays.length > 0 ? { training_days: trainingDays } : {}),
          source: 'marketplace',
        },
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

  // ── Intake — one question at a time (legacy accounts) ─────────────────────
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
                  setAnswers({ time: answers.time, style: answers.style });
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

  // ── Matches — who should run your week? ───────────────────────────────────
  if (step === 'matches') {
    const goalChip = (skippedIntake && prefill.goalLabel) || answers.goal;
    const daysChip = trainingDays.length > 0
      ? listDays(trainingDays, 'short')
      : prefill.daysN !== undefined && answers.days === prefill.answers.days
      ? `${prefill.daysN} days a week`
      : answers.days ? `${answers.days} a week` : undefined;
    const current = matches[Math.min(page, Math.max(0, matches.length - 1))];
    const n = matches.length;
    return (
      <View style={s.container}>
        <View style={[s.topRow, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={goBack} style={s.roundBtn} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={21} color={C.textPrimary} />
          </TouchableOpacity>
          {!loadingMatches && n > 0 ? (
            <Text style={s.mono}>{n} {n === 1 ? 'COACH FITS' : 'COACHES FIT'}</Text>
          ) : <View />}
          <View style={{ width: 44 }} />
        </View>

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
          <>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={s.matchesHead}>
                <Text style={s.title} accessibilityRole="header">Who should run your week?</Text>
                <View style={s.matchedRow} accessible accessibilityLabel={`Matched on ${[goalChip, daysChip].filter(Boolean).join(', ')}`}>
                  <Text style={s.matchedLabel}>Matched on</Text>
                  {goalChip ? <View style={s.matchedChip}><Text style={s.matchedChipText}>{goalChip}</Text></View> : null}
                  {daysChip ? <View style={s.matchedChip}><Text style={s.matchedChipText}>{daysChip}</Text></View> : null}
                  <TouchableOpacity
                    hitSlop={12}
                    onPress={changeAnswers}
                    accessibilityRole="button"
                    accessibilityLabel="Change what we matched on"
                  >
                    <Text style={s.matchedAction}>Change</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <MatchPager
                matches={matches}
                cardW={cardW}
                width={width}
                page={page}
                reduced={reduced}
                onPage={onPageChange}
                onOpen={openProfile}
              />
            </ScrollView>

            <View style={[s.footer, { paddingBottom: insets.bottom + 70 }]}>
              <TouchableOpacity
                style={s.primaryBtn}
                activeOpacity={0.85}
                onPress={() => current && openRequest(current)}
                accessibilityRole="button"
                accessibilityLabel={`Ask ${firstName(current?.trainer?.name)} to run it`}
              >
                <Text style={s.primaryBtnText}>Ask {firstName(current?.trainer?.name)} to run it</Text>
              </TouchableOpacity>
              <Text style={s.footerHint}>A request, not a purchase. Your drafted week stays until they say yes.</Text>
            </View>
          </>
        )}
      </View>
    );
  }

  // ── Profile — the card opened up ──────────────────────────────────────────
  if (step === 'profile' && selected) {
    const t = selected.trainer;
    const first = firstName(t.name);
    const certs: string[] = typeof t.certifications === 'string'
      ? t.certifications.split(',').map((c: string) => c.trim()).filter(Boolean)
      : [];
    const days = enabledDays(t.working_hours);

    // Fit rows — only what is derivable for THIS coach. A missing fact (no
    // working hours set, time preference "It varies") omits the row entirely
    // rather than rendering a false one.
    const wantedDays = desiredDayCount(answers.days);
    const timeFit = coversTime(t.working_hours, answers.time);
    const fitRows: FitRow[] = [];
    // A coach with NO bio and NO specialization cannot keyword-match any
    // goal — but that is UNMEASURED, not a mismatch. An amber "doesn't
    // train your goal" bar would be a false claim about missing data
    // (INVARIANTS §4), so the row is omitted, exactly like the schedule
    // rows when working_hours were never set.
    const goalCheckable = !!`${t.specialization || ''}${t.bio || ''}`.trim();
    if (answers.goal && goalCheckable) {
      fitRows.push({ label: 'Trains your goal', value: selected.goalMatch ? 'Yes' : 'Not mentioned', ok: selected.goalMatch });
    }
    if (selected.dayFit) {
      fitRows.push({
        label: `Your ${trainingDays.length} days covered`,
        value: selected.dayFit.ok ? listDays(trainingDays, 'short') : `${listDays(selected.dayFit.missing, 'short')} not set`,
        ok: selected.dayFit.ok,
      });
    } else if (days.length > 0 && wantedDays !== null) {
      const ok = days.length >= wantedDays;
      fitRows.push({ label: `Your ${wantedDays} days covered`, value: ok ? 'Yes' : `Only ${days.length}`, ok });
    }
    if (timeFit !== null && answers.time) {
      fitRows.push({ label: answers.time, value: timeFit ? 'Yes' : 'Hours not set', ok: timeFit });
    }
    fitRows.push({
      label: 'Published passes',
      value: selected.plans.length > 0 ? `${selected.plans.length}` : 'None yet',
      ok: selected.plans.length > 0,
    });

    return (
      <View style={s.container}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}>
          {/* The coach's own photograph as the hero when they have one; no
              photo, and the gradient stays — an honest colour, never a stock gym. */}
          <View style={s.hero}>
            {t.cover_url ? (
              <Image source={{ uri: t.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={Motion.quick} />
            ) : (
              <LinearGradient colors={[C.raised, C.bg]} style={StyleSheet.absoluteFill} />
            )}
            <LinearGradient colors={['rgba(16,18,16,0)', 'rgba(16,18,16,0.88)']} style={s.heroScrim} />
            <TouchableOpacity
              onPress={goBack}
              style={[s.roundBtn, s.heroBack, { top: insets.top + 8 }]}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={21} color={C.textPrimary} />
            </TouchableOpacity>
            <View style={s.heroId}>
              <Avatar uri={t.avatar_url} name={t.name} size={76} textSize={24} />
              <View style={{ flex: 1, paddingBottom: 6 }}>
                <Text style={s.heroName} accessibilityRole="header">{t.name}</Text>
                {t.specialization ? <Text style={s.heroSpec}>{t.specialization}</Text> : null}
              </View>
            </View>
          </View>

          <View style={s.profileBody}>
            {t.bio ? <Text style={s.profileBio}>{String(t.bio).trim()}</Text> : null}

            {fitRows.length > 0 && <FitCard key={t.id} name={first} rows={fitRows} reduced={reduced} />}

            {certs.length > 0 && (
              <View>
                <Text style={s.mono}>CERTIFICATIONS</Text>
                <View style={s.chipRow}>
                  {certs.map((c) => (
                    <View key={c} style={s.certChip}><Text style={s.certChipText}>{c}</Text></View>
                  ))}
                </View>
              </View>
            )}

            {selected.plans.length > 0 && (
              <View>
                <Text style={s.mono}>PASSES</Text>
                <View style={{ gap: 10, marginTop: 10 }}>
                  {selected.plans.map((p) => {
                    const { weeks, hasSeason } = planComposition(p);
                    const shownWeeks = Math.min(weeks, 12);
                    const price = Number(p.price);
                    return (
                      <View key={p.id} style={s.passCard} accessible accessibilityLabel={`${p.name}, ${planSummary(p)}`}>
                        <View style={s.passTopRow}>
                          <Text style={s.passName} numberOfLines={2}>{p.name}</Text>
                          {Number.isFinite(price) && price > 0 ? (
                            <Text style={s.passPrice}>
                              ${price}<Text style={s.passPeriod}>/{p.period === 'year' ? 'yr' : 'mo'}</Text>
                            </Text>
                          ) : null}
                        </View>
                        {hasSeason && (
                          <View style={s.weekStrip}>
                            {Array.from({ length: shownWeeks }, (_, i) => (
                              <View key={i} style={s.weekSeg} />
                            ))}
                            {weeks > 12 && <Text style={s.weekOverflow}>+{weeks - 12}</Text>}
                          </View>
                        )}
                        <Text style={s.passMeta}>{planSummary(p)}</Text>
                        {p.description ? <Text style={s.passDesc} numberOfLines={2}>{p.description}</Text> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={[s.footer, { paddingBottom: insets.bottom + 70 }]}>
          <TouchableOpacity
            style={s.primaryBtn}
            activeOpacity={0.85}
            onPress={() => openRequest(selected)}
            accessibilityRole="button"
            accessibilityLabel={`Ask ${first} to run my week`}
          >
            <Text style={s.primaryBtnText}>Ask {first} to run my week</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Request — we wrote the first message ──────────────────────────────────
  if (step === 'request' && selected) {
    const t = selected.trainer;
    const first = firstName(t.name);
    const segments = highlightSegments(note, [goalPhrase(answers.goal), daysPhrase(answers.days, trainingDays)]);
    return (
      <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.topRow, { paddingTop: insets.top + 8, justifyContent: 'flex-start', gap: 12 }]}>
          <TouchableOpacity onPress={goBack} style={s.roundBtn} accessibilityRole="button" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={21} color={C.textPrimary} />
          </TouchableOpacity>
          <View style={s.toRow}>
            <Avatar uri={t.avatar_url} name={t.name} size={32} textSize={12} />
            <Text style={s.toText}>To {first}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={[s.body, { paddingTop: 12, paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={s.title} accessibilityRole="header">We wrote the first message. Change anything.</Text>
          <Text style={s.subtitle}>It carries your goal and your days, so {first} answers you, not a form.</Text>

          <Animated.View
            style={s.noteCard}
            entering={reduced ? FadeIn.duration(Motion.reduced) : FadeInDown.duration(Motion.screen).delay(120).easing(Ease.out)}
          >
            {editingNote ? (
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
                onBlur={() => setEditingNote(false)}
                multiline
                autoFocus
                maxLength={NOTE_MAX}
                placeholder={`Hi ${first}, I’d like to train with you.`}
                placeholderTextColor={C.textFaint}
                accessibilityLabel="Message to the coach"
              />
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setEditingNote(true)}
                accessibilityRole="button"
                accessibilityLabel={`Message to ${first}: ${note}. Double tap to edit`}
              >
                <Text style={s.noteText}>
                  {note
                    ? segments.map((seg, i) => (
                      <Text key={i} style={seg.hit ? s.noteHighlight : undefined}>{seg.text}</Text>
                    ))
                    : <Text style={{ color: C.textFaint }}>Hi {first}, I’d like to train with you.</Text>}
                </Text>
              </TouchableOpacity>
            )}
            <View style={s.noteMetaRow}>
              <Text style={s.monoSmall}>{editingNote ? 'EDITING' : 'EDIT ANY OF IT'}</Text>
              <Text style={[s.monoSmall, note.length >= NOTE_MAX && { color: C.warning }]}>{note.length} / {NOTE_MAX}</Text>
            </View>
          </Animated.View>

          {/* Optional context — nothing ranks on these, so an empty answer is
              a fine answer. One tap adds a sentence; the same tap removes it. */}
          <View style={{ marginTop: 18 }}>
            <Text style={s.mono}>OPTIONAL, ONE TAP</Text>
            <View style={[s.chipRow, { marginTop: 10 }]}>
              {OPTIONAL_QUESTIONS.flatMap((q) => q.options.map((opt) => {
                const active = answers[q.id] === opt.label;
                return (
                  <TouchableOpacity
                    key={`${q.id}:${opt.label}`}
                    style={[s.choiceChip, active && s.choiceChipActive]}
                    onPress={() => toggleChip(q.id as 'time' | 'style', opt.label)}
                    activeOpacity={0.8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${opt.label}, ${q.prompt}`}
                    hitSlop={4}
                  >
                    <Text style={[s.choiceChipText, active && s.choiceChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              }))}
            </View>
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
            style={[s.primaryBtn, s.primaryBtnRow, sending && { opacity: 0.6 }]}
            onPress={sendRequest}
            disabled={sending}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Send to ${first}`}
          >
            {sending ? (
              <ActivityIndicator size="small" color={C.onAccent} />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color={C.onAccent} />
                <Text style={s.primaryBtnText}>Send to {first}</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={s.footerHint}>Nothing is charged. Coaches usually reply within a day.</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── Sent ───────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { paddingTop: insets.top + 52, paddingBottom: insets.bottom + 70 }]}>
      <SentMoment
        first={firstName(selected?.trainer?.name) || 'the coach'}
        reduced={reduced}
        hasToday={!!todayWorkout}
        onTrain={() => router.replace(ClientRoute.workouts)}
        // Home is the tab group's index — the same target app/_layout.tsx uses.
        onHome={() => router.replace('/(client-tabs)')}
      />
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

  // The 44pt top row (matches, request).
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  roundBtn: {
    width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous', backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center',
  },
  mono: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2, color: C.textFaint, fontVariant: ['tabular-nums'] },
  monoSmall: { fontFamily: F.mono, fontSize: 10.5, color: C.textFaint, fontVariant: ['tabular-nums'] },
  title: { fontFamily: F.headingBold, fontSize: 26, lineHeight: 30, color: C.textPrimary },
  subtitle: { fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.textSecondary, marginTop: 8 },

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

  // Intake (legacy accounts) — unchanged.
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
  matchesHead: { paddingHorizontal: 20, paddingTop: 18 },
  matchedRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  matchedLabel: { fontFamily: F.body, fontSize: 13.5, color: C.textSecondary },
  matchedChip: {
    minHeight: 26, paddingHorizontal: 10, justifyContent: 'center',
    borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.accentSoft,
  },
  matchedChipText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.accent },
  matchedAction: {
    fontFamily: F.bodySemiBold, fontSize: 13, color: C.textSecondary,
    textDecorationLine: 'underline', paddingVertical: 4,
  },

  card: {
    marginTop: 18, borderRadius: 24, borderCurve: 'continuous', overflow: 'hidden',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  cardCover: { height: 200, justifyContent: 'flex-end', padding: 16 },
  cardScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
  bestTag: {
    position: 'absolute', top: 14, left: 14, height: 26, paddingHorizontal: 10,
    borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.accent, justifyContent: 'center',
  },
  bestTagText: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1.5, color: C.onAccent },
  cardIdRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  cardName: { fontFamily: F.headingBold, fontSize: 22, color: C.textPrimary },
  cardSpec: { fontFamily: F.body, fontSize: 13, color: C.textSecondary, marginTop: 2 },
  cardBody: { padding: 16, gap: 12 },
  cardBio: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textPrimary },
  factLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  factCheck: {
    width: 18, height: 18, borderRadius: 9, borderCurve: 'continuous',
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  gapRing: {
    width: 18, height: 18, borderRadius: 9, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.warning, alignItems: 'center', justifyContent: 'center',
  },
  gapDot: { width: 6, height: 6, borderRadius: 3, borderCurve: 'continuous', backgroundColor: C.warning },
  factText: { flex: 1, fontFamily: F.body, fontSize: 13.5, color: C.textPrimary },
  gapText: { color: C.textSecondary },
  cardFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    borderTopWidth: 1, borderTopColor: C.borderMuted, paddingTop: 12,
  },
  cardFootText: { flex: 1, fontFamily: F.body, fontSize: 13, color: C.textSecondary, fontVariant: ['tabular-nums'] },
  cardFootAction: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.accent },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14 },
  dot: { width: 4, height: 4, borderRadius: 2, borderCurve: 'continuous', backgroundColor: C.border },
  dotActive: { width: 18, backgroundColor: C.accent },

  avatar: { borderWidth: 2, borderColor: C.bg, backgroundColor: C.border },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.headingBold, color: C.textPrimary },

  // Profile
  hero: { height: 300, backgroundColor: C.surface, overflow: 'hidden', justifyContent: 'flex-end' },
  heroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 170 },
  heroBack: { position: 'absolute', left: 20, backgroundColor: 'rgba(16,18,16,0.7)' },
  heroId: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, paddingHorizontal: 20 },
  heroName: { fontFamily: F.headingBold, fontSize: 28, lineHeight: 30, color: C.textPrimary },
  heroSpec: { fontFamily: F.body, fontSize: 13.5, color: C.textSecondary, marginTop: 4 },
  profileBody: { paddingHorizontal: 20, paddingTop: 18, gap: 18 },
  profileBio: { fontFamily: F.body, fontSize: 16, lineHeight: 25, color: C.textPrimary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  certChip: {
    minHeight: 34, paddingHorizontal: 12, justifyContent: 'center',
    borderWidth: 1, borderColor: C.border, borderRadius: 999, borderCurve: 'continuous',
  },
  certChipText: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textSecondary },

  // Fit card — facts as bars, no score anywhere.
  fitCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 16, gap: 12,
  },
  fitHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  fitLabel: { flex: 1, fontFamily: F.body, fontSize: 13.5, color: C.textPrimary },
  fitValue: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.accent, textAlign: 'right', fontVariant: ['tabular-nums'] },
  fitValueGap: { color: C.warning },
  fitTrack: {
    height: 3, borderRadius: 2, borderCurve: 'continuous', marginTop: 6,
    backgroundColor: C.borderMuted, overflow: 'hidden',
  },
  fitFill: { height: 3, borderRadius: 2, borderCurve: 'continuous', backgroundColor: C.accent },
  fitFoot: { fontFamily: F.body, fontSize: 12, lineHeight: 17, color: C.textFaint },

  // Passes
  passCard: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 16, gap: 10,
  },
  passTopRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  passName: { flex: 1, fontFamily: F.headingBold, fontSize: 17, color: C.textPrimary },
  passPrice: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary, fontVariant: ['tabular-nums'] },
  passPeriod: { fontFamily: F.body, color: C.textFaint },
  // One lime segment per week — the season's physical shape, capped at 12.
  weekStrip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekSeg: { flex: 1, height: 6, borderRadius: 2, borderCurve: 'continuous', backgroundColor: C.accent },
  weekOverflow: {
    fontFamily: F.bodySemiBold, fontSize: 11, color: C.textMuted,
    marginLeft: 4, fontVariant: ['tabular-nums'],
  },
  passMeta: { fontFamily: F.body, fontSize: 12.5, color: C.textSecondary, fontVariant: ['tabular-nums'] },
  passDesc: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.textFaint },

  // Request
  toRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toText: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  noteCard: {
    marginTop: 18, borderRadius: 16, borderCurve: 'continuous', backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, padding: 16, minHeight: 176, justifyContent: 'space-between',
  },
  noteText: { fontFamily: F.body, fontSize: 15, lineHeight: 24, color: C.textPrimary },
  noteHighlight: { backgroundColor: C.accentSoft, color: C.accent },
  noteInput: {
    fontFamily: F.body, fontSize: 15, lineHeight: 24, color: C.textPrimary,
    padding: 0, margin: 0, minHeight: 96, textAlignVertical: 'top',
  },
  noteMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  choiceChip: {
    minHeight: 38, paddingHorizontal: 14, justifyContent: 'center',
    borderWidth: 1, borderColor: C.border, borderRadius: 999, borderCurve: 'continuous',
  },
  choiceChipActive: { borderColor: C.accent, backgroundColor: C.accentSoft },
  choiceChipText: { fontFamily: F.body, fontSize: 13, color: C.textPrimary },
  choiceChipTextActive: { fontFamily: F.bodySemiBold, color: C.accent },
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
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: C.borderMuted, backgroundColor: C.bg,
  },
  primaryBtn: {
    minHeight: 56, backgroundColor: C.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnRow: { flexDirection: 'row', gap: 8 },
  primaryBtnText: { fontFamily: F.bodyBold, fontSize: 17, color: C.onAccent },
  ghostBtn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  ghostBtnText: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textSecondary },
  footerHint: {
    fontFamily: F.body, fontSize: 12.5, lineHeight: 17, color: C.textFaint,
    textAlign: 'center', marginTop: 10,
  },

  // Sent
  sentWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 20 },
  sentRing: {
    width: 120, height: 120, borderRadius: 60, borderCurve: 'continuous',
    backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accent,
    alignItems: 'center', justifyContent: 'center', marginTop: 54, overflow: 'hidden',
  },
  sentTitle: { fontFamily: F.headingBold, fontSize: 28, lineHeight: 32, color: C.textPrimary, textAlign: 'center', marginTop: 26 },
  sentBody: {
    fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textSecondary,
    textAlign: 'center', marginTop: 8, maxWidth: 300,
  },
  timeline: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 34 },
  timelineRail: { width: 22, alignItems: 'center' },
  timelineBase: { position: 'absolute', top: 10, bottom: 10, width: 1, backgroundColor: C.borderMuted },
  timelineThread: { position: 'absolute', top: 10, width: 1, backgroundColor: C.accent },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginLeft: -22 },
  stepDone: {
    width: 22, height: 22, borderRadius: 11, borderCurve: 'continuous',
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  stepRing: {
    width: 22, height: 22, borderRadius: 11, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.accent, backgroundColor: C.bg,
  },
  stepRingLater: { borderColor: C.border },
  stepTitle: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  stepBody: { fontFamily: F.body, fontSize: 13.5, lineHeight: 20, color: C.textSecondary, marginTop: 2 },

  // Empty / guard
  emptyTitle: { fontFamily: F.headingSemiBold, fontSize: 18, color: C.textSecondary },
  emptyBody: {
    fontFamily: F.body, fontSize: 14, color: C.textFaint,
    textAlign: 'center', lineHeight: 20, paddingHorizontal: 30,
  },
});
