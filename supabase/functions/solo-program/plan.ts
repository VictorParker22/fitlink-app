// ============================================================
// plan — the programming brain of the Solo builder.
//
// Pure TypeScript (no Deno APIs, no imports beyond sample.ts types) so jest
// can load it from tests/soloProgramPlan.test.ts and the edge function can
// import it.
//
// The model used to be asked "write N workouts from this 140-row list". It
// wrote plausible-looking sessions with no split logic, no progression, no
// coaching notes and, for a "Powerlifting" athlete, a week without a bench
// or a deadlift. A coach does not work like that. A coach decides the
// STRUCTURE first — the split for the days available, which movement
// pattern anchors each session, how many sets and reps at what effort for
// this goal in this week of the block — and only then picks the exercise
// that fits the person in front of them and tells them how to do it.
//
// So the structure is code (this file) and the model is left with the part
// it is good at: choosing between a handful of pattern-matched options for
// the athlete's experience and limitations, naming the session, writing a
// one-line cue per lift and one sentence on why this week looks the way it
// does. Everything the model returns is validated against the blueprint;
// anything missing is filled deterministically, so a week is ALWAYS
// produced, model or no model.
// ============================================================

/** The library columns this module reads; sample.ts's LibraryRow satisfies it. */
export interface LibraryRow {
  id: string;
  name: string;
  category?: string | null;
  muscle_group?: string | null;
  secondary_muscles?: string[] | null;
  equipment?: string | null;
}

