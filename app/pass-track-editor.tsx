import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useApp } from '../context/AppContext';
import type { TrackNode, PlanEnrollment } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { weekOfPosition, weekStartIndices, totalWeeks, diffTracks } from '../lib/passWeeks';
import type { TrackDiffEntry } from '../lib/passWeeks';
import { isMissingSchemaError } from '../lib/schemaErrors';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const nodeKey = (n: TrackNode) => `${n.type}:${n.id ?? ''}:${n.label ?? ''}`;

// Source tabs for the node picker. Classes sit alongside workouts and meal
// plans because a season week can hold any of the three.
type SourceTab = 'workouts' | 'diets' | 'classes';
const SOURCE_TABS: { key: SourceTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'workouts', label: 'Workouts', icon: 'barbell-outline' },
  { key: 'diets', label: 'Meal plans', icon: 'nutrition-outline' },
  { key: 'classes', label: 'Classes', icon: 'videocam-outline' },
];

// Editor rows need a key that survives reordering. Index keys break
// DraggableFlatList (rows mis-reconcile → overlapped cards, stale numbers),
// and content keys collide because a season repeats the same workout across
// weeks — so each row instance carries its own uid for the editing session.
type EditorNode = TrackNode & { _uid: string };
let uidSeq = 0;
const newUid = () => `n${Date.now().toString(36)}-${++uidSeq}`;
const withUids = (nodes: TrackNode[]): EditorNode[] => nodes.map(n => ({ ...n, _uid: newUid() }));
const toTrackNodes = (nodes: EditorNode[]): TrackNode[] =>
  nodes.map(({ _uid, ...n }, i) => ({ ...n, order: i }));

