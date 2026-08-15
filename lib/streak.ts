/**
 * lib/streak.ts — shared training-streak and slip helpers for athlete surfaces.
 *
 * The streak computation was extracted verbatim from ClientCopilot so Today
 * and any other surface read the exact same numbers. The slip helpers detect
 * missed assigned workouts (client_workouts rows still 'assigned' with an
 * assigned_date before today) so the app can offer a one-tap way back instead
 * of showing the athlete their failure.
 */

export interface StreakResult {
  /** Consecutive training days ending today or yesterday. */
  days: number;
  /** True when a training day was logged today. */
  trainedToday: boolean;
}

/** Minimal shape of a WorkoutContext history entry we care about. */
interface HistoryEntryLike {
  completedAt?: number | string | null;
}

/**
 * Consecutive training days from real history, local timezone.
 * Sources: WorkoutContext history (class/strength sessions logged on-device)
 * and completed coach assignments from ClientContext. Day granularity via
 * toDateString(); a streak may end today or yesterday (an unfinished today
 * doesn't break it). Behavior identical to the original ClientCopilot code.
 */
export function computeStreak(
  workoutHistory: HistoryEntryLike[] | null | undefined,
  workouts: any[] | null | undefined
): StreakResult {
  const days = new Set<string>();
  (workoutHistory || []).forEach((e) => {
    if (e?.completedAt) days.add(new Date(e.completedAt).toDateString());
  });
  (workouts || []).forEach((w: any) => {
    if (w.status !== 'completed' || !w.assigned_date) return;
    const t = new Date(w.assigned_date);
    if (!Number.isNaN(t.getTime())) days.add(t.toDateString());
  });
  if (days.size === 0) return { days: 0, trainedToday: false };
  const cursor = new Date();
  const trainedToday = days.has(cursor.toDateString());
  if (!trainedToday) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (days.has(cursor.toDateString())) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { days: n, trainedToday };
}

/**
 * Parse a stored date as a LOCAL calendar day. Date-only strings
 * ("2026-08-13") are parsed by parts — new Date('2026-08-13') would be UTC
 * midnight, which lands on the previous local day west of Greenwich and
 * would make a workout rescheduled to today still look overdue.
 */
export function parseLocalDay(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Today as a local YYYY-MM-DD string — the format client_workouts stores. */
export function localDayString(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** True when an assigned date falls strictly before today (local days). */
export function isOverdue(assignedDate?: string | null): boolean {
  const day = parseLocalDay(assignedDate);
  if (!day) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return day.getTime() < today.getTime();
}

/**
 * Missed assigned workouts — still 'assigned', dated before today — sorted
 * most recently missed first. Real rows only; anything without a parseable
 * date is skipped.
 */
export function overdueAssigned(workouts: any[] | null | undefined): any[] {
  return (workouts || [])
    .filter((w: any) => w?.status === 'assigned' && isOverdue(w.assigned_date))
    .sort(
      (a: any, b: any) =>
        (parseLocalDay(b.assigned_date)?.getTime() || 0) -
        (parseLocalDay(a.assigned_date)?.getTime() || 0)
    );
}
