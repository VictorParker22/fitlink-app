/**
 * passPublish — republishing a live pass without pulling the floor out from
 * under anyone.
 *
 * ONE implementation shared by the roadmap editor (app/pass-track-editor.tsx)
 * and the season map in edit mode (app/create-plan.tsx). The rules:
 *   - "Nobody's current week changes under them": if an athlete's current
 *     week (in the snapshot they bought) contains a node this edit removes,
 *     that week keeps its old shape in their new snapshot; everything from
 *     the next week onward comes from the new track. track_position is never
 *     touched (buildProtectedSnapshot).
 *   - The pass and every snapshot move in ONE transaction (publish_plan_track,
 *     SECURITY DEFINER, owner-checked). The pre-edit track is kept in
 *     plan_versions first, best effort while that table may lag.
 *   - Holders are told: a message in their thread from the coach, and a
 *     notification row (→ push) that opens their Train tab.
 */
import { supabase } from './supabase';
import type { TrackNode, PlanEnrollment } from '../context/AppContext';
import { weekOfPosition, weekStartIndices } from './passWeeks';
import { isMissingSchemaError } from './schemaErrors';
import type { TrackDiffEntry } from './passWeeks';

export const nodeKey = (n: TrackNode) => `${n.type}:${n.id ?? ''}:${n.label ?? ''}`;

export interface LiveHolder {
  enrollment: PlanEnrollment;
  client?: { id: string; name: string } | undefined;
  snapshot: TrackNode[];
  week: number;
}

/** Holders still inside the season, each read against the snapshot they bought. */
export function liveHoldersFor(
  enrollments: PlanEnrollment[],
  clients: { id: string; name: string }[],
  planTrack: TrackNode[] | null | undefined,
  durationWeeks?: number | null,
): LiveHolder[] {
  return enrollments
    .filter((e) => e.status === 'active' || e.status === 'paused')
    .map((e) => {
      const snapshot: TrackNode[] = e.track_snapshot && e.track_snapshot.length > 0 ? e.track_snapshot : (planTrack ?? []);
      return {
        enrollment: e,
        client: clients.find((c) => c.id === e.client_id),
        snapshot,
        week: weekOfPosition(e.track_position, snapshot, durationWeeks),
      };
    });
}

export function buildProtectedSnapshot(
  oldSnap: TrackNode[],
  newTrack: TrackNode[],
  position: number,
  removedKeys: Set<string>,
  durationWeeks?: number | null,
): TrackNode[] {
  const w = weekOfPosition(position, oldSnap, durationWeeks);
  const oldStarts = weekStartIndices(oldSnap, durationWeeks);
  const weekStart = oldStarts[w - 1] ?? 0;
  const oldSlice = oldSnap.slice(weekStart, oldStarts[w] ?? oldSnap.length);
  const bitten = oldSlice.some((n) => removedKeys.has(nodeKey(n)));
  // A week the athlete has not started (position at its first node) has no
  // floor to pull out: they simply get the new season. Laurel at position 0
  // was kept on a stale week 1 by an over-cautious version of this on 2026-09-09.
  const started = position > weekStart;
  if (!bitten || !started) return newTrack.map((n, i) => ({ ...n, order: i }));
  const newStarts = weekStartIndices(newTrack, durationWeeks);
  const start = Math.min(newStarts[w - 1] ?? newTrack.length, newTrack.length);
  const end = Math.min(newStarts[w] ?? newTrack.length, newTrack.length);
  const spliced = [...newTrack.slice(0, start), ...oldSlice, ...newTrack.slice(end)];
  return spliced.map((n, i) => ({ ...n, order: i }));
}

export function describeChanges(changes: TrackDiffEntry[], labelOf: (n: TrackNode) => string): string {
  // The same workout painted onto five days is one thing to say, not five:
  // "added Lower Body Blast (5 days)". The 05:44 message on 2026-09-09 read
  // "New day, New day, New day, New day, New day, New day, Full Body…".
  const grouped = (kind: 'added' | 'removed') => {
    const counts = new Map<string, number>();
    changes.filter((c) => c.kind === kind).forEach((c) => {
      const l = labelOf(c.node);
      counts.set(l, (counts.get(l) ?? 0) + 1);
    });
    return [...counts.entries()].map(([l, n]) => (n > 1 ? `${l} (${n} days)` : l));
  };
  const added = grouped('added');
  const removed = grouped('removed');
  const parts: string[] = [];
  if (added.length > 0) parts.push(`added ${added.join(', ')}`);
  if (removed.length > 0) parts.push(`removed ${removed.join(', ')}`);
  return parts.join(', ');
}

