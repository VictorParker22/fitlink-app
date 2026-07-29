import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Avatar from '../components/Avatar';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = SCREEN_W - 48;

const TIER_CONFIG: Record<string, { rank: string; icon: string; glow: string; gradientStart: string; gradientMid: string; gradientEnd: string }> = {
  diamond: { rank: 'DIAMOND', icon: 'diamond', glow: '#67E8F9', gradientStart: '#22D3EE', gradientMid: '#0EA5E9', gradientEnd: '#0369A1' },
  gold: { rank: 'GOLD', icon: 'trophy', glow: '#FCD34D', gradientStart: '#FDE68A', gradientMid: '#FBBF24', gradientEnd: '#D97706' },
  silver: { rank: 'SILVER', icon: 'shield-checkmark', glow: '#CBD5E1', gradientStart: '#F1F5F9', gradientMid: '#94A3B8', gradientEnd: '#475569' },
  bronze: { rank: 'BRONZE', icon: 'medal', glow: '#FDBA74', gradientStart: '#FED7AA', gradientMid: '#FB923C', gradientEnd: '#C2410C' },
};

const getTier = (price: number) => {
  if (price >= 200) return TIER_CONFIG.diamond;
  if (price >= 100) return TIER_CONFIG.gold;
  if (price >= 50) return TIER_CONFIG.silver;
  return TIER_CONFIG.bronze;
};

