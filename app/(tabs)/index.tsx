import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import Card from '../../components/Card';
import Avatar from '../../components/Avatar';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const METRIC_CARD_WIDTH = (SCREEN_WIDTH - 48 - 12) / 2; // 2 visible + peek
const METRIC_CARD_HEIGHT = 170;

export default function DashboardScreen() {
  const router = useRouter();
  const {
    trainer, activeClients, todaySessions, totalReferrals,
    totalMonthlyRevenue, activities, upcomingSessions,
    getClientById, refreshData, loading, sessions,
    plans, clients, referrals, trialClients,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const firstName = trainer?.name?.split(' ')[0] || 'Coach';
  const todayDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;

  // Next upcoming session
  const nextSession = upcomingSessions[0];
  const nextClient = nextSession ? getClientById(nextSession.client_id || '') : null;
  const nextSessionDate = nextSession ? new Date(nextSession.date) : null;

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'signup': return { icon: 'person-add', color: Colors.green };
      case 'session': return { icon: 'calendar', color: Colors.blue };
      case 'referral': return { icon: 'share', color: Colors.purple };
      case 'payment': return { icon: 'cash', color: Colors.accent };
      default: return { icon: 'pulse', color: Colors.textTertiary };
    }
  };

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const metricCards = [
    {
      label: 'Clients',
      value: String(activeClients.length),
      icon: 'people',
      gradient: ['#FF6B35', '#FF8F65'] as const,
    },
    {
      label: 'Sessions',
      value: String(todaySessions.length),
      icon: 'calendar',
      gradient: ['#6C9BF2', '#8BB5FF'] as const,
    },
    {
      label: 'Revenue',
      value: `$${totalMonthlyRevenue.toLocaleString()}`,
      icon: 'cash-outline',
      gradient: ['#22C55E', '#4ADE80'] as const,
    },
    {
      label: 'Referrals',
      value: String(totalReferrals),
      icon: 'share-social',
      gradient: ['#A78BFA', '#C4B5FD'] as const,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* ── SECTION 1: Dark Hero Header ── */}
        <LinearGradient
          colors={['#1C1C21', '#2A2A32', '#1C1C21']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          {/* Top row: date + notification */}
          <View style={styles.heroTopRow}>
            <View style={styles.heroDateRow}>
              <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.5)" />
              <Text style={styles.heroDateText}>{todayDate}</Text>
            </View>
            <TouchableOpacity style={styles.notifBtn}>
              <Ionicons name="notifications-outline" size={20} color={Colors.white} />
              {activities.length > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{Math.min(activities.length, 9)}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Main row: avatar + greeting */}
          <TouchableOpacity style={styles.heroMainRow} activeOpacity={0.8} onPress={() => router.push('/(tabs)/profile')}>
            <Avatar name={trainer?.name || 'Coach'} size="lg" imageUrl={trainer?.avatar_url} />
            <View style={styles.heroTextCol}>
              <Text style={styles.heroGreeting}>Hello, {firstName}!</Text>
              <View style={styles.heroBadges}>
                <View style={styles.heroBadge}>
                  <Ionicons name="people" size={11} color="#FF6B35" />
                  <Text style={styles.heroBadgeText}>{activeClients.length} Active</Text>
                </View>
                <Text style={styles.heroDot}>·</Text>
                <View style={styles.heroBadge}>
                  <Ionicons name="calendar" size={11} color="#6C9BF2" />
                  <Text style={styles.heroBadgeText}>{todaySessions.length} Today</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        </LinearGradient>

        {/* ── SECTION 2: Business Metrics ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Business Metrics</Text>
          <TouchableOpacity>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricsScroll}
          decelerationRate="fast"
          snapToInterval={METRIC_CARD_WIDTH + 12}
        >
          {metricCards.map((card, i) => (
            <LinearGradient
              key={i}
              colors={[card.gradient[0], card.gradient[1]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.metricCard}
            >
              {/* Top: label + icon */}
              <View style={styles.metricTopRow}>
                <Text style={styles.metricLabel}>{card.label}</Text>
                <View style={styles.metricIconBubble}>
                  <Ionicons name={card.icon as any} size={14} color={Colors.white} />
                </View>
              </View>

              {/* Middle: decorative bars/lines */}
              <View style={styles.metricChartArea}>
                {card.label === 'Clients' && (
                  <View style={styles.miniBarChart}>
                    {[0.4, 0.6, 0.3, 0.8, 0.5, 0.9, 0.7].map((h, j) => (
                      <View key={j} style={[styles.miniBar, { height: h * 40, opacity: 0.3 + h * 0.5 }]} />
                    ))}
                  </View>
                )}
                {card.label === 'Sessions' && (
                  <View style={styles.miniLineChart}>
                    {[20, 35, 25, 45, 30, 50, 40].map((h, j) => (
                      <View key={j} style={[styles.miniDot, { bottom: h }]} />
                    ))}
                  </View>
                )}
                {card.label === 'Revenue' && (
                  <View style={styles.miniBarChart}>
                    {[0.5, 0.7, 0.4, 0.9, 0.6, 0.8, 0.95].map((h, j) => (
                      <View key={j} style={[styles.miniBar, { height: h * 40, opacity: 0.3 + h * 0.5 }]} />
                    ))}
                  </View>
                )}
                {card.label === 'Referrals' && (
                  <View style={styles.miniLineChart}>
                    {[15, 30, 20, 40, 35, 45, 50].map((h, j) => (
                      <View key={j} style={[styles.miniDot, { bottom: h }]} />
                    ))}
                  </View>
                )}
              </View>

              {/* Bottom: value */}
              <Text style={styles.metricValue}>{card.value}</Text>
            </LinearGradient>
          ))}
        </ScrollView>

        {/* ── SECTION 3: Next Session Card ── */}
        {nextSession && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Next Session
              </Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/schedule')}>
                <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.sessionCard}
              activeOpacity={0.9}
              onPress={() => router.push('/(tabs)/schedule')}
            >
              <Image
                source={require('../../assets/images/session-bg.png')}
                style={styles.sessionBgImage}
                resizeMode="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.85)']}
                locations={[0.1, 0.5, 1]}
                style={styles.sessionGradient}
              />

              {/* Top pills */}
              <View style={styles.sessionTopPills}>
                <View style={styles.sessionPill}>
                  <Ionicons name="time-outline" size={12} color={Colors.white} />
                  <Text style={styles.sessionPillText}>
                    {nextSessionDate?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={styles.sessionPill}>
                  <Ionicons name="flame-outline" size={12} color={Colors.white} />
                  <Text style={styles.sessionPillText}>{nextSession.duration}min</Text>
                </View>
              </View>

              {/* Bottom info */}
              <View style={styles.sessionBottomRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionTitle}>
                    {nextClient?.name || nextSession.group_name || 'Session'}
                  </Text>
                  <View style={styles.sessionMetaRow}>
                    <Text style={styles.sessionMeta}>
                      {nextSessionDate?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                    <View style={styles.sessionTypeBadge}>
                      <Text style={styles.sessionTypeText}>{nextSession.type}</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.sessionPlayBtn}>
                  <Ionicons name="arrow-forward" size={20} color={Colors.white} />
                </View>
              </View>
            </TouchableOpacity>
          </>
        )}

        {/* ── Quick Actions ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>
        <View style={styles.quickActions}>
          {[
            { label: 'Add Client', icon: 'person-add', color: Colors.accent, route: '/(tabs)/clients' },
            { label: 'Book Session', icon: 'calendar-outline', color: Colors.blue, route: '/book-session' },
            { label: 'Message', icon: 'chatbubble', color: Colors.green, route: '/(tabs)/messages' },
            { label: 'Invite', icon: 'share-social', color: Colors.purple, route: '/referrals' },
          ].map((action, i) => (
            <TouchableOpacity key={i} style={styles.quickAction} onPress={() => router.push(action.route as any)} activeOpacity={0.7}>
              <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}14` }]}>
                <Ionicons name={action.icon as any} size={22} color={action.color} />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── SECTION 4: Active Plans (horizontal scroll, like Diet & Nutrition) ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Active Plans</Text>
          <TouchableOpacity onPress={() => router.push('/subscriptions' as any)}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.plansScroll}
          decelerationRate="fast"
          snapToInterval={SCREEN_WIDTH * 0.68 + 12}
        >
          {plans.length > 0 ? plans.map((plan, i) => {
            const planClients = clients.filter(c => c.plan_id === plan.id && c.status === 'active');
            return (
              <TouchableOpacity
                key={plan.id}
                style={styles.planCard}
                activeOpacity={0.9}
                onPress={() => router.push('/subscriptions' as any)}
              >
                {/* Plan info badges */}
                <View style={styles.planBadges}>
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeValue}>{planClients.length}</Text>
                    <Text style={styles.planBadgeLabel}>Clients</Text>
                  </View>
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeValue}>${plan.price}</Text>
                    <Text style={styles.planBadgeLabel}>{plan.interval}</Text>
                  </View>
                </View>

                {/* Plan icon */}
                <View style={styles.planIconCenter}>
                  <LinearGradient
                    colors={[Colors.accentSoft, '#FFF0E8']}
                    style={styles.planIconGradient}
                  >
                    <Ionicons name="document-text-outline" size={32} color={Colors.accent} />
                  </LinearGradient>
                </View>

                {/* Plan name + meta */}
                <Text style={styles.planName} numberOfLines={1}>{plan.name}</Text>
                <View style={styles.planMetaRow}>
                  <View style={styles.planMetaItem}>
                    <Ionicons name="cash-outline" size={11} color={Colors.textTertiary} />
                    <Text style={styles.planMetaText}>${plan.price}/{plan.interval === 'monthly' ? 'mo' : plan.interval}</Text>
                  </View>
                  <Text style={styles.planMetaDot}>·</Text>
                  <View style={styles.planMetaItem}>
                    <Ionicons name="people-outline" size={11} color={Colors.textTertiary} />
                    <Text style={styles.planMetaText}>{planClients.length} enrolled</Text>
                  </View>
                </View>

                {/* Orange arrow button */}
                <View style={styles.planArrowBtn}>
                  <Ionicons name="arrow-forward" size={16} color={Colors.white} />
                </View>
              </TouchableOpacity>
            );
          }) : (
            <TouchableOpacity
              style={styles.planCardEmpty}
              activeOpacity={0.8}
              onPress={() => router.push('/subscriptions' as any)}
            >
              <Ionicons name="add-circle-outline" size={36} color={Colors.accent} />
              <Text style={styles.planEmptyText}>Create your first plan</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* ── SECTION 5: Weekly Performance (like Activities chart card) ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Performance</Text>
          <TouchableOpacity>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>
        <Card style={styles.perfCard}>
          {/* Time filter tabs */}
          <View style={styles.perfTabs}>
            {['1w', '1m', '3m', '1y', 'All'].map((tab, i) => (
              <TouchableOpacity
                key={tab}
                style={[styles.perfTab, i === 0 && styles.perfTabActive]}
              >
                <Text style={[styles.perfTabText, i === 0 && styles.perfTabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Decorative chart bars */}
          <View style={styles.perfChartArea}>
            <View style={styles.perfGridLines}>
              {[0.8, 0.6, 0.4, 0.2].map((_, i) => (
                <View key={i} style={styles.perfGridLine} />
              ))}
            </View>
            <View style={styles.perfBars}>
              {[0.4, 0.65, 0.5, 0.85, 0.7, 0.9, 0.75].map((h, i) => (
                <View key={i} style={styles.perfBarWrapper}>
                  <LinearGradient
                    colors={[Colors.accent, Colors.accentHover]}
                    style={[styles.perfBar, { height: `${h * 100}%` }]}
                  />
                </View>
              ))}
            </View>
          </View>

          {/* Big value + sub stats */}
          <View style={styles.perfBottomRow}>
            <View>
              <Text style={styles.perfBigValue}>{completedSessions}</Text>
              <View style={styles.perfSubStats}>
                <Ionicons name="trending-up" size={12} color={Colors.green} />
                <Text style={styles.perfSubText}>+{todaySessions.length} today</Text>
                <Text style={styles.perfSubDot}>·</Text>
                <Ionicons name="people-outline" size={12} color={Colors.textTertiary} />
                <Text style={styles.perfSubText}>{activeClients.length} clients</Text>
              </View>
            </View>
            <View style={styles.perfActionBtn}>
              <Ionicons name="fitness-outline" size={20} color={Colors.white} />
            </View>
          </View>
        </Card>

        {/* ── SECTION 6: Referral Program (like Virtual AI Coach promo card) ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Referral Program</Text>
          <TouchableOpacity onPress={() => router.push('/referrals' as any)}>
            <Ionicons name="ellipsis-horizontal" size={20} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.promoCard}
          activeOpacity={0.9}
          onPress={() => router.push('/referrals' as any)}
        >
          <Image
            source={require('../../assets/images/welcome-3.png')}
            style={styles.promoBgImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(255,107,53,0.85)', 'rgba(255,107,53,0.6)', 'rgba(0,0,0,0.7)']}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={styles.promoGradient}
          />

          {/* Top pills */}
          <View style={styles.promoTopPills}>
            <View style={styles.promoPill}>
              <Text style={styles.promoPillText}>Earn Rewards</Text>
            </View>
            <View style={styles.promoPill}>
              <Text style={styles.promoPillText}>Free Tier</Text>
            </View>
          </View>

          {/* Bottom */}
          <View style={styles.promoBottom}>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoBigValue}>{totalReferrals}</Text>
              <Text style={styles.promoSubtext}>Total Referrals</Text>
            </View>
            <View style={styles.promoBtn}>
              <Ionicons name="share-social" size={18} color={Colors.accent} />
            </View>
          </View>
        </TouchableOpacity>

        {/* ── SECTION 7: Top Clients (like Fitness Resources list) ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Top Clients</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/clients')}>
            <Text style={styles.seeAll}>See All</Text>
          </TouchableOpacity>
        </View>
        {activeClients.length > 0 ? (
          <Card noPadding style={{ marginHorizontal: Spacing.base, marginBottom: Spacing.xl }}>
            {activeClients.slice(0, 4).map((client, i) => {
              const clientSessions = sessions.filter(s => s.client_id === client.id && s.status === 'completed').length;
              return (
                <TouchableOpacity
                  key={client.id}
                  style={[styles.clientListItem, i < Math.min(activeClients.length, 4) - 1 && styles.clientListBorder]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/client/${client.id}` as any)}
                >
                  <Avatar name={client.name} size="md" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clientListName}>{client.name}</Text>
                    <View style={styles.clientListMeta}>
                      <Ionicons name="star" size={11} color={Colors.yellow} />
                      <Text style={styles.clientListMetaText}>{Math.min(5, (clientSessions * 0.5 + 2.5)).toFixed(1)}</Text>
                      <Text style={styles.clientListDot}>·</Text>
                      <Ionicons name="calendar" size={11} color={Colors.textTertiary} />
                      <Text style={styles.clientListMetaText}>{clientSessions} sessions</Text>
                      <Text style={styles.clientListDot}>·</Text>
                      <Ionicons name="heart" size={11} color={Colors.red} />
                      <Text style={styles.clientListMetaText}>{Math.floor(clientSessions * 3.2)}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
                </TouchableOpacity>
              );
            })}
          </Card>
        ) : (
          <Card style={{ marginHorizontal: Spacing.base, marginBottom: Spacing.xl }}>
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={32} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No clients yet</Text>
              <Text style={styles.emptySubtext}>Add your first client to get started</Text>
            </View>
          </Card>
        )}

        {/* ── Upcoming Sessions List ── */}
        {upcomingSessions.length > 1 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming ({upcomingSessions.length})</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/schedule')}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {upcomingSessions.slice(1, 4).map((session) => {
              const client = getClientById(session.client_id || '');
              const dt = new Date(session.date);
              return (
                <Card key={session.id} style={styles.upcomingCard}>
                  <View style={styles.upcomingRow}>
                    {client ? <Avatar name={client.name} size="sm" /> : (
                      <View style={styles.groupAvatar}><Text style={styles.groupAvatarText}>G</Text></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.upcomingName}>{client?.name || session.group_name}</Text>
                      <Text style={styles.upcomingMeta}>
                        {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={[styles.upcomingTypeBadge, { backgroundColor: `${Colors.blue}18` }]}>
                      <Text style={[styles.upcomingTypeText, { color: Colors.blue }]}>{session.type}</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </>
        )}

        {/* ── Recent Activity ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
        </View>
        {activities.length === 0 ? (
          <Card style={{ marginHorizontal: Spacing.base }}>
            <View style={styles.emptyState}>
              <Ionicons name="pulse-outline" size={32} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No activity yet</Text>
              <Text style={styles.emptySubtext}>Start by adding clients and booking sessions</Text>
            </View>
          </Card>
        ) : (
          <Card noPadding style={{ marginHorizontal: Spacing.base }}>
            {activities.slice(0, 5).map((activity, i) => {
              const meta = getActivityIcon(activity.type);
              return (
                <View key={activity.id} style={[styles.activityItem, i < activities.slice(0, 5).length - 1 && styles.activityBorder]}>
                  <View style={[styles.activityIcon, { backgroundColor: `${meta.color}14` }]}>
                    <Ionicons name={meta.icon as any} size={15} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityMessage} numberOfLines={1}>{activity.message}</Text>
                    <Text style={styles.activityTime}>{getTimeAgo(activity.timestamp)}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  scrollContent: { paddingBottom: 100 },

  /* ── Hero Header ── */
  heroCard: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    borderRadius: Radius['2xl'],
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  heroDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroDateText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: Colors.white,
  },
  heroMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  heroTextCol: {
    flex: 1,
  },
  heroGreeting: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.xl,
    color: Colors.white,
    letterSpacing: -0.5,
  },
  heroBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroBadgeText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.6)',
  },
  heroDot: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 10,
  },

  /* ── Section Headers ── */
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.lg,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  seeAll: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.accentText,
  },

  /* ── Metric Cards ── */
  metricsScroll: {
    paddingLeft: Spacing.base,
    paddingRight: Spacing.sm,
    gap: 12,
    marginBottom: Spacing.xl,
  },
  metricCard: {
    width: METRIC_CARD_WIDTH,
    height: METRIC_CARD_HEIGHT,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    justifyContent: 'space-between',
  },
  metricTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  metricIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricChartArea: {
    flex: 1,
    justifyContent: 'center',
  },
  miniBarChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 44,
  },
  miniBar: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 3,
  },
  miniLineChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 55,
    gap: 4,
    position: 'relative',
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.6)',
    flex: 1,
    position: 'absolute',
  },
  metricValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: Colors.white,
    letterSpacing: -1,
  },

  /* ── Next Session Card ── */
  sessionCard: {
    marginHorizontal: Spacing.base,
    height: 200,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  sessionBgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  sessionGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  sessionTopPills: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    top: Spacing.base,
    left: Spacing.base,
  },
  sessionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sessionPillText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.white,
  },
  sessionBottomRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  sessionTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.xl,
    color: Colors.white,
    letterSpacing: -0.5,
  },
  sessionMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sessionMeta: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  sessionTypeBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sessionTypeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.white,
  },
  sessionPlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },

  /* ── Quick Actions ── */
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.xl,
  },
  quickAction: { flex: 1, alignItems: 'center', gap: 6 },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  /* ── Upcoming Sessions ── */
  upcomingCard: { marginHorizontal: Spacing.base, marginBottom: Spacing.sm },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  upcomingName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  upcomingMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  groupAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.purple, alignItems: 'center', justifyContent: 'center' },
  groupAvatarText: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: Colors.white },
  upcomingTypeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs },
  upcomingTypeText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  /* ── Activity ── */
  emptyState: { alignItems: 'center', paddingVertical: Spacing['2xl'], gap: Spacing.sm },
  emptyText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textSecondary },
  emptySubtext: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },

  activityItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  activityIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  activityMessage: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textPrimary },
  activityTime: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },

  /* ── Active Plans (horizontal cards) ── */
  plansScroll: { paddingLeft: Spacing.base, paddingRight: Spacing.sm, gap: 12, marginBottom: Spacing.xl },
  planCard: {
    width: SCREEN_WIDTH * 0.68,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
  },
  planCardEmpty: {
    width: SCREEN_WIDTH * 0.68,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.xl,
    padding: Spacing['2xl'],
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  planEmptyText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textTertiary },
  planBadges: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  planBadge: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  planBadgeValue: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: Colors.textPrimary },
  planBadgeLabel: { fontFamily: FontFamily.body, fontSize: 9, color: Colors.textTertiary, marginTop: 1 },
  planIconCenter: { alignItems: 'center', marginVertical: Spacing.md },
  planIconGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  planMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  planMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  planMetaText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  planMetaDot: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  planArrowBtn: {
    position: 'absolute',
    bottom: Spacing.base,
    right: Spacing.base,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Performance Card ── */
  perfCard: { marginHorizontal: Spacing.base, marginBottom: Spacing.xl },
  perfTabs: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.lg },
  perfTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated,
  },
  perfTabActive: { backgroundColor: Colors.textPrimary },
  perfTabText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary },
  perfTabTextActive: { color: Colors.white },
  perfChartArea: {
    height: 120,
    marginBottom: Spacing.lg,
    position: 'relative',
  },
  perfGridLines: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  perfGridLine: {
    height: 1,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  perfBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 4,
  },
  perfBarWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  perfBar: {
    width: '80%',
    borderRadius: Radius.xs,
  },
  perfBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  perfBigValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  perfSubStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  perfSubText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  perfSubDot: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  perfActionBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Referral Promo Card ── */
  promoCard: {
    marginHorizontal: Spacing.base,
    height: 180,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  promoBgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  promoGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  promoTopPills: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    top: Spacing.base,
    left: Spacing.base,
  },
  promoPill: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  promoPillText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.white },
  promoBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  promoBigValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: Colors.white,
    letterSpacing: -1,
  },
  promoSubtext: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  promoBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Top Clients List ── */
  clientListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    paddingVertical: Spacing.base,
  },
  clientListBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  clientListName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  clientListMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  clientListMetaText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  clientListDot: { fontFamily: FontFamily.body, fontSize: 8, color: Colors.textTertiary },
});