export interface PublishInput {
  planId: string;
  oldTrack: TrackNode[];
  newTrack: TrackNode[];
  changes: TrackDiffEntry[];
  holders: LiveHolder[];
  /** 'everyone' rebases every holder (protected week); 'new' touches nobody inside. */
  audience: 'everyone' | 'new';
  durationWeeks?: number | null;
  summary: string;
}

export interface PublishOutcome {
  moved: number;
  expected: number;
  versionWarning: string | null;
}

/** Version history + pass + every holder's snapshot, atomically where it matters. */
export async function publishPlanTrack(input: PublishInput): Promise<PublishOutcome> {
  let versionWarning: string | null = null;
  const { data: vRows, error: vErr } = await supabase
    .from('plan_versions').select('version').eq('plan_id', input.planId).order('version', { ascending: false }).limit(1);
  if (!vErr) {
    const nextVersion = ((vRows?.[0] as any)?.version ?? 0) + 1;
    const { error: insErr } = await supabase.from('plan_versions').insert({
      plan_id: input.planId, version: nextVersion, track: input.oldTrack, summary: input.summary,
    });
    if (insErr && !isMissingSchemaError(insErr)) versionWarning = insErr.message;
  } else if (!isMissingSchemaError(vErr)) {
    versionWarning = vErr.message;
  }

  const removedKeys = new Set(input.changes.filter((c) => c.kind === 'removed').map((c) => nodeKey(c.node)));
  const snapshots = input.audience === 'everyone'
    ? input.holders.map((h) => ({
        id: h.enrollment.id,
        track_snapshot: buildProtectedSnapshot(h.snapshot, input.newTrack, h.enrollment.track_position, removedKeys, input.durationWeeks),
      }))
    : [];

  const { data: movedCount, error } = await supabase.rpc('publish_plan_track', {
    p_plan_id: input.planId,
    p_track: input.newTrack,
    p_snapshots: snapshots,
  });
  if (error) throw error;
  return { moved: typeof movedCount === 'number' ? movedCount : snapshots.length, expected: snapshots.length, versionWarning };
}

/** The coach's note in each holder's thread. Returns how many did NOT go out. */
export async function sendUpdateMessages(trainerId: string, clientIds: string[], content: string): Promise<number> {
  if (clientIds.length === 0) return 0;
  const { data: convs } = await supabase.from('conversations').select('id, client_id');
  let failed = 0;
  for (const clientId of clientIds) {
    let convId = (convs || []).find((c: any) => c.client_id === clientId)?.id;
    if (!convId) {
      const { data: created, error } = await supabase.from('conversations').insert({ trainer_id: trainerId, client_id: clientId }).select().single();
      if (error || !created) { failed++; continue; }
      convId = created.id;
    }
    const { error: msgErr } = await supabase.from('messages').insert({ conversation_id: convId, sender_type: 'trainer', content });
    if (msgErr) { failed++; continue; }
    await supabase.from('conversations').update({ last_message: content, last_message_at: new Date().toISOString() }).eq('id', convId);
  }
  return failed;
}

/**
 * One notification row per holder (→ a push through the bridge) that opens
 * their Train tab. A coach may write the 'workout' type into their own
 * athletes' inboxes (guard_notification_insert). Best effort.
 */
export async function notifyHoldersOfUpdate(clientIds: string[], planName: string, summary: string): Promise<void> {
  if (clientIds.length === 0) return;
  const rows = clientIds.map((client_id) => ({
    client_id,
    type: 'workout',
    title: `${planName} was updated`,
    description: (summary ? `Your coach ${summary}.` : 'Your coach changed the season.') + ' Your current week stays as it was.',
    is_read: false,
    metadata: { url: '/(client-tabs)/workouts', plan_update: true },
  }));
  const { error } = await supabase.from('notifications').insert(rows);
  if (error && __DEV__) console.warn('[passPublish] holder notifications failed:', error.message);
}
