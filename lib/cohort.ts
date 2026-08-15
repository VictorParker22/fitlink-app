/**
 * Cohort programs — the dated variant of a pass.
 *
 * An evergreen pass is athlete-paced: you buy it whenever, week 1 starts the
 * day you start. A COHORT starts on a fixed date for everyone, closes
 * enrollment before it begins, and can cap seats. Think a gym's "4-week
 * signature program, Sep 8 – Sep 29, sign up by Aug 31, 12 spots".
 *
 * Three plan columns carry it (supabase/migrations/add_cohort_programs.sql):
 *   starts_on         date  — the cohort's first day (null ⇒ evergreen pass)
 *   enrollment_closes date  — last day to join (null ⇒ open until it starts)
 *   capacity          int   — seat cap (null ⇒ unlimited)
 *
 * A plan is a cohort if and only if starts_on is set. Everything else in the
 * pass model — track, weeks, snapshot-at-purchase, position — is unchanged, so
 * cohorts reuse the whole season experience.
 *
 * Honesty rules baked in here:
 *  · Urgency is only ever reported from real coach-set dates and a real seat
 *    count. Nothing here invents scarcity.
 *  · Node dates are returned ONLY for cohorts. Evergreen passes are paced by
 *    the athlete, so a calendar date there would be a lie — callers get null
 *    and must fall back to sequential labels ("Week 3 · Session 2").
 */

import { weekOfPosition, totalWeeks } from './passWeeks';
import type { TrackNode } from '../context/AppContext';

export interface CohortFields {
  starts_on?: string | null;
  enrollment_closes?: string | null;
  capacity?: number | null;
  duration_weeks?: number | null;
  track?: TrackNode[] | null;
}

export type EnrollmentState =
  | 'open'          // joinable now
  | 'closing-soon'  // joinable, deadline within CLOSING_SOON_DAYS
  | 'closed-date'   // past the deadline (or already started)
  | 'full'          // capacity reached
  | 'running'       // started, athlete is in it
  | 'finished';     // past the final week

export const CLOSING_SOON_DAYS = 5;

/** Parse a `YYYY-MM-DD` column as a LOCAL day. `new Date('2026-09-08')` is UTC
 *  midnight, which reads as the previous day west of Greenwich — that shifts
 *  every session label by a day for half the world. */
export function parseLocalDay(value?: string | null): Date | null {
  if (!value) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** A plan is a cohort only when the coach gave it a real start date. */
export function isCohort(plan?: CohortFields | null): boolean {
  return !!plan && !!parseLocalDay(plan.starts_on);
}

/** Last day to join: the explicit deadline, else the day before it starts. */
export function enrollmentDeadline(plan?: CohortFields | null): Date | null {
  if (!plan) return null;
  const explicit = parseLocalDay(plan.enrollment_closes);
  if (explicit) return explicit;
  const start = parseLocalDay(plan.starts_on);
  if (!start) return null;
  const dayBefore = new Date(start);
  dayBefore.setDate(dayBefore.getDate() - 1);
  return dayBefore;
}

/** Real seats left, or null when the coach set no cap (unlimited). */
export function spotsLeft(plan: CohortFields | null | undefined, enrolledCount: number): number | null {
  const cap = plan?.capacity;
  if (!cap || cap <= 0) return null;
  return Math.max(0, cap - Math.max(0, enrolledCount));
}

/** The cohort's last day, when the track's week count is known. */
export function cohortEndDate(plan?: CohortFields | null): Date | null {
  const start = parseLocalDay(plan?.starts_on);
  if (!start) return null;
  const weeks = plan?.duration_weeks
    ?? (plan?.track ? totalWeeks(plan.track, plan.duration_weeks ?? null) : null);
  if (!weeks || weeks <= 0) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + weeks * 7 - 1);
  return end;
}

/**
 * Where this cohort stands. `enrolled` = whether the viewer is already in it
 * (an enrolled athlete sees 'running', never a sold-out banner).
 */