/** Same normalisation as sample.ts (kept import-free so tsc never follows a .ts path). */
export function normalizeName(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ── Movement patterns ────────────────────────────────────────────────────────

export type Pattern =
  | 'squat' | 'hinge' | 'lunge'
  | 'hpush' | 'vpush' | 'hpull' | 'vpull'
  | 'core' | 'carry' | 'conditioning' | 'mobility'
  | 'accessory';

const PATTERN_LABEL: Record<Pattern, string> = {
  squat: 'squat', hinge: 'hip hinge', lunge: 'single-leg', hpush: 'horizontal push', vpush: 'overhead press',
  hpull: 'row', vpull: 'vertical pull', core: 'core', carry: 'loaded carry', conditioning: 'conditioning',
  mobility: 'mobility', accessory: 'accessory',
};

const has = (n: string, ...words: string[]) => words.some((w) => n.includes(w));

/** True for stretches, holds and drills that must never fill a working slot. */
export function isMobility(row: LibraryRow): boolean {
  const n = normalizeName(row.name);
  return has(n, 'stretch', 'circles', 'dorsal flexion', 'balance board', 'foam roll', 'roller', 'mobility', 'chin tuck', 'neck side', 'wrist circle', 'ankle', 'cat cow', 'pigeon');
}

/** Jumps, throws and Olympic-derived lifts: out for pain and for a return after a break. */
export function isBallistic(row: LibraryRow): boolean {
  const n = normalizeName(row.name);
  return has(n, 'jump', 'burpee', 'clean', 'snatch', 'plyo', 'hop', 'bound', 'throw', 'slam', 'box', 'depth', 'skater', 'tuck', 'sprint', 'thruster', 'high pull');
}

/**
 * Which slot an exercise can fill. Name first (the ExerciseDB names are
 * consistent), muscle group as the tie-breaker, category last.
 */
export function patternOf(row: LibraryRow): Pattern {
  const n = normalizeName(row.name);
  const mg = String(row.muscle_group ?? '').toLowerCase();
  const cat = String(row.category ?? '').toLowerCase();
  if (isMobility(row)) return 'mobility';
  if (cat === 'cardio' || mg === 'cardiovascular system') return 'conditioning';
  if (has(n, 'farmer', 'carry', 'suitcase walk', 'waiter walk')) return 'carry';
  if (has(n, 'lunge', 'split squat', 'step up', 'step ups', 'pistol', 'single leg squat', 'bulgarian', 'skater squat')) return 'lunge';
  if (has(n, 'deadlift', 'good morning', 'hip thrust', 'glute bridge', 'hip lift', 'swing', 'pull through', 'back extension', 'hyperextension', 'hip extension', 'reverse hyper', 'rdl')) return 'hinge';
  if (has(n, 'squat', 'leg press', 'hack', 'wall sit')) return 'squat';
  if (has(n, 'overhead press', 'military press', 'shoulder press', 'pike push', 'handstand', 'arnold press', 'push press', 'landmine press', 'z press')) return 'vpush';
  if (has(n, 'bench press', 'chest press', 'push up', 'pushup', 'floor press', 'dip', 'fly', 'flye', 'crossover', 'cross over', 'pec deck', 'svend')) return 'hpush';
  if (has(n, 'pull up', 'pullup', 'chin up', 'chinup', 'pulldown', 'pull down', 'lat pull', 'muscle up')) return 'vpull';
  if (has(n, 'row', 'face pull', 'rear delt', 'reverse fly', 'reverse flye', 'pullover', 'shrug', 'y raise', 'band pull apart', 'pull apart')) return 'hpull';
  if (mg === 'abs' || mg === 'spine' || cat === 'core' || has(n, 'plank', 'dead bug', 'bird dog', 'crunch', 'sit up', 'situp', 'leg raise', 'knee raise', 'hollow', 'pallof', 'rollout', 'roll out', 'ab wheel', 'russian twist', 'side bend', 'v up', 'mountain climber', 'flutter', 'bicycle')) return 'core';
  if (mg === 'quads' || mg === 'glutes') return 'squat';
  if (mg === 'hamstrings') return 'hinge';
  if (mg === 'pectorals' || mg === 'serratus anterior') return 'hpush';
  if (mg === 'lats') return 'vpull';
  if (mg === 'upper back' || mg === 'traps') return 'hpull';
  if (mg === 'delts') return 'vpush';
  return 'accessory';
}

/** Muscle-group hint a slot may carry (lower-case, as the library stores it). */
export type Muscle =
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'adductors' | 'abductors'
  | 'pectorals' | 'lats' | 'upper back' | 'delts' | 'biceps' | 'triceps' | 'forearms' | 'abs' | 'traps';

// ── Goals, tags and experience ───────────────────────────────────────────────

export type GoalKey = 'strength' | 'fat_loss' | 'return' | 'pain' | 'general';

export interface Tags {
  powerlifting: boolean;
  running: boolean;
  conditioning: boolean;
  hypertrophy: boolean;
  mobility: boolean;
  weightManagement: boolean;
}

/**
 * The onboarding goal key ('strength'|'fat_loss'|'return'|'pain') wins; the
 * free-text goal and the interest tags fill in for accounts that predate it.
 */
export function goalKeyFrom(goalKey: unknown, goalText: unknown, goals: unknown): GoalKey {
  const k = String(goalKey ?? '').toLowerCase();
  if (k === 'strength' || k === 'fat_loss' || k === 'return' || k === 'pain') return k;
  const t = `${String(goalText ?? '')} ${(Array.isArray(goals) ? goals : []).join(' ')}`.toLowerCase();
  if (/pain|injur|rehab|hurt/.test(t)) return 'pain';
  if (/back into|after a break|out of the habit|restart|return/.test(t)) return 'return';
  if (/fat|weight|lean|cut|slim|lose/.test(t)) return 'fat_loss';
  if (/strong|strength|lift|powerlift|muscle|big lifts/.test(t)) return 'strength';
  return 'general';
}

export function tagsFrom(goals: unknown): Tags {
  const list = (Array.isArray(goals) ? goals : []).map((g) => String(g ?? '').toLowerCase());
  const any = (re: RegExp) => list.some((g) => re.test(g));
  return {
    powerlifting: any(/powerlift|big lifts|strength/),
    running: any(/run|marathon|5k|10k|endurance/),
    conditioning: any(/condition|cardio|hiit|performance|athletic/),
    hypertrophy: any(/muscle|size|hypertrophy|bodybuild|tone/),
    mobility: any(/mobility|flexib|yoga|stretch/),
    weightManagement: any(/weight|fat|lean|cut|slim/),
  };
}

export type Experience = 'new' | 'returning' | 'training';

/** The three onboarding answers, plus a guess for free text. */
export function experienceFrom(raw: unknown): Experience {
  const t = String(raw ?? '').toLowerCase();
  if (/never|first time|brand new|new to/.test(t)) return 'new';
  if (/before|out of the habit|break|used to|returning/.test(t)) return 'returning';
  if (/training now|currently|regular|structured|experienced|years/.test(t)) return 'training';
  return 'returning';
}

// ── Prescription ─────────────────────────────────────────────────────────────

export type Role = 'main' | 'secondary' | 'accessory' | 'core' | 'finisher' | 'mobility';
export type Phase = 'base' | 'build' | 'peak' | 'deload';

export interface Slot {
  role: Role;
  pattern: Pattern;
  muscle?: Muscle;
  sets: number;
  reps: string;
  rest: number;
  rpe: number;
}

export interface SessionPlan {
  key: string;
  /** Fallback name when the model gives none. */
  name: string;
  category: 'strength' | 'cardio' | 'flexibility' | 'hiit' | 'circuit';
  /** What the session is for, in coach words; the model gets it and may improve it. */
  focus: string;
  slots: Slot[];
  estimated_duration: number;
}

export interface WeekPlan {
  split: string;
  splitLabel: string;
  week: number;
  phase: Phase;
  goal: GoalKey;
  sessions: SessionPlan[];
  /** Plain sentence the corner can say about this week. */
  rationale: string;
}

interface Scheme {
  main: { sets: number; reps: string; rpe: number; rest: number };
  secondary: { sets: number; reps: string; rpe: number; rest: number };
  accessory: { sets: number; reps: string; rpe: number; rest: number };
  core: { sets: number; reps: string; rest: number };
  finisherMinutes: number;
  phase: Phase;
}

/** Week 1..4 of a block, per goal. Week 4 is always a deload. */
export function schemeFor(goal: GoalKey, week: number): Scheme {
  const w = ((Math.max(1, Math.round(week)) - 1) % 4) + 1;
  const phase: Phase = w === 1 ? 'base' : w === 2 ? 'build' : w === 3 ? 'peak' : 'deload';
  const core = { sets: w === 4 ? 2 : 3, reps: '30-45s', rest: 45 };
  switch (goal) {
    case 'strength':
      return {
        phase,
        main: [{ sets: 4, reps: '5', rpe: 7, rest: 150 }, { sets: 4, reps: '4', rpe: 8, rest: 180 }, { sets: 5, reps: '3', rpe: 8.5, rest: 180 }, { sets: 2, reps: '5', rpe: 6, rest: 150 }][w - 1],
        secondary: [{ sets: 3, reps: '6', rpe: 7, rest: 120 }, { sets: 3, reps: '6', rpe: 7.5, rest: 120 }, { sets: 3, reps: '5', rpe: 8, rest: 120 }, { sets: 2, reps: '6', rpe: 6, rest: 120 }][w - 1],
        accessory: [{ sets: 3, reps: '8-10', rpe: 7, rest: 75 }, { sets: 3, reps: '8-10', rpe: 7.5, rest: 75 }, { sets: 3, reps: '8', rpe: 8, rest: 90 }, { sets: 2, reps: '10', rpe: 6, rest: 75 }][w - 1],
        core, finisherMinutes: 0,
      };
    case 'fat_loss':
      return {
        phase,
        main: [{ sets: 3, reps: '8', rpe: 7, rest: 90 }, { sets: 3, reps: '10', rpe: 7.5, rest: 75 }, { sets: 4, reps: '8', rpe: 8, rest: 75 }, { sets: 2, reps: '10', rpe: 6, rest: 90 }][w - 1],
        secondary: [{ sets: 3, reps: '10', rpe: 7, rest: 60 }, { sets: 3, reps: '12', rpe: 7.5, rest: 60 }, { sets: 3, reps: '10', rpe: 8, rest: 60 }, { sets: 2, reps: '12', rpe: 6, rest: 60 }][w - 1],
        accessory: [{ sets: 3, reps: '12', rpe: 7, rest: 45 }, { sets: 3, reps: '12-15', rpe: 7.5, rest: 45 }, { sets: 3, reps: '15', rpe: 8, rest: 45 }, { sets: 2, reps: '12', rpe: 6, rest: 45 }][w - 1],
        core, finisherMinutes: [8, 10, 12, 8][w - 1],
      };
    case 'return':
      return {
        phase,
        main: [{ sets: 3, reps: '8', rpe: 6.5, rest: 120 }, { sets: 3, reps: '8', rpe: 7, rest: 120 }, { sets: 4, reps: '8', rpe: 7.5, rest: 120 }, { sets: 2, reps: '8', rpe: 6, rest: 120 }][w - 1],
        secondary: [{ sets: 3, reps: '8', rpe: 6.5, rest: 90 }, { sets: 3, reps: '10', rpe: 7, rest: 90 }, { sets: 3, reps: '10', rpe: 7.5, rest: 90 }, { sets: 2, reps: '10', rpe: 6, rest: 90 }][w - 1],
        accessory: [{ sets: 2, reps: '12', rpe: 6.5, rest: 60 }, { sets: 3, reps: '12', rpe: 7, rest: 60 }, { sets: 3, reps: '12', rpe: 7.5, rest: 60 }, { sets: 2, reps: '12', rpe: 6, rest: 60 }][w - 1],
        core, finisherMinutes: 0,
      };
    case 'pain':
      return {
        phase,
        main: [{ sets: 3, reps: '10', rpe: 6, rest: 90 }, { sets: 3, reps: '10', rpe: 6.5, rest: 90 }, { sets: 3, reps: '12', rpe: 7, rest: 90 }, { sets: 2, reps: '10', rpe: 5.5, rest: 90 }][w - 1],
        secondary: [{ sets: 3, reps: '10', rpe: 6, rest: 75 }, { sets: 3, reps: '12', rpe: 6.5, rest: 75 }, { sets: 3, reps: '12', rpe: 7, rest: 75 }, { sets: 2, reps: '12', rpe: 5.5, rest: 75 }][w - 1],
        accessory: [{ sets: 2, reps: '12-15', rpe: 6, rest: 60 }, { sets: 2, reps: '15', rpe: 6.5, rest: 60 }, { sets: 3, reps: '12-15', rpe: 7, rest: 60 }, { sets: 2, reps: '12', rpe: 5.5, rest: 60 }][w - 1],
        core: { sets: 3, reps: '30s', rest: 45 }, finisherMinutes: 0,
      };
    default:
      return {
        phase,
        main: [{ sets: 3, reps: '8', rpe: 7, rest: 120 }, { sets: 3, reps: '10', rpe: 7.5, rest: 120 }, { sets: 4, reps: '8', rpe: 8, rest: 120 }, { sets: 2, reps: '10', rpe: 6, rest: 120 }][w - 1],
        secondary: [{ sets: 3, reps: '10', rpe: 7, rest: 90 }, { sets: 3, reps: '10', rpe: 7.5, rest: 90 }, { sets: 3, reps: '8-10', rpe: 8, rest: 90 }, { sets: 2, reps: '10', rpe: 6, rest: 90 }][w - 1],
        accessory: [{ sets: 3, reps: '12', rpe: 7, rest: 60 }, { sets: 3, reps: '12', rpe: 7.5, rest: 60 }, { sets: 3, reps: '10-12', rpe: 8, rest: 60 }, { sets: 2, reps: '12', rpe: 6, rest: 60 }][w - 1],
        core, finisherMinutes: 0,
      };
  }
}

// ── Splits ───────────────────────────────────────────────────────────────────

type SlotSpec = { role: Role; pattern: Pattern; muscle?: Muscle };
type SessionSpec = { key: string; name: string; category: SessionPlan['category']; focus: string; slots: SlotSpec[] };

const S = (role: Role, pattern: Pattern, muscle?: Muscle): SlotSpec => ({ role, pattern, ...(muscle ? { muscle } : {}) });

function fullBody(variant: 'A' | 'B' | 'C'): SessionSpec {
  if (variant === 'A') return { key: 'full_a', name: 'Full body A', category: 'strength', focus: 'Squat-led full body: one heavy lower lift, then push and pull.', slots: [S('main', 'squat'), S('secondary', 'hpush'), S('secondary', 'hpull'), S('accessory', 'hinge', 'hamstrings'), S('core', 'core')] };
  if (variant === 'B') return { key: 'full_b', name: 'Full body B', category: 'strength', focus: 'Hinge-led full body: deadlift pattern first, then overhead and vertical pull.', slots: [S('main', 'hinge'), S('secondary', 'vpush'), S('secondary', 'vpull'), S('accessory', 'lunge'), S('core', 'core')] };
  return { key: 'full_c', name: 'Full body C', category: 'strength', focus: 'Single-leg and volume day: lighter loads, more reps, everything moves.', slots: [S('main', 'lunge'), S('secondary', 'hpush', 'pectorals'), S('secondary', 'hpull', 'upper back'), S('accessory', 'squat', 'glutes'), S('core', 'core')] };
}

const UPPER_A: SessionSpec = { key: 'upper_a', name: 'Upper A', category: 'strength', focus: 'Press-led upper body: bench pattern first, rows to match, arms to finish.', slots: [S('main', 'hpush'), S('secondary', 'hpull'), S('secondary', 'vpush'), S('accessory', 'vpull', 'lats'), S('accessory', 'accessory', 'triceps'), S('accessory', 'accessory', 'biceps')] };
const LOWER_A: SessionSpec = { key: 'lower_a', name: 'Lower A', category: 'strength', focus: 'Squat-led lower body: heavy squat pattern, hinge to balance it, single-leg work after.', slots: [S('main', 'squat'), S('secondary', 'hinge'), S('secondary', 'lunge'), S('accessory', 'accessory', 'hamstrings'), S('accessory', 'accessory', 'calves'), S('core', 'core')] };
const UPPER_B: SessionSpec = { key: 'upper_b', name: 'Upper B', category: 'strength', focus: 'Pull-led upper body: vertical pull first, overhead press, then chest and shoulders.', slots: [S('main', 'vpull'), S('secondary', 'vpush'), S('secondary', 'hpush', 'pectorals'), S('accessory', 'hpull', 'upper back'), S('accessory', 'accessory', 'delts'), S('core', 'core')] };
const LOWER_B: SessionSpec = { key: 'lower_b', name: 'Lower B', category: 'strength', focus: 'Hinge-led lower body: deadlift pattern heavy, squat pattern lighter, glutes and quads after.', slots: [S('main', 'hinge'), S('secondary', 'squat'), S('secondary', 'lunge'), S('accessory', 'accessory', 'glutes'), S('accessory', 'accessory', 'quads'), S('core', 'core')] };
const PUSH_A: SessionSpec = { key: 'push_a', name: 'Push', category: 'strength', focus: 'Chest, shoulders and triceps: heavy horizontal press, then overhead, then isolation.', slots: [S('main', 'hpush'), S('secondary', 'vpush'), S('secondary', 'hpush', 'pectorals'), S('accessory', 'accessory', 'delts'), S('accessory', 'accessory', 'triceps'), S('core', 'core')] };
const PULL_A: SessionSpec = { key: 'pull_a', name: 'Pull', category: 'strength', focus: 'Back and biceps: vertical pull heavy, rows for thickness, rear delts and arms.', slots: [S('main', 'vpull'), S('secondary', 'hpull'), S('secondary', 'hpull', 'upper back'), S('accessory', 'accessory', 'biceps'), S('accessory', 'carry'), S('core', 'core')] };
const LEGS_A: SessionSpec = { key: 'legs_a', name: 'Legs', category: 'strength', focus: 'Whole lower body: squat heavy, hinge second, single-leg and calves after.', slots: [S('main', 'squat'), S('secondary', 'hinge'), S('secondary', 'lunge'), S('accessory', 'accessory', 'hamstrings'), S('accessory', 'accessory', 'calves'), S('core', 'core')] };
const PUSH_B: SessionSpec = { key: 'push_b', name: 'Push B', category: 'strength', focus: 'Overhead-led push day: press first, incline or dumbbell chest second, arms to finish.', slots: [S('main', 'vpush'), S('secondary', 'hpush'), S('secondary', 'hpush', 'pectorals'), S('accessory', 'accessory', 'triceps'), S('accessory', 'accessory', 'delts'), S('core', 'core')] };
const PULL_B: SessionSpec = { key: 'pull_b', name: 'Pull B', category: 'strength', focus: 'Row-led pull day: heavy row first, pull-downs second, rear delts, biceps, grip.', slots: [S('main', 'hpull'), S('secondary', 'vpull'), S('secondary', 'hpull', 'upper back'), S('accessory', 'accessory', 'biceps'), S('accessory', 'accessory', 'forearms'), S('core', 'core')] };
const LEGS_B: SessionSpec = { key: 'legs_b', name: 'Legs B', category: 'strength', focus: 'Hinge-led leg day: deadlift pattern heavy, squat pattern lighter, glutes and hamstrings after.', slots: [S('main', 'hinge'), S('secondary', 'squat'), S('secondary', 'lunge'), S('accessory', 'accessory', 'glutes'), S('accessory', 'accessory', 'hamstrings'), S('core', 'core')] };

export function splitFor(days: number): { key: string; label: string; sessions: SessionSpec[] } {
  const d = Math.max(2, Math.min(6, Math.round(days)));
  switch (d) {
    case 2: return { key: 'full_2', label: 'two full-body days', sessions: [fullBody('A'), fullBody('B')] };
    case 3: return { key: 'full_3', label: 'three full-body days', sessions: [fullBody('A'), fullBody('B'), fullBody('C')] };
    case 4: return { key: 'upper_lower', label: 'upper/lower split', sessions: [UPPER_A, LOWER_A, UPPER_B, LOWER_B] };
    case 5: return { key: 'ul_ppl', label: 'upper/lower plus push, pull, legs', sessions: [UPPER_A, LOWER_A, PUSH_A, PULL_A, LEGS_A] };
    default: return { key: 'ppl_2', label: 'push/pull/legs twice', sessions: [PUSH_A, PULL_A, LEGS_A, PUSH_B, PULL_B, LEGS_B] };
  }
}

export interface BlueprintInput {
  days: number;
  goal: GoalKey;
  tags: Tags;
  experience: Experience;
  week: number;
  limitation?: string;
}

/** The week's structure, before any exercise is chosen. */
export function blueprint(input: BlueprintInput): WeekPlan {
  const split = splitFor(input.days);
  const scheme = schemeFor(input.goal, input.week);
  const week = ((Math.max(1, Math.round(input.week)) - 1) % 4) + 1;
  const deload = scheme.phase === 'deload';

  const sessions: SessionPlan[] = split.sessions.map((spec, i) => {
    const slots: Slot[] = spec.slots.map((s) => {
      if (s.role === 'main') return { ...s, ...scheme.main };
      if (s.role === 'secondary') return { ...s, ...scheme.secondary };
      if (s.role === 'core') return { ...s, sets: scheme.core.sets, reps: scheme.core.reps, rest: scheme.core.rest, rpe: 7 };
      if (s.pattern === 'carry') return { ...s, ...scheme.accessory, reps: '30-45s' };
      return { ...s, ...scheme.accessory };
    });
    // Conditioning: a finisher on two sessions for a fat-loss block or a
    // running/conditioning interest, and on every session when both. A
    // deload week keeps it short.
    const wantsFinisher = input.goal === 'fat_loss' || input.tags.running || input.tags.conditioning;
    const finisherOn = wantsFinisher && (input.goal === 'fat_loss' && (input.tags.running || input.tags.conditioning) ? true : i % 2 === (split.sessions.length > 3 ? 1 : 0));
    if (finisherOn) {
      const minutes = scheme.finisherMinutes || (deload ? 8 : 10);
      slots.push({ role: 'finisher', pattern: 'conditioning', sets: 1, reps: `${minutes} min`, rest: 0, rpe: input.goal === 'pain' ? 5 : 7 });
    }
    if (input.tags.mobility || input.goal === 'pain') {
      slots.push({ role: 'mobility', pattern: 'mobility', sets: 1, reps: '60s', rest: 0, rpe: 3 });
    }
    // A brand-new athlete gets one fewer accessory so the session fits and
    // the compounds get the attention.
    const trimmed = input.experience === 'new' ? slots.filter((s, idx) => !(s.role === 'accessory' && idx === slots.findIndex((x) => x.role === 'accessory' && x.pattern === 'accessory'))) : slots;
    const minutes = Math.round(trimmed.reduce((acc, s) => {
      if (s.role === 'finisher') return acc + parseInt(s.reps, 10);
      if (s.role === 'mobility') return acc + 5;
      return acc + s.sets * (0.75 + s.rest / 60);
    }, 8));
    return {
      key: spec.key,
      name: spec.name,
      category: spec.category,
      focus: spec.focus,
      slots: trimmed,
      estimated_duration: Math.max(25, Math.min(80, minutes)),
    };
  });

  const phaseLine: Record<Phase, string> = {
    base: 'week 1 of the block: moderate effort, learning the lifts and setting starting loads',
    build: 'week 2 of the block: same lifts, a little more weight or one more rep than last week',
    peak: 'week 3 of the block: the heaviest week, fewer reps at the top loads',
    deload: 'week 4 of the block: a deload, same lifts at two-thirds effort so next block starts fresh',
  };
  const goalLine: Record<GoalKey, string> = {
    strength: 'built around the squat, bench, deadlift and overhead press',
    fat_loss: 'built around big lifts at moderate weights with short rests and a conditioning finisher',
    return: 'built around the fundamental patterns at loads that leave reps in the tank',
    pain: 'built around low-impact, machine and dumbbell work at easy efforts',
    general: 'built around the fundamental patterns with balanced volume',
  };
  const article = /^[aeiou]/i.test(split.label) ? 'An' : 'A';
  return {
    split: split.key,
    splitLabel: split.label,
    week,
    phase: scheme.phase,
    goal: input.goal,
    sessions,
    rationale: `${article} ${split.label}, ${goalLine[input.goal]}; ${phaseLine[scheme.phase]}.`,
  };
}

// ── Candidates ───────────────────────────────────────────────────────────────

const BARBELL_MAINS = ['barbell full squat', 'barbell bench press', 'barbell deadlift', 'barbell standing military press', 'barbell sumo deadlift', 'barbell romanian deadlift', 'barbell front squat', 'barbell incline bench press', 'barbell seated overhead press', 'trap bar deadlift'];
/** The four competition-style lifts lead their pattern for a strength athlete. */
const FIRST_CHOICE = ['barbell full squat', 'barbell bench press', 'barbell deadlift', 'barbell standing military press'];

function seededRand(seed: string): () => number {
  let h = 2166136261 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = (h >>> 0) || 7;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface CandidateOptions {
  goal: GoalKey;
  experience: Experience;
  /** Names to put first (last block's anchors), normalized. */
  anchors?: string[];
  /** Normalized names already used this week (kept out unless nothing else fits). */
  used?: Set<string>;
  seed?: string;
  limit?: number;
}

/**
 * Score a row for a slot; higher is better. Anchors and the classic barbell
 * lifts lead a strength main slot; a return/pain athlete gets dumbbells,
 * machines and bodyweight first; assisted/one-arm/odd variants sink.
 */
export function scoreFor(row: LibraryRow, slot: Slot, opts: CandidateOptions): number {
  const n = normalizeName(row.name);
  const eq = String(row.equipment ?? '').toLowerCase();
  let s = 0;
  if (opts.anchors?.includes(n)) s += 50;
  const classic = BARBELL_MAINS.includes(n);
  if (slot.role === 'main' || slot.role === 'secondary') {
    if (classic && opts.experience === 'training' && opts.goal !== 'pain') s += 15;
    if (eq === 'other') s -= 15;
    if (opts.goal === 'strength' && classic) s += 30;
    if (opts.goal === 'strength' && FIRST_CHOICE.includes(n)) s += 12;
    if (opts.goal === 'strength' && eq === 'barbell') s += 10;
    if ((opts.goal === 'return' || opts.goal === 'pain' || opts.experience === 'new') && (eq === 'dumbbell' || eq === 'machine' || eq === 'bodyweight' || eq === 'cable')) s += 15;
    if (opts.goal === 'pain' && eq === 'barbell') s -= 20;
    if (opts.experience === 'new' && eq === 'barbell' && !classic) s -= 10;
    if (has(n, 'goblet', 'leg press', 'romanian', 'trap bar', 'chest press', 'lat pulldown', 'seated row', 'dumbbell bench', 'dumbbell shoulder press', 'hip thrust', 'split squat', 'walking lunge', 'pull up', 'chin up', 'push up')) s += 8;
  }
  if (slot.muscle) {
    const mg = String(row.muscle_group ?? '').toLowerCase();
    const sec = (row.secondary_muscles ?? []).map((m) => String(m).toLowerCase());
    if (mg === slot.muscle) s += 20; else if (sec.includes(slot.muscle)) s += 8; else if (slot.pattern === 'accessory') s -= 30;
  }
  if (slot.pattern === 'conditioning' && has(n, 'run', 'bike', 'cycle', 'row', 'jump rope', 'ski', 'elliptical', 'stair', 'walk')) s += 10;
  if (slot.pattern === 'core' && has(n, 'plank', 'dead bug', 'bird dog', 'pallof', 'hanging', 'leg raise', 'rollout', 'hollow')) s += 6;
  // Odd variants, one-arm/one-leg twists, "assisted" and "(male)" demo rows read badly as a prescription.
  if (has(n, 'assisted', 'male', 'female', 'v 2', 'v 3', 'v 4', 'twisting', 'zercher', 'guillotine', 'behind head', 'behind the head', 'bradford', 'jm ', 'reverse grip', 'wide reverse', 'bench front', 'one arm', 'single arm', 'alternate')) s -= 12;
  if (has(n, 'smith', 'lever') && opts.goal === 'strength' && slot.role === 'main') s -= 8;
  if (has(n, 'medicine ball', 'arm blaster', 'weighted', 'with towel', 'on exercise ball', 'stability ball', 'bosu', 'suspension', 'trx')) s -= 10;
  if (eq === 'other' && slot.role === 'accessory') s -= 6;
  if (opts.used?.has(n)) s -= 40;
  return s;
}

/** Rows that may fill the slot at all (pattern, equipment already filtered, exclusions). */
export function eligible(row: LibraryRow, slot: Slot, opts: CandidateOptions): boolean {
  const p = patternOf(row);
  if (slot.pattern === 'accessory') {
    if (!slot.muscle) return p === 'accessory';
    const mg = String(row.muscle_group ?? '').toLowerCase();
    if (mg !== slot.muscle) return false;
    return p !== 'mobility' && p !== 'conditioning';
  }
  if (p !== slot.pattern) return false;
  if (slot.pattern === 'mobility') return true;
  if ((opts.goal === 'pain' || opts.goal === 'return' || opts.experience === 'new') && isBallistic(row)) return false;
  if (opts.goal === 'pain' && has(normalizeName(row.name), 'deadlift', 'good morning', 'sit up', 'crunch', 'russian twist')) return false;
  if (slot.role === 'main' && isBallistic(row)) return false;
  return true;
}

/** Top `limit` options for a slot, best first, deterministic for a seed. */
export function candidatesFor(rows: LibraryRow[], slot: Slot, opts: CandidateOptions): LibraryRow[] {
  const rand = seededRand(`${opts.seed ?? 'solo'}:${slot.pattern}:${slot.muscle ?? ''}:${slot.role}`);
  const limit = opts.limit ?? 8;
  const scored = rows
    .filter((r) => eligible(r, slot, opts))
    .map((r) => ({ r, s: scoreFor(r, slot, opts) + rand() * 4 }))
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.r);
}

// ── Assembly and validation ──────────────────────────────────────────────────

export interface Pick { slot: number; exercise: string; cue: string }
export interface ModelSession { key: string; name: string; description: string; picks: Pick[] }
export interface ModelOutput { sessions: ModelSession[]; rationale?: string; changes?: string }

export interface BuiltExercise {
  row: LibraryRow;
  slot: Slot;
  cue: string;
  /** True when the model's choice was replaced by the deterministic fallback. */
  fallback: boolean;
}
export interface BuiltSession {
  key: string;
  name: string;
  description: string;
  category: SessionPlan['category'];
  estimated_duration: number;
  exercises: BuiltExercise[];
}

const cleanText = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** A cue when the model gave none: what a coach says most often for the pattern. */
export function defaultCue(pattern: Pattern, role: Role): string {
  const byPattern: Record<Pattern, string> = {
    squat: 'Brace before you descend, knees track over toes, drive the floor away.',
    hinge: 'Hips back, flat back, bar close; stand up by squeezing the glutes.',
    lunge: 'Tall torso, front heel down, control the way down.',
    hpush: 'Shoulder blades pinned back and down, elbows at 45 degrees, press through the whole hand.',
    vpush: 'Ribs down, squeeze the glutes, press straight up and finish over the ears.',
    hpull: 'Lead with the elbows, pause at the top, no shrugging.',
    vpull: 'Pull the elbows to the ribs, chest to the bar, control the way up.',
    core: 'Slow breathing, ribs down, nothing moves except what is meant to.',
    carry: 'Stand tall, shoulders packed, short quick steps.',
    conditioning: 'Steady pace you could hold a short sentence at.',
    mobility: 'Easy breathing, into a stretch, never into pain.',
    accessory: 'Full range, controlled negative, no swinging.',
  };
  return role === 'finisher' ? byPattern.conditioning : byPattern[pattern];
}

/**
 * Validate the model's picks against the blueprint's candidates and fill
 * every gap deterministically. Returns a complete week in blueprint order.
 */
export function assemble(plan: WeekPlan, candidates: Map<string, LibraryRow[][]>, output: ModelOutput | null): BuiltSession[] {
  const byKey = new Map<string, ModelSession>();
  for (const s of output?.sessions ?? []) if (s && typeof s.key === 'string') byKey.set(s.key, s);
  const usedWeek = new Set<string>();

  return plan.sessions.map((session) => {
    const model = byKey.get(session.key);
    const options = candidates.get(session.key) ?? [];
    const usedSession = new Set<string>();
    const exercises: BuiltExercise[] = session.slots.map((slot, i) => {
      const opts = options[i] ?? [];
      const pick = (model?.picks ?? []).find((p) => Number(p?.slot) === i + 1);
      const wanted = pick ? normalizeName(pick.exercise) : '';
      let row = wanted ? opts.find((r) => normalizeName(r.name) === wanted && !usedSession.has(normalizeName(r.name))) : undefined;
      let fallback = false;
      if (!row) {
        // Prefer an option not yet used anywhere this week, then any unused
        // in this session, then the first option.
        row = opts.find((r) => !usedWeek.has(normalizeName(r.name)) && !usedSession.has(normalizeName(r.name)))
          ?? opts.find((r) => !usedSession.has(normalizeName(r.name)))
          ?? opts[0];
        fallback = true;
      }
      if (!row) return null as unknown as BuiltExercise;
      const n = normalizeName(row.name);
      usedSession.add(n);
      // Anchors are meant to repeat across the block, not within one week;
      // accessories may repeat across sessions when the library is thin.
      if (slot.role === 'main' || slot.role === 'secondary') usedWeek.add(n);
      // A replaced pick's cue was written for a different exercise.
      const cue = (!fallback && cleanText(pick?.cue, 140)) || defaultCue(slot.pattern, slot.role);
      return { row, slot, cue, fallback };
    }).filter(Boolean);
    return {
      key: session.key,
      name: cleanText(model?.name, 60) || session.name,
      description: cleanText(model?.description, 240) || session.focus,
      category: session.category,
      estimated_duration: session.estimated_duration,
      exercises,
    };
  });
}

/** Sanity checks on a built week, for tests and for the log line. */
export function auditWeek(week: BuiltSession[]): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const patterns = new Set<Pattern>();
  for (const s of week) {
    if (s.exercises.length < 3) problems.push(`${s.key}: only ${s.exercises.length} exercises`);
    const names = s.exercises.map((e) => normalizeName(e.row.name));
    if (new Set(names).size !== names.length) problems.push(`${s.key}: duplicate exercise`);
    for (const e of s.exercises) patterns.add(e.slot.pattern);
  }
  for (const p of ['squat', 'hinge', 'hpush', 'hpull'] as Pattern[]) {
    if (!patterns.has(p) && !(p === 'hpull' && patterns.has('vpull'))) problems.push(`week has no ${PATTERN_LABEL[p]}`);
  }
  return { ok: problems.length === 0, problems };
}

