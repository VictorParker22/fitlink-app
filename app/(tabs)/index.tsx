import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { FontFamily, Radius } from '../../constants/theme';
import { StatusBar } from 'expo-status-bar';
import GlobalSearchModal from '../../components/dashboard/GlobalSearchModal';
import AlertPill, { AlertPillProps } from '../../components/dashboard/AlertPill';
import ClientPulseModal from '../../components/dashboard/ClientPulseModal';
import { Client } from '../../context/AppContext';

export default function DashboardScreen() {
  const router = useRouter();
  const { trainer, clients, plans, sessions, notifications } = useApp();
  const { colors } = useTheme();

  const [isSearchVisible, setIsSearchVisible] = React.useState(false);
  const [selectedPulseClient, setSelectedPulseClient] = React.useState<Client | null>(null);

  const activeClients = clients.filter(c => c.status !== 'inactive');
  const activeClientsCount = activeClients.length;
  const firstName = (trainer?.name || 'Victor').split(' ')[0];
  const initials = (trainer?.name || 'VP').substring(0, 2).toUpperCase();

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

  // Notifications and Sessions logic
  const unreadNotifs = notifications?.filter(n => !n.is_read).length || 0;
  
  const nextSession = useMemo(() => {
    const now = new Date().getTime();
    const upcoming = sessions
      .filter(s => new Date(s.date).getTime() > now && s.status === 'upcoming')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return upcoming.length > 0 ? upcoming[0] : null;
  }, [sessions]);

  const todayIndex = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const completedThisWeek = 0;

  // Compute Dynamic Action Alerts
  const actionAlerts = useMemo(() => {
    const alerts: AlertPillProps[] = [];
    
    // Check for trial clients
    const trialClient = clients.find(c => c.status === 'trial');
    if (trialClient) {
      alerts.push({
        id: 'trial-ending',
        type: 'warning',
        icon: 'time-outline',
        title: `Trial Ending: ${trialClient.name}`,
        subtitle: 'Trial expires soon. Tap to follow up.',
        actionText: 'Review',
        onPress: () => setSelectedPulseClient(trialClient),
      });
    }

    // Check for unread notifications
    if (unreadNotifs > 0) {
      alerts.push({
        id: 'unread-notifs',
        type: 'urgent',
        icon: 'notifications-outline',
        title: `${unreadNotifs} Unread Notifications`,
        subtitle: 'Action required on recent client activity.',
        actionText: 'View',
        onPress: () => router.push('/notifications'),
      });
    }

    // Default alert if no active urgent items
    if (alerts.length === 0) {
      alerts.push({
        id: 'roster-check',
        type: 'info',
        icon: 'sparkles-outline',
        title: 'Roster Insights',
        subtitle: `${activeClientsCount} active clients on track this week.`,
        actionText: 'Roster',
        onPress: () => router.push('/(tabs)/clients'),
      });
    }

    return alerts;
  }, [clients, unreadNotifs, activeClientsCount]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        
        {/* HERO BACKGROUND (ABSOLUTE) */}
        <View style={styles.heroBgContainer}>
          <Image 
            source={require('../../assets/images/milestone-bg.png')} 
            style={styles.heroImg}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.8)', '#000000']}
            style={StyleSheet.absoluteFillObject}
          />
        </View>
        
        <SafeAreaView edges={['top']} style={styles.heroContentWrapper}>
            {/* TOP BAR */}
            <View style={styles.topBar}>
              <TouchableOpacity onPress={() => router.push('/(tabs)/profile')} style={styles.avatarBtn}>
                {trainer?.avatar_url ? (
                  <Image source={{ uri: trainer.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarText}>{initials}</Text>
                )}
              </TouchableOpacity>
              
              <View style={styles.topBarIcons}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setIsSearchVisible(true)}>
                  <Ionicons name="search" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/(tabs)/schedule')}>
                  <Ionicons name="calendar-outline" size={24} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/notifications')}>
                  <Ionicons name="notifications-outline" size={24} color="#FFFFFF" />
                  {unreadNotifs > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.scheduleBtn} onPress={() => router.push('/(tabs)/schedule')}>
                  <Text style={styles.scheduleText}>Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* TEXT CONTENT */}
            <View style={styles.heroContent}>
              <Text style={styles.bizOverview}>BUSINESS OVERVIEW</Text>
              <Text style={styles.revenue}>${Math.floor(actualEarnings)}</Text>
              <Text style={styles.greeting}>
                Good afternoon, {firstName}! You have {activeClientsCount} active client{activeClientsCount !== 1 ? 's' : ''} under your roster.
              </Text>
              
              <TouchableOpacity style={styles.rosterBtn} onPress={() => router.push('/(tabs)/clients')}>
                <Text style={styles.rosterText}>Client Roster</Text>
                <View style={styles.rosterArrow}>
                  <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            </View>
        </SafeAreaView>

        {/* ACTION CENTER */}
        <View style={styles.actionCenterSection}>
          <Text style={styles.sectionHeaderLabel}>ACTION CENTER</Text>
          {actionAlerts.map(alert => (
            <AlertPill key={alert.id} {...alert} />
          ))}
        </View>

        {/* METRICS GRID */}
        <View style={styles.contentRow}>
          {/* NEXT UP */}
          <View style={styles.contentCol}>
            <Text style={styles.verticalLabel}>NEXT UP</Text>
            <View style={styles.contentInner}>
              {nextSession ? (
                <>
                  <Ionicons name="calendar" size={32} color="#6C9BF2" />
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.sessionTitle} numberOfLines={1}>
                      {clients.find(c => c.id === nextSession.client_id)?.name || nextSession.group_name || 'Session'}
                    </Text>
                    <Text style={styles.sessionTime}>
                      {new Date(nextSession.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Ionicons name="calendar-outline" size={32} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyMetricText}>No upcoming sessions</Text>
                </>
              )}
            </View>
          </View>
          
          {/* PERFORMANCE */}
          <View style={styles.contentCol}>
            <Text style={styles.verticalLabel}>PERFORMANCE</Text>
            <View style={styles.performanceInner}>
              {/* Circular Progress */}
              <View style={styles.progressCircle}>
                <View style={styles.progressInner}>
                  <Text style={styles.progressNumber}>{completedThisWeek}</Text>
                </View>
              </View>
              <Text style={styles.progressSubtext}>of 5 this week</Text>
              
              {/* Day tracker */}
              <View style={styles.daysRow}>
                {['M','T','W','T','F','S','S'].map((day, i) => (
                  <View key={i} style={[
                    styles.dayCircle,
                    i === todayIndex && styles.dayCircleToday
                  ]}>
                    <Text style={[
                      styles.dayText,
                      i === todayIndex && styles.dayTextToday
                    ]}>{day}</Text>
                  </View>
                ))}
              </View>
              
              <View style={styles.lightningRow}>
                <Ionicons name="flash" size={12} color="#FFFFFF" />
                <Text style={styles.lightningText}>0 done this week</Text>
              </View>
            </View>
          </View>
        </View>

        {/* QUICK ACTIONS */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.quickActionsScroll}
          style={styles.quickActionsContainer}
        >
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/(tabs)/clients')} activeOpacity={0.8}>
            <View style={[styles.actionIcon, { backgroundColor: '#1A0C0C', borderColor: '#FF6B6B' }]}>
              <Ionicons name="person-add-outline" size={20} color="#FF6B6B" />
            </View>
            <Text style={styles.actionText}>ADD CLIENT</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/(tabs)/schedule')} activeOpacity={0.8}>
            <View style={[styles.actionIcon, { backgroundColor: '#0C1420', borderColor: '#4D94FF' }]}>
              <Ionicons name="calendar-outline" size={20} color="#4D94FF" />
            </View>
            <Text style={styles.actionText}>BOOK SESSION</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/subscriptions')} activeOpacity={0.8}>
            <View style={[styles.actionIcon, { backgroundColor: '#1A1500', borderColor: '#EAB308' }]}>
              <Ionicons name="ticket-outline" size={20} color="#EAB308" />
            </View>
            <Text style={styles.actionText}>SEASON PASSES</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/(tabs)/messages')} activeOpacity={0.8}>
            <View style={[styles.actionIcon, { backgroundColor: '#0C1C12', borderColor: '#22C55E' }]}>
              <Ionicons name="chatbubble-outline" size={20} color="#22C55E" />
            </View>
            <Text style={styles.actionText}>MESSAGES</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/create-class' as any)} activeOpacity={0.8}>
            <View style={[styles.actionIcon, { backgroundColor: '#160C20', borderColor: '#A855F7' }]}>
              <Ionicons name="videocam-outline" size={20} color="#A855F7" />
            </View>
            <Text style={styles.actionText}>NEW CLASS</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push('/(tabs)/programs')} activeOpacity={0.8}>
            <View style={[styles.actionIcon, { backgroundColor: '#160C20', borderColor: '#A855F7' }]}>
              <Ionicons name="document-text-outline" size={20} color="#A855F7" />
            </View>
            <Text style={styles.actionText}>NEW PLAN</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* CLIENT PULSE (HORIZONTAL FEED) */}
        <View style={styles.pulseSection}>
          <View style={styles.pulseHeader}>
            <Text style={styles.sectionTitle}>Client Pulse</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/clients')}>
              <Text style={styles.seeAllText}>See Roster →</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pulseScroll}>
            {activeClients.map(client => (
              <TouchableOpacity 
                key={client.id} 
                style={styles.pulseCard} 
                activeOpacity={0.8}
                onPress={() => setSelectedPulseClient(client)}
              >
                <View style={styles.pulseAvatarWrapper}>
                  {client.avatar_url ? (
                    <Image source={{ uri: client.avatar_url }} style={styles.pulseAvatarImg} />
                  ) : (
                    <Text style={styles.pulseAvatarText}>{client.name.substring(0, 2).toUpperCase()}</Text>
                  )}
                  <View style={[styles.pulseStatusDot, { backgroundColor: client.status === 'active' ? '#22C55E' : '#F59E0B' }]} />
                </View>
                <Text style={styles.pulseName} numberOfLines={1}>{client.name.split(' ')[0]}</Text>
                <Text style={styles.pulseMeta}>{client.completed_workouts || 0} workouts · {client.xp || 0} XP</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* LIVE ACTIVITY STREAM */}
        <View style={styles.activitySection}>
          <Text style={styles.sectionTitle}>Live Activity Stream</Text>
          
          <View style={styles.activityCard}>
            <View style={styles.timelineItem}>
              <View style={styles.timelineIconBg}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>Workout Completed</Text>
                <Text style={styles.timelineSub}>Active client logged today's session</Text>
              </View>
              <Text style={styles.timelineTime}>Today</Text>
            </View>

            <View style={styles.timelineDivider} />

            <View style={styles.timelineItem}>
              <View style={styles.timelineIconBg}>
                <Ionicons name="card-outline" size={18} color="#6C9BF2" />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>Subscription Renewed</Text>
                <Text style={styles.timelineSub}>Client plan bill processed cleanly</Text>
              </View>
              <Text style={styles.timelineTime}>Yesterday</Text>
            </View>

            <View style={styles.timelineDivider} />

            <View style={styles.timelineItem}>
              <View style={styles.timelineIconBg}>
                <Ionicons name="person-add" size={18} color="#A855F7" />
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>New Client Roster Added</Text>
                <Text style={styles.timelineSub}>Joined via coach invite link</Text>
              </View>
              <Text style={styles.timelineTime}>3 days ago</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Global Search Modal */}
      <GlobalSearchModal 
        visible={isSearchVisible} 
        onClose={() => setIsSearchVisible(false)} 
      />

      {/* Client Pulse Inspection Modal */}
      <ClientPulseModal
        visible={!!selectedPulseClient}
        client={selectedPulseClient}
        onClose={() => setSelectedPulseClient(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    flexGrow: 1,
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
    paddingBottom: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    marginBottom: 40,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontFamily: FontFamily.headingSemiBold,
    color: '#FFFFFF',
    fontSize: 16,
  },
  topBarIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBtn: {
    padding: 4,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#EF4444',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#000000',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: FontFamily.bodySemiBold,
  },
  scheduleBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginLeft: 8,
  },
  scheduleText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
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
    marginBottom: 12,
  },
  greeting: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    maxWidth: '90%',
  },
  rosterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rosterText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
  },
  rosterArrow: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 16,
    marginBottom: 24,
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
  daysRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
  },
  dayCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  dayText: {
    color: 'rgba(255,255,255,0.3)',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
  },
  dayTextToday: {
    color: '#FFFFFF',
  },
  lightningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lightningText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
  },
  quickActionsContainer: {
    marginBottom: 32,
  },
  quickActionsScroll: {
    paddingHorizontal: 24,
    gap: 20,
  },
  actionItem: {
    alignItems: 'center',
    gap: 10,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  actionCenterSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeaderLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 2,
    marginBottom: 10,
  },
  pulseSection: {
    marginBottom: 28,
  },
  pulseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  seeAllText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#6C9BF2',
    letterSpacing: 0.5,
  },
  pulseScroll: {
    paddingHorizontal: 20,
    gap: 10,
  },
  pulseCard: {
    width: 96,
    backgroundColor: '#0F0F0F',
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  pulseAvatarWrapper: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  pulseAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.sm,
  },
  pulseAvatarText: {
    fontFamily: FontFamily.heading,
    fontSize: 13,
    color: '#FFFFFF',
  },
  pulseStatusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#0F0F0F',
  },
  pulseName: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 12,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  pulseMeta: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  activitySection: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  activityCard: {
    backgroundColor: '#0F0F0F',
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  timelineIconBg: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  timelineSub: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  timelineTime: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  timelineDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 4,
    marginLeft: 46,
  },
});