export function enrollmentState(
  plan: CohortFields | null | undefined,
  enrolledCount: number,
  enrolled = false,
): EnrollmentState | null {
  if (!isCohort(plan)) return null;
  const today = startOfToday();
  const start = parseLocalDay(plan!.starts_on)!;
  const end = cohortEndDate(plan);

  if (enrolled) {
    if (end && today > end) return 'finished';
    return today >= start ? 'running' : 'open';
  }

  if (today >= start) return 'closed-date';

  const deadline = enrollmentDeadline(plan);
  if (deadline && today > deadline) return 'closed-date';

  const left = spotsLeft(plan, enrolledCount);
  if (left !== null && left <= 0) return 'full';

  if (deadline && daysBetween(today, deadline) <= CLOSING_SOON_DAYS) return 'closing-soon';
  return 'open';
}

export function canJoin(
  plan: CohortFields | null | undefined,
  enrolledCount: number,
): boolean {
  if (!isCohort(plan)) return true; // evergreen passes are always joinable
  const state = enrollmentState(plan, enrolledCount);
  return state === 'open' || state === 'closing-soon';
}

/**
 * The real calendar date of a track node — cohorts only.
 *
 * Week N of the cohort begins `startsOn + (N-1) * 7` days; within a week the
 * node's offset among that week's nodes spreads across the week's days. This
 * is an honest approximation of "which day of week N" only when the coach set
 * a start date; evergreen passes return null and callers must keep sequential
 * labels instead of inventing a calendar.
 */
export function dateForNode(
  plan: CohortFields | null | undefined,
  track: TrackNode[],
  index: number,
): Date | null {
  const start = parseLocalDay(plan?.starts_on);
  if (!start || index < 0 || index >= track.length) return null;

  const week = weekOfPosition(index, track, plan?.duration_weeks ?? null); // 1-based
  const weekNodes = track
    .map((n, i) => ({ i, w: weekOfPosition(i, track, plan?.duration_weeks ?? null) }))
    .filter(entry => entry.w === week)
    .map(entry => entry.i);
  const offset = Math.max(0, weekNodes.indexOf(index));

  // Spread this week's nodes across its 7 days, in order, never past day 7.
  const dayInWeek = weekNodes.length > 1
    ? Math.min(6, Math.round((offset * 6) / (weekNodes.length - 1)))
    : 0;

  const date = new Date(start);
  date.setDate(date.getDate() + (week - 1) * 7 + dayInWeek);
  return date;
}

// ── Formatting ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sep 8" / "Sep 8, 2027" when the year differs from today's. */
export function formatDay(date?: Date | null): string | null {
  if (!date) return null;
  const now = new Date();
  const base = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base}, ${date.getFullYear()}`;
}

/** "Today" / "Tomorrow" / "Tue 16 Sep" — for dated cohort nodes. */
export function formatNodeDay(date?: Date | null): string | null {
  if (!date) return null;
  const today = startOfToday();
  const diff = daysBetween(today, new Date(date.getFullYear(), date.getMonth(), date.getDate()));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** "Sep 8 – Sep 29" when the end is known, else "Starts Sep 8". */
export function formatRun(plan?: CohortFields | null): string | null {
  const start = parseLocalDay(plan?.starts_on);
  if (!start) return null;
  const end = cohortEndDate(plan);
  return end ? `${formatDay(start)} – ${formatDay(end)}` : `Starts ${formatDay(start)}`;
}

/** Deadline phrasing built only from the real date: "Closes Aug 31" /
 *  "Closes tomorrow" / "Last day to join". Null when there is no deadline. */
export function formatDeadline(plan?: CohortFields | null): string | null {
  const deadline = enrollmentDeadline(plan);
  if (!deadline) return null;
  const diff = daysBetween(startOfToday(), deadline);
  if (diff < 0) return 'Enrollment closed';
  if (diff === 0) return 'Last day to join';
  if (diff === 1) return 'Closes tomorrow';
  return `Closes ${formatDay(deadline)}`;
}