// ── Notes and loads ──────────────────────────────────────────────────────────

export interface LoggedSet { weight?: number | string | null; reps?: number | string | null; completed?: boolean | null; unit?: string | null }
export interface LoggedExercise { id?: string; sets?: LoggedSet[] }

/** The heaviest completed set of an exercise across recent logs, by exercise id. */
export function bestSetsById(logs: { exercises?: LoggedExercise[] | null }[]): Map<string, { weight: number; reps: number; unit: string }> {
  const out = new Map<string, { weight: number; reps: number; unit: string }>();
  for (const log of logs) {
    for (const ex of log.exercises ?? []) {
      if (!ex?.id) continue;
      for (const st of ex.sets ?? []) {
        if (st?.completed === false) continue;
        const w = Number(st?.weight); const r = Number(st?.reps);
        if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0) continue;
        const cur = out.get(ex.id);
        if (!cur || w > cur.weight || (w === cur.weight && r > cur.reps)) out.set(ex.id, { weight: w, reps: r, unit: String(st?.unit ?? '') });
      }
    }
  }
  return out;
}

/** Next-load suggestion from the best logged set, by phase. Null when nothing was logged. */
export function loadHint(best: { weight: number; reps: number; unit: string } | undefined, slot: Slot, phase: Phase, unit: string): string | null {
  if (!best) return null;
  const u = best.unit || unit;
  const step = u === 'kg' ? 2.5 : 5;
  const round = (x: number) => Math.round(x / step) * step;
  const target = parseInt(slot.reps, 10);
  if (phase === 'deload') return `Last: ${best.weight} ${u} × ${best.reps}. Deload: about ${round(best.weight * 0.7)} ${u}.`;
  if (Number.isFinite(target) && best.reps >= target && phase !== 'base') return `Last: ${best.weight} ${u} × ${best.reps}. Try ${round(best.weight + step)} ${u} this week.`;
  return `Last: ${best.weight} ${u} × ${best.reps}. Start there and add a rep before adding weight.`;
}

