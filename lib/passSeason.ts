/**
 * passSeason — the season map (weeks × days) and the flat track, both ways.
 *
 * A coach builds a pass as weeks of days (create-plan's season map) and the
 * pass is stored as a flat ordered track (plans.track). Creation only ever
 * went one way, so after publishing the map was gone and the only editor
 * left was the node-by-node roadmap: "super tedious" (2026-09-09).
 *
 * `trackToSeason` reads a live track back into weeks. Week boundaries come
 * from the same maths every pass surface uses (lib/passWeeks). Days are not
 * stored on the track, so nodes are laid across the week by a fixed spread
 * (3 workouts → Mon/Wed/Fri); the SEQUENCE of nodes is what the athlete
 * experiences and it is preserved exactly, which `diffTracks` confirms as
 * "no change" for a round trip. Pure: jest-tested in tests/passSeason.test.ts.
 */
import type { TrackNode } from '../context/AppContext';
import { weekStartIndices } from './passWeeks';

export type DayNodeKind = 'workout' | 'diet' | 'checkin' | 'live' | 'rest' | 'milestone';
export type DayNode = { kind: DayNodeKind; id?: string; name?: string; label?: string };
export type SeasonWeek = { days: DayNode[][]; label: string; isRest?: boolean };

const WEEK_LABEL_RE = /^Week (\d+):\s*(.*)$/;
export const REST_WEEK_LABEL = 'Rest week';

export const emptyDays = (): DayNode[][] => Array.from({ length: 7 }, () => []);

/** Season map → flat track (what create-plan's buildTrack did inline). */
export function seasonToTrack(weeks: SeasonWeek[], finalMilestones: string[]): TrackNode[] {
  const nodes: Omit<TrackNode, 'order'>[] = [];
  weeks.forEach((wk, i) => {
    const label = (wk.label ?? '').trim();
    if (label) nodes.push({ type: 'milestone', label: `Week ${i + 1}: ${label}` });
    else if (wk.isRest) nodes.push({ type: 'milestone', label: `Week ${i + 1}: ${REST_WEEK_LABEL}` });
    wk.days.forEach((day) => {
      day.forEach((d) => {
        if (d.kind === 'workout' && d.id) nodes.push({ type: 'workout', id: d.id });
        else if (d.kind === 'diet' && d.id) nodes.push({ type: 'diet', id: d.id });
        else if (d.kind === 'checkin') nodes.push({ type: 'milestone', label: 'Check-in' });
        else if (d.kind === 'live') nodes.push({ type: 'milestone', label: 'Live session' });
        else if (d.kind === 'milestone') nodes.push({ type: 'milestone', label: (d.label ?? '').trim() || 'Milestone' });
        // 'rest' is a rhythm marker, not deliverable content — no node.
      });
    });
  });
  finalMilestones.forEach((m) => nodes.push({ type: 'milestone', label: m }));
  return nodes.map((n, i) => ({ ...n, order: i }));
}

/** Where n items of one kind land in a 7-day week (0 = Monday). */
export function spreadDays(n: number): number[] {
  const patterns: Record<number, number[]> = {
    0: [], 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
  };
  if (n <= 7) return patterns[n];
  // More than one a day: round-robin from Monday.
  return Array.from({ length: n }, (_, i) => i % 7);
}

export interface NameLookup {
  workoutName?: (id: string) => string | undefined;
  dietName?: (id: string) => string | undefined;
}

/**
 * Flat track → season map. A trailing run of plain milestones (not a week
 * label, not Check-in / Live session) is the season's final milestones.
 */
export function trackToSeason(track: TrackNode[], durationWeeks?: number | null, names: NameLookup = {}): { weeks: SeasonWeek[]; finalMilestones: string[] } {
  const sorted = [...(track ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const isWeekLabel = (n: TrackNode) => n.type === 'milestone' && !!n.label && WEEK_LABEL_RE.test(n.label);
  const isDayMilestone = (n: TrackNode) => n.type === 'milestone' && (n.label === 'Check-in' || n.label === 'Live session');
  const isFinal = (n: TrackNode) => n.type === 'milestone' && !isWeekLabel(n) && !isDayMilestone(n);

  // Final milestones: the trailing run at the very end.
  let end = sorted.length;
  while (end > 0 && isFinal(sorted[end - 1])) end--;
  const finalMilestones = sorted.slice(end).map((n) => n.label ?? 'Milestone');
  const body = sorted.slice(0, end);

  const starts = weekStartIndices(body, durationWeeks);
  const weeks: SeasonWeek[] = [];
  for (let w = 0; w < starts.length; w++) {
    const from = starts[w];
    const to = w + 1 < starts.length ? starts[w + 1] : body.length;
    let slice = body.slice(from, to);
    let label = '';
    let isRest = false;
    if (slice[0] && isWeekLabel(slice[0])) {
      const m = WEEK_LABEL_RE.exec(slice[0].label ?? '');
      const text = (m?.[2] ?? '').trim();
      if (text === REST_WEEK_LABEL) isRest = true; else label = text;
      slice = slice.slice(1);
    }
    const days = emptyDays();
    const byKind = { workout: [] as DayNode[], diet: [] as DayNode[], other: [] as DayNode[] };
    for (const n of slice) {
      if (n.type === 'workout' && n.id) byKind.workout.push({ kind: 'workout', id: n.id, name: names.workoutName?.(n.id) });
      else if (n.type === 'diet' && n.id) byKind.diet.push({ kind: 'diet', id: n.id, name: names.dietName?.(n.id) });
      else if (n.type === 'milestone' && n.label === 'Check-in') byKind.other.push({ kind: 'checkin' });
      else if (n.type === 'milestone' && n.label === 'Live session') byKind.other.push({ kind: 'live' });
      else if (n.type === 'milestone') byKind.other.push({ kind: 'milestone', label: n.label });
      else if (n.type === 'class' && n.id) byKind.other.push({ kind: 'live', id: n.id, name: n.label });
    }
    // Workouts set the rhythm; a meal plan per workout sits on the same day
    // (the normal case), fewer sit from Monday; everything else lands on the
    // last training day or Sunday so the sequence still reads in order.
    const wDays = spreadDays(byKind.workout.length);
    byKind.workout.forEach((n, i) => days[wDays[i]].push(n));
    const dDays = byKind.diet.length === byKind.workout.length && byKind.workout.length > 0 ? wDays : spreadDays(byKind.diet.length);
    byKind.diet.forEach((n, i) => days[dDays[i]].push(n));
    const tail = wDays.length > 0 ? Math.max(...wDays) : 6;
    byKind.other.forEach((n) => days[Math.max(tail, 6)].push(n));
    if (slice.length === 0 && !isRest && !label) {
      // An empty week without a label is a rest week in all but name.
      isRest = true;
    }
    weeks.push({ days, label, isRest });
  }
  return { weeks, finalMilestones };
}
