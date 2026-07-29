import { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Alert, RefreshControl, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useApp } from '../context/AppContext';
import type { TrackNode } from '../context/AppContext';
import Avatar from '../components/Avatar';
import { getWorkoutEmblem, getWorkoutEmblemGlow } from '../utils/workoutEmblems';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');

const TIER_CONFIG = {
  diamond: { rank: 'DIAMOND', icon: 'diamond' as const, glow: '#67E8F9', gradientColors: ['#22D3EE', '#0EA5E9', '#0369A1'] as [string, string, string] },
  gold: { rank: 'GOLD', icon: 'trophy' as const, glow: '#FCD34D', gradientColors: ['#FDE68A', '#FBBF24', '#D97706'] as [string, string, string] },
  silver: { rank: 'SILVER', icon: 'shield-checkmark' as const, glow: '#CBD5E1', gradientColors: ['#F1F5F9', '#94A3B8', '#475569'] as [string, string, string] },
  bronze: { rank: 'BRONZE', icon: 'medal' as const, glow: '#FDBA74', gradientColors: ['#FED7AA', '#FB923C', '#C2410C'] as [string, string, string] },
};

const getTier = (price: number) => {
  if (price >= 200) return TIER_CONFIG.diamond;
  if (price >= 100) return TIER_CONFIG.gold;
  if (price >= 50) return TIER_CONFIG.silver;
  return TIER_CONFIG.bronze;
};

// Perk icons based on common keywords
const getPerkIcon = (text: string): string => {
  const lower = text.toLowerCase();
  if (lower.includes('session') || lower.includes('training')) return 'barbell';
  if (lower.includes('check') || lower.includes('review')) return 'clipboard';
  if (lower.includes('nutrition') || lower.includes('diet') || lower.includes('meal')) return 'nutrition';
  if (lower.includes('chat') || lower.includes('message') || lower.includes('support')) return 'chatbubbles';
  if (lower.includes('video') || lower.includes('call')) return 'videocam';
  if (lower.includes('plan') || lower.includes('program')) return 'document-text';
  if (lower.includes('progress') || lower.includes('track')) return 'trending-up';
  if (lower.includes('access') || lower.includes('library')) return 'library';
  return 'checkmark-circle';
};

