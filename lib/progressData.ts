/**
 * progressData — the numbers behind the Progress tab, pure.
 *
 * Every figure the tab shows is derived here from real rows: workout logs
 * (best set per session, PR moments, e1RM), the Solo block or the pass track
 * (which days are planned), habit rows (weekly %, streaks, four-week grid),
 * and the health history (steps per day, sleep). Nothing is invented: a
 * series needs two points to be a curve, one point is a stated fact, zero is
 * absence. Jest-tested in tests/progressData.test.ts.
 */
import { localDayString, parseLocalDay } from './streak';

// ─── Lifts ───────────────────────────────────────────────────────────────────

export interface LoggedSet { weight: number; reps: number; completed: boolean; feel?: 'easy' | 'right' | 'grind' | 'failed' }
export interface LiftSession { date: string; best: number; sets: LoggedSet[]; feel: string | null; workoutId?: string | null }
export interface LiftSeries { exerciseId: string; name: string; sessions: LiftSession[] }
export interface PrMoment { exerciseId: string; name: string; weight: number; reps: number; date: string; previous: number | null }

/** Epley: the load you could lift once, from a set of `reps` at `weight`. */
export function e1rm(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

/** Best completed set per session per exercise, chronological. */
export function buildLiftSeries(logs: any[], names: Record<string, string>): LiftSeries[] {
  const byEx: Record<string, LiftSession[]> = {};
  [...(logs || [])]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .forEach((row) => {
      (row.exercises || []).forEach((ex: any) => {
        if (!ex?.id) return;
        const sets: LoggedSet[] = (ex.sets || [])
          .filter((s: any) => s?.completed)
          .map((s: any) => ({ weight: parseFloat(String(s.weight)) || 0, reps: parseInt(String(s.reps), 10) || 0, completed: true, feel: s.feel }))
          .filter((s: LoggedSet) => s.weight > 0);
        if (sets.length === 0) return;
        const best = Math.max(...sets.map((s) => s.weight));
        const feels = sets.map((s) => s.feel).filter(Boolean) as string[];
        const feel = feels.includes('failed') ? 'failed' : feels.includes('grind') ? 'grind' : feels.includes('right') ? 'right' : feels.includes('easy') ? 'easy' : null;
        (byEx[ex.id] ||= []).push({ date: row.created_at, best, sets, feel, workoutId: row.workout_id ?? null });
      });
    });
  return Object.entries(byEx)
    .map(([exerciseId, sessions]) => ({ exerciseId, name: names[exerciseId] || '', sessions }))
    .filter((s) => s.name)
    .sort((a, b) => b.sessions.length - a.sessions.length);
}

/** Every time a lift's best set beat every earlier one, newest first. */
export function prMoments(series: LiftSeries[]): PrMoment[] {
  const out: PrMoment[] = [];
  series.forEach((s) => {
    let max = 0;
    s.sessions.forEach((sess) => {
      if (sess.best > max) {
        const bestSet = sess.sets.find((x) => x.weight === sess.best);
        out.push({ exerciseId: s.exerciseId, name: s.name, weight: sess.best, reps: bestSet?.reps ?? 0, date: sess.date, previous: max > 0 ? max : null });
        max = sess.best;
      }
    });
  });
  // The very first session of a lift is a starting point, not a PR.
  return out.filter((p) => p.previous !== null).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Percent change first → last best set; null below two sessions. */
export function liftDeltaPct(s: LiftSeries): number | null {
  if (s.sessions.length < 2) return null;
  const first = s.sessions[0].best;
  const last = s.sessions[s.sessions.length - 1].best;
  return first > 0 ? Math.round(((last - first) / first) * 100) : null;
}

export function bestE1rm(s: LiftSeries): number {
  let best = 0;
  s.sessions.forEach((sess) => sess.sets.forEach((set) => { best = Math.max(best, e1rm(set.weight, set.reps)); }));
  return best;
}

// ─── The week: planned vs done ───────────────────────────────────────────────

export interface WeekDay {
  date: string;      // YYYY-MM-DD local
  label: string;     // M T W T F S S
  isToday: boolean;
  planned: boolean;  // a session belongs on this day
  done: boolean;     // a session was completed on this day
  minutes: number;   // logged/health workout minutes
  steps: number | null;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Monday of the local week containing `d`. */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/**
 * Seven days Monday → Sunday. Planned days come from `trainingDays` (weekday
 * keys, e.g. the Solo block's or onboarding's ['mon','wed','fri']); done days
 * from completed session dates; minutes and steps from the caller's maps.
 */
export function buildWeek(opts: {
  now: Date;
  trainingDays: string[];
  completedDates: string[];            // YYYY-MM-DD local
  minutesByDay?: Record<string, number>;
  stepsByDay?: Record<string, number>;
}): WeekDay[] {
  const start = mondayOf(opts.now);
  const todayKey = localDayString(opts.now);
  const done = new Set(opts.completedDates);
  const planned = new Set(opts.trainingDays.map((k) => k.toLowerCase().slice(0, 3)));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const date = localDayString(d);
    return {
      date,
      label: DAY_LETTERS[d.getDay()],
      isToday: date === todayKey,
      planned: planned.has(WEEKDAY_KEYS[d.getDay()]),
      done: done.has(date),
      minutes: opts.minutesByDay?.[date] ?? 0,
      steps: opts.stepsByDay && date in opts.stepsByDay ? opts.stepsByDay[date] : null,
    };
  });
}

/** Local day keys of completed workouts (client_workouts rows). */
export function completedDayKeys(workouts: any[]): string[] {
  const out = new Set<string>();
  (workouts || []).forEach((w: any) => {
    if (w?.status !== 'completed') return;
    const raw = w.completed_at || w.assigned_date;
    if (!raw) return;
    const d = w.completed_at ? new Date(w.completed_at) : parseLocalDay(w.assigned_date);
    if (d && !Number.isNaN(d.getTime())) out.add(localDayString(d));
  });
  return [...out];
}

// ─── Habits ──────────────────────────────────────────────────────────────────

export const HABIT_KEYS = ['water', 'steps', 'sleep', 'protein', 'mindfulness'] as const;
export type HabitKey = typeof HABIT_KEYS[number];
export const HABIT_LABELS: Record<HabitKey, string> = { water: 'Hydration', steps: 'Steps', sleep: 'Sleep', protein: 'Protein', mindfulness: 'Mindfulness' };
export const STEP_GOAL = 8000;
export const SLEEP_GOAL_MIN = 420;

/**
 * client_habits.date keys. The Home habit tracker (and the coach grid) write
 * the UTC calendar day (toISOString), so every reader must key the same way
 * or an evening tap west of Greenwich lands on "tomorrow".
 */
export const habitDayKey = (d: Date): string => d.toISOString().split('T')[0];

/** YYYY-MM-DD for the last `n` days ending today (oldest first). */
export function lastDays(n: number, now = new Date(), keyOf: (d: Date) => string = habitDayKey): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getTime() - (n - 1 - i) * 86_400_000);
    return keyOf(d);
  });
}

