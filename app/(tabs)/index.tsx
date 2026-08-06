import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { FontFamily, Radius, Spacing } from '../../constants/theme';
import { useHaptic } from '../../hooks/useHaptic';
import { StatusBar } from 'expo-status-bar';
import GlobalSearchModal from '../../components/dashboard/GlobalSearchModal';
import ClientPulseModal from '../../components/dashboard/ClientPulseModal';
import NewCoachSetupCards from '../../components/dashboard/NewCoachSetupCards';
import CheckInInbox from '../../components/dashboard/CheckInInbox';
import CoachContextHeroCard from '../../components/dashboard/CoachContextHeroCard';
import { LinearGradient } from 'expo-linear-gradient';
import { PrecisionIcons } from '../../components/icons/PrecisionIcons';
import { CoachCopilotCard }    from '../../components/coach/CoachCopilotCard';
import { CopilotScoreCard }    from '../../components/coach/CopilotScoreCard';
import { RosterHeatmap }       from '../../components/coach/RosterHeatmap';
import { RevenueIntelligenceCard } from '../../components/dashboard/RevenueIntelligenceCard';
import { Client, NotificationData } from '../../context/AppContext';

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const haptic = useHaptic();
  const { trainer, clients, plans, sessions, notifications, workouts, liveClasses } = useApp();

  const [isSearchVisible, setIsSearchVisible] = React.useState(false);
  const [selectedPulseClient, setSelectedPulseClient] = React.useState<Client | null>(null);
  const [activityFilter, setActivityFilter] = useState<'all' | 'clients' | 'revenue'>('all');

  const activeClients = clients.filter(c => c.status !== 'inactive');
  const activeClientsCount = activeClients.length;
  const unreadNotifs = notifications?.filter(n => !n.is_read).length || 0;

  // Calculate actual money made from plans and active subs
  const actualEarnings = useMemo(() => {
    let total = 0;
    plans.forEach(plan => {
      const subs = activeClients.filter(c => c.plan_id === plan.id).length;
      const gross = Number(plan.price || 0) * subs;
      const net = gross * 0.9; // 10% platform fee as per earnings.tsx
      total += net;
    });
    return total;
  }, [clients, plans]);



  const nextSession = useMemo(() => {
    const now = new Date().getTime();
    const upcoming = sessions
      .filter(s => new Date(s.date).getTime() > now && s.status === 'upcoming')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return upcoming.length > 0 ? upcoming[0] : null;
  }, [sessions]);

  const todayIndex = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const completedThisWeek = sessions.filter(s =>
    s.status === 'completed' &&
    new Date(s.date) >= (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1); d.setHours(0,0,0,0); return d; })()
  ).length;
  const weeklyGoal = 5;

  // Recency copy for client pulse
  function getClientRecency(client: Client): { text: string; color: string } {
    if (client.status === 'trial') {
      if (client.trial_end_date) {
        const days = Math.max(0, Math.round(
          (new Date(client.trial_end_date).getTime() - Date.now()) / 86400000
        ));
        return { text: days === 0 ? 'Expires today' : `Trial · ${days}d left`, color: '#F59E0B' };
      }
      return { text: 'Trial client', color: '#F59E0B' };
    }
    // Estimate from created_at as a proxy if no last_active field
    const createdDaysAgo = Math.floor(
      (Date.now() - new Date(client.created_at).getTime()) / 86400000
    );
    const workoutsLogged = client.completed_workouts || 0;
    if (workoutsLogged > 0) {
      return { text: 'Active recently', color: '#22C55E' };
    }
    if (createdDaysAgo <= 1) return { text: 'Just joined', color: '#6C9BF2' };
    if (createdDaysAgo <= 3) return { text: 'New · say hi', color: '#22C55E' };
    if (createdDaysAgo <= 7) return { text: `Day ${createdDaysAgo}`, color: 'rgba(255,255,255,0.4)' };
    return { text: 'Check in', color: '#F59E0B' };
  }

  // Notification icon + color mapping
  function getNotifMeta(notif: NotificationData): { icon: string; color: string } {
    switch (notif.type) {
      case 'workout':   return { icon: 'barbell',         color: '#22C55E' };
      case 'message':   return { icon: 'chatbubble',      color: '#6C9BF2' };
      case 'score':     return { icon: 'trophy',          color: '#F59E0B' };
      case 'water':     return { icon: 'water',           color: '#38BDF8' };
      case 'nutrition': return { icon: 'nutrition',       color: '#A855F7' };
      case 'file':      return { icon: 'document-text',  color: '#94A3B8' };
      default:          return { icon: 'notifications',  color: '#FFFFFF' };
    }
  }

  function getRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  }

  const filteredNotifs = useMemo(() => {
    if (activityFilter === 'clients') {
      return notifications.filter(n => ['workout','message','score','water','nutrition','file'].includes(n.type));
    }
    // 'revenue' — no tagged type yet, show all (future: filter on payment type)
    return notifications;
  }, [notifications, activityFilter]);


  // Compute action alerts — kept for NewCoachSetupCards compatibility
  const unreadNotifsCount = unreadNotifs;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['rgba(26, 16, 5, 0.4)', '#000000']}
        locations={[0, 0.6]}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >

        {/* ── CONTEXT HERO ──────────────────────────────────────────── */}
        <CoachContextHeroCard />

        {/* ── TOP RIGHT: SEARCH + BELL ─────────────────────────── */}
        {/* These are now overlaid on the hero card in CoachContextHeroCard itself,
            but we render the action icons here for the scroll view context */}
        <View style={styles.utilBar}>
          <TouchableOpacity style={styles.utilBtn} onPress={() => setIsSearchVisible(true)}>
            <Ionicons name="search-outline" size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.utilBtn} onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={20} color="rgba(255,255,255,0.5)" />
            {unreadNotifs > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* ── NEW COACH SETUP ────────────────────────────────────── */}
        <NewCoachSetupCards />

        {/* ── COACH COPILOT — predictive priority queue ─────────────── */}
        <CoachCopilotCard />
        <CopilotScoreCard />

        {/* ── METRICS ROW: NEXT SESSION + PERFORMANCE ─────────────── */}
        <View style={styles.metricsRow}>
          {/* Next session card */}
          <TouchableOpacity
            style={styles.metricCard}
            onPress={() => router.push('/(tabs)/schedule')}
            activeOpacity={0.8}
          >
            <Text style={styles.metricLabel}>Next session</Text>
            {nextSession ? (
              <>
                <PrecisionIcons.Calendar size={24} color="#6C9BF2" style={{ marginBottom: 6 }} />
                <Text style={styles.metricTitle} numberOfLines={1}>
                  {clients.find(c => c.id === nextSession.client_id)?.name
                    || nextSession.group_name || 'Session'}
                </Text>
                <Text style={styles.metricSub}>
                  {new Date(nextSession.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </>
            ) : (
              <>
                <PrecisionIcons.Calendar size={24} color="rgba(255,255,255,0.15)" style={{ marginBottom: 6 }} />
                <Text style={styles.metricEmpty}>No sessions today</Text>
                <TouchableOpacity
                  style={styles.metricCta}
                  onPress={() => router.push('/(tabs)/schedule')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={12} color="rgba(255,255,255,0.5)" />
                  <Text style={styles.metricCtaText}>Book one</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>

          {/* Performance card — reframed zero */}
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>This week</Text>

            {/* Ring */}
            <View style={[styles.ring, { borderColor: completedThisWeek >= weeklyGoal ? '#22C55E' : 'rgba(255,255,255,0.1)' }]}>
              <Text style={[
                styles.ringNum,
                completedThisWeek >= weeklyGoal && { color: '#22C55E' },
              ]}>
                {completedThisWeek}
              </Text>
            </View>

            {/* Day dots */}
            <View style={styles.daysRow}>
              {['M','T','W','T','F','S','S'].map((day, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => {
                    haptic.trigger('light');
                    router.push('/(tabs)/schedule');
                  }}
                  activeOpacity={0.5}
                  style={[styles.dayDot, i === todayIndex && styles.dayDotToday]}
                >
                  <Text style={[styles.dayText, i === todayIndex && styles.dayTextToday]}>{day}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Reframed copy */}
            <Text style={styles.ringCopy}>
              {completedThisWeek === 0
                ? 'This week starts\nwhen you do'
                : completedThisWeek >= weeklyGoal
                ? '🎯 Week crushed!'
                : `${completedThisWeek} done · ${weeklyGoal - completedThisWeek} to go`}
            </Text>
          </View>
        </View>

        {/* ── REVENUE INTELLIGENCE ────────────────────────────────── */}
        <RevenueIntelligenceCard />

        {/* ── CLIENT PULSE ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Client Pulse</Text>
            {activeClients.length > 0 && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/clients')}>
                <Text style={styles.seeAll}>See Roster →</Text>
              </TouchableOpacity>
            )}
          </View>

          {activeClients.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: Spacing.xl, gap: 10 }}>
              {activeClients.map(client => {
                const recency = getClientRecency(client);
                return (
                  <TouchableOpacity
                    key={client.id}
                    style={styles.pulseCard}
                    onPress={() => setSelectedPulseClient(client)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.pulseAvatar}>
                      {client.avatar_url ? (
                        <View style={[styles.pulseAvatarCircle, { overflow: 'hidden' }]}>
                          {/* avatar_url as background */}
                        </View>
                      ) : (
                        <View style={styles.pulseAvatarCircle}>
                          <Text style={styles.pulseInitial}>
                            {client.name.substring(0, 2).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={[
                        styles.pulseDot,
                        { backgroundColor: client.status === 'trial' ? '#F59E0B' : '#22C55E' }
                      ]} />
                    </View>
                    <Text style={styles.pulseName} numberOfLines={1}>{client.name.split(' ')[0]}</Text>
                    <Text style={[styles.pulseMeta, { color: recency.color }]}>
                      {recency.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.emptyCard}>
              <PrecisionIcons.Activity size={28} color="rgba(255,255,255,0.12)" />
              <Text style={styles.emptyTitle}>Your roster is empty</Text>
              <Text style={styles.emptySub}>Share your FitLink profile or invite clients directly.</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/(tabs)/clients')}>
                <Ionicons name="person-add-outline" size={13} color="#FFFFFF" />
                <Text style={styles.emptyBtnText}>Invite Client</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── LIVE ACTIVITY STREAM — real notifications ──────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Activity Stream</Text>
            {unreadNotifs > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadNotifs} new</Text>
              </View>
            )}
          </View>

          {/* Filter chips */}
          <View style={styles.filterRow}>
            {(['all', 'clients', 'revenue'] as const).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setActivityFilter(f)}
                style={[styles.filterChip, activityFilter === f && styles.filterChipActive]}
              >
                <Text style={[
                  styles.filterChipText,
                  activityFilter === f && styles.filterChipTextActive,
                ]}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredNotifs.length > 0 ? (
            <View style={styles.activityCard}>
              {filteredNotifs.slice(0, 8).map((notif, idx) => {
                const meta = getNotifMeta(notif);
                return (
                  <View key={notif.id}>
                    <TouchableOpacity
                      style={styles.activityItem}
                      onPress={() => router.push('/notifications')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.activityIcon, { backgroundColor: `${meta.color}18` }]}>
                        <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                      </View>
                      <View style={styles.activityText}>
                        <Text style={styles.activityTitle} numberOfLines={1}>{notif.title}</Text>
                        <Text style={styles.activitySub} numberOfLines={1}>{notif.description}</Text>
                      </View>
                      <Text style={styles.activityTime}>{getRelativeTime(notif.created_at)}</Text>
                      {!notif.is_read && <View style={styles.unreadDot} />}
                    </TouchableOpacity>
                    {idx < filteredNotifs.slice(0, 8).length - 1 && <View style={styles.divider} />}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <PrecisionIcons.Heartbeat size={28} color="rgba(255,255,255,0.12)" />
              <Text style={styles.emptyTitle}>
                {activityFilter === 'clients' ? 'No client activity yet'
                  : activityFilter === 'revenue' ? 'No revenue activity yet'
                  : 'No activity yet'}
              </Text>
              <Text style={styles.emptySub}>
                {activityFilter === 'all'
                  ? "Your clients' actions will appear here — workouts, messages, check-ins."
                  : `Filter active. New ${activityFilter} events will appear here.`}
              </Text>
            </View>
          )}
        </View>

        {/* CHECK-IN INBOX */}
        {trainer?.id && <CheckInInbox trainerId={trainer.id} />}

        {/* ── ROSTER ADHERENCE HEATMAP ────────────────────────────── */}
        <RosterHeatmap />

        {/* ── QUICK ACTIONS — 3×2 icon tile grid ─────────────────── */}
        {/* No photos. Icon + accent chip + label + stat. All 6 visible in ~200px. */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            {QUICK_ACTIONS(router, haptic.trigger, clients, sessions, plans, workouts).map(action => (
              <TouchableOpacity
                key={action.id}
                style={styles.actionTile}
                onPress={action.onPress}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIconChip, { backgroundColor: `${action.color}1A` }]}>
                  <Ionicons name={action.icon as any} size={22} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
                {action.stat ? <Text style={styles.actionStat}>{action.stat}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <GlobalSearchModal visible={isSearchVisible} onClose={() => setIsSearchVisible(false)} />
      <ClientPulseModal
        visible={!!selectedPulseClient}
        client={selectedPulseClient}
        onClose={() => setSelectedPulseClient(null)}
      />
    </View>
  );
}

// ── Quick Actions data ────────────────────────────────────────────────────────────────
function QUICK_ACTIONS(
  router: any,
  hapticTrigger: (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection') => void,
  clients: any[],
  sessions: any[],
  plans: any[],
  workouts: any[]
) {
  const activeCount  = clients.filter(c => c.status !== 'inactive').length;
  const upcomingCount = sessions.filter(s => s.status === 'upcoming').length;
  return [
    {
      id: 'live',
      label: 'Go Live',
      icon: 'radio',
      color: '#EF4444',
      stat: 'Broadcast a class',
      onPress: () => { hapticTrigger('medium'); router.push('/create-live-class'); },
    },
    {
      id: 'workout',
      label: 'New Workout',
      icon: 'barbell',
      color: '#22C55E',
      stat: `${workouts.length} built`,
      onPress: () => router.push('/create-workout'),
    },
    {
      id: 'session',
      label: 'Book Session',
      icon: 'calendar',
      color: '#6C9BF2',
      stat: upcomingCount > 0 ? `${upcomingCount} upcoming` : 'None booked',
      onPress: () => router.push('/(tabs)/schedule'),
    },
    {
      id: 'client',
      label: 'Add Client',
      icon: 'person-add',
      color: '#FF6B6B',
      stat: `${activeCount} active`,
      onPress: () => router.push('/(tabs)/clients'),
    },
    {
      id: 'pass',
      label: 'Season Pass',
      icon: 'card',
      color: '#C9A96E',
      stat: `${plans.length} plan${plans.length !== 1 ? 's' : ''} live`,
      onPress: () => router.push('/create-plan'),
    },
    {
      id: 'class',
      label: 'New Class',
      icon: 'videocam',
      color: '#A855F7',
      stat: 'On-demand content',
      onPress: () => router.push('/create-class'),
    },
  ];
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    flexGrow: 1,
  },

  // ── Search/bell utility bar (floats below hero card) ──────────────────────
  utilBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: 10,
    gap: 8,
  },
  utilBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  // ── Metrics row (Next Session + This Week) ────────────────────────────────
  metricsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    gap: 12,
    marginBottom: 32,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.lg,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 170,
    gap: 6,
  },
  metricLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  metricSub: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  metricEmpty: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginBottom: 6,
  },
  metricCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  metricCtaText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },

  // Performance ring
  ring: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  ringNum: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: '#FFFFFF',
  },
  daysRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 4,
  },
  dayDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDotToday: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  dayText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    color: 'rgba(255,255,255,0.3)',
  },
  dayTextToday: {
    color: '#FFFFFF',
  },
  ringCopy: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 14,
  },

  // ── Section layout ─────────────────────────────────────────────────────────
  section: {
    marginBottom: 32,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  seeAll: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#6C9BF2',
    letterSpacing: 0.3,
  },

  // ── Client Pulse cards ─────────────────────────────────────────────────────
  pulseCard: {
    width: 88,
    backgroundColor: '#0F0F0F',
    borderRadius: Radius.lg,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  pulseAvatar: {
    position: 'relative',
    marginBottom: 8,
  },
  pulseAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseInitial: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  pulseDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#0F0F0F',
  },
  pulseName: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 11,
    color: '#FFFFFF',
    marginBottom: 3,
    textAlign: 'center',
  },
  pulseMeta: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 13,
  },

  // ── Empty states ───────────────────────────────────────────────────────────
  emptyCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: 24,
    alignItems: 'center',
    marginHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 10,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.xs,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emptyBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFFFFF',
  },

  // ── Activity Stream ────────────────────────────────────────────────────────
  unreadBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  unreadText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.xl,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  filterChipText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  activityCard: {
    backgroundColor: '#0F0F0F',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: Spacing.xl,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: {
    flex: 1,
  },
  activityTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  activitySub: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },
  activityTime: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6C9BF2',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginLeft: 62,
  },

  // ── Quick Actions 3×2 icon tile grid ──────────────────────────────────────
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.xl,
    gap: 10,
  },
  actionTile: {
    width: '30.5%',             // 3 per row with gap
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: Radius.lg,
    padding: 14,
    alignItems: 'center',
    gap: 7,
  },
  actionIconChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.1,
  },
  actionStat: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
  },

  heroBgContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    overflow: 'hidden',
  },
  heroImg: {
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  heroContentWrapper: {
    paddingBottom: 32,             // 8pt grid: generous hero bottom
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 32,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  avatarBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontFamily: FontFamily.headingSemiBold,
    color: '#FFFFFF',
    fontSize: 18,
  },
  greetingBlock: {
    flex: 1,
    gap: 3,
  },
  greetingName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  greetingTagline: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#0C0C0E',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: FontFamily.bodySemiBold,
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  bizOverview: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 6,
  },
  revenue: {
    color: '#FFFFFF',
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 52,
    letterSpacing: -1,
    marginBottom: 8,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  contentRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 16,
    marginBottom: 32,              // 8pt grid: section-to-section
  },
  contentCol: {
    flex: 1,
    flexDirection: 'row',
  },
  verticalLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    transform: [{ rotate: '-90deg' }],
    position: 'absolute',
    left: -28,
    top: '40%',
    width: 80,
  },
  contentInner: {
    flex: 1,
    marginLeft: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 180,
  },
  performanceInner: {
    flex: 1,
    marginLeft: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 180,
    paddingVertical: 10,
  },
  emptyMetricText: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: FontFamily.body,
    fontSize: 12,
    textAlign: 'center',
  },
  sessionTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  sessionTime: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    textAlign: 'center',
  },
  progressCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 6,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressNumber: {
    color: '#FFFFFF',
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
  },
  progressSubtext: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: FontFamily.body,
    fontSize: 10,
  },

  // ── Quick Actions — Cinematic Image Cards ──
  quickActionsSection: {
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  quickActionsHeader: {
    marginBottom: 16,
  },

  // Live stat badge — top-left corner of cards showing real data
  statBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statBadgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.3,
  },

  // Shared card base
  cardBgImage: {
    ...StyleSheet.absoluteFillObject as any,
    width: '100%',
    height: '100%',
  },
  cardBottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  cardTextBlock: {
    flex: 1,
    marginRight: 10,
  },
  cardHeadline: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 3,
  },
  cardPersuasion: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 17,
  },
  cardHeadlineSm: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  cardPersuasionSm: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
  },

  // Start / CTA pills
  startPill: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  startPillSm: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // White text — used on coloured pill backgrounds (red, green, blue etc.)
  startPillText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  // Used inside small circle pills (+, ▶)
  startPillTextSm: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
  },


  // Live indicator pill
  livePill: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.85)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  livePillText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },

  // Hero full-width card (tall)
  heroActionCard: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#0C0C0E',
  },

  // Wide card (shorter)
  wideActionCard: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
    backgroundColor: '#0C0C0E',
  },

  // Row of two equal cards
  cardRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 0,
    marginTop: 10,
  },
  halfCard: {
    flex: 1,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0C0C0E',
  },


  // ── Empty States ──
  emptyStateCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: 24,
    alignItems: 'center',
    marginHorizontal: 16,
  },
  emptyStateTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    marginBottom: 8,
  },
  emptyStateSub: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  emptyStateActions: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.xs,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyStateBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  emptyStateBtnAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.xs,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyStateBtnAltText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },

});