/** A core slot's reps as the athlete will log them: a hold is timed, a raise or crunch is counted. */
export function repsFor(ex: BuiltExercise): string {
  if (ex.slot.role !== 'core') return ex.slot.reps;
  const n = normalizeName(ex.row.name);
  const hold = has(n, 'plank', 'hold', 'dead bug', 'bird dog', 'pallof', 'hollow', 'bridge', 'l sit', 'wall sit', 'carry');
  return hold ? ex.slot.reps : (ex.slot.sets <= 2 ? '10-12' : '10-15');
}

/** What goes into workout_exercises.notes: effort, the cue, and a load hint when history exists. */
export function noteFor(ex: BuiltExercise, phase: Phase, hint: string | null): string {
  const s = ex.slot;
  const rir = Math.max(0, Math.round(10 - s.rpe));
  const effort = s.role === 'finisher' ? 'Conversational pace, no sprinting.'
    : s.role === 'mobility' ? 'Easy, no forcing.'
    : s.role === 'core' ? (/s$/.test(repsFor(ex)) ? 'Hold each set with steady breathing.' : 'Slow reps, no momentum, breathe out on the way up.')
    : `RPE ${s.rpe} — leave ${rir} rep${rir === 1 ? '' : 's'} in the tank.`;
  const warm = s.role === 'main' ? ' Warm up with 2 lighter sets first.' : '';
  return [effort + warm, ex.cue, hint].filter(Boolean).join(' ').slice(0, 400);
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export interface PromptAthlete {
  name?: string | null;
  goalLabel: string;
  goals: string[];
  experienceLabel: string;
  setting: string;
  limitation?: string;
  historyBlock?: string;
  adapt?: boolean;
}

/**
 * The model's whole job in one prompt: choose one option per slot, name each
 * session, one cue per lift, one sentence of intent. Options are the only
 * legal answers; everything else is validated away.
 */
export function buildProgramPrompt(plan: WeekPlan, candidates: Map<string, LibraryRow[][]>, athlete: PromptAthlete): string {
  const lines: string[] = [];
  lines.push(`You are a strength and conditioning coach finishing a week of training that has already been structured. Your job is ONLY to (1) choose the single best option for each slot, (2) name each session, (3) write one short coaching cue per exercise, and (4) write one sentence of intent per session.`);
  lines.push(`Athlete${athlete.name ? ` ${athlete.name}` : ''}: main goal = ${athlete.goalLabel}; interests = ${athlete.goals.join(', ') || 'none stated'}; experience = ${athlete.experienceLabel}; setting = ${athlete.setting}${athlete.limitation ? `; must work around: ${athlete.limitation}` : ''}.`);
  lines.push(`Block: ${plan.rationale}`);
  if (athlete.historyBlock) lines.push(`Last 14 days:\n${athlete.historyBlock}`);
  if (athlete.adapt) lines.push(`This is next week's rewrite. Keep the same main lifts the athlete logged (they are listed first in their slots) so loads can progress; you may change accessories that were skipped or that look repetitive.`);
  lines.push('');
  lines.push('Choosing rules:');
  lines.push('- Pick EXACTLY one option per slot, by its exact name from that slot\'s list. Never invent or rename an exercise.');
  lines.push('- No exercise twice in one session. Across the week, a main or secondary lift may repeat (that is how it progresses); accessory, core and finisher choices should differ from session to session.');
  lines.push('- Prefer the classic version of a lift over an odd variant unless the athlete\'s limitation or experience says otherwise.');
  lines.push('- A beginner or someone returning after a break gets dumbbell, machine or bodyweight versions of the main lifts before barbell versions. A strength or powerlifting athlete gets the barbell squat, bench press, deadlift and overhead press whenever they are options.');
  lines.push('- Respect the limitation: if a movement would load a painful area, choose the option that does not.');
  lines.push('- Cue: 6 to 16 words, the one thing that fixes the most common mistake on that lift. No numbers.');
  lines.push('- Session name: 2 to 4 words, specific ("Heavy squat day", "Upper pull and press"). Description: one sentence on the intent, under 25 words, no numbers.');
  if (athlete.adapt) lines.push('- "changes": ONE spoken sentence under 35 words, in a coach\'s voice, on what changed from last week and why. Only mention sessions or lifts that appear in the last 14 days above or in this week.');
  lines.push('');
  for (const s of plan.sessions) {
    lines.push(`Session key "${s.key}" (${s.category}, about ${s.estimated_duration} min). Working name: ${s.name}. Intent: ${s.focus}`);
    s.slots.forEach((slot, i) => {
      const opts = candidates.get(s.key)?.[i] ?? [];
      const what = slot.role === 'finisher' ? `finisher, ${slot.reps}` : slot.role === 'mobility' ? 'mobility, 60s' : `${slot.role} ${PATTERN_LABEL[slot.pattern]}${slot.muscle ? ` (${slot.muscle})` : ''}, ${slot.sets}×${slot.reps} @RPE ${slot.rpe}`;
      lines.push(`  slot ${i + 1} — ${what}: ${opts.map((o) => o.name).join(' | ') || '(no options: leave empty)'}`);
    });
  }
  lines.push('');
  lines.push('Return JSON only, matching the schema.');
  return lines.join('\n');
}

/** Gemini responseSchema for the model's part. */
export const PROGRAM_SCHEMA = {
  type: 'object',
  properties: {
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          picks: {
            type: 'array',
            items: {
              type: 'object',
              properties: { slot: { type: 'integer' }, exercise: { type: 'string' }, cue: { type: 'string' } },
              required: ['slot', 'exercise', 'cue'],
            },
          },
        },
        required: ['key', 'name', 'description', 'picks'],
      },
    },
    changes: { type: 'string' },
  },
  required: ['sessions'],
} as const;

