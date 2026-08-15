/**
 * Pre-start copy for a cohort that has not begun yet.
 *
 * Shared by SeasonHero (Train) and SeasonPulseCard (Today) so both surfaces
 * say the same true thing. Built only from the coach's real starts_on date —
 * no countdown theatrics, and null for evergreen passes (which have no start
 * date to count down to) and for cohorts already running.
 */
import { isCohort, parseLocalDay, formatDay, type CohortFields } from './cohort';

/** Whole days from today until the cohort's first day. Negative once running. */
export function daysUntilStart(plan?: CohortFields | null): number | null {
  const start = parseLocalDay(plan?.starts_on);
  if (!start) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((start.getTime() - today.getTime()) / 86400000);
}

/**
 * "Starts tomorrow" / "Starts Tuesday · 3 days to go" / "Starts Sep 8 · 24
 * days to go". Null unless this is a cohort whose real start is still ahead —
 * callers then keep their normal "week N of M" line.
 */
export function preStartLine(plan?: CohortFields | null): string | null {
  if (!isCohort(plan)) return null;
  const days = daysUntilStart(plan);
  if (days === null || days <= 0) return null;
  const start = parseLocalDay(plan?.starts_on);
  if (!start) return null;
  if (days === 1) return 'Starts tomorrow';
  // A weekday name only reads unambiguously inside the coming week.
  const when =
    days < 7 ? start.toLocaleDateString('en-GB', { weekday: 'long' }) : formatDay(start);
  return `Starts ${when} · ${days} days to go`;
}