export default function SubscriptionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { plans, clients, refreshData } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  }, [refreshData]);

  const getSubCount = (planId: string) => clients.filter(c => c.plan_id === planId && c.status !== 'inactive').length;
  const totalRevenue = useMemo(() => plans.reduce((sum, p) => sum + Number(p.price) * getSubCount(p.id), 0), [plans, clients]);
  const totalSubscribers = useMemo(() => plans.reduce((sum, p) => sum + getSubCount(p.id), 0), [plans, clients]);

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* ── HEADER ── */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={st.headerCenter}>
          <Ionicons name="layers" size={16} color="#FF6B35" />
          <Text style={st.headerTitle}>Season Passes</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/create-plan' as any)} style={st.addBtn}>
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
      >
        {/* ── EMPIRE HERO ── */}
        <View style={st.empireHero}>
          <Text style={st.empireLabel}>YOUR EMPIRE</Text>
          <Text style={st.empireRevenue}>${totalRevenue.toLocaleString()}</Text>
          <Text style={st.empireSub}>/MONTH RECURRING</Text>

          <View style={st.empireStats}>
            <View style={st.empireStat}>
              <Text style={st.empireStatNum}>{totalSubscribers}</Text>
              <Text style={st.empireStatLabel}>MEMBERS</Text>
            </View>
            <View style={st.empireStatSep} />
            <View style={st.empireStat}>
              <Text style={st.empireStatNum}>{plans.length}</Text>
              <Text style={st.empireStatLabel}>TIERS</Text>
            </View>
            <View style={st.empireStatSep} />
            <View style={st.empireStat}>
              <Text style={st.empireStatNum}>${totalSubscribers > 0 ? Math.round(totalRevenue / totalSubscribers) : 0}</Text>
              <Text style={st.empireStatLabel}>ARPU</Text>
            </View>
          </View>
        </View>

        {/* ── SEASON PASS CARDS ── */}
        {plans.length === 0 ? (
          <View style={st.emptyState}>
            <View style={st.emptyIcon}>
              <Ionicons name="layers-outline" size={24} color="rgba(255,255,255,0.4)" />
            </View>
            <Text style={st.emptyTitle}>NO SEASON PASSES</Text>
            <Text style={st.emptySub}>CREATE YOUR FIRST TIER TO START BUILDING YOUR EMPIRE</Text>
            <TouchableOpacity style={st.emptyCta} onPress={() => router.push('/create-plan' as any)} activeOpacity={0.8}>
              <Ionicons name="add" size={16} color="#000" />
              <Text style={st.emptyCtaText}>CREATE PASS</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={st.passGrid}>
            {plans.map((plan, idx) => {
              const planColor = (plan as any).color || '#3B82F6';
              const tier = getTier(Number(plan.price));
              const subCount = getSubCount(plan.id);
              const subscribers = clients.filter(c => c.plan_id === plan.id && c.status !== 'inactive');
              const features = ((plan as any).features || []) as string[];
              const isPopular = (plan as any).is_popular;
              const planRevenue = Number(plan.price) * subCount;

              return (
                <TouchableOpacity
                  key={plan.id}
                  activeOpacity={0.9}
                  onPress={() => router.push({ pathname: '/plan-detail', params: { planId: plan.id } } as any)}
                >
                  <View style={st.passCard}>
                    {/* Header zone */}
                    <View style={st.passHeroGradient}>
                      {isPopular && (
                        <View style={st.popularRibbon}>
                          <Ionicons name="flame" size={8} color="#000" />
                          <Text style={st.popularRibbonText}>POPULAR</Text>
                        </View>
                      )}

                      <View style={st.passHeroContent}>
                        <View style={st.tierIconCircle}>
                          <Ionicons name={tier.icon as any} size={20} color="#FFF" />
                        </View>
                        <Text style={st.tierRankText}>{tier.rank}</Text>
                        <Text style={st.passNameText}>{plan.name.toUpperCase()}</Text>
                      </View>
                    </View>

                    {/* Dark body */}
                    <View style={st.passBody}>
                      {/* Price block */}
                      <View style={st.passPriceBlock}>
                        <View style={st.passPriceRow}>
                          <Text style={st.passCurrency}>$</Text>
                          <Text style={st.passPrice}>{Number(plan.price)}</Text>
                          <Text style={st.passPeriod}>/{(plan as any).period || 'mo'}</Text>
                        </View>
                        <View style={[st.revenuePill, { backgroundColor: planColor + '15' }]}>
                          <Text style={[st.revenuePillText, { color: planColor }]}>${planRevenue.toLocaleString()}/mo revenue</Text>
                        </View>
                      </View>

                      {/* Perks */}
                      {features.length > 0 && (
                        <View style={st.passPerks}>
                          {features.slice(0, 4).map((f, i) => (
                            <View key={i} style={st.passPerkRow}>
                              <View style={[st.perkDot, { backgroundColor: planColor }]} />
                              <Text style={st.perkText} numberOfLines={1}>{f}</Text>
                            </View>
                          ))}
                          {features.length > 4 && (
                            <Text style={st.perkMore}>+{features.length - 4} more</Text>
                          )}
                        </View>
                      )}

                      {/* Footer: subscribers + arrow */}
                      <View style={st.passFooter}>
                        <View style={st.passSubscribers}>
                          {subscribers.length > 0 && (
                            <View style={st.avatarStack}>
                              {subscribers.slice(0, 4).map((c, i) => (
                                <View key={c.id} style={[st.avatarWrap, { marginLeft: i > 0 ? -10 : 0, zIndex: 5 - i }]}>
                                  <Avatar name={c.name} size="sm" imageUrl={(c as any).avatar_url} />
                                </View>
                              ))}
                            </View>
                          )}
                          <Text style={st.subCountText}>
                            {subCount === 0 ? 'No members yet' : `${subCount} member${subCount !== 1 ? 's' : ''}`}
                          </Text>
                        </View>
                        <View style={[st.viewBtn, { backgroundColor: planColor + '20' }]}>
                          <Ionicons name="arrow-forward" size={16} color={planColor} />
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: Radius.xs,
    backgroundColor: '#0F0F0F',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: '#FFFFFF', letterSpacing: 1.5 },
  addBtn: {
    width: 36, height: 36, borderRadius: Radius.xs,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },

  // Empire Hero
  empireHero: {
    marginHorizontal: 20,
    marginBottom: 28,
    marginTop: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: Radius.xs,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  empireLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 4,
  },
  empireRevenue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 48,
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  empireSub: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 24,
  },
  empireStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.xs,
    paddingVertical: 14,
    width: '100%',
  },
  empireStat: { flex: 1, alignItems: 'center', gap: 2 },
  empireStatNum: { fontFamily: FontFamily.headingExtraBold, fontSize: 18, color: '#FFFFFF' },
  empireStatLabel: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
  empireStatSep: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.1)' },

  // Pass Grid
  passGrid: { paddingHorizontal: 20, gap: 16 },

  // Pass Card
  passCard: {
    borderRadius: Radius.xs,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },

  // Hero section inside card
  passHeroGradient: {
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  popularRibbon: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  popularRibbonText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
    color: '#000000',
    letterSpacing: 1.5,
  },
  passHeroContent: { alignItems: 'center', gap: 6 },
  tierIconCircle: {
    width: 48,
    height: 48,
    borderRadius: Radius.xs,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tierRankText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 2,
  },
  passNameText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  // Dark body
  passBody: {
    padding: 20,
    gap: 16,
  },
  passPriceBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passPriceRow: { flexDirection: 'row', alignItems: 'flex-end' },
  passCurrency: { fontFamily: FontFamily.heading, fontSize: 16, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  passPrice: { fontFamily: FontFamily.headingExtraBold, fontSize: 36, color: '#FFFFFF', lineHeight: 40 },
  passPeriod: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6, letterSpacing: 1 },
  revenuePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  revenuePillText: { fontFamily: FontFamily.bodyBold, fontSize: 9, letterSpacing: 0.5 },

  // Perks
  passPerks: {
    gap: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  passPerkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkDot: { width: 6, height: 6, borderRadius: Radius.xs },
  perkText: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: 'rgba(255,255,255,0.6)', flex: 1, letterSpacing: 0.5 },
  perkMore: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: 'rgba(255,255,255,0.3)', paddingLeft: 16, letterSpacing: 0.5 },

  // Footer
  passFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  passSubscribers: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarStack: { flexDirection: 'row' },
  avatarWrap: { borderWidth: 1, borderColor: '#000000', borderRadius: Radius.xs },
  subCountText: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  viewBtn: {
    width: 32, height: 32, borderRadius: Radius.xs,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 100, paddingHorizontal: 40, gap: 12 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: Radius.xs,
    backgroundColor: '#0F0F0F',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  emptyTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: '#FFFFFF', letterSpacing: 1 },
  emptySub: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center', letterSpacing: 0.5 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: Radius.xs, marginTop: 16,
  },
  emptyCtaText: { fontFamily: FontFamily.bodyBold, fontSize: 12, color: '#000000', letterSpacing: 1 },
});
