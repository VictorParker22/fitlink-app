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

/** The "Week N: …" marker that opens a week; the text may be empty. */
export const isWeekMarker = (n: TrackNode) => n.type === 'milestone' && !!n.label && WEEK_LABEL_RE.test(n.label);

/**
 * Season map → flat track (what create-plan's buildTrack did inline).
 *
 * EVERY week opens with a "Week N: …" marker, labelled or not. Without one
 * the week boundaries are an even slice of the node count, and the moment an
 * edit changes that count every boundary moves: on 2026-09-09 a coach
 * painted two new workouts onto Spring, published, and found them scattered
 * into other weeks with "removed Push Day ×4" in the diff for edits they
 * never made. Each content node also carries its weekday so the grid reads
 * back exactly as it was painted.
 */
export function seasonToTrack(weeks: SeasonWeek[], finalMilestones: string[]): TrackNode[] {
  const nodes: Omit<TrackNode, 'order'>[] = [];
  weeks.forEach((wk, i) => {
    const label = (wk.label ?? '').trim();
    if (wk.isRest && !label) nodes.push({ type: 'milestone', label: `Week ${i + 1}: ${REST_WEEK_LABEL}` });
    else nodes.push({ type: 'milestone', label: `Week ${i + 1}: ${label}`.trimEnd() });
    if (wk.isRest) return;
    wk.days.forEach((day, dayIndex) => {
      day.forEach((d) => {
        if (d.kind === 'workout' && d.id) nodes.push({ type: 'workout', id: d.id, day: dayIndex });
        else if (d.kind === 'diet' && d.id) nodes.push({ type: 'diet', id: d.id, day: dayIndex });
        else if (d.kind === 'checkin') nodes.push({ type: 'milestone', label: 'Check-in', day: dayIndex });
        else if (d.kind === 'live') nodes.push({ type: 'milestone', label: 'Live session', day: dayIndex });
        else if (d.kind === 'milestone') nodes.push({ type: 'milestone', label: (d.label ?? '').trim() || 'Milestone', day: dayIndex });
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
  const isWeekLabel = isWeekMarker;
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
    let marked = false;
    if (slice[0] && isWeekLabel(slice[0])) {
      marked = true;
      const m = WEEK_LABEL_RE.exec(slice[0].label ?? '');
      const text = (m?.[2] ?? '').trim();
      if (text === REST_WEEK_LABEL) isRest = true; else label = text;
      slice = slice.slice(1);
    }
    const days = emptyDays();
    const toDayNode = (n: TrackNode): DayNode | null => {
      if (n.type === 'workout' && n.id) return { kind: 'workout', id: n.id, name: names.workoutName?.(n.id) };
      if (n.type === 'diet' && n.id) return { kind: 'diet', id: n.id, name: names.dietName?.(n.id) };
      if (n.type === 'milestone' && n.label === 'Check-in') return { kind: 'checkin' };
      if (n.type === 'milestone' && n.label === 'Live session') return { kind: 'live' };
      if (n.type === 'milestone') return { kind: 'milestone', label: n.label };
      if (n.type === 'class' && n.id) return { kind: 'live', id: n.id, name: n.label };
      return null;
    };
    const placed = slice.every((n) => typeof n.day === 'number' && n.day >= 0 && n.day <= 6);
    if (placed) {
      // Painted on the grid: every node knows its weekday.
      for (const n of slice) { const d = toDayNode(n); if (d) days[n.day as number].push(d); }
    } else {
      const byKind = { workout: [] as DayNode[], diet: [] as DayNode[], other: [] as DayNode[] };
      for (const n of slice) {
        const d = toDayNode(n);
        if (!d) continue;
        if (d.kind === 'workout') byKind.workout.push(d);
        else if (d.kind === 'diet') byKind.diet.push(d);
        else byKind.other.push(d);
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
    }
    if (slice.length === 0 && !marked && !isRest && !label) {
      // An empty week without a marker is a rest week in all but name.
      isRest = true;
    }
    weeks.push({ days, label, isRest });
  }
  // A marked season shorter than the declared length: the remaining weeks
  // exist (the athlete's pass says so) and are empty, waiting to be filled.
  const declared = durationWeeks && durationWeeks > 0 ? durationWeeks : 0;
  while (weeks.length < declared) weeks.push({ days: emptyDays(), label: '', isRest: false });
  return { weeks, finalMilestones };
}
