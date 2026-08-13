import type { TrackNode } from '../context/AppContext';

/**
 * Week math for pass tracks — shared by the live-pass overview (21a), the
 * edit blast-radius sheet (21b), and the versions screen (21c) so every
 * surface derives "which week is this athlete in" the same way.
 *
 * A track is a flat ordered list of nodes. When the season builder created
 * it, week starts are marked by "Week N: …" milestone labels; otherwise we
 * fall back to slicing the track evenly across plan.duration_weeks. Both are
 * approximations of the same real thing — stated, not invented.
 */

const WEEK_LABEL_RE = /^Week (\d+):/;

/** Node index at which each week starts. Index 0 of the result = week 1. */
export function weekStartIndices(track: TrackNode[], durationWeeks?: number | null): number[] {
  const starts: number[] = [];
  track.forEach((n, i) => {
    if (n.type === 'milestone' && n.label && WEEK_LABEL_RE.test(n.label)) starts.push(i);
  });
  if (starts.length >= 2) {
    if (starts[0] !== 0) starts.unshift(0);
    return starts;
  }
  // Fallback: even slices across the declared season length.
  const weeks = durationWeeks && durationWeeks > 0 ? durationWeeks : 1;
  if (track.length === 0) return [0];
  const per = track.length / weeks;
  return Array.from({ length: weeks }, (_, w) => Math.floor(w * per));
}

/** 1-based week an athlete at `position` (nodes completed) is currently in. */
export function weekOfPosition(position: number, track: TrackNode[], durationWeeks?: number | null): number {
  const starts = weekStartIndices(track, durationWeeks);
  let week = 1;
  for (let w = 0; w < starts.length; w++) {
    if (position >= starts[w]) week = w + 1;
    else break;
  }
  return week;
}

export function totalWeeks(track: TrackNode[], durationWeeks?: number | null): number {
  return Math.max(weekStartIndices(track, durationWeeks).length, durationWeeks || 0, 1);
}

/** Holder count per week (index 0 = week 1) — the "Where everyone is" bars. */
export function weekHistogram(
  positions: number[],
  track: TrackNode[],
  durationWeeks?: number | null,
): number[] {
  const weeks = totalWeeks(track, durationWeeks);
  const bars = Array.from({ length: weeks }, () => 0);
  positions.forEach(p => {
    const w = Math.min(weekOfPosition(p, track, durationWeeks), weeks);
    bars[w - 1] += 1;
  });
  return bars;
}

/** First week (1-based) that no holder has reached yet — null if someone is in the last week. */
export function firstUntouchedWeek(
  positions: number[],
  track: TrackNode[],
  durationWeeks?: number | null,
): number | null {
  const weeks = totalWeeks(track, durationWeeks);
  const furthest = positions.length > 0
    ? Math.max(...positions.map(p => weekOfPosition(p, track, durationWeeks)))
    : 0;
  return furthest < weeks ? furthest + 1 : null;
}

/** Deep-equality check: is this enrollment's frozen snapshot the current plan track? */
export function isOnLatestTrack(snapshot: TrackNode[] | null | undefined, track: TrackNode[] | null | undefined): boolean {
  const a = snapshot ?? [];
  const b = track ?? [];
  if (a.length !== b.length) return false;
  return a.every((n, i) => n.type === b[i].type && n.id === b[i].id && n.label === b[i].label);
}

export type TrackDiffEntry = {
  kind: 'added' | 'removed';
  node: TrackNode;
  /** 1-based week the node sits in (in whichever track it belongs to). */
  week: number;
};

/**
 * Human-scale diff between the published track and the edited one. Node
 * identity is (type + id/label), counted — so swapping back squat's workout
 * for another shows as one removal and one addition. Order-only moves are
 * deliberately ignored: reordering inside a week has no blast radius worth
 * interrupting a save for.
 */
export function diffTracks(
  before: TrackNode[],
  after: TrackNode[],
  durationWeeks?: number | null,
): TrackDiffEntry[] {
  const key = (n: TrackNode) => `${n.type}:${n.id ?? ''}:${n.label ?? ''}`;
  const count = (list: TrackNode[]) => {
    const m = new Map<string, { node: TrackNode; n: number; firstIndex: number }>();
    list.forEach((node, i) => {
      const k = key(node);
      const e = m.get(k);
      if (e) e.n += 1;
      else m.set(k, { node, n: 1, firstIndex: i });
    });
    return m;
  };
  const b = count(before);
  const a = count(after);
  const out: TrackDiffEntry[] = [];
  a.forEach((entry, k) => {
    const prev = b.get(k)?.n ?? 0;
    for (let i = 0; i < entry.n - prev; i++) {
      out.push({ kind: 'added', node: entry.node, week: weekOfPosition(entry.firstIndex, after, durationWeeks) });
    }
  });
  b.forEach((entry, k) => {
    const next = a.get(k)?.n ?? 0;
    for (let i = 0; i < entry.n - next; i++) {
      out.push({ kind: 'removed', node: entry.node, week: weekOfPosition(entry.firstIndex, before, durationWeeks) });
    }
  });
  return out;
}