export default function PlanDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { plans, clients, trainer, sessions, workouts, diets, refreshData } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  }, [refreshData]);

  const plan = plans.find(p => p.id === planId);
  if (!plan) {
    return (
      <View style={[st.container, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={st.navBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={st.notFound}>
          <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.15)" />
          <Text style={st.notFoundText}>Plan not found</Text>
        </View>
      </View>
    );
  }

  const planColor = (plan as any).color || '#3B82F6';
  const tier = getTier(Number(plan.price));
  const features = ((plan as any).features || []) as string[];
  const isPopular = (plan as any).is_popular;

  const subscribers = clients.filter(c => c.plan_id === plan.id && c.status !== 'inactive');
  const subCount = subscribers.length;
  const monthlyRevenue = Number(plan.price) * subCount;
  const yearlyRevenue = monthlyRevenue * 12;

  // Capacity XP bar
  const maxCapacity = Math.max(subCount + 5, 10);
  const capacityPct = Math.min((subCount / maxCapacity) * 100, 100);

  // Session stats
  const avgSessions = useMemo(() => {
    if (subCount === 0) return 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const subIds = new Set(subscribers.map(s => s.id));
    const count = sessions.filter(s =>
      s.client_id && subIds.has(s.client_id) &&
      new Date(s.date) >= monthStart && s.status === 'completed'
    ).length;
    return Math.round(count / subCount);
  }, [subscribers, sessions]);

  const handleCollectPayment = () => {
    if (trainer?.stripe_onboarding_complete !== true) {
      Alert.alert('Payment Setup Required', 'Set up your Stripe account before collecting payments.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Set Up Now', onPress: () => router.push('/earnings' as any) },
      ]);
      return;
    }
    if (subCount === 0) {
      Alert.alert('No Members', 'Add a client to this pass before collecting payment.');
    } else if (subCount === 1) {
      router.push({ pathname: '/checkout', params: { planId: plan.id, clientId: subscribers[0].id } } as any);
    } else {
      const buttons = subscribers.map(c => ({
        text: c.name,
        onPress: () => router.push({ pathname: '/checkout', params: { planId: plan.id, clientId: c.id } } as any),
      }));
      buttons.push({ text: 'Cancel', onPress: () => {} });
      Alert.alert('Select Member', 'Which member to charge?', buttons as any);
    }
  };

  return (
    <View style={st.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFF" />}
      >
        {/* ── VIP HERO CARD ── */}
        <View style={[st.heroContainer, { paddingTop: insets.top }]}>
          {/* Nav */}
          <View style={st.heroNav}>
            <TouchableOpacity onPress={() => router.back()} style={st.navBtn}>
              <Ionicons name="chevron-back" size={20} color="#FFF" />
            </TouchableOpacity>
            <Text style={st.headerTitle}>PASS DETAILS</Text>
            <View style={st.navRight}>
              <TouchableOpacity style={st.navBtn} onPress={() => router.push({ pathname: '/create-plan', params: { editId: plan.id } } as any)}>
                <Ionicons name="create-outline" size={18} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* VIP Pass Main Card */}
          <View style={st.vipCard}>
            <View style={st.vipCardTop}>
              <View style={st.tierIconWrap}>
                <Ionicons name={tier.icon} size={22} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.tierLabel}>{tier.rank} PASS</Text>
                <Text style={st.planNameHero}>{plan.name}</Text>
              </View>
              {isPopular && (
                <View style={st.popularTag}>
                  <Text style={st.popularTagText}>POPULAR</Text>
                </View>
              )}
            </View>

            {/* Price display */}
            <View style={st.priceDisplay}>
              <Text style={st.priceSign}>$</Text>
              <Text style={st.priceNum}>{Number(plan.price)}</Text>
              <View style={st.pricePeriodCol}>
                <Text style={st.pricePer}>PER</Text>
                <Text style={st.priceUnit}>{((plan as any).period || 'month').toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── CAPACITY BAR ── */}
        <View style={st.xpCard}>
          <View style={st.xpHeader}>
            <View style={st.xpLevelBadge}>
              <Text style={st.xpLevelText}>LVL {subCount}</Text>
            </View>
            <Text style={st.xpLabel}>MEMBER CAPACITY</Text>
            <Text style={st.xpFraction}>{subCount} / {maxCapacity}</Text>
          </View>
          <View style={st.xpTrack}>
            <View style={[st.xpFill, { width: `${capacityPct}%`, backgroundColor: '#FFFFFF' }]} />
          </View>
        </View>

        {/* ── STATS GRID ── */}
        <View style={st.statsGrid}>
          <View style={st.statBox}>
            <Text style={st.statLabel}>MONTHLY REVENUE</Text>
            <Text style={st.statValue}>${monthlyRevenue.toLocaleString()}</Text>
            <Text style={st.statSub}>+ MRR ACTIVE</Text>
          </View>
          <View style={st.statBox}>
            <Text style={st.statLabel}>PROJECTED / YR</Text>
            <Text style={st.statValue}>${yearlyRevenue.toLocaleString()}</Text>
            <Text style={st.statSub}>ANNUALIZED</Text>
          </View>
          <View style={st.statBox}>
            <Text style={st.statLabel}>AVG SESSIONS</Text>
            <Text style={st.statValue}>{avgSessions}</Text>
            <Text style={st.statSub}>PER MEMBER</Text>
          </View>
        </View>

        {/* ── PROGRESSION TRACK ── */}
        {plan.track && plan.track.length > 0 && (
          <View style={st.trackSection}>
            <View style={st.trackHeader}>
              <View style={st.sectionTitleRow}>
                <Text style={st.sectionTitle}>PROGRESSION ROADMAP</Text>
                <View style={st.countBadge}>
                  <Text style={st.countBadgeText}>{plan.track.length} STEPS</Text>
                </View>
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.trackScroll}
            >
              {plan.track.sort((a, b) => a.order - b.order).map((node, idx) => {
                const isFirst = idx === 0;
                const getNodeState = (i: number): 'completed' | 'active' | 'locked' => i === 0 ? 'active' : 'locked';
                const nodeState = getNodeState(idx);

                let nodeName = node.label || 'Milestone';
                let nodeSub = '';
                let nodeIcon: string = 'trophy';
                let workoutEmblem: any = null;

                if (node.type === 'workout' && node.id) {
                  const w = workouts.find(wk => wk.id === node.id);
                  nodeName = w?.name || 'Workout';
                  nodeSub = w?.workout_exercises ? `${w.workout_exercises.length} EXERCISES` : '';
                  nodeIcon = 'barbell';
                  const muscleGroups = w?.workout_exercises?.map(e => e.exercises?.muscle_group).filter(Boolean) as string[] | undefined;
                  workoutEmblem = getWorkoutEmblem(node.id, w?.name, muscleGroups);
                } else if (node.type === 'diet' && node.id) {
                  const d = diets.find(dt => dt.id === node.id);
                  nodeName = d?.name || 'Meal Plan';
                  nodeSub = d?.diet_plan_meals ? `${d.diet_plan_meals.length} MEALS` : '';
                  nodeIcon = 'nutrition';
                } else if (node.type === 'milestone') {
                  nodeSub = 'MILESTONE';
                  nodeIcon = 'trophy';
                }

                return (
                  <View key={`${node.type}-${node.id || idx}`} style={st.trackNodeWrap}>
                    {!isFirst && (
                      <View style={[
                        st.trackConnector,
                        nodeState === 'active'
                          ? { backgroundColor: '#FFFFFF' }
                          : { backgroundColor: 'rgba(255,255,255,0.1)' },
                      ]} />
                    )}

                    <View style={[
                      st.trackNode,
                      nodeState === 'active' && { borderColor: '#FFFFFF', backgroundColor: '#111111' },
                      nodeState === 'locked' && { borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#050505' },
                    ]}>
                      {workoutEmblem && nodeState !== 'locked' ? (
                        <Image source={workoutEmblem} style={st.trackEmblemImage} />
                      ) : nodeState === 'active' ? (
                        <Ionicons name={nodeIcon as any} size={18} color="#FFFFFF" />
                      ) : (
                        <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.2)" />
                      )}
                    </View>

                    {nodeState === 'active' && (
                      <View style={st.trackCurrentBadge}>
                        <Text style={st.trackCurrentText}>ACTIVE</Text>
                      </View>
                    )}

                    <Text style={[
                      st.trackNodeName,
                      nodeState === 'locked' && { color: 'rgba(255,255,255,0.25)' },
                    ]} numberOfLines={2}>{nodeName.toUpperCase()}</Text>
                    {nodeSub ? (
                      <Text style={st.trackNodeSub}>{nodeSub}</Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={st.editTrackBtn}
              onPress={() => router.push({ pathname: '/pass-track-editor', params: { planId: plan.id } } as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={14} color="#FFF" />
              <Text style={st.editTrackText}>EDIT ROADMAP</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Add Track CTA (when no track exists) */}
        {(!plan.track || plan.track.length === 0) && (
          <TouchableOpacity
            style={st.addTrackCard}
            onPress={() => router.push({ pathname: '/pass-track-editor', params: { planId: plan.id } } as any)}
            activeOpacity={0.8}
          >
            <View style={st.addTrackIcon}>
              <Ionicons name="map-outline" size={20} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.addTrackTitle}>ADD PROGRESSION ROADMAP</Text>
              <Text style={st.addTrackSub}>Build a battle pass of workouts & milestones</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        )}

        {/* ── PERKS ── */}
        {features.length > 0 && (
          <View style={st.section}>
            <View style={st.sectionTitleRow}>
              <Text style={st.sectionTitle}>INCLUDED PERKS</Text>
            </View>
            <View style={st.perksGrid}>
              {features.map((feat, i) => (
                <View key={i} style={st.perkCard}>
                  <View style={st.perkIconBox}>
                    <Ionicons name={getPerkIcon(feat) as any} size={16} color="#FFF" />
                  </View>
                  <Text style={st.perkCardText}>{feat.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── MEMBERS ── */}
        <View style={st.section}>
          <View style={st.sectionTitleRow}>
            <Text style={st.sectionTitle}>SUBSCRIBED MEMBERS</Text>
            <View style={st.countBadge}>
              <Text style={st.countBadgeText}>{subCount}</Text>
            </View>
          </View>
          {subCount === 0 ? (
            <View style={st.emptyMembers}>
              <Ionicons name="qr-code-outline" size={28} color="rgba(255,255,255,0.3)" />
              <Text style={st.emptyMembersText}>NO MEMBERS SUBSCRIBED</Text>
              <Text style={st.emptyMembersSub}>Share this VIP pass link to onboard your first client</Text>
            </View>
          ) : (
            <View style={st.membersList}>
              {subscribers.map((client) => (
                <TouchableOpacity
                  key={client.id}
                  style={st.memberCard}
                  onPress={() => router.push(`/client/${client.id}` as any)}
                  activeOpacity={0.7}
                >
                  <Avatar name={client.name} size="md" imageUrl={(client as any).avatar_url} />
                  <View style={st.memberInfo}>
                    <Text style={st.memberName}>{client.name.toUpperCase()}</Text>
                    <Text style={st.memberEmail}>{(client as any).email || 'NO EMAIL'}</Text>
                  </View>
                  <View style={st.memberStatusBadge}>
                    <Text style={st.memberStatusText}>{client.status.toUpperCase()}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── ACTIONS ── */}
        <View style={st.actionsSection}>
          <TouchableOpacity
            style={st.primaryAction}
            onPress={handleCollectPayment}
            activeOpacity={0.85}
          >
            <View style={st.primaryActionGradient}>
              <Ionicons name="card" size={18} color="#000000" />
              <Text style={st.primaryActionText}>COLLECT PAYMENT</Text>
            </View>
          </TouchableOpacity>

          <View style={st.secondaryRow}>
            <TouchableOpacity style={st.secondaryAction} activeOpacity={0.7}>
              <Ionicons name="share-social" size={16} color="#FFF" />
              <Text style={st.secondaryText}>SHARE PASS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.secondaryAction} activeOpacity={0.7}>
              <Ionicons name="analytics" size={16} color="#FFF" />
              <Text style={st.secondaryText}>ANALYTICS</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Hero
  heroContainer: { paddingHorizontal: 20, paddingBottom: 16 },
  heroNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, marginBottom: 8,
  },
  headerTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 13, color: '#FFF', letterSpacing: 1.5 },
  navBtn: {
    width: 36, height: 36, borderRadius: Radius.xs,
    backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  navRight: { flexDirection: 'row', gap: 8 },

  vipCard: {
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm,
    padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  vipCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  tierIconWrap: {
    width: 44, height: 44, borderRadius: Radius.xs,
    backgroundColor: '#111111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  tierLabel: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 11,
    color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 2,
  },
  planNameHero: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 22, color: '#FFF',
    letterSpacing: -0.5,
  },
  popularTag: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  popularTagText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: '#000000', letterSpacing: 0.5 },

  priceDisplay: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 16 },
  priceSign: { fontFamily: FontFamily.headingExtraBold, fontSize: 20, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  priceNum: { fontFamily: FontFamily.headingExtraBold, fontSize: 40, color: '#FFF', lineHeight: 44 },
  pricePeriodCol: { justifyContent: 'center', marginTop: 8, marginLeft: 4 },
  pricePer: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  priceUnit: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },

  // Capacity Bar
  xpCard: {
    marginHorizontal: 20, backgroundColor: '#0A0A0A',
    borderRadius: Radius.sm, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  xpHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  xpLevelBadge: {
    backgroundColor: '#111111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.xs,
  },
  xpLevelText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#FFF', letterSpacing: 1 },
  xpLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, flex: 1 },
  xpFraction: { fontFamily: FontFamily.headingExtraBold, fontSize: 13, color: '#FFF' },
  xpTrack: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3,
    overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: 3 },

  // Stats
  statsGrid: {
    flexDirection: 'row', marginHorizontal: 20, gap: 8, marginBottom: 24,
  },
  statBox: {
    flex: 1, gap: 4,
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  statLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: 18, color: '#FFF' },
  statSub: { fontFamily: FontFamily.headingExtraBold, fontSize: 9.5, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },

  // Sections
  section: { marginHorizontal: 20, marginBottom: 24 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 12,
    color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5,
  },
  countBadge: { backgroundColor: '#111111', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.xs, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  countBadgeText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#FFF', letterSpacing: 0.5 },

  // Perks
  perksGrid: { gap: 6 },
  perkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm,
    padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  perkIconBox: {
    width: 32, height: 32, borderRadius: Radius.xs,
    backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center',
  },
  perkCardText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5, flex: 1 },

  // Members
  emptyMembers: { alignItems: 'center', paddingVertical: 32, gap: 6, backgroundColor: '#0A0A0A', borderRadius: Radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderStyle: 'dashed' },
  emptyMembersText: { fontFamily: FontFamily.headingExtraBold, fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: 1 },
  emptyMembersSub: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingHorizontal: 24 },
  membersList: { gap: 6 },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm,
    padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: '#FFF', letterSpacing: 0.5 },
  memberEmail: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  memberStatusBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs,
    backgroundColor: '#111111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  memberStatusText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: '#FFF', letterSpacing: 0.5 },

  // Actions
  actionsSection: { paddingHorizontal: 20, gap: 10 },
  primaryAction: { height: 52, borderRadius: Radius.sm, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  primaryActionGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryActionText: { fontFamily: FontFamily.headingExtraBold, fontSize: 13, color: '#000000', letterSpacing: 1 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryAction: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 46, borderRadius: Radius.sm,
    backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  secondaryText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#FFF', letterSpacing: 0.5 },

  // Progression Track
  trackSection: { marginBottom: 24 },
  trackHeader: { paddingHorizontal: 20, marginBottom: 12 },
  trackScroll: { paddingHorizontal: 20, paddingBottom: 8 },
  trackNodeWrap: {
    alignItems: 'center', width: 88, marginRight: 4, position: 'relative',
  },
  trackConnector: {
    position: 'absolute', top: 22, left: -20, width: 20, height: 2,
  },
  trackNode: {
    width: 44, height: 44, borderRadius: Radius.xs,
    backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative',
    overflow: 'hidden',
  },
  trackEmblemImage: { width: 44, height: 44, borderRadius: Radius.xs },
  trackCurrentBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.xs,
    backgroundColor: '#FFFFFF', marginBottom: 4,
  },
  trackCurrentText: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: '#000000', letterSpacing: 1,
  },
  trackNodeName: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#FFF',
    textAlign: 'center', lineHeight: 14, letterSpacing: 0.5,
  },
  trackNodeSub: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: 'rgba(255,255,255,0.4)',
    textAlign: 'center', marginTop: 2, letterSpacing: 0.5,
  },
  editTrackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 20, marginTop: 12, height: 42, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#0A0A0A',
  },
  editTrackText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#FFF', letterSpacing: 1 },
  addTrackCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 20, marginBottom: 24, padding: 16,
    borderRadius: Radius.sm, backgroundColor: '#0A0A0A',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed',
  },
  addTrackIcon: {
    width: 40, height: 40, borderRadius: Radius.xs,
    backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center',
  },
  addTrackTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#FFF', letterSpacing: 0.5 },
  addTrackSub: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },

  // Not Found
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
});