export interface HabitStats {
  doneThisWeek: number;     // last 7 days, all habits
  possibleThisWeek: number; // 7 × habits
  perHabitPct: Record<HabitKey, number>;
  todayDone: number;
  weeks: { start: string; pct: number; days: string[] }[]; // last 4 weeks, oldest first
  fourWeekPct: number;
  bestWeekPct: number;
  streaks: Record<HabitKey, number>;      // current run ending today or yesterday
  longest: { habit: HabitKey; days: number; endedOn: string } | null;
  weakest: { habit: HabitKey; done: number; possible: number } | null;
}

export function habitStats(rows: Record<string, any>, now = new Date()): HabitStats {
  const week = lastDays(7, now);
  const done = (date: string, k: HabitKey) => rows?.[date]?.[k] === true;
  const todayKey = habitDayKey(now);
  const perHabitPct = {} as Record<HabitKey, number>;
  let doneThisWeek = 0;
  HABIT_KEYS.forEach((k) => {
    const n = week.filter((d) => done(d, k)).length;
    perHabitPct[k] = Math.round((n / 7) * 100);
    doneThisWeek += n;
  });
  const todayDone = HABIT_KEYS.filter((k) => done(todayKey, k)).length;

  const all28 = lastDays(28, now);
  const weeks: HabitStats['weeks'] = [];
  for (let w = 0; w < 4; w++) {
    const days = all28.slice(w * 7, w * 7 + 7);
    const n = days.reduce((s, d) => s + HABIT_KEYS.filter((k) => done(d, k)).length, 0);
    weeks.push({ start: days[0], pct: Math.round((n / 35) * 100), days });
  }
  const fourWeekDone = weeks.reduce((s, w) => s + Math.round((w.pct / 100) * 35), 0);
  const fourWeekPct = Math.round((fourWeekDone / 140) * 100);
  const bestWeekPct = Math.max(...weeks.map((w) => w.pct));

  const streaks = {} as Record<HabitKey, number>;
  let longest: HabitStats['longest'] = null;
  HABIT_KEYS.forEach((k) => {
    // Current run: count back from today; a miss today does not break a run that ended yesterday.
    let run = 0;
    const startIdx = done(todayKey, k) ? all28.length - 1 : all28.length - 2;
    for (let i = startIdx; i >= 0; i--) { if (done(all28[i], k)) run++; else break; }
    streaks[k] = run;
    let cur = 0;
    all28.forEach((d) => {
      if (done(d, k)) { cur++; if (!longest || cur > longest.days) longest = { habit: k, days: cur, endedOn: d }; }
      else cur = 0;
    });
  });

  let weakest: HabitStats['weakest'] = null;
  HABIT_KEYS.forEach((k) => {
    const n = all28.filter((d) => done(d, k)).length;
    if (!weakest || n < weakest.done) weakest = { habit: k, done: n, possible: 28 };
  });

  return { doneThisWeek, possibleThisWeek: 35, perHabitPct, todayDone, weeks, fourWeekPct, bestWeekPct, streaks, longest, weakest };
}

// ─── Health rollups ──────────────────────────────────────────────────────────

export function averageOver(map: Record<string, number>, days: string[]): number | null {
  const vals = days.map((d) => map[d]).filter((v) => typeof v === 'number' && v > 0);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** "7 h 20" from minutes. */
export function formatHours(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function shortDate(iso: string): string {
  const d = parseLocalDay(iso) ?? new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "Today", "Yesterday", "Sunday 14 Sep". */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const key = localDayString(d);
  if (key === localDayString(now)) return 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (key === localDayString(y)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}
