import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Dimensions, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import type { TrackNode } from '../context/AppContext';
import { getWorkoutEmblem } from '../utils/workoutEmblems';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

const getTierColor = (price: number) => {
  if (price >= 200) return '#0EA5E9';
  if (price >= 100) return '#FBBF24';
  if (price >= 50) return '#94A3B8';
  return '#FB923C';
};

export default function PassTrackEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { plans, workouts, diets, updatePlanTrack } = useApp();

  const plan = plans.find(p => p.id === planId);
  const planColor = (plan as any)?.color || '#3B82F6';
  const tierColor = plan ? getTierColor(Number(plan.price)) : '#3B82F6';

  const [track, setTrack] = useState<TrackNode[]>(() =>
    (plan?.track || []).sort((a, b) => a.order - b.order)
  );
  const [activeTab, setActiveTab] = useState<'workouts' | 'diets'>('workouts');
  const [saving, setSaving] = useState(false);
  const [milestoneInput, setMilestoneInput] = useState('');
  const [showMilestoneInput, setShowMilestoneInput] = useState(false);

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

  const moveNode = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= track.length) return;
    const updated = [...track];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setTrack(updated.map((n, i) => ({ ...n, order: i })));
  };

  const addMilestone = () => {
    const label = milestoneInput.trim();
    if (!label) return;
    addNode('milestone', undefined, label);
    setMilestoneInput('');
    setShowMilestoneInput(false);
  };

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    try {
      await updatePlanTrack(plan.id, track);
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save track');
    } finally {
      setSaving(false);
    }
  };

  if (!plan) {
    return (
      <View style={[st.container, { paddingTop: insets.top }]}>
        <Text style={st.notFoundText}>Plan not found</Text>
      </View>
    );
  }

  const getNodeIcon = (node: TrackNode): string => {
    if (node.type === 'workout') return 'barbell';
    if (node.type === 'diet') return 'nutrition';
    return 'trophy';
  };

  const getNodeLabel = (node: TrackNode): string => {
    if (node.type === 'workout' && node.id) {
      return workouts.find(w => w.id === node.id)?.name || 'Workout';
    }
    if (node.type === 'diet' && node.id) {
      return diets.find(d => d.id === node.id)?.name || 'Meal Plan';
    }
    return node.label || 'Milestone';
  };

  const getNodeSub = (node: TrackNode): string => {
    if (node.type === 'workout' && node.id) {
      const w = workouts.find(wk => wk.id === node.id);
      return w?.workout_exercises ? `${w.workout_exercises.length} exercises` : 'Workout';
    }
    if (node.type === 'diet' && node.id) {
      const d = diets.find(dt => dt.id === node.id);
      return d?.diet_plan_meals ? `${d.diet_plan_meals.length} meals` : 'Diet Plan';
    }
    return '🏆 Milestone';
  };

  const getWorkoutMuscleGroups = (node: TrackNode): string[] | undefined => {
    if (node.type !== 'workout' || !node.id) return undefined;
    const w = workouts.find(wk => wk.id === node.id);
    return w?.workout_exercises?.map(e => e.exercises?.muscle_group).filter(Boolean) as string[] | undefined;
  };

  const TYPE_COLORS: Record<string, string> = { workout: '#22C55E', diet: '#A78BFA', milestone: '#FBBF24', class: '#A855F7' };

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* ── HEADER ── */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.closeBtn}>
          <Ionicons name="close" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={st.headerTitle}>Track Editor</Text>
          <Text style={st.headerSub}>{plan.name}</Text>
        </View>
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[st.saveBtn, { backgroundColor: planColor }]}
        >
          <Text style={st.saveBtnText}>{saving ? '...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── MINI TRACK PREVIEW ── */}
        <View style={st.previewSection}>
          <Text style={st.previewLabel}>TRACK PREVIEW</Text>
          {track.length === 0 ? (
            <View style={st.previewEmpty}>
              <Ionicons name="map-outline" size={24} color="rgba(255,255,255,0.08)" />
              <Text style={st.previewEmptyText}>Add workouts and milestones below</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.previewTrack}>
              {track.map((node, idx) => {
                const color = TYPE_COLORS[node.type];
                return (
                  <View key={idx} style={st.previewNodeWrap}>
                    {idx > 0 && <View style={[st.previewConnector, { backgroundColor: color + '30' }]} />}
                    <View style={[st.previewNode, { borderColor: color }]}>
                      {node.type === 'workout' && node.id ? (
                        <Image source={getWorkoutEmblem(node.id, getNodeLabel(node), getWorkoutMuscleGroups(node))} style={st.previewEmblemImg} />
                      ) : (
                        <Ionicons name={getNodeIcon(node) as any} size={14} color={color} />
                      )}
                    </View>
                    <Text style={st.previewNodeLabel} numberOfLines={1}>{getNodeLabel(node)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* ── CURRENT TRACK (reorderable list) ── */}
        <View style={st.section}>
          <Text style={st.sectionLabel}>TRACK ORDER · {track.length} nodes</Text>
          {track.map((node, idx) => {
            const color = TYPE_COLORS[node.type];
            return (
              <View key={idx} style={st.trackItem}>
                {/* Order number */}
                <View style={[st.orderBadge, { backgroundColor: color + '15' }]}>
                  <Text style={[st.orderText, { color }]}>{idx + 1}</Text>
                </View>

                {/* Icon */}
                {node.type === 'workout' && node.id ? (
                  <Image source={getWorkoutEmblem(node.id, getNodeLabel(node), getWorkoutMuscleGroups(node))} style={st.trackItemEmblem} />
                ) : (
                  <View style={[st.trackItemIcon, { backgroundColor: color + '12' }]}>
                    <Ionicons name={getNodeIcon(node) as any} size={18} color={color} />
                  </View>
                )}

                {/* Info */}
                <View style={st.trackItemInfo}>
                  <Text style={st.trackItemName} numberOfLines={1}>{getNodeLabel(node)}</Text>
                  <Text style={st.trackItemSub}>{getNodeSub(node)}</Text>
                </View>

                {/* Controls */}
                <View style={st.trackItemControls}>
                  <TouchableOpacity onPress={() => moveNode(idx, -1)} disabled={idx === 0} style={st.moveBtn}>
                    <Ionicons name="chevron-up" size={16} color={idx === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveNode(idx, 1)} disabled={idx === track.length - 1} style={st.moveBtn}>
                    <Ionicons name="chevron-down" size={16} color={idx === track.length - 1 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={() => removeNode(idx)} style={st.removeBtn}>
                  <Ionicons name="close" size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* ── ADD MILESTONE ── */}
        {showMilestoneInput ? (
          <View style={st.milestoneInput}>
            <View style={st.milestoneInputRow}>
              <Ionicons name="trophy" size={18} color="#FBBF24" />
              <TextInput
                style={st.milestoneTextInput}
                placeholder="e.g. Week 1 Complete!"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={milestoneInput}
                onChangeText={setMilestoneInput}
                onSubmitEditing={addMilestone}
                autoFocus
              />
              <TouchableOpacity onPress={addMilestone} style={[st.milestoneAddBtn, { backgroundColor: '#FBBF24' }]}>
                <Ionicons name="add" size={18} color="#000" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setShowMilestoneInput(false)}>
              <Text style={st.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={st.addMilestoneBtn}
            onPress={() => setShowMilestoneInput(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="trophy" size={18} color="#FBBF24" />
            <Text style={st.addMilestoneBtnText}>Add Milestone</Text>
          </TouchableOpacity>
        )}

        {/* ── AVAILABLE CONTENT ── */}
        <View style={st.section}>
          {/* Tabs */}
          <View style={st.tabs}>
            {(['workouts', 'diets'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[st.tab, activeTab === tab && st.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Ionicons
                  name={tab === 'workouts' ? 'barbell' : 'nutrition'}
                  size={16}
                  color={activeTab === tab ? '#FFF' : 'rgba(255,255,255,0.3)'}
                />
                <Text style={[st.tabText, activeTab === tab && st.tabTextActive]}>
                  {tab === 'workouts' ? 'Workouts' : 'Diet Plans'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content list */}
          {activeTab === 'workouts' ? (
            workouts.length === 0 ? (
              <View style={st.emptyContent}>
                <Ionicons name="barbell-outline" size={28} color="rgba(255,255,255,0.08)" />
                <Text style={st.emptyContentText}>No workouts created yet</Text>
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
                      <View style={[st.contentIcon, { backgroundColor: isUsed ? 'rgba(255,255,255,0.03)' : 'rgba(34,197,94,0.1)' }]}>
                        <Ionicons name="barbell" size={18} color={isUsed ? 'rgba(255,255,255,0.1)' : '#22C55E'} />
                      </View>
                      <View style={st.contentInfo}>
                        <Text style={[st.contentName, isUsed && { color: 'rgba(255,255,255,0.15)' }]}>{w.name}</Text>
                        <Text style={[st.contentSub, isUsed && { color: 'rgba(255,255,255,0.08)' }]}>
                          {w.workout_exercises?.length || 0} exercises
                        </Text>
                      </View>
                      {isUsed ? (
                        <View style={st.usedBadge}>
                          <Ionicons name="checkmark" size={12} color="rgba(255,255,255,0.15)" />
                          <Text style={st.usedText}>Added</Text>
                        </View>
                      ) : (
                        <View style={[st.addContentBtn, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
                          <Ionicons name="add" size={18} color="#22C55E" />
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
                <Ionicons name="nutrition-outline" size={28} color="rgba(255,255,255,0.08)" />
                <Text style={st.emptyContentText}>No diet plans created yet</Text>
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
                      <View style={[st.contentIcon, { backgroundColor: isUsed ? 'rgba(255,255,255,0.03)' : 'rgba(167,139,250,0.1)' }]}>
                        <Ionicons name="nutrition" size={18} color={isUsed ? 'rgba(255,255,255,0.1)' : '#A78BFA'} />
                      </View>
                      <View style={st.contentInfo}>
                        <Text style={[st.contentName, isUsed && { color: 'rgba(255,255,255,0.15)' }]}>{d.name}</Text>
                        <Text style={[st.contentSub, isUsed && { color: 'rgba(255,255,255,0.08)' }]}>
                          {d.diet_plan_meals?.length || 0} meals
                        </Text>
                      </View>
                      {isUsed ? (
                        <View style={st.usedBadge}>
                          <Ionicons name="checkmark" size={12} color="rgba(255,255,255,0.15)" />
                          <Text style={st.usedText}>Added</Text>
                        </View>
                      ) : (
                        <View style={[st.addContentBtn, { backgroundColor: 'rgba(167,139,250,0.12)' }]}>
                          <Ionicons name="add" size={18} color="#A78BFA" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 17, color: '#FFF', textAlign: 'center' },
  headerSub: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20 },
  saveBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: '#FFF' },

  // Preview
  previewSection: { paddingHorizontal: 20, marginBottom: 24 },
  previewLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 10,
    color: 'rgba(255,255,255,0.25)', letterSpacing: 1.5, marginBottom: 10,
  },
  previewEmpty: {
    alignItems: 'center', paddingVertical: 30, gap: 8,
    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', borderStyle: 'dashed',
  },
  previewEmptyText: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.15)' },
  previewTrack: { paddingVertical: 10, gap: 0 },
  previewNodeWrap: { alignItems: 'center', width: 64, position: 'relative' },
  previewConnector: {
    position: 'absolute', top: 15, left: -10, width: 10, height: 2, borderRadius: 1,
  },
  previewNode: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    overflow: 'hidden',
  },
  previewEmblemImg: { width: 30, height: 30, borderRadius: 15 },
  previewNodeLabel: { fontFamily: FontFamily.body, fontSize: 8, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },

  // Section
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 10,
    color: 'rgba(255,255,255,0.25)', letterSpacing: 1.5, marginBottom: 12,
  },

  // Track Items
  trackItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  orderBadge: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  orderText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11 },
  trackItemIcon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  trackItemEmblem: { width: 38, height: 38, borderRadius: 12 },
  trackItemInfo: { flex: 1, gap: 2 },
  trackItemName: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: '#FFF' },
  trackItemSub: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.25)' },
  trackItemControls: { gap: 0 },
  moveBtn: { padding: 4 },
  removeBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },

  // Milestone Input
  milestoneInput: {
    paddingHorizontal: 20, marginBottom: 20, gap: 8,
  },
  milestoneInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(251,191,36,0.15)',
  },
  milestoneTextInput: {
    flex: 1, fontFamily: FontFamily.body, fontSize: 14, color: '#FFF', paddingVertical: 14,
  },
  milestoneAddBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: {
    fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center',
  },
  addMilestoneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 20, paddingVertical: 12,
    borderRadius: 12, backgroundColor: 'rgba(251,191,36,0.06)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.12)',
  },
  addMilestoneBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: '#FBBF24' },

  // Tabs
  tabs: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14, padding: 4, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 11,
  },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  tabText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: 'rgba(255,255,255,0.3)' },
  tabTextActive: { color: '#FFF' },

  // Content List
  contentList: { gap: 6 },
  contentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  contentCardUsed: { opacity: 0.5 },
  contentIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  contentInfo: { flex: 1, gap: 2 },
  contentName: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: '#FFF' },
  contentSub: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.25)' },
  addContentBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  usedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  usedText: { fontFamily: FontFamily.body, fontSize: 10, color: 'rgba(255,255,255,0.15)' },

  // Empty
  emptyContent: {
    alignItems: 'center', paddingVertical: 32, gap: 8,
  },
  emptyContentText: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.15)' },

  // Not Found
  notFoundText: { fontFamily: FontFamily.body, fontSize: 16, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 100 },
});
