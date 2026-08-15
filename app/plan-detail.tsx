import { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '../context/AppContext';
import type { TrackNode } from '../context/AppContext';
import Avatar from '../components/Avatar';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { isCohort, formatRun, formatDeadline } from '../lib/cohort';

const { width: SCREEN_W } = Dimensions.get('window');

const TIER_CONFIG = {
  diamond: { rank: 'Diamond', icon: 'diamond' as const },
  gold: { rank: 'Gold', icon: 'trophy' as const },
  silver: { rank: 'Silver', icon: 'shield-checkmark' as const },
  bronze: { rank: 'Bronze', icon: 'medal' as const },
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
          <Ionicons name="chevron-back" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={st.notFound}>
          <Ionicons name="alert-circle-outline" size={48} color={CoachColors.textFaint} />
          <Text style={st.notFoundText}>Plan not found</Text>
        </View>
      </View>
    );
  }

  const tier = getTier(Number(plan.price));
  // A cohort is a dated pass (lib/cohort.ts) — evergreen passes have no dates
  // to show, so the tag and the run line are simply absent for them.
  const cohort = isCohort(plan);
  const cohortRun = cohort
    ? [formatRun(plan), formatDeadline(plan)].filter(Boolean).join(' · ')
    : null;
  const features = ((plan as any).features || []) as string[];
  const isPopular = (plan as any).is_popular;

  const subscribers = clients.filter(c => c.plan_id === plan.id && c.status !== 'inactive');
  const subCount = subscribers.length;
  const monthlyRevenue = Number(plan.price) * subCount;
  const yearlyRevenue = monthlyRevenue * 12;

  // Capacity bar
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
      Alert.alert('Payment setup required', 'Set up your Stripe account before collecting payments.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Set up now', onPress: () => router.push('/earnings' as any) },
      ]);
      return;
    }
    if (subCount === 0) {
      Alert.alert('No members', 'Add a client to this pass before collecting payment.');
    } else if (subCount === 1) {
      router.push({ pathname: '/checkout', params: { planId: plan.id, clientId: subscribers[0].id } } as any);
    } else {
      const buttons = subscribers.map(c => ({
        text: c.name,
        onPress: () => router.push({ pathname: '/checkout', params: { planId: plan.id, clientId: c.id } } as any),
      }));
      buttons.push({ text: 'Cancel', onPress: () => {} });
      Alert.alert('Select member', 'Which member to charge?', buttons as any);
    }
  };

  return (
    <View style={st.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.textPrimary} />}
      >
        {/* ── HERO CARD ── */}
        <View style={[st.heroContainer, { paddingTop: insets.top }]}>
          {/* Nav */}
          <View style={st.heroNav}>
            <TouchableOpacity onPress={() => router.back()} style={st.navBtn}>
              <Ionicons name="chevron-back" size={20} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <Text style={st.headerTitle}>Pass details</Text>
            <View style={st.navRight}>
              <TouchableOpacity style={st.navBtn} onPress={() => router.push({ pathname: '/create-plan', params: { editId: plan.id } } as any)}>
                <Ionicons name="create-outline" size={18} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Pass Main Card */}
          <View style={st.vipCard}>
            <View style={st.vipCardTop}>
              <View style={st.tierIconWrap}>
                <Ionicons name={tier.icon} size={22} color={CoachColors.textPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={st.tierRow}>
                  <Text style={st.tierLabel}>{tier.rank} pass</Text>
                  {cohort && (
                    <View style={st.cohortTag}>
                      <Text style={st.cohortTagText}>Cohort</Text>
                    </View>
                  )}
                </View>
                <Text style={st.planNameHero}>{plan.name}</Text>
                {/* Dated pass — everyone runs it on the same calendar. */}
                {cohortRun ? <Text style={st.cohortRunLine}>{cohortRun}</Text> : null}
              </View>
              {isPopular && (
                <View style={st.popularTag}>
                  <Text style={st.popularTagText}>Popular</Text>
                </View>
              )}
            </View>

            {/* Price display */}
            <View style={st.priceDisplay}>
              <Text style={st.priceSign}>$</Text>
              <Text style={st.priceNum}>{Number(plan.price)}</Text>
              <View style={st.pricePeriodCol}>
                <Text style={st.pricePer}>Per</Text>
                <Text style={st.priceUnit}>{(plan as any).period || 'month'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── CAPACITY BAR ── */}
        <View style={st.xpCard}>
          <View style={st.xpHeader}>
            <View style={st.xpLevelBadge}>
              <Text style={st.xpLevelText}>{subCount}</Text>
            </View>
            <Text style={st.xpLabel}>Member capacity</Text>
            <Text style={st.xpFraction}>{subCount} / {maxCapacity}</Text>
          </View>
          <View style={st.xpTrack}>
            <View style={[st.xpFill, { width: `${capacityPct}%` }]} />
          </View>
        </View>

        {/* ── STATS GRID ── */}
        <View style={st.statsGrid}>
          <View style={st.statBox}>
            <Text style={st.statLabel}>Monthly revenue</Text>
            <Text style={st.statValue}>${monthlyRevenue.toLocaleString()}</Text>
            <Text style={st.statSub}>MRR active</Text>
          </View>
          <View style={st.statBox}>
            <Text style={st.statLabel}>Projected / yr</Text>
            <Text style={st.statValue}>${yearlyRevenue.toLocaleString()}</Text>
            <Text style={st.statSub}>Annualized</Text>
          </View>
          <View style={st.statBox}>
            <Text style={st.statLabel}>Avg sessions</Text>
            <Text style={st.statValue}>{avgSessions}</Text>
            <Text style={st.statSub}>Per member</Text>
          </View>
        </View>

        {/* ── PROGRESSION TRACK ── */}
        {plan.track && plan.track.length > 0 && (
          <View style={st.trackSection}>
            <View style={st.trackHeader}>
              <View style={st.sectionTitleRow}>
                <Text style={st.sectionTitle}>Progression roadmap</Text>
                <View style={st.countBadge}>
                  <Text style={st.countBadgeText}>{plan.track.length} steps</Text>
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
                let nodeIcon: string = 'trophy-outline';

                if (node.type === 'workout' && node.id) {
                  const w = workouts.find(wk => wk.id === node.id);
                  nodeName = w?.name || 'Workout';
                  nodeSub = w?.workout_exercises ? `${w.workout_exercises.length} exercises` : '';
                  nodeIcon = 'barbell-outline';
                } else if (node.type === 'diet' && node.id) {
                  const d = diets.find(dt => dt.id === node.id);
                  nodeName = d?.name || 'Meal plan';
                  nodeSub = d?.diet_plan_meals ? `${d.diet_plan_meals.length} meals` : '';
                  nodeIcon = 'nutrition-outline';
                } else if (node.type === 'milestone') {
                  nodeSub = 'Milestone';
                  nodeIcon = 'trophy-outline';
                }

                return (
                  <View key={`${node.type}-${node.id || idx}`} style={st.trackNodeWrap}>
                    {!isFirst && (
                      <View style={[
                        st.trackConnector,
                        nodeState === 'active'
                          ? { backgroundColor: CoachColors.accent }
                          : { backgroundColor: CoachColors.borderMuted },
                      ]} />
                    )}

                    <View style={[
                      st.trackNode,
                      nodeState === 'active' && { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter },
                      nodeState === 'locked' && { borderColor: CoachColors.borderMuted, backgroundColor: CoachColors.surface },
                    ]}>
                      {nodeState === 'active' ? (
                        <Ionicons name={nodeIcon as any} size={18} color={CoachColors.accent} />
                      ) : nodeState === 'locked' ? (
                        <Ionicons name="lock-closed-outline" size={14} color={CoachColors.textFaint} />
                      ) : (
                        <Ionicons name={nodeIcon as any} size={18} color={CoachColors.textSecondary} />
                      )}
                    </View>

                    {nodeState === 'active' && (
                      <View style={st.trackCurrentBadge}>
                        <Text style={st.trackCurrentText}>Active</Text>
                      </View>
                    )}

                    <Text style={[
                      st.trackNodeName,
                      nodeState === 'locked' && { color: CoachColors.textFaint },
                    ]} numberOfLines={2}>{nodeName}</Text>
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
              <Ionicons name="create-outline" size={14} color={CoachColors.textPrimary} />
              <Text style={st.editTrackText}>Edit roadmap</Text>
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
              <Ionicons name="map-outline" size={20} color={CoachColors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.addTrackTitle}>Add progression roadmap</Text>
              <Text style={st.addTrackSub}>Build a battle pass of workouts & milestones</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={CoachColors.textFaint} />
          </TouchableOpacity>
        )}

        {/* ── PERKS ── */}
        {features.length > 0 && (
          <View style={st.section}>
            <View style={st.sectionTitleRow}>
              <Text style={st.sectionTitle}>Included perks</Text>
            </View>
            <View style={st.perksGrid}>
              {features.map((feat, i) => (
                <View key={i} style={st.perkCard}>
                  <View style={st.perkIconBox}>
                    <Ionicons name={getPerkIcon(feat) as any} size={16} color={CoachColors.textSecondary} />
                  </View>
                  <Text style={st.perkCardText}>{feat}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── MEMBERS ── */}
        <View style={st.section}>
          <View style={st.sectionTitleRow}>
            <Text style={st.sectionTitle}>Subscribed members</Text>
            <View style={st.countBadge}>
              <Text style={st.countBadgeText}>{subCount}</Text>
            </View>
          </View>
          {subCount === 0 ? (
            <View style={st.emptyMembers}>
              <Ionicons name="qr-code-outline" size={28} color={CoachColors.textFaint} />
              <Text style={st.emptyMembersText}>No members subscribed</Text>
              <Text style={st.emptyMembersSub}>Share this pass link to onboard your first client</Text>
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
                    <Text style={st.memberName}>{client.name}</Text>
                    <Text style={st.memberEmail}>{(client as any).email || 'No email'}</Text>
                  </View>
                  <View style={st.memberStatusBadge}>
                    <Text style={st.memberStatusText}>{client.status}</Text>
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
              <Ionicons name="card" size={18} color={CoachColors.onAccent} />
              <Text style={st.primaryActionText}>Collect payment</Text>
            </View>
          </TouchableOpacity>

          <View style={st.secondaryRow}>
            <TouchableOpacity style={st.secondaryAction} activeOpacity={0.7}>
              <Ionicons name="share-social" size={16} color={CoachColors.textPrimary} />
              <Text style={st.secondaryText}>Share pass</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.secondaryAction} activeOpacity={0.7}>
              <Ionicons name="analytics" size={16} color={CoachColors.textPrimary} />
              <Text style={st.secondaryText}>Analytics</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  // Hero
  heroContainer: { paddingHorizontal: 20, paddingBottom: 16 },
  heroNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, marginBottom: 8,
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 15, color: CoachColors.textPrimary, letterSpacing: 0.2 },
  navBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  navRight: { flexDirection: 'row', gap: 8 },

  vipCard: {
    backgroundColor: CoachColors.surface, borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: CoachColors.border,
  },
  vipCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  tierIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  tierLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11,
    color: CoachColors.textSecondary, letterSpacing: 0.5, marginBottom: 2,
  },
  planNameHero: {
    fontFamily: CoachFonts.headingBold, fontSize: 22, color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cohortTag: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)',
  },
  cohortTagText: { fontFamily: CoachFonts.bodyBold, fontSize: 9.5, color: CoachColors.accent, letterSpacing: 0.4 },
  cohortRunLine: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 4 },

  popularTag: {
    backgroundColor: CoachColors.accent, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8,
  },
  popularTagText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 10, color: CoachColors.onAccent, letterSpacing: 0.3 },

  priceDisplay: { flexDirection: 'row', alignItems: 'flex-start', gap: 2, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, paddingTop: 16 },
  priceSign: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textSecondary, marginTop: 4 },
  priceNum: { fontFamily: CoachFonts.headingBold, fontSize: 40, color: CoachColors.textPrimary, lineHeight: 44 },
  pricePeriodCol: { justifyContent: 'center', marginTop: 8, marginLeft: 4 },
  pricePer: { fontFamily: CoachFonts.bodyMedium, fontSize: 10, color: CoachColors.textMuted, letterSpacing: 0.3 },
  priceUnit: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textSecondary, letterSpacing: 0.3 },

  // Capacity Bar
  xpCard: {
    marginHorizontal: 20, backgroundColor: CoachColors.surface,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    marginBottom: 16,
  },
  xpHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  xpLevelBadge: {
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.borderMuted,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  xpLevelText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textPrimary, letterSpacing: 0.3 },
  xpLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 11, color: CoachColors.textSecondary, letterSpacing: 0.3, flex: 1 },
  xpFraction: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },
  xpTrack: {
    height: 6, backgroundColor: CoachColors.borderMuted, borderRadius: 3,
    overflow: 'hidden',
  },
  xpFill: { height: '100%', borderRadius: 3, backgroundColor: CoachColors.accent },

  // Stats
  statsGrid: {
    flexDirection: 'row', marginHorizontal: 20, gap: 8, marginBottom: 24,
  },
  statBox: {
    flex: 1, gap: 4,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  statLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 10, color: CoachColors.textSecondary, letterSpacing: 0.3 },
  statValue: { fontFamily: CoachFonts.headingBold, fontSize: 18, color: CoachColors.textPrimary },
  statSub: { fontFamily: CoachFonts.bodyMedium, fontSize: 9.5, color: CoachColors.textMuted, letterSpacing: 0.3 },

  // Sections
  section: { marginHorizontal: 20, marginBottom: 24 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 12,
    color: CoachColors.textSecondary, letterSpacing: 0.3,
  },
  countBadge: { backgroundColor: CoachColors.surface, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: CoachColors.borderMuted },
  countBadgeText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textPrimary, letterSpacing: 0.3 },

  // Perks
  perksGrid: { gap: 6 },
  perkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  perkIconBox: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: CoachColors.bg, alignItems: 'center', justifyContent: 'center',
  },
  perkCardText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textPrimary, flex: 1 },

  // Members
  emptyMembers: { alignItems: 'center', paddingVertical: 32, gap: 6, backgroundColor: CoachColors.surface, borderRadius: 14, borderWidth: 1, borderColor: CoachColors.borderMuted, borderStyle: 'dashed' },
  emptyMembersText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textSecondary, letterSpacing: 0.3 },
  emptyMembersSub: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
  membersList: { gap: 6 },
  memberCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    padding: 12, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  memberInfo: { flex: 1, gap: 2 },
  memberName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  memberEmail: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },
  memberStatusBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  memberStatusText: { fontFamily: CoachFonts.bodyMedium, fontSize: 10, color: CoachColors.textSecondary, letterSpacing: 0.3 },

  // Actions
  actionsSection: { paddingHorizontal: 20, gap: 10 },
  primaryAction: { height: 52, borderRadius: 14, backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center' },
  primaryActionGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryActionText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.onAccent, letterSpacing: 0.2 },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryAction: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 46, borderRadius: 14,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  secondaryText: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textPrimary, letterSpacing: 0.2 },

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
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative',
    overflow: 'hidden',
  },
  trackCurrentBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
    backgroundColor: CoachColors.accent, marginBottom: 4,
  },
  trackCurrentText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 9, color: CoachColors.onAccent, letterSpacing: 0.3,
  },
  trackNodeName: {
    fontFamily: CoachFonts.bodyMedium, fontSize: 11, color: CoachColors.textPrimary,
    textAlign: 'center', lineHeight: 14,
  },
  trackNodeSub: {
    fontFamily: CoachFonts.body, fontSize: 9, color: CoachColors.textMuted,
    textAlign: 'center', marginTop: 2,
  },
  editTrackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 20, marginTop: 12, height: 42, borderRadius: 14,
    borderWidth: 1, borderColor: CoachColors.borderMuted, backgroundColor: CoachColors.surface,
  },
  editTrackText: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textPrimary, letterSpacing: 0.2 },
  addTrackCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 20, marginBottom: 24, padding: 16,
    borderRadius: 14, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted, borderStyle: 'dashed',
  },
  addTrackIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: CoachColors.bg, alignItems: 'center', justifyContent: 'center',
  },
  addTrackTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },
  addTrackSub: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 2 },

  // Not Found
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textSecondary, letterSpacing: 0.2 },
});
