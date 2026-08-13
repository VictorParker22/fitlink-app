import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useApp } from '../context/AppContext';
import type { TrackNode, PlanEnrollment } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { weekOfPosition, weekStartIndices, diffTracks } from '../lib/passWeeks';
import type { TrackDiffEntry } from '../lib/passWeeks';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const nodeKey = (n: TrackNode) => `${n.type}:${n.id ?? ''}:${n.label ?? ''}`;

export default function PassTrackEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { plans, workouts, diets, clients, updatePlanTrack } = useApp();
  const { user } = useAuth();

  const plan = plans.find(p => p.id === planId);

  const [track, setTrack] = useState<TrackNode[]>(() =>
    (plan?.track || []).sort((a, b) => a.order - b.order)
  );
  const [activeTab, setActiveTab] = useState<'workouts' | 'diets'>('workouts');
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

  // IDs already in the track
  const usedWorkoutIds = new Set(track.filter(n => n.type === 'workout').map(n => n.id));
  const usedDietIds = new Set(track.filter(n => n.type === 'diet').map(n => n.id));

  const addNode = (type: TrackNode['type'], id?: string, label?: string) => {
    const newNode: TrackNode = { type, id, label, order: track.length };
    setTrack([...track, newNode]);
  };

  const removeNode = (index: number) => {
    const updated = track.filter((_, i) => i !== index).map((n, i) => ({ ...n, order: i }));
    setTrack(updated);
  };

  const onDragEnd = ({ data }: { data: TrackNode[] }) => {
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
    const changes = diffTracks(plan.track ?? [], track, durationWeeks);
    // Nobody inside, or nothing but a reorder — save with no ceremony.
    if (liveHolders.length === 0 || changes.length === 0) {
      setSaving(true);
      try {
        await updatePlanTrack(plan.id, track);
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

  const sendUpdateMessages = async (clientIds: string[], content: string) => {
    if (!user || clientIds.length === 0) return;
    const { data: convs } = await supabase.from('conversations').select('id, client_id');
    for (const clientId of clientIds) {
      try {
        let convId = (convs || []).find((c: any) => c.client_id === clientId)?.id;
        if (!convId) {
          const { data: created, error } = await supabase
            .from('conversations')
            .insert({ trainer_id: user.id, client_id: clientId })
            .select()
            .single();
          if (error || !created) continue;
          convId = created.id;
        }
        await supabase.from('messages').insert({
          conversation_id: convId,
          sender_type: 'trainer',
          content,
        });
        await supabase.from('conversations').update({
          last_message: content,
          last_message_at: new Date().toISOString(),
        }).eq('id', convId);
      } catch {
        // Non-fatal — a failed message shouldn't sink the publish.
      }
    }
  };

  const handlePublish = async () => {
    if (!plan || !review) return;
    setSaving(true);
    try {
      const oldTrack = plan.track ?? [];
      // 1. Snapshot the pre-edit track into version history (never blocks the edit).
      try {
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
          if (insErr) console.warn('plan_versions insert failed:', insErr.message);
        } else if (vErr.code !== '42P01') {
          console.warn('plan_versions read failed:', vErr.message);
        }
      } catch (e: any) {
        console.warn('plan_versions unavailable:', e?.message);
      }
      // 2. The pass itself.
      await updatePlanTrack(plan.id, track);
      // 3. Per choice.
      if (audience === 'everyone') {
        const removedKeys = new Set(review.filter(c => c.kind === 'removed').map(c => nodeKey(c.node)));
        for (const h of liveHolders) {
          const newSnap = buildProtectedSnapshot(h.snapshot, track, h.enrollment.track_position, removedKeys);
          await supabase
            .from('client_plan_enrollments')
            .update({ track_snapshot: newSnap, updated_at: new Date().toISOString() })
            .eq('id', h.enrollment.id);
        }
        if (notify && message.trim()) {
          await sendUpdateMessages(liveHolders.map(h => h.enrollment.client_id), message.trim());
        }
      }
      // Under "new joiners only" nothing changes for the people inside — no writes, no messages.
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

  const renderTrackItem = ({ item: node, drag, isActive, getIndex }: RenderItemParams<TrackNode>) => {
    const index = getIndex() ?? 0;
    const isMilestone = node.type === 'milestone';
    return (
      <ScaleDecorator>
        <View style={st.trackRow}>
          {/* Left rail: node marker + connecting line */}
          <View style={st.rail}>
            {index > 0 && <View style={st.railLineTop} />}
            <View style={[st.marker, isMilestone && st.markerMilestone]}>
              {isMilestone ? (
                <Ionicons name="trophy" size={18} color={CoachColors.accent} />
              ) : (
                <Text style={st.markerText}>{index + 1}</Text>
              )}
            </View>
            <View style={st.railLineBottom} />
          </View>

          {/* Card */}
          <TouchableOpacity
            style={[st.trackCard, isMilestone && st.trackCardMilestone, isActive && st.trackCardActive]}
            activeOpacity={0.85}
            onLongPress={drag}
          >
            <View style={st.trackCardIcon}>
              <Ionicons name={getNodeIcon(node)} size={19} color={isMilestone ? CoachColors.accent : CoachColors.textSecondary} />
            </View>

            <View style={st.trackCardInfo}>
              <Text style={[st.trackCardName, isMilestone && { color: CoachColors.accent }]} numberOfLines={1}>{getNodeLabel(node)}</Text>
              <Text style={st.trackCardSub} numberOfLines={1}>{getNodeSub(node)}</Text>
            </View>

            <TouchableOpacity onPressIn={drag} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={st.dragHandle}>
              <Ionicons name="reorder-three-outline" size={22} color={CoachColors.textFaint} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => removeNode(index)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={st.removeBtn}>
              <Ionicons name="close" size={16} color={CoachColors.textFaint} />
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
        <TouchableOpacity onPress={() => router.back()} style={st.closeBtn}>
          <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.headerTitle}>Track editor</Text>
          <Text style={st.headerSub}>{plan.name} · {track.length} node{track.length === 1 ? '' : 's'}</Text>
        </View>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={st.saveBtn}>
          <Text style={st.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <DraggableFlatList
        data={track}
        onDragEnd={onDragEnd}
        keyExtractor={(_, i) => `node-${i}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={renderTrackItem}
        ListHeaderComponent={
          <>
            {/* ── MINI TRACK PREVIEW ── */}
            <View style={st.previewSection}>
              <Text style={st.previewLabel}>Track preview</Text>
              {track.length === 0 ? (
                <View style={st.previewEmpty}>
                  <Ionicons name="map-outline" size={22} color={CoachColors.textFaint} />
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
                          <Ionicons name={getNodeIcon(node)} size={16} color={isMilestone ? CoachColors.accent : CoachColors.textSecondary} />
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
              <TouchableOpacity style={st.quickAddPill} onPress={() => setActiveTab('workouts')}>
                <Text style={st.quickAddText}>+ Workout</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.quickAddPill} onPress={() => setActiveTab('diets')}>
                <Text style={st.quickAddText}>+ Meal plan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.quickAddPill, st.quickAddPillAccent]} onPress={() => setShowMilestoneInput(true)}>
                <Text style={[st.quickAddText, { color: CoachColors.accent }]}>+ Milestone</Text>
              </TouchableOpacity>
            </View>

            {/* ── ADD MILESTONE ── */}
            {showMilestoneInput && (
              <View style={st.milestoneInput}>
                <View style={st.milestoneInputRow}>
                  <Ionicons name="trophy-outline" size={18} color={CoachColors.accent} />
                  <TextInput
                    style={st.milestoneTextInput}
                    placeholder="e.g. Week 1 complete"
                    placeholderTextColor={CoachColors.textFaint}
                    value={milestoneInput}
                    onChangeText={setMilestoneInput}
                    onSubmitEditing={addMilestone}
                    autoFocus
                  />
                  <TouchableOpacity onPress={addMilestone} style={st.milestoneAddBtn}>
                    <Ionicons name="add" size={18} color={CoachColors.onAccent} />
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
                {(['workouts', 'diets'] as const).map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[st.tab, activeTab === tab && st.tabActive]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <Ionicons
                      name={tab === 'workouts' ? 'barbell-outline' : 'nutrition-outline'}
                      size={16}
                      color={activeTab === tab ? CoachColors.textPrimary : CoachColors.textFaint}
                    />
                    <Text style={[st.tabText, activeTab === tab && st.tabTextActive]}>
                      {tab === 'workouts' ? 'Workouts' : 'Meal plans'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {activeTab === 'workouts' ? (
                workouts.length === 0 ? (
                  <View style={st.emptyContent}>
                    <Ionicons name="barbell-outline" size={26} color={CoachColors.textFaint} />
                    <Text style={st.emptyContentText}>No workouts in your library yet</Text>
                  </View>
                ) : (
                  <View style={st.contentList}>
                    {workouts.map(w => {
                      const isUsed = usedWorkoutIds.has(w.id);
                      return (
                        <TouchableOpacity
                          key={w.id}
                          style={[st.contentCard, isUsed && st.contentCardUsed]}
                          onPress={() => !isUsed && addNode('workout', w.id)}
                          activeOpacity={isUsed ? 1 : 0.7}
                          disabled={isUsed}
                        >
                          <View style={st.contentIcon}>
                            <Ionicons name="barbell-outline" size={18} color={isUsed ? CoachColors.textFaint : CoachColors.textSecondary} />
                          </View>
                          <View style={st.contentInfo}>
                            <Text style={[st.contentName, isUsed && { color: CoachColors.textFaint }]} numberOfLines={1}>{w.name}</Text>
                            <Text style={[st.contentSub, isUsed && { color: CoachColors.textFaint }]}>
                              {w.workout_exercises?.length || 0} exercises
                            </Text>
                          </View>
                          {isUsed ? (
                            <View style={st.usedBadge}>
                              <Ionicons name="checkmark" size={12} color={CoachColors.textFaint} />
                              <Text style={st.usedText}>Added</Text>
                            </View>
                          ) : (
                            <View style={st.addContentBtn}>
                              <Ionicons name="add" size={18} color={CoachColors.accent} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )
              ) : (
                diets.length === 0 ? (
                  <View style={st.emptyContent}>
                    <Ionicons name="nutrition-outline" size={26} color={CoachColors.textFaint} />
                    <Text style={st.emptyContentText}>No meal plans in your library yet</Text>
                  </View>
                ) : (
                  <View style={st.contentList}>
                    {diets.map(d => {
                      const isUsed = usedDietIds.has(d.id);
                      return (
                        <TouchableOpacity
                          key={d.id}
                          style={[st.contentCard, isUsed && st.contentCardUsed]}
                          onPress={() => !isUsed && addNode('diet', d.id)}
                          activeOpacity={isUsed ? 1 : 0.7}
                          disabled={isUsed}
                        >
                          <View style={st.contentIcon}>
                            <Ionicons name="nutrition-outline" size={18} color={isUsed ? CoachColors.textFaint : CoachColors.textSecondary} />
                          </View>
                          <View style={st.contentInfo}>
                            <Text style={[st.contentName, isUsed && { color: CoachColors.textFaint }]} numberOfLines={1}>{d.name}</Text>
                            <Text style={[st.contentSub, isUsed && { color: CoachColors.textFaint }]}>
                              {d.diet_plan_meals?.length || 0} meals
                            </Text>
                          </View>
                          {isUsed ? (
                            <View style={st.usedBadge}>
                              <Ionicons name="checkmark" size={12} color={CoachColors.textFaint} />
                              <Text style={st.usedText}>Added</Text>
                            </View>
                          ) : (
                            <View style={st.addContentBtn}>
                              <Ionicons name="add" size={18} color={CoachColors.accent} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )
              )}
            </View>

            <View style={{ height: 100 }} />
          </>
        }
      />

      {/* ── 21b: blast-radius review — in-screen overlay, NOT a native Modal,
             because we navigate (router.back) right after publishing. ── */}
      {review && (
        <View style={[st.reviewOverlay, { paddingTop: insets.top }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
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
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 16, color: CoachColors.textPrimary, textAlign: 'center' },
  headerSub: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted, marginTop: 1 },
  saveBtn: { backgroundColor: CoachColors.accent, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  saveBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 13, color: CoachColors.onAccent },

  // Preview
  previewSection: { paddingHorizontal: 20, paddingTop: 18, marginBottom: 20 },
  previewLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11,
    color: CoachColors.textFaint, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 12,
  },
  previewEmpty: {
    alignItems: 'center', paddingVertical: 26, gap: 8,
    backgroundColor: CoachColors.surface, borderRadius: 16,
    borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed',
  },
  previewEmptyText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
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
  previewNodeLabel: { fontFamily: CoachFonts.body, fontSize: 10.5, color: CoachColors.textMuted, textAlign: 'center' },

  // Section
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11,
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
  markerText: { fontFamily: CoachFonts.headingBold, fontSize: 13, color: CoachColors.textSecondary },

  trackCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 12, marginBottom: 12,
  },
  trackCardMilestone: { borderColor: 'rgba(198,242,78,0.3)', backgroundColor: CoachColors.accentSofter },
  trackCardActive: { borderColor: CoachColors.accent },
  trackCardIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  trackCardInfo: { flex: 1, gap: 2 },
  trackCardName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  trackCardSub: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },
  dragHandle: { padding: 4 },
  removeBtn: { padding: 4, marginLeft: 2 },

  // Quick add
  quickAdd: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 18 },
  quickAddPill: {
    borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed',
    borderRadius: 999, paddingHorizontal: 15, paddingVertical: 9,
  },
  quickAddPillAccent: { borderColor: 'rgba(198,242,78,0.4)' },
  quickAddText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textSecondary },

  // Milestone Input
  milestoneInput: { paddingHorizontal: 20, marginBottom: 18, gap: 8 },
  milestoneInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(198,242,78,0.25)',
  },
  milestoneTextInput: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textPrimary, paddingVertical: 14,
  },
  milestoneAddBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, textAlign: 'center' },

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
  tabText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textFaint },
  tabTextActive: { color: CoachColors.textPrimary },

  // Content List
  contentList: { gap: 8 },
  contentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  contentCardUsed: { opacity: 0.5 },
  contentIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  contentInfo: { flex: 1, gap: 2 },
  contentName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  contentSub: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted },
  addContentBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: CoachColors.accentSofter,
    alignItems: 'center', justifyContent: 'center',
  },
  usedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: CoachColors.borderMuted,
  },
  usedText: { fontFamily: CoachFonts.body, fontSize: 10.5, color: CoachColors.textFaint },

  // Empty
  emptyContent: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyContentText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },

  // 21b review overlay
  reviewOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: CoachColors.bg, paddingHorizontal: 20,
  },
  reviewTitle: { fontFamily: CoachFonts.headingBold, fontSize: 21, color: CoachColors.textPrimary, marginTop: 22 },
  reviewSub: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 6, lineHeight: 19 },

  changeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 12,
  },
  changeIcon: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  changeIconAdded: { backgroundColor: CoachColors.accentSoft },
  changeIconRemoved: { backgroundColor: CoachColors.warningSoft },
  changeIconText: { fontFamily: CoachFonts.headingBold, fontSize: 17 },
  changeName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  changeWeek: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 2, lineHeight: 17 },

  reviewEyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint,
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
  radioTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  radioSub: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginTop: 4, lineHeight: 18 },

  notifyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 14,
  },
  notifyTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  notifySub: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },
  notifyEdit: { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.accent },
  messageInput: {
    fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textPrimary,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 14, padding: 14, marginTop: 10, minHeight: 88, textAlignVertical: 'top', lineHeight: 19,
  },
  noNotifyNote: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint, marginTop: 14 },

  reviewFooter: { flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted },
  backOutlineBtn: {
    paddingHorizontal: 22, paddingVertical: 14, borderRadius: 999,
    borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center',
  },
  backOutlineText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },
  publishBtn: {
    flex: 1, backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  publishBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.onAccent },

  // Not Found
  notFoundText: { fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textMuted, textAlign: 'center', marginTop: 100 },
});