// ── Block state (clients.solo_block) ─────────────────────────────────────────

export interface SoloBlock {
  /** ISO date the block started. */
  started: string;
  /** 1..4 */
  week: number;
  split: string;
  goal: GoalKey;
  days: number;
  /** Normalized names of the main/secondary lifts, so they carry across the block. */
  anchors: string[];
  rationale: string;
  /** Written by solo-nutrition. */
  nutrition?: { built_at: string; calories: number; protein: number; carbs: number; fat: number; rest_calories: number; method: string };
}

/**
 * Where the next build sits in the block. A weekly rewrite (adapt) moves to
 * the next week; week 4 rolls into a fresh block. An explicit rebuild keeps
 * the week (the athlete wants the week rewritten, not the calendar moved)
 * unless the goal or day count changed, which starts a new block.
 */
export function nextBlock(prev: SoloBlock | null | undefined, goal: GoalKey, days: number, today: string, mode: 'first' | 'rebuild' | 'adapt'): { week: number; started: string; fresh: boolean } {
  if (!prev || !Number.isFinite(prev.week) || prev.goal !== goal || prev.days !== days) return { week: 1, started: today, fresh: true };
  if (mode === 'adapt') {
    if (prev.week >= 4) return { week: 1, started: today, fresh: true };
    return { week: prev.week + 1, started: prev.started, fresh: false };
  }
  return { week: Math.max(1, Math.min(4, prev.week)), started: prev.started, fresh: false };
}

/** One line the corner can read about where the athlete is in the block. */
export function describeBlock(b: SoloBlock | null | undefined): string {
  if (!b) return '';
  const phase = b.week === 1 ? 'base' : b.week === 2 ? 'build' : b.week === 3 ? 'peak' : 'deload';
  return `week ${b.week} of 4 (${phase}), ${b.split.replace(/_/g, ' ')}, ${b.days} days: ${b.rationale}`;
}
