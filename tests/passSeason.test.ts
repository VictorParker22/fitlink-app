/**
 * The season map and the flat track are two views of one season: reading a
 * live track back into weeks and writing it out again must not change what
 * the athlete experiences (diffTracks says "no change"), and rebasing a
 * holder onto a new track must never change their current week.
 */
import { seasonToTrack, trackToSeason, spreadDays } from '../lib/passSeason';
import { buildProtectedSnapshot, describeChanges, liveHoldersFor } from '../lib/passPublish';
import { diffTracks } from '../lib/passWeeks';
import type { TrackNode } from '../context/AppContext';

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));

const W = (id: string): TrackNode => ({ type: 'workout', id, order: 0 });
const D = (id: string): TrackNode => ({ type: 'diet', id, order: 0 });
const M = (label: string): TrackNode => ({ type: 'milestone', label, order: 0 });
const ordered = (nodes: TrackNode[]) => nodes.map((n, i) => ({ ...n, order: i }));

const SPRING = ordered([
  M('Week 1: Baseline'), W('a'), D('d1'), W('b'), W('c'), M('Check-in'),
  M('Week 2: Rest week'),
  M('Week 3: Build'), W('a'), W('b'), W('c'), W('e'), D('d1'),
  M('Season done'),
]);

describe('spreadDays', () => {
  it('lays training days out like a coach would', () => {
    expect(spreadDays(3)).toEqual([0, 2, 4]);
    expect(spreadDays(4)).toEqual([0, 1, 3, 4]);
    expect(spreadDays(0)).toEqual([]);
    expect(spreadDays(9)).toEqual([0, 1, 2, 3, 4, 5, 6, 0, 1]);
  });
});

describe('trackToSeason', () => {
  it('reads weeks, labels, rest weeks and final milestones back', () => {
    const { weeks, finalMilestones } = trackToSeason(SPRING, 3, { workoutName: (id) => `Workout ${id}` });
    expect(weeks).toHaveLength(3);
    expect(weeks[0].label).toBe('Baseline');
    expect(weeks[0].days[0].map((n) => n.kind)).toEqual(['workout', 'diet']);
    expect(weeks[0].days[0][0].name).toBe('Workout a');
    expect(weeks[0].days[2][0]).toMatchObject({ kind: 'workout', id: 'b' });
    expect(weeks[0].days[4][0]).toMatchObject({ kind: 'workout', id: 'c' });
    expect(weeks[0].days[6][0]).toMatchObject({ kind: 'checkin' });
    expect(weeks[1].isRest).toBe(true);
    expect(weeks[1].days.flat()).toHaveLength(0);
    expect(weeks[2].label).toBe('Build');
    expect(weeks[2].days.flat().filter((n) => n.kind === 'workout')).toHaveLength(4);
    expect(finalMilestones).toEqual(['Season done']);
  });
  it('falls back to even slices when a track has no week labels', () => {
    const flat = ordered([W('a'), W('b'), W('c'), W('d'), W('e'), W('f')]);
    const { weeks } = trackToSeason(flat, 2);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].days.flat().map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(weeks[1].days.flat().map((n) => n.id)).toEqual(['d', 'e', 'f']);
  });
});

describe('round trip', () => {
  it('changes nothing an athlete experiences', () => {
    const { weeks, finalMilestones } = trackToSeason(SPRING, 3);
    const again = seasonToTrack(weeks, finalMilestones);
    expect(diffTracks(SPRING, again, 3)).toEqual([]);
    expect(again).toHaveLength(SPRING.length);
    // Week labels and final milestones sit exactly where they were; the
    // content inside a week is the same set (days are a layout, not data).
    expect(again.map((n) => n.label).filter(Boolean)).toEqual(SPRING.map((n) => n.label).filter(Boolean));
  });
  it('adding a workout to a week shows as exactly one change', () => {
    const { weeks, finalMilestones } = trackToSeason(SPRING, 3);
    weeks[2].days[5].push({ kind: 'workout', id: 'new' });
    const next = seasonToTrack(weeks, finalMilestones);
    const changes = diffTracks(SPRING, next, 3);
    expect(changes).toEqual([{ kind: 'added', node: expect.objectContaining({ type: 'workout', id: 'new' }), week: 3 }]);
  });
});

describe('buildProtectedSnapshot', () => {
  it('keeps the holder\'s current week when the edit removes something from it', () => {
    const removedC = SPRING.filter((n) => n.id !== 'c').map((n, i) => ({ ...n, order: i }));
    const removedKeys = new Set(['workout:c:']);
    // In week 1 (position 2): week 1 keeps its old shape, week 3 loses c.
    const snap = buildProtectedSnapshot(SPRING, removedC, 2, removedKeys, 3);
    const week1 = snap.slice(0, 6).map((n) => n.id ?? n.label);
    expect(week1).toEqual(['Week 1: Baseline', 'a', 'd1', 'b', 'c', 'Check-in']);
    expect(snap.filter((n) => n.id === 'c')).toHaveLength(1);
    // In week 3 (position 8): nothing removed from week 1 matters, and week 3 follows the new track.
    const snapW3 = buildProtectedSnapshot(SPRING, removedC, 8, removedKeys, 3);
    // The protected snapshot: new week 1 (5 nodes, c gone) + week 2 label + OLD week 3 (c kept).
    const w3 = snapW3.slice(6).map((n) => n.id ?? n.label);
    expect(w3).toEqual(['Week 3: Build', 'a', 'b', 'c', 'e', 'd1', 'Season done']);
  });
  it('is the new track when nothing in the current week was removed', () => {
    const added = ordered([...SPRING, W('z')]);
    expect(buildProtectedSnapshot(SPRING, added, 2, new Set(), 3)).toEqual(added);
  });
});

describe('holders and summaries', () => {
  it('reads holders against the snapshot they bought', () => {
    const holders = liveHoldersFor([
      { id: 'e1', client_id: 'c1', plan_id: 'p', track_snapshot: SPRING, track_position: 8, status: 'active', started_at: '' } as any,
      { id: 'e2', client_id: 'c2', plan_id: 'p', track_snapshot: [], track_position: 0, status: 'completed', started_at: '' } as any,
    ], [{ id: 'c1', name: 'Laurel' }], SPRING, 3);
    expect(holders).toHaveLength(1);
    expect(holders[0].week).toBe(3);
    expect(holders[0].client?.name).toBe('Laurel');
  });
  it('describes changes in coach words', () => {
    const changes = diffTracks(SPRING, ordered([...SPRING.filter((n) => n.id !== 'e'), W('z')]), 3);
    expect(describeChanges(changes, (n) => n.id ?? n.label ?? '?')).toBe('added z, removed e');
  });
});
