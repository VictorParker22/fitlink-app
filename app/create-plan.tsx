import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import type { TrackNode } from '../context/AppContext';
import { useAlert } from '../context/AlertContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

const PLAN_COLORS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#EC4899',
  '#6366F1', '#14B8A6', '#F97316', '#06B6D4',
];

const TIER_CONFIG = {
  diamond: { rank: 'DIAMOND', icon: 'diamond' as const, gradient: ['#22D3EE', '#0EA5E9', '#0369A1'] as [string, string, string] },
  gold: { rank: 'GOLD', icon: 'trophy' as const, gradient: ['#FDE68A', '#FBBF24', '#D97706'] as [string, string, string] },
  silver: { rank: 'SILVER', icon: 'shield-checkmark' as const, gradient: ['#F1F5F9', '#94A3B8', '#475569'] as [string, string, string] },
  bronze: { rank: 'BRONZE', icon: 'medal' as const, gradient: ['#FED7AA', '#FB923C', '#C2410C'] as [string, string, string] },
};

const getTier = (price: number) => {
  if (price >= 200) return TIER_CONFIG.diamond;
  if (price >= 100) return TIER_CONFIG.gold;
  if (price >= 50) return TIER_CONFIG.silver;
  return TIER_CONFIG.bronze;
};