export default function PassTrackEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { plans, workouts, diets, classes, clients, updatePlanTrack, refreshPlans } = useApp();
  const { user } = useAuth();

  // Classes are a COACH-SCOPED library — AppContext already loads only this
  // coach's rows (classes … .eq('trainer_id', user.id)). Only published ones
  // can go on a season: a draft would be unreadable to the athlete under
  // supabase/migrations/scope_classes_to_coach.sql.
  const publishedClasses = useMemo(
    () => classes.filter(c => c.status === 'published'),
    [classes],
  );

  const plan = plans.find(p => p.id === planId);

  const [track, setTrack] = useState<EditorNode[]>(() =>
    withUids([...(plan?.track || [])].sort((a, b) => a.order - b.order))
  );
  const [activeTab, setActiveTab] = useState<SourceTab>('workouts');
  const [saving, setSaving] = useState(false);
  const [milestoneInput, setMilestoneInput] = useState('');
  const [showMilestoneInput, setShowMilestoneInput] = useState(false);

  // ── Blast radius (21b): who is inside this pass right now ──
  const [enrollments, setEnrollments] = useState<PlanEnrollment[]>([]);
  const [review, setReview] = useState<TrackDiffEntry[] | null>(null);
  const [audience, setAudience] = useState<'everyone' | 'new'>('everyone');
  const [notify, setNotify] = useState(true);
  const [editingMessage, setEditingMessage] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!planId) return;
    supabase
      .from('client_plan_enrollments')
      .select('id, client_id, track_position, status, track_snapshot, started_at, sync_with_plan, updated_at, plan_id, created_at')
      .eq('plan_id', planId)
      .then(({ data, error }) => {
        if (!error && data) setEnrollments(data as PlanEnrollment[]);
      });
  }, [planId]);

  const durationWeeks = plan?.duration_weeks;

  // Holders still inside the season, each read against the snapshot they bought.
  const liveHolders = useMemo(() => {
    return enrollments
      .filter(e => e.status === 'active' || e.status === 'paused')
      .map(e => {
        const snapshot: TrackNode[] = (e.track_snapshot && e.track_snapshot.length > 0)
          ? e.track_snapshot
          : (plan?.track ?? []);
        return {
          enrollment: e,
          client: clients.find(c => c.id === e.client_id),
          snapshot,
          week: weekOfPosition(e.track_position, snapshot, durationWeeks),
        };
      });
  }, [enrollments, clients, plan, durationWeeks]);

  const activeHolders = useMemo(() => liveHolders.filter(h => h.enrollment.status === 'active'), [liveHolders]);
  const maxActiveWeek = activeHolders.length > 0 ? Math.max(...activeHolders.map(h => h.week)) : 0;

  // How many times each library item already appears in the track. A season
  // legitimately repeats content weekly, so nothing is ever locked out —
  // the count is shown as information, not enforcement.
  const nodeCounts = useMemo(() => {
    const m = new Map<string, number>();
    track.forEach(n => {
      if (n.id) m.set(`${n.type}:${n.id}`, (m.get(`${n.type}:${n.id}`) ?? 0) + 1);
    });
    return m;
  }, [track]);
  const countOf = (type: TrackNode['type'], id: string) => nodeCounts.get(`${type}:${id}`) ?? 0;

  const seasonWeekCount = totalWeeks(track, durationWeeks);

  const addNode = (type: TrackNode['type'], id?: string, label?: string) => {
    Haptics.selectionAsync().catch(() => {});
    const newNode: EditorNode = { type, id, label, order: track.length, _uid: newUid() };
    setTrack([...track, newNode]);
  };

  // "Nobody hand-places 18 nodes": drop one instance at the end of every
  // week in a single tap. Week boundaries come from the same math every
  // pass surface uses (lib/passWeeks). Inserting back-to-front keeps the
  // original boundary indices valid while we splice.
  const addNodeEveryWeek = (type: TrackNode['type'], id: string, label?: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTrack(prev => {
      const starts = weekStartIndices(prev, durationWeeks);
      const updated = [...prev];
      for (let w = starts.length - 1; w >= 0; w--) {
        const insertAt = w + 1 < starts.length ? starts[w + 1] : updated.length;
        updated.splice(insertAt, 0, { type, id, label, order: 0, _uid: newUid() });
      }
      return updated.map((n, i) => ({ ...n, order: i }));
    });
  };

  const removeNode = (index: number) => {
    const updated = track.filter((_, i) => i !== index).map((n, i) => ({ ...n, order: i }));
    setTrack(updated);
  };

  const onDragEnd = ({ data }: { data: EditorNode[] }) => {
    setTrack(data.map((n, i) => ({ ...n, order: i })));
  };

  const addMilestone = () => {
    const label = milestoneInput.trim();
    if (!label) return;
    addNode('milestone', undefined, label);
    setMilestoneInput('');
    setShowMilestoneInput(false);
  };

  const describeChanges = (changes: TrackDiffEntry[]) => {
    const added = changes.filter(c => c.kind === 'added').map(c => getNodeLabel(c.node));
    const removed = changes.filter(c => c.kind === 'removed').map(c => getNodeLabel(c.node));
    const parts: string[] = [];
    if (added.length > 0) parts.push(`added ${added.join(', ')}`);
    if (removed.length > 0) parts.push(`removed ${removed.join(', ')}`);
    return parts.join(', ');
  };

  const handleSave = async () => {
    if (!plan) return;
    const clean = toTrackNodes(track);
    const changes = diffTracks(plan.track ?? [], clean, durationWeeks);
    // Nobody inside, or nothing but a reorder — save with no ceremony.
    if (liveHolders.length === 0 || changes.length === 0) {
      setSaving(true);
      try {
        await updatePlanTrack(plan.id, clean);
        router.back();
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to save track');
      } finally {
        setSaving(false);
      }
      return;
    }
    // Real changes to a live season: state the blast radius before saving.
    setMessage(`I've updated ${plan.name}: ${describeChanges(changes)}.`);
    setAudience('everyone');
    setNotify(true);
    setEditingMessage(false);
    setReview(changes);
  };

  /**
   * "Nobody's current week changes under them": if the athlete's current week
   * (in the snapshot they bought) contains a node this edit removes, keep that
   * whole week's old shape in their new snapshot; everything from the next
   * week start onward comes from the new track. track_position is never touched.
   */
  const buildProtectedSnapshot = (
    oldSnap: TrackNode[],
    newTrack: TrackNode[],
    position: number,
    removedKeys: Set<string>,
  ): TrackNode[] => {
    const w = weekOfPosition(position, oldSnap, durationWeeks);
    const oldStarts = weekStartIndices(oldSnap, durationWeeks);
    const oldSlice = oldSnap.slice(oldStarts[w - 1] ?? 0, oldStarts[w] ?? oldSnap.length);
    const bitten = oldSlice.some(n => removedKeys.has(nodeKey(n)));
    if (!bitten) return newTrack.map((n, i) => ({ ...n, order: i }));
    const newStarts = weekStartIndices(newTrack, durationWeeks);
    const start = Math.min(newStarts[w - 1] ?? newTrack.length, newTrack.length);
    const end = Math.min(newStarts[w] ?? newTrack.length, newTrack.length);
    const spliced = [...newTrack.slice(0, start), ...oldSlice, ...newTrack.slice(end)];
    return spliced.map((n, i) => ({ ...n, order: i }));
  };

  /** Sends the update note to each athlete. Returns how many did NOT go out. */
  const sendUpdateMessages = async (clientIds: string[], content: string): Promise<number> => {
    if (!user || clientIds.length === 0) return 0;
    const { data: convs } = await supabase.from('conversations').select('id, client_id');
    let failed = 0;
    for (const clientId of clientIds) {
      let convId = (convs || []).find((c: any) => c.client_id === clientId)?.id;
      if (!convId) {
        const { data: created, error } = await supabase
          .from('conversations')
          .insert({ trainer_id: user.id, client_id: clientId })
          .select()
          .single();
        if (error || !created) { failed++; continue; }
        convId = created.id;
      }
      // Resolves with { error } — it does not throw, so the old catch never ran.
      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: convId,
        sender_type: 'trainer',
        content,
      });
      if (msgErr) { failed++; continue; }
      const { error: previewErr } = await supabase.from('conversations').update({
        last_message: content,
        last_message_at: new Date().toISOString(),
      }).eq('id', convId);
      if (__DEV__ && previewErr) console.warn('[TrackEditor] conversation preview update failed:', previewErr);
    }
    return failed;
  };

  const handlePublish = async () => {
    if (!plan || !review) return;
    setSaving(true);
    try {
      const oldTrack = plan.track ?? [];
      const cleanTrack = toTrackNodes(track);
      // 1. Snapshot the pre-edit track into version history. The audit trail is
      //    best-effort ONLY while the plan_versions migration may not have run
      //    (42P01/42703); anything else is a real failure and is reported below.
      let versionWarning: string | null = null;
      const { data: vRows, error: vErr } = await supabase
        .from('plan_versions')
        .select('version')
        .eq('plan_id', plan.id)
        .order('version', { ascending: false })
        .limit(1);
      if (!vErr) {
        const nextVersion = ((vRows?.[0] as any)?.version ?? 0) + 1;
        const { error: insErr } = await supabase.from('plan_versions').insert({
          plan_id: plan.id,
          version: nextVersion,
          track: oldTrack,
          summary: describeChanges(review),
        });
        if (insErr && !isMissingSchemaError(insErr)) versionWarning = insErr.message;
      } else if (!isMissingSchemaError(vErr)) {
        versionWarning = vErr.message;
      }
      // 2 + 3. The pass and every athlete's snapshot, in ONE transaction.
      //
      // These used to be separate writes: the plan first, then a per-athlete
      // loop. A failure partway left the pass on the new track with some
      // athletes stranded on the old one. publish_plan_track applies both
      // atomically — everyone moves or nothing changes. The protected-week
      // maths stays here, where it is shared with the review the coach just
      // approved; the RPC only supplies the transaction boundary.
      let messageFailures = 0;
      const snapshots =
        audience === 'everyone'
          ? (() => {
              const removedKeys = new Set(
                review.filter(c => c.kind === 'removed').map(c => nodeKey(c.node)),
              );
              return liveHolders.map(h => ({
                id: h.enrollment.id,
                track_snapshot: buildProtectedSnapshot(
                  h.snapshot,
                  cleanTrack,
                  h.enrollment.track_position,
                  removedKeys,
                ),
              }));
            })()
          : []; // "new joiners only" — nobody inside is touched.

      const { data: movedCount, error: publishErr } = await supabase.rpc('publish_plan_track', {
        p_plan_id: plan.id,
        p_track: cleanTrack,
        p_snapshots: snapshots,
      });

      if (publishErr) {
        Alert.alert(
          'Not published',
          `The pass was left exactly as it was — nothing changed for anyone. ${publishErr.message}`,
        );
        return;
      }
      // Keep local context in step with what the server now holds.
      await refreshPlans?.();

      if (typeof movedCount === 'number' && snapshots.length > 0 && movedCount < snapshots.length) {
        // The transaction succeeded, so this means rows no longer matched
        // (an athlete left the pass mid-publish) — worth saying, not alarming.
        Alert.alert(
          'Published',
          `${movedCount} of ${snapshots.length} athletes moved to the new track. The others are no longer on this pass.`,
        );
      }

      if (audience === 'everyone' && notify && message.trim()) {
        messageFailures = await sendUpdateMessages(
          liveHolders.map(h => h.enrollment.client_id),
          message.trim(),
        );
      }
      if (messageFailures > 0 || versionWarning) {
        const parts: string[] = [];
        if (messageFailures > 0) parts.push(`${messageFailures} athlete${messageFailures === 1 ? '' : 's'} did not get the update message.`);
        if (versionWarning) parts.push(`Version history was not recorded: ${versionWarning}`);
        Alert.alert('Published, with problems', parts.join('\n\n'));
        router.back();
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to publish changes');
    } finally {
      setSaving(false);
    }
  };

  if (!plan) {
    return (
      <View style={[st.container, { paddingTop: insets.top }]}>
        <Text style={st.notFoundText}>Pass not found</Text>
      </View>
    );
  }

  const getNodeIcon = (node: TrackNode): keyof typeof Ionicons.glyphMap => {
    if (node.type === 'workout') return 'barbell-outline';
    if (node.type === 'diet') return 'nutrition-outline';
    if (node.type === 'class') return 'videocam-outline';
    return 'trophy-outline';
  };

  const getNodeTypeLabel = (node: TrackNode): string => {
    if (node.type === 'workout') return 'Workout';
    if (node.type === 'diet') return 'Meal plan';
    if (node.type === 'class') return 'Class';
    return 'Milestone';
  };

  const getNodeLabel = (node: TrackNode): string => {
    if (node.type === 'workout' && node.id) {
      return workouts.find(w => w.id === node.id)?.name || 'Workout';
    }
    if (node.type === 'diet' && node.id) {
      return diets.find(d => d.id === node.id)?.name || 'Meal plan';
    }
    if (node.type === 'class' && node.id) {
      return classes.find(c => c.id === node.id)?.title || node.label || 'Class';
    }
    return node.label || 'Milestone';
  };

  const getNodeSub = (node: TrackNode): string => {
    if (node.type === 'workout' && node.id) {
      const w = workouts.find(wk => wk.id === node.id);
      const count = w?.workout_exercises?.length || 0;
      return `${getNodeTypeLabel(node)} · ${count} exercise${count === 1 ? '' : 's'}`;
    }
    if (node.type === 'diet' && node.id) {
      const d = diets.find(dt => dt.id === node.id);
      const count = d?.diet_plan_meals?.length || 0;
      return `${getNodeTypeLabel(node)} · ${count} meal${count === 1 ? '' : 's'}`;
    }
    if (node.type === 'class' && node.id) {
      const c = classes.find(cl => cl.id === node.id);
      // Real meta or nothing — a class the coach unpublished still reads as a class.
      const bits = [getNodeTypeLabel(node)];
      if (c?.duration_minutes) bits.push(`${c.duration_minutes} min`);
      if (c?.category) bits.push(c.category);
      return bits.join(' · ');
    }
    return getNodeTypeLabel(node);
  };

  // ── Review-step derivations (only when the sheet is up) ──
  const removedKeySet = new Set((review ?? []).filter(c => c.kind === 'removed').map(c => nodeKey(c.node)));
  let protectedInfo: { name: string; week: number; nodeName: string } | null = null;
  if (review) {
    for (const h of liveHolders) {
      if (!h.client) continue;
      const starts = weekStartIndices(h.snapshot, durationWeeks);
      const slice = h.snapshot.slice(starts[h.week - 1] ?? 0, starts[h.week] ?? h.snapshot.length);
      const hit = slice.find(n => removedKeySet.has(nodeKey(n)));
      if (hit) {
        protectedInfo = { name: h.client.name, week: h.week, nodeName: getNodeLabel(hit) };
        break;
      }
    }
  }

  const blastNote = (change: TrackDiffEntry): { text: string; tone: 'warning' | 'muted' } | null => {
    if (change.kind === 'removed' && change.week <= maxActiveWeek) {
      const affected = activeHolders
        .filter(h => h.week >= change.week && h.client)
        .sort((a, b) => b.week - a.week)[0];
      if (affected?.client) return { text: `${affected.client.name} is in week ${affected.week} right now`, tone: 'warning' };
      return null;
    }
    if (change.kind === 'added' && change.week > maxActiveWeek) {
      return { text: `Nobody has reached week ${change.week} yet`, tone: 'muted' };
    }
    return null;
  };

  const everyoneSub = () => {
    if (!review) return '';
    let s = `${liveHolders.length} athlete${liveHolders.length === 1 ? '' : 's'} get${liveHolders.length === 1 ? 's' : ''} all ${review.length}.`;
    if (protectedInfo) {
      s += ` ${protectedInfo.name} keeps their ${protectedInfo.nodeName} — they're inside week ${protectedInfo.week} — and picks the rest up in week ${protectedInfo.week + 1}.`;
    }
    return s;
  };

  const renderTrackItem = ({ item: node, drag, isActive, getIndex }: RenderItemParams<EditorNode>) => {
    const index = getIndex() ?? 0;
    const isMilestone = node.type === 'milestone';
    return (
      <ScaleDecorator>
        <View style={st.trackRow}>
          {/* Left rail: node marker + connecting line. The lines extend past
              the row's bounds by design, so they must vanish while the row is
              being dragged or they smear across neighbouring rows. */}
          <View style={st.rail}>
            {!isActive && index > 0 && <View style={st.railLineTop} />}
            <View style={[st.marker, isMilestone && st.markerMilestone, isActive && st.markerActive]}>
              {isMilestone ? (
                <Ionicons name="trophy" size={20} color={CoachColors.accent} />
              ) : (
                <Text style={st.markerText}>{index + 1}</Text>
              )}
            </View>
            {!isActive && <View style={st.railLineBottom} />}
          </View>

          {/* Card */}
          <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
            style={[st.trackCard, isMilestone && st.trackCardMilestone, isActive && st.trackCardActive]}
            activeOpacity={0.85}
            onLongPress={drag}
          >
            <View style={st.trackCardIcon}>
              <Ionicons name={getNodeIcon(node)} size={21} color={isMilestone ? CoachColors.accent : CoachColors.textSecondary} />
            </View>

            <View style={st.trackCardInfo}>
              <Text style={[st.trackCardName, isMilestone && { color: CoachColors.accent }]} numberOfLines={1}>{getNodeLabel(node)}</Text>
              <Text style={st.trackCardSub} numberOfLines={1}>{getNodeSub(node)}</Text>
            </View>

            <TouchableOpacity onPressIn={drag} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={st.dragHandle}>
              <Ionicons name="reorder-three-outline" size={25} color={CoachColors.textFaint} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => removeNode(index)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={st.removeBtn}>
              <Ionicons name="close" size={18} color={CoachColors.textFaint} />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* ── HEADER ── */}
      <View style={st.header}>
        <TouchableOpacity hitSlop={6} onPress={() => router.back()} style={st.closeBtn}>
          <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.headerTitle}>Track editor</Text>
          <Text style={st.headerSub}>{plan.name} · {track.length} node{track.length === 1 ? '' : 's'}</Text>
        </View>
        <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} onPress={handleSave} disabled={saving} style={st.saveBtn}>
          <Text style={st.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      {/* The milestone field and the per-node inputs live inside this list, so the
          list needs the keyboard treatment. No tab bar and no sticky footer here
          (Save is in the header) — bottom clearance is just the home indicator. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <DraggableFlatList
        data={track}
        onDragEnd={onDragEnd}
        keyExtractor={item => item._uid}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={renderTrackItem}
        ListHeaderComponent={
          <>
            {/* ── MINI TRACK PREVIEW ── */}
            <View style={st.previewSection}>
              <Text style={st.previewLabel}>Track preview</Text>
              {track.length === 0 ? (
                <View style={st.previewEmpty}>
                  <Ionicons name="map-outline" size={25} color={CoachColors.textFaint} />
                  <Text style={st.previewEmptyText}>Add workouts and milestones below</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.previewTrack}>
                  {track.map((node, idx) => {
                    const isMilestone = node.type === 'milestone';
                    return (
                      <View key={idx} style={st.previewNodeWrap}>
                        {idx > 0 && <View style={st.previewConnector} />}
                        <View style={[st.previewNode, isMilestone && st.previewNodeMilestone]}>
                          <Ionicons name={getNodeIcon(node)} size={18} color={isMilestone ? CoachColors.accent : CoachColors.textSecondary} />
                        </View>
                        <Text style={st.previewNodeLabel} numberOfLines={1}>{getNodeLabel(node)}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <Text style={[st.sectionLabel, { paddingHorizontal: 20 }]}>Track order</Text>
          </>
        }
        ListFooterComponent={
          <>
            {/* ── QUICK ADD ── */}
            <View style={st.quickAdd}>
              <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} style={st.quickAddPill} onPress={() => setActiveTab('workouts')}>
                <Text style={st.quickAddText}>+ Workout</Text>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} style={st.quickAddPill} onPress={() => setActiveTab('diets')}>
                <Text style={st.quickAddText}>+ Meal plan</Text>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} style={st.quickAddPill} onPress={() => setActiveTab('classes')}>
                <Text style={st.quickAddText}>+ Class</Text>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} style={[st.quickAddPill, st.quickAddPillAccent]} onPress={() => setShowMilestoneInput(true)}>
                <Text style={[st.quickAddText, { color: CoachColors.accent }]}>+ Milestone</Text>
              </TouchableOpacity>
            </View>

            {/* ── ADD MILESTONE ── */}
            {showMilestoneInput && (
              <View style={st.milestoneInput}>
                <View style={st.milestoneInputRow}>
                  <Ionicons name="trophy-outline" size={20} color={CoachColors.accent} />
                  <TextInput
                    style={st.milestoneTextInput}
                    placeholder="e.g. Week 1 complete"
                    placeholderTextColor={CoachColors.textFaint}
                    value={milestoneInput}
                    onChangeText={setMilestoneInput}
                    onSubmitEditing={addMilestone}
                    autoFocus
                  />
                  <TouchableOpacity hitSlop={7} onPress={addMilestone} style={st.milestoneAddBtn}>
                    <Ionicons name="add" size={20} color={CoachColors.onAccent} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setShowMilestoneInput(false)}>
                  <Text style={st.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── AVAILABLE CONTENT ── */}
            <View style={st.section}>
              <View style={st.tabs}>
                {SOURCE_TABS.map(({ key, label, icon }) => (
                  <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                    key={key}
                    style={[st.tab, activeTab === key && st.tabActive]}
                    onPress={() => setActiveTab(key)}
                  >
                    <Ionicons
                      name={icon}
                      size={16}
                      color={activeTab === key ? CoachColors.textPrimary : CoachColors.textFaint}
                    />
                    <Text style={[st.tabText, activeTab === key && st.tabTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {activeTab === 'workouts' ? (
                workouts.length === 0 ? (
                  <View style={st.emptyContent}>
                    <Ionicons name="barbell-outline" size={29} color={CoachColors.textFaint} />
                    <Text style={st.emptyContentText}>No workouts in your library yet</Text>
                  </View>
                ) : (
                  <View style={st.contentList}>
                    {workouts.map(w => {
                      const count = countOf('workout', w.id);
                      return (
                        <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                          key={w.id}
                          style={st.contentCard}
                          onPress={() => addNode('workout', w.id)}
                          activeOpacity={0.7}
                        >
                          <View style={st.contentIcon}>
                            <Ionicons name="barbell-outline" size={20} color={CoachColors.textSecondary} />
                          </View>
                          <View style={st.contentInfo}>
                            <Text style={st.contentName} numberOfLines={1}>{w.name}</Text>
                            <Text style={st.contentSub}>
                              {w.workout_exercises?.length || 0} exercises
                              {count > 0 ? ` · in track ×${count}` : ''}
                            </Text>
                          </View>
                          {seasonWeekCount >= 2 && (
                            <TouchableOpacity
                              style={st.everyWeekBtn}
                              onPress={() => addNodeEveryWeek('workout', w.id)}
                              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                              accessibilityLabel={`Add ${w.name} to every week`}
                            >
                              <Text style={st.everyWeekText}>×{seasonWeekCount} wks</Text>
                            </TouchableOpacity>
                          )}
                          <View style={st.addContentBtn}>
                            <Ionicons name="add" size={20} color={CoachColors.accent} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )
              ) : activeTab === 'classes' ? (
                publishedClasses.length === 0 ? (
                  <View style={st.emptyContent}>
                    <Ionicons name="videocam-outline" size={29} color={CoachColors.textFaint} />
                    <Text style={st.emptyContentText}>
                      {classes.length === 0
                        ? 'No classes in your library yet'
                        : 'Publish a class to put it on a season'}
                    </Text>
                  </View>
                ) : (
                  <View style={st.contentList}>
                    {publishedClasses.map(c => {
                      const count = countOf('class', c.id);
                      // Label is carried on the node so the season still reads
                      // sensibly if the class is later unpublished or renamed.
                      const meta = [
                        c.duration_minutes ? `${c.duration_minutes} min` : null,
                        c.category || null,
                      ].filter(Boolean).join(' · ');
                      return (
                        <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                          key={c.id}
                          style={st.contentCard}
                          onPress={() => addNode('class', c.id, c.title)}
                          activeOpacity={0.7}
                        >
                          <View style={st.contentIcon}>
                            <Ionicons name="videocam-outline" size={20} color={CoachColors.textSecondary} />
                          </View>
                          <View style={st.contentInfo}>
                            <Text style={st.contentName} numberOfLines={1}>{c.title}</Text>
                            <Text style={st.contentSub}>
                              {meta}
                              {count > 0 ? `${meta ? ' · ' : ''}in track ×${count}` : ''}
                            </Text>
                          </View>
                          {seasonWeekCount >= 2 && (
                            <TouchableOpacity
                              style={st.everyWeekBtn}
                              onPress={() => addNodeEveryWeek('class', c.id, c.title)}
                              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                              accessibilityLabel={`Add ${c.title} to every week`}
                            >
                              <Text style={st.everyWeekText}>×{seasonWeekCount} wks</Text>
                            </TouchableOpacity>
                          )}
                          <View style={st.addContentBtn}>
                            <Ionicons name="add" size={20} color={CoachColors.accent} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )
              ) : (
                diets.length === 0 ? (
                  <View style={st.emptyContent}>
                    <Ionicons name="nutrition-outline" size={29} color={CoachColors.textFaint} />
                    <Text style={st.emptyContentText}>No meal plans in your library yet</Text>
                  </View>
                ) : (
                  <View style={st.contentList}>
                    {diets.map(d => {
                      const count = countOf('diet', d.id);
                      return (
                        <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                          key={d.id}
                          style={st.contentCard}
                          onPress={() => addNode('diet', d.id)}
                          activeOpacity={0.7}
                        >
                          <View style={st.contentIcon}>
                            <Ionicons name="nutrition-outline" size={20} color={CoachColors.textSecondary} />
                          </View>
                          <View style={st.contentInfo}>
                            <Text style={st.contentName} numberOfLines={1}>{d.name}</Text>
                            <Text style={st.contentSub}>
                              {d.diet_plan_meals?.length || 0} meals
                              {count > 0 ? ` · in track ×${count}` : ''}
                            </Text>
                          </View>
                          {seasonWeekCount >= 2 && (
                            <TouchableOpacity
                              style={st.everyWeekBtn}
                              onPress={() => addNodeEveryWeek('diet', d.id)}
                              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                              accessibilityLabel={`Add ${d.name} to every week`}
                            >
                              <Text style={st.everyWeekText}>×{seasonWeekCount} wks</Text>
                            </TouchableOpacity>
                          )}
                          <View style={st.addContentBtn}>
                            <Ionicons name="add" size={20} color={CoachColors.accent} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )
              )}
            </View>

          </>
        }
      />
      </KeyboardAvoidingView>

      {/* ── 21b: blast-radius review — in-screen overlay, NOT a native Modal,
             because we navigate (router.back) right after publishing. ── */}
      {review && (
        <View style={[st.reviewOverlay, { paddingTop: insets.top }]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={st.reviewTitle}>
              {review.length} change{review.length === 1 ? '' : 's'} to a live season
            </Text>
            <Text style={st.reviewSub}>
              {liveHolders.length} {liveHolders.length === 1 ? 'person is' : 'people are'} mid-season inside {plan.name}. Nobody's current week changes under them.
            </Text>

            <View style={{ gap: 10, marginTop: 18 }}>
              {review.map((change, i) => {
                const note = blastNote(change);
                return (
                  <View key={i} style={st.changeRow}>
                    <View style={[st.changeIcon, change.kind === 'added' ? st.changeIconAdded : st.changeIconRemoved]}>
                      <Text style={[st.changeIconText, { color: change.kind === 'added' ? CoachColors.accent : CoachColors.warning }]}>
                        {change.kind === 'added' ? '+' : '−'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.changeName} numberOfLines={1}>{getNodeLabel(change.node)}</Text>
                      <Text style={st.changeWeek}>
                        Week {change.week}
                        {note ? <Text style={{ color: note.tone === 'warning' ? CoachColors.warning : CoachColors.textFaint }}> · {note.text}</Text> : null}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <Text style={st.reviewEyebrow}>Who gets it</Text>
            <TouchableOpacity
              style={[st.radioCard, audience === 'everyone' && st.radioCardSelected]}
              onPress={() => setAudience('everyone')}
              activeOpacity={0.8}
            >
              <View style={[st.radioDot, audience === 'everyone' && st.radioDotSelected]} />
              <View style={{ flex: 1 }}>
                <Text style={st.radioTitle}>Everyone, from where they stand</Text>
                <Text style={st.radioSub}>{everyoneSub()}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[st.radioCard, audience === 'new' && st.radioCardSelected]}
              onPress={() => setAudience('new')}
              activeOpacity={0.8}
            >
              <View style={[st.radioDot, audience === 'new' && st.radioDotSelected]} />
              <View style={{ flex: 1 }}>
                <Text style={st.radioTitle}>New joiners only</Text>
                <Text style={st.radioSub}>
                  The {liveHolders.length} {liveHolders.length === 1 ? 'person' : 'people'} inside finish the season they bought. You'll be running two versions.
                </Text>
              </View>
            </TouchableOpacity>

            {audience === 'everyone' ? (
              <>
                <View style={st.notifyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.notifyTitle}>Tell them what changed</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={st.notifySub}>One message from you</Text>
                      <TouchableOpacity onPress={() => setEditingMessage(e => !e)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={st.notifyEdit}>· Edit</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Switch
                    value={notify}
                    onValueChange={setNotify}
                    accessibilityRole="switch"
                    accessibilityLabel="Tell them what changed"
                    trackColor={{ false: CoachColors.borderMuted, true: CoachColors.accent }}
                    thumbColor={CoachColors.textPrimary}
                  />
                </View>
                {editingMessage && (
                  <TextInput
                    style={st.messageInput}
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    placeholder="What changed and why"
                    placeholderTextColor={CoachColors.textFaint}
                  />
                )}
              </>
            ) : (
              <Text style={st.noNotifyNote}>Nothing changes for the people inside — no message needed.</Text>
            )}
          </ScrollView>

          <View style={[st.reviewFooter, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <TouchableOpacity style={st.backOutlineBtn} onPress={() => setReview(null)} disabled={saving}>
              <Text style={st.backOutlineText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.publishBtn} onPress={handlePublish} disabled={saving}>
              <Text style={st.publishBtnText}>{saving ? 'Publishing…' : 'Publish changes'}</Text>
            </TouchableOpacity>
          </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 18, color: CoachColors.textPrimary, textAlign: 'center' },
  headerSub: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 1 },
  saveBtn: { backgroundColor: CoachColors.accent, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  saveBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.onAccent },

  // Preview
  previewSection: { paddingHorizontal: 20, paddingTop: 18, marginBottom: 20 },
  previewLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5,
    color: CoachColors.textFaint, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 12,
  },
  previewEmpty: {
    alignItems: 'center', paddingVertical: 26, gap: 8,
    backgroundColor: CoachColors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed',
  },
  previewEmptyText: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted },
  previewTrack: { paddingVertical: 6, gap: 0 },
  previewNodeWrap: { alignItems: 'center', width: 72, position: 'relative' },
  previewConnector: {
    position: 'absolute', top: 20, left: -12, width: 12, height: 2, borderRadius: 1,
    backgroundColor: CoachColors.border,
  },
  previewNode: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
    overflow: 'hidden',
  },
  previewNodeMilestone: { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter },
  previewNodeLabel: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, textAlign: 'center' },

  // Section
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5,
    color: CoachColors.textFaint, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 12,
  },

  // Vertical track (draggable)
  trackRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20 },
  rail: { width: 40, alignItems: 'center' },
  railLineTop: { position: 'absolute', top: -12, width: 2, height: 12, backgroundColor: CoachColors.border },
  railLineBottom: { width: 2, flex: 1, minHeight: 8, backgroundColor: CoachColors.border, marginTop: 4 },
  marker: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  markerMilestone: { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter },
  markerActive: { borderColor: CoachColors.accent, backgroundColor: CoachColors.bg },
  markerText: { fontFamily: CoachFonts.headingBold, fontSize: 14.5, color: CoachColors.textSecondary },

  trackCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 12, marginBottom: 12,
  },
  trackCardMilestone: { borderColor: 'rgba(198,242,78,0.3)', backgroundColor: CoachColors.accentSofter },
  trackCardActive: {
    borderColor: CoachColors.accent,
    // Lift the hovering card above its neighbours so it reads as picked up.
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12,
    elevation: 8,
  },
  trackCardIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  trackCardInfo: { flex: 1, gap: 2 },
  trackCardName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary },
  trackCardSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  dragHandle: { padding: 4 },
  removeBtn: { padding: 4, marginLeft: 2 },

  // Quick add
  quickAdd: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 18 },
  quickAddPill: {
    borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed',
    borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9,
  },
  quickAddPillAccent: { borderColor: 'rgba(198,242,78,0.4)' },
  quickAddText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },

  // Milestone Input
  milestoneInput: { paddingHorizontal: 20, marginBottom: 18, gap: 8 },
  milestoneInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(198,242,78,0.25)',
  },
  milestoneTextInput: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary, paddingVertical: 17,
  },
  milestoneAddBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, textAlign: 'center' },

  // Tabs
  tabs: {
    flexDirection: 'row', backgroundColor: CoachColors.surface,
    borderRadius: 14, padding: 4, marginBottom: 14,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 11,
  },
  tabActive: { backgroundColor: CoachColors.borderMuted },
  tabText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textFaint },
  tabTextActive: { color: CoachColors.textPrimary },

  // Content List
  contentList: { gap: 8 },
  contentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  contentIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  contentInfo: { flex: 1, gap: 2 },
  contentName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  contentSub: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },
  addContentBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: CoachColors.accentSofter,
    alignItems: 'center', justifyContent: 'center',
  },
  everyWeekBtn: {
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6, marginRight: 2,
  },
  everyWeekText: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.accent },

  // Empty
  emptyContent: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyContentText: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted },

  // 21b review overlay
  reviewOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: CoachColors.bg, paddingHorizontal: 20,
  },
  reviewTitle: { fontFamily: CoachFonts.headingBold, fontSize: 23.5, color: CoachColors.textPrimary, marginTop: 22 },
  reviewSub: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, marginTop: 6, lineHeight: 21.5 },

  changeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 12,
  },
  changeIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  changeIconAdded: { backgroundColor: CoachColors.accentSoft },
  changeIconRemoved: { backgroundColor: CoachColors.warningSoft },
  changeIconText: { fontFamily: CoachFonts.headingBold, fontSize: 19 },
  changeName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  changeWeek: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2, lineHeight: 19 },

  reviewEyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 26, marginBottom: 10,
  },
  radioCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1.5, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  radioCardSelected: { borderColor: CoachColors.accent },
  radioDot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: CoachColors.border, marginTop: 1,
  },
  radioDotSelected: { borderColor: CoachColors.accent, backgroundColor: CoachColors.accent },
  radioTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary },
  radioSub: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 4, lineHeight: 20 },

  notifyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 14,
  },
  notifyTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  notifySub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  notifyEdit: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.accent },
  messageInput: {
    fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textPrimary,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 14, padding: 14, marginTop: 10, minHeight: 106, textAlignVertical: 'top', lineHeight: 21.5,
  },
  noNotifyNote: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textFaint, marginTop: 14 },

  reviewFooter: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted },
  backOutlineBtn: {
    paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999,
    borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center',
  },
  backOutlineText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textSecondary },
  publishBtn: {
    flex: 1, backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  publishBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 16, color: CoachColors.onAccent },

  // Not Found
  notFoundText: { fontFamily: CoachFonts.body, fontSize: 18, color: CoachColors.textMuted, textAlign: 'center', marginTop: 100 },
});