export default function CreatePlanModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createPlan, updatePlanTrack, workouts, diets } = useApp();
  const { showAlert } = useAlert();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [period, setPeriod] = useState('month');
  const [featureInput, setFeatureInput] = useState('');
  const [features, setFeatures] = useState<string[]>([]);
  const [color, setColor] = useState(PLAN_COLORS[0]);
  const [isPopular, setIsPopular] = useState(false);
  const [loading, setLoading] = useState(false);

  // Track builder state
  const [trackNodes, setTrackNodes] = useState<TrackNode[]>([]);
  const [showTrackBuilder, setShowTrackBuilder] = useState(false);
  const [trackTab, setTrackTab] = useState<'workouts' | 'diets'>('workouts');
  const [milestoneInput, setMilestoneInput] = useState('');
  const [showMilestoneInput, setShowMilestoneInput] = useState(false);

  const usedWorkoutIds = new Set(trackNodes.filter(n => n.type === 'workout').map(n => n.id));
  const usedDietIds = new Set(trackNodes.filter(n => n.type === 'diet').map(n => n.id));

  const numericPrice = Number(price) || 0;
  const tier = useMemo(() => getTier(numericPrice), [numericPrice]);

  const handleAddFeature = () => {
    const trimmed = featureInput.trim();
    if (trimmed && !features.includes(trimmed)) {
      setFeatures([...features, trimmed]);
      setFeatureInput('');
    }
  };

  const handleRemoveFeature = (feat: string) => {
    setFeatures(features.filter(f => f !== feat));
  };

  const addTrackNode = (type: TrackNode['type'], id?: string, label?: string) => {
    setTrackNodes(prev => [...prev, { type, id, label, order: prev.length }]);
  };

  const removeTrackNode = (index: number) => {
    setTrackNodes(prev => prev.filter((_, i) => i !== index).map((n, i) => ({ ...n, order: i })));
  };

  const moveTrackNode = (index: number, dir: -1 | 1) => {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= trackNodes.length) return;
    const updated = [...trackNodes];
    [updated[index], updated[newIdx]] = [updated[newIdx], updated[index]];
    setTrackNodes(updated.map((n, i) => ({ ...n, order: i })));
  };

  const addMilestone = () => {
    const label = milestoneInput.trim();
    if (!label) return;
    addTrackNode('milestone', undefined, label);
    setMilestoneInput('');
    setShowMilestoneInput(false);
  };

  const getTrackNodeIcon = (node: TrackNode): string => {
    if (node.type === 'workout') return 'barbell';
    if (node.type === 'diet') return 'nutrition';
    return 'trophy';
  };

  const getTrackNodeName = (node: TrackNode): string => {
    if (node.type === 'workout' && node.id) return workouts.find(w => w.id === node.id)?.name || 'Workout';
    if (node.type === 'diet' && node.id) return diets.find(d => d.id === node.id)?.name || 'Meal Plan';
    return node.label || 'Milestone';
  };

  const TRACK_COLORS: Record<string, string> = { workout: '#22C55E', diet: '#A78BFA', milestone: '#FBBF24', class: '#A855F7' };

  const handleSave = async () => {
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Missing Name', message: 'Plan name is required.' });
    if (!price || isNaN(Number(price))) return showAlert({ type: 'warning', title: 'Invalid Price', message: 'A valid price is required.' });

    setLoading(true);
    try {
      const plan = await createPlan(name.trim(), Number(price), period, features, color, isPopular);
      // Save track if nodes were added
      if (trackNodes.length > 0) {
        await updatePlanTrack(plan.id, trackNodes);
      }
      router.back();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to create plan' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      {/* ── HEADER ── */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.closeBtn}>
          <Ionicons name="close" size={22} color="#FFF" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Create Pass</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── LIVE PREVIEW CARD ── */}
        <View style={st.previewWrap}>
          <Text style={st.previewBadge}>LIVE PREVIEW</Text>
          <View style={st.previewCard}>
            {/* Gradient hero */}
            <LinearGradient
              colors={tier.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={st.previewHero}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0.2)', 'transparent', 'rgba(255,255,255,0.06)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={st.previewTierIcon}>
                <Ionicons name={tier.icon} size={24} color="#FFF" />
              </View>
              <Text style={st.previewTierLabel}>{tier.rank}</Text>
              <Text style={st.previewPlanName}>{name || 'Your Plan'}</Text>
            </LinearGradient>

            {/* Dark body */}
            <View style={st.previewBody}>
              <View style={st.previewPriceRow}>
                <Text style={st.previewDollar}>$</Text>
                <Text style={st.previewPriceNum}>{numericPrice || '0'}</Text>
                <Text style={st.previewPeriodText}>/{period === 'year' ? 'yr' : 'mo'}</Text>
              </View>
              {features.length > 0 && (
                <View style={st.previewPerks}>
                  {features.slice(0, 3).map((f, i) => (
                    <View key={i} style={st.previewPerkRow}>
                      <View style={[st.previewPerkDot, { backgroundColor: color }]} />
                      <Text style={st.previewPerkText} numberOfLines={1}>{f}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── TIER INDICATOR ── */}
        <View style={st.tierBar}>
          {Object.entries(TIER_CONFIG).map(([key, t]) => {
            const isActive = tier.rank === t.rank;
            return (
              <View key={key} style={[st.tierStep, isActive && st.tierStepActive]}>
                {isActive ? (
                  <LinearGradient colors={t.gradient} style={st.tierStepGradient}>
                    <Ionicons name={t.icon} size={16} color="#FFF" />
                  </LinearGradient>
                ) : (
                  <View style={st.tierStepInactive}>
                    <Ionicons name={t.icon} size={14} color="rgba(255,255,255,0.15)" />
                  </View>
                )}
                <Text style={[st.tierStepLabel, isActive && st.tierStepLabelActive]}>
                  {t.rank}
                </Text>
              </View>
            );
          })}
          {/* Connector line */}
          <View style={st.tierConnector} />
        </View>

        {/* ── NAME ── */}
        <View style={st.field}>
          <Text style={st.label}>PLAN NAME</Text>
          <View style={st.inputWrap}>
            <Ionicons name="layers-outline" size={18} color="rgba(255,255,255,0.2)" />
            <TextInput
              style={st.input}
              placeholder="e.g. Pro Coaching"
              placeholderTextColor="rgba(255,255,255,0.2)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>
        </View>

        {/* ── PRICE & PERIOD ── */}
        <View style={st.row}>
          <View style={[st.field, { flex: 1 }]}>
            <Text style={st.label}>PRICE</Text>
            <View style={st.inputWrap}>
              <Text style={st.dollarIcon}>$</Text>
              <TextInput
                style={st.input}
                placeholder="0"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <View style={[st.field, { flex: 1 }]}>
            <Text style={st.label}>BILLING</Text>
            <View style={st.periodToggle}>
              {(['month', 'year'] as const).map(p => (
                <TouchableOpacity
                  key={p}
                  style={[st.periodBtn, period === p && st.periodBtnActive]}
                  onPress={() => setPeriod(p)}
                  activeOpacity={0.7}
                >
                  <Text style={[st.periodBtnText, period === p && st.periodBtnTextActive]}>
                    {p === 'month' ? 'Monthly' : 'Yearly'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ── PERKS ── */}
        <View style={st.field}>
          <Text style={st.label}>PERKS & FEATURES</Text>
          <View style={st.featureInputRow}>
            <View style={[st.inputWrap, { flex: 1 }]}>
              <Ionicons name="flash-outline" size={16} color="rgba(255,255,255,0.2)" />
              <TextInput
                style={st.input}
                placeholder="e.g. Weekly check-ins"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={featureInput}
                onChangeText={setFeatureInput}
                onSubmitEditing={handleAddFeature}
                returnKeyType="done"
              />
            </View>
            <TouchableOpacity
              style={[st.addBtn, { backgroundColor: color }]}
              onPress={handleAddFeature}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
          {features.length > 0 && (
            <View style={st.featureChips}>
              {features.map((feat, i) => (
                <View key={i} style={[st.chip, { borderColor: color + '25' }]}>
                  <View style={[st.chipDot, { backgroundColor: color }]} />
                  <Text style={st.chipText}>{feat}</Text>
                  <TouchableOpacity onPress={() => handleRemoveFeature(feat)} hitSlop={8}>
                    <Ionicons name="close" size={14} color="rgba(255,255,255,0.25)" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── COLOR ── */}
        <View style={st.field}>
          <Text style={st.label}>BRAND COLOR</Text>
          <View style={st.colorGrid}>
            {PLAN_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                onPress={() => setColor(c)}
                activeOpacity={0.7}
                style={st.colorOuter}
              >
                <View style={[
                  st.colorCircle,
                  { backgroundColor: c },
                  color === c && { borderWidth: 3, borderColor: '#FFF', transform: [{ scale: 1.2 }] },
                ]}>
                  {color === c && <Ionicons name="checkmark" size={16} color="#FFF" />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── POPULAR ── */}
        <TouchableOpacity
          style={[st.toggleCard, isPopular && { borderColor: '#FF6B35' + '30' }]}
          onPress={() => setIsPopular(!isPopular)}
          activeOpacity={0.7}
        >
          <View style={[st.toggleIconWrap, isPopular && { backgroundColor: 'rgba(255,107,53,0.12)' }]}>
            <Ionicons name="flame" size={22} color={isPopular ? '#FF6B35' : 'rgba(255,255,255,0.15)'} />
          </View>
          <View style={st.toggleContent}>
            <Text style={st.toggleTitle}>Mark as Popular</Text>
            <Text style={st.toggleSub}>Badges this pass as recommended</Text>
          </View>
          <View style={[st.toggleCheck, isPopular && { backgroundColor: '#FF6B35', borderColor: '#FF6B35' }]}>
            {isPopular && <Ionicons name="checkmark" size={14} color="#FFF" />}
          </View>
        </TouchableOpacity>

        {/* ── PROGRESSION TRACK ── */}
        <TouchableOpacity
          style={[st.trackToggle, showTrackBuilder && { borderColor: color + '25' }]}
          onPress={() => setShowTrackBuilder(!showTrackBuilder)}
          activeOpacity={0.7}
        >
          <View style={[st.toggleIconWrap, showTrackBuilder && { backgroundColor: color + '12' }]}>
            <Ionicons name="map" size={22} color={showTrackBuilder ? color : 'rgba(255,255,255,0.15)'} />
          </View>
          <View style={st.toggleContent}>
            <Text style={st.toggleTitle}>Progression Track</Text>
            <Text style={st.toggleSub}>
              {trackNodes.length > 0 ? `${trackNodes.length} nodes added` : 'Add workouts & milestones'}
            </Text>
          </View>
          <Ionicons
            name={showTrackBuilder ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="rgba(255,255,255,0.25)"
          />
        </TouchableOpacity>

        {showTrackBuilder && (
          <View style={st.trackBuilder}>
            {/* Mini track preview */}
            {trackNodes.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.trackPreviewScroll}>
                <View style={st.trackPreviewRow}>
                  {trackNodes.map((node, idx) => {
                    const nodeColor = TRACK_COLORS[node.type];
                    return (
                      <View key={idx} style={st.trackPreviewNodeWrap}>
                        {idx > 0 && <View style={[st.trackPreviewConn, { backgroundColor: nodeColor + '30' }]} />}
                        <View style={[st.trackPreviewNode, { borderColor: nodeColor }]}>
                          <Ionicons name={getTrackNodeIcon(node) as any} size={12} color={nodeColor} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            {/* Current nodes list */}
            {trackNodes.length > 0 && (
              <View style={st.trackNodesList}>
                {trackNodes.map((node, idx) => {
                  const nodeColor = TRACK_COLORS[node.type];
                  return (
                    <View key={idx} style={st.trackNodeItem}>
                      <View style={[st.trackNodeOrder, { backgroundColor: nodeColor + '15' }]}>
                        <Text style={[st.trackNodeOrderText, { color: nodeColor }]}>{idx + 1}</Text>
                      </View>
                      <Ionicons name={getTrackNodeIcon(node) as any} size={16} color={nodeColor} />
                      <Text style={st.trackNodeItemName} numberOfLines={1}>{getTrackNodeName(node)}</Text>
                      <TouchableOpacity onPress={() => moveTrackNode(idx, -1)} disabled={idx === 0}>
                        <Ionicons name="chevron-up" size={14} color={idx === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.3)'} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => moveTrackNode(idx, 1)} disabled={idx === trackNodes.length - 1}>
                        <Ionicons name="chevron-down" size={14} color={idx === trackNodes.length - 1 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.3)'} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeTrackNode(idx)}>
                        <Ionicons name="close" size={14} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Add milestone */}
            {showMilestoneInput ? (
              <View style={st.milestoneRow}>
                <View style={st.milestoneInputWrap}>
                  <Ionicons name="trophy" size={14} color="#FBBF24" />
                  <TextInput
                    style={st.milestoneInput}
                    placeholder="e.g. Week 1 Complete!"
                    placeholderTextColor="rgba(255,255,255,0.2)"
                    value={milestoneInput}
                    onChangeText={setMilestoneInput}
                    onSubmitEditing={addMilestone}
                    autoFocus
                  />
                  <TouchableOpacity onPress={addMilestone} style={st.milestoneAddBtn}>
                    <Ionicons name="add" size={16} color="#000" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={st.addMilestoneBtn} onPress={() => setShowMilestoneInput(true)}>
                <Ionicons name="trophy" size={14} color="#FBBF24" />
                <Text style={st.addMilestoneBtnText}>Add Milestone</Text>
              </TouchableOpacity>
            )}

            {/* Workout / Diet tabs */}
            <View style={st.trackTabs}>
              {(['workouts', 'diets'] as const).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[st.trackTab, trackTab === tab && st.trackTabActive]}
                  onPress={() => setTrackTab(tab)}
                >
                  <Ionicons
                    name={tab === 'workouts' ? 'barbell' : 'nutrition'}
                    size={14}
                    color={trackTab === tab ? '#FFF' : 'rgba(255,255,255,0.25)'}
                  />
                  <Text style={[st.trackTabText, trackTab === tab && st.trackTabTextActive]}>
                    {tab === 'workouts' ? 'Workouts' : 'Diets'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Content items */}
            <View style={st.trackContentList}>
              {trackTab === 'workouts' ? (
                workouts.length === 0 ? (
                  <Text style={st.trackEmptyText}>No workouts yet — create one first</Text>
                ) : (
                  workouts.map(w => {
                    const isUsed = usedWorkoutIds.has(w.id);
                    return (
                      <TouchableOpacity
                        key={w.id}
                        style={[st.trackContentItem, isUsed && { opacity: 0.4 }]}
                        onPress={() => !isUsed && addTrackNode('workout', w.id)}
                        disabled={isUsed}
                        activeOpacity={0.7}
                      >
                        <View style={[st.trackContentIcon, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
                          <Ionicons name="barbell" size={16} color={isUsed ? 'rgba(255,255,255,0.1)' : '#22C55E'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.trackContentName} numberOfLines={1}>{w.name}</Text>
                          <Text style={st.trackContentSub}>{w.workout_exercises?.length || 0} exercises</Text>
                        </View>
                        {isUsed ? (
                          <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.15)" />
                        ) : (
                          <Ionicons name="add-circle" size={20} color="#22C55E" />
                        )}
                      </TouchableOpacity>
                    );
                  })
                )
              ) : (
                diets.length === 0 ? (
                  <Text style={st.trackEmptyText}>No diet plans yet — create one first</Text>
                ) : (
                  diets.map(d => {
                    const isUsed = usedDietIds.has(d.id);
                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={[st.trackContentItem, isUsed && { opacity: 0.4 }]}
                        onPress={() => !isUsed && addTrackNode('diet', d.id)}
                        disabled={isUsed}
                        activeOpacity={0.7}
                      >
                        <View style={[st.trackContentIcon, { backgroundColor: 'rgba(167,139,250,0.1)' }]}>
                          <Ionicons name="nutrition" size={16} color={isUsed ? 'rgba(255,255,255,0.1)' : '#A78BFA'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.trackContentName} numberOfLines={1}>{d.name}</Text>
                          <Text style={st.trackContentSub}>{d.diet_plan_meals?.length || 0} meals</Text>
                        </View>
                        {isUsed ? (
                          <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.15)" />
                        ) : (
                          <Ionicons name="add-circle" size={20} color="#A78BFA" />
                        )}
                      </TouchableOpacity>
                    );
                  })
                )
              )}
            </View>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── FOOTER CTA ── */}
      <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[st.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={tier.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={st.submitGradient}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="layers" size={20} color="#FFF" />
                <Text style={st.submitText}>Create Season Pass</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },

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
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 17, color: '#FFF' },

  // Preview
  previewWrap: { marginBottom: 24 },
  previewBadge: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 9,
    color: 'rgba(255,255,255,0.25)', letterSpacing: 2, marginBottom: 8,
  },
  previewCard: { borderRadius: 22, overflow: 'hidden' },
  previewHero: {
    paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', position: 'relative',
  },
  previewTierIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  previewTierLabel: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 10,
    color: 'rgba(255,255,255,0.6)', letterSpacing: 4,
  },
  previewPlanName: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 20, color: '#FFF',
    textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  previewBody: {
    backgroundColor: 'rgba(15,15,20,0.95)', paddingHorizontal: 20, paddingVertical: 16, gap: 10,
  },
  previewPriceRow: { flexDirection: 'row', alignItems: 'flex-end' },
  previewDollar: { fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: 'rgba(255,255,255,0.4)', marginBottom: 3 },
  previewPriceNum: { fontFamily: FontFamily.headingExtraBold, fontSize: 32, color: '#FFF', lineHeight: 34 },
  previewPeriodText: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 4 },
  previewPerks: { gap: 5 },
  previewPerkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewPerkDot: { width: 5, height: 5, borderRadius: 3 },
  previewPerkText: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', flex: 1 },

  // Tier bar
  tierBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 14,
    marginBottom: 24, position: 'relative', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  tierConnector: {
    position: 'absolute', left: 40, right: 40, top: '50%', height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)', zIndex: 0, marginTop: -6,
  },
  tierStep: { alignItems: 'center', gap: 4, zIndex: 1 },
  tierStepActive: {},
  tierStepGradient: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tierStepInactive: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center',
  },
  tierStepLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 8, color: 'rgba(255,255,255,0.15)', letterSpacing: 1 },
  tierStepLabelActive: { color: 'rgba(255,255,255,0.6)' },

  // Fields
  field: { marginBottom: 22 },
  label: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1.5, marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 12 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  input: { flex: 1, fontFamily: FontFamily.body, fontSize: 15, color: '#FFF', paddingVertical: 14 },
  dollarIcon: { fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: 'rgba(255,255,255,0.3)' },

  // Period
  periodToggle: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    padding: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  periodBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 11 },
  periodBtnActive: { backgroundColor: 'rgba(255,255,255,0.1)' },
  periodBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: 'rgba(255,255,255,0.25)' },
  periodBtnTextActive: { color: '#FFF' },

  // Features
  featureInputRow: { flexDirection: 'row', gap: 8 },
  addBtn: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  featureChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 50, borderWidth: 1,
  },
  chipDot: { width: 5, height: 5, borderRadius: 3 },
  chipText: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: 'rgba(255,255,255,0.5)' },

  // Colors
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  colorOuter: { padding: 2 },
  colorCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

  // Toggle
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 16,
  },
  toggleIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center',
  },
  toggleContent: { flex: 1 },
  toggleTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: '#FFF' },
  toggleSub: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 1 },
  toggleCheck: {
    width: 24, height: 24, borderRadius: 8,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Footer
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  submitBtn: { borderRadius: Radius.sm, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', height: 50 },
  submitGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
  },
  submitText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#000000', letterSpacing: 1 },

  // Track Builder
  trackToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 8,
  },
  trackBuilder: {
    backgroundColor: '#050505',
    borderRadius: Radius.sm, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16, gap: 12,
  },
  trackPreviewScroll: { marginBottom: 4 },
  trackPreviewRow: { flexDirection: 'row', paddingVertical: 6, gap: 0 },
  trackPreviewNodeWrap: { alignItems: 'center', width: 44, position: 'relative' },
  trackPreviewConn: {
    position: 'absolute', top: 11, left: -6, width: 6, height: 2, borderRadius: 1,
  },
  trackPreviewNode: {
    width: 24, height: 24, borderRadius: 4, borderWidth: 1.5,
    backgroundColor: '#0F0F0F',
    alignItems: 'center', justifyContent: 'center',
  },
  trackNodesList: { gap: 6 },
  trackNodeItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0A0A0A', borderRadius: Radius.xs,
    paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  trackNodeOrder: {
    width: 20, height: 20, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  trackNodeOrderText: { fontFamily: FontFamily.headingExtraBold, fontSize: 9 },
  trackNodeItemName: { fontFamily: FontFamily.headingSemiBold, fontSize: 12, color: '#FFF', flex: 1 },
  milestoneRow: { gap: 6 },
  milestoneInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#0A0A0A', borderRadius: Radius.xs,
    paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)',
  },
  milestoneInput: {
    flex: 1, fontFamily: FontFamily.body, fontSize: 13, color: '#FFF', paddingVertical: 10,
  },
  milestoneAddBtn: {
    width: 26, height: 26, borderRadius: 4, backgroundColor: '#FBBF24',
    alignItems: 'center', justifyContent: 'center',
  },
  addMilestoneBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: Radius.xs,
    backgroundColor: '#141005', borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)',
  },
  addMilestoneBtnText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: '#FBBF24', letterSpacing: 0.5 },
  trackTabs: {
    flexDirection: 'row', backgroundColor: '#0A0A0A', borderRadius: Radius.xs,
    padding: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  trackTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 4,
  },
  trackTabActive: { backgroundColor: '#FFFFFF' },
  trackTabText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  trackTabTextActive: { color: '#000000' },
  trackContentList: { gap: 4 },
  trackContentItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0A0A0A', borderRadius: Radius.xs,
    padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  trackContentIcon: {
    width: 32, height: 32, borderRadius: Radius.xs,
    alignItems: 'center', justifyContent: 'center',
  },
  trackContentName: { fontFamily: FontFamily.headingSemiBold, fontSize: 13, color: '#FFF' },
  trackContentSub: { fontFamily: FontFamily.body, fontSize: 10, color: 'rgba(255,255,255,0.3)' },
  trackEmptyText: {
    fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.2)',
    textAlign: 'center', paddingVertical: 20,
  },
});
