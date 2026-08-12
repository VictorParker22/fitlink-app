import React, { useMemo, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Image, Animated, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../context/AppContext';
import { FontFamily } from '../../constants/theme';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Client } from '../../context/AppContext';
import CheckInInbox from '../../components/dashboard/CheckInInbox';

const { width: W } = Dimensions.get('window');
const CARD_W = W * 0.72;

// ─── Quick Actions ────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: 'people-outline',       label: 'Clients',   route: '/(tabs)/clients'   },
  { icon: 'calendar-outline',     label: 'Schedule',  route: '/(tabs)/schedule'  },
  { icon: 'barbell-outline',      label: 'Programs',  route: '/(tabs)/programs'  },
  { icon: 'chatbubble-outline',   label: 'Messages',  route: '/(tabs)/messages'  },
  { icon: 'videocam-outline',     label: 'Go Live',   route: '/(tabs)/studio'    },
  { icon: 'nutrition-outline',    label: 'Diets',     route: '/(tabs)/diets'     },
  { icon: 'stats-chart-outline',  label: 'Revenue',   route: '/earnings'         },
  { icon: 'person-outline',       label: 'Profile',   route: '/(tabs)/profile'   },
] as const;

// ─── Discover tabs ────────────────────────────────────────────────────────────
const DISCOVER_TABS = ['All', 'Sessions', 'Clients', 'Revenue'];

export default function CoachHomeScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { trainer, clients, sessions, notifications, plans } = useApp();

  // discoverTab removed — activity is now a mini 3-item strip, not a tabbed feed

  const activeClients  = clients.filter(c => c.status !== 'inactive');
  const unreadNotifs   = notifications?.filter(n => !n.is_read).length || 0;
  const greeting       = getGreeting();
  const firstName      = trainer?.name?.split(' ')[0] || 'Coach';

  // Next session
  const nextSession = useMemo(() => {
    const now = Date.now();
    return sessions
      .filter(s => new Date(s.date).getTime() > now && s.status === 'upcoming')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
  }, [sessions]);

  // This week completions
  const weekCompletions = useMemo(() => {
    const monday = (() => {
      const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0,0,0,0); return d;
    })();
    return sessions.filter(s => s.status === 'completed' && new Date(s.date) >= monday).length;
  }, [sessions]);

  // Monthly earnings
  const monthlyEarnings = useMemo(() => {
    let total = 0;
    plans.forEach(p => {
      const subs = activeClients.filter(c => c.plan_id === p.id).length;
      total += Number(p.price || 0) * subs * 0.9;
    });
    return total;
  }, [clients, plans]);

  // Clients needing attention — sorted by days-since-activity (most at-risk first)
  const attentionClients = useMemo(() => {
    const now = Date.now();
    return [...activeClients]
      .map(client => {
        const cs = sessions.filter(s => s.client_id === client.id && s.status === 'completed');
        const lastMs = cs.length === 0
          ? new Date(client.created_at).getTime()
          : Math.max(...cs.map(s => new Date(s.date).getTime()));
        return { client, daysSince: Math.floor((now - lastMs) / 86400000) };
      })
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 8)
      .map(({ client }) => client);
  }, [activeClients, sessions]);

  // ── At-Risk Detection ────────────────────────────────────────────────────────
  // A client is "at risk" if their last completed session was >7 days ago,
  // or they have no sessions at all and joined >7 days ago.
  const AT_RISK_DAYS = 7;
  const atRiskClients = useMemo(() => {
    const threshold = AT_RISK_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return activeClients.map(client => {
      const clientSessions = sessions.filter(
        s => s.client_id === client.id && s.status === 'completed'
      );
      let lastActivityMs: number;
      if (clientSessions.length === 0) {
        lastActivityMs = new Date(client.created_at).getTime();
      } else {
        lastActivityMs = Math.max(...clientSessions.map(s => new Date(s.date).getTime()));
      }
      const daysSince = Math.floor((now - lastActivityMs) / 86400000);
      return { client, daysSince, lastActivityMs };
    })
      .filter(({ daysSince }) => daysSince >= AT_RISK_DAYS)
      .sort((a, b) => b.daysSince - a.daysSince); // worst first
  }, [activeClients, sessions]);

  // Activity feed — top 3 most recent, shown above the fold before the Studio banner
  const feedItems = useMemo(() =>
    notifications.slice(0, 3).map(n => ({
      id: n.id, type: n.type,
      title: n.title || 'Update',
      body: n.description || '',
      time: n.created_at,
    })),
  [notifications]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Full-screen dark gradient background */}
      <LinearGradient
        colors={['#0D0D12', '#111118', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HEADER ──────────────────────────────────────────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View>
            <Text style={styles.greetingText}>{greeting}</Text>
            <Text style={styles.nameText}>{firstName} 👊</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/notifications')}
            >
              <Ionicons name="notifications-outline" size={22} color="#fff" />
              {unreadNotifs > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadNotifs > 9 ? '9+' : unreadNotifs}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, { marginLeft: 10 }]}
              onPress={() => router.push('/(tabs)/profile')}
            >
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>
                  {firstName[0]?.toUpperCase()}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── STATS STRIP ─────────────────────────────────────────── */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsStrip}
        >
          <StatPill icon="people" label="Clients" value={String(activeClients.length)} color="#C8F135" />
          <StatPill icon="checkmark-circle" label="This Week" value={String(weekCompletions)} color="#60A5FA" />
          <StatPill icon="cash" label="Monthly" value={`$${monthlyEarnings.toFixed(0)}`} color="#A78BFA" />
          {nextSession && (
            <StatPill
              icon="time"
              label="Next Session"
              value={new Date(nextSession.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              color="#FB923C"
            />
          )}
        </ScrollView>

        {/* ── QUICK ACTIONS — 2×4 visible grid with dividers ──────── */}
        <View style={styles.quickRow}>
          {/* Row 1 */}
          <View style={styles.quickGridRow}>
            {QUICK_ACTIONS.slice(0, 4).map((a, index) => (
              <React.Fragment key={a.label}>
                <TouchableOpacity
                  style={styles.quickItem}
                  activeOpacity={0.65}
                  onPress={() => router.push(a.route as any)}
                >
                  <View style={styles.quickIconWrap}>
                    <Ionicons name={a.icon as any} size={22} color="#C8F135" />
                  </View>
                  <Text style={styles.quickLabel}>{a.label}</Text>
                </TouchableOpacity>
                {index < 3 && <View style={styles.quickDivider} />}
              </React.Fragment>
            ))}
          </View>

          {/* Horizontal divider between rows */}
          <View style={styles.quickRowDivider} />

          {/* Row 2 */}
          <View style={styles.quickGridRow}>
            {QUICK_ACTIONS.slice(4).map((a, index) => (
              <React.Fragment key={a.label}>
                <TouchableOpacity
                  style={styles.quickItem}
                  activeOpacity={0.65}
                  onPress={() => router.push(a.route as any)}
                >
                  <View style={styles.quickIconWrap}>
                    <Ionicons name={a.icon as any} size={22} color="#C8F135" />
                  </View>
                  <Text style={styles.quickLabel}>{a.label}</Text>
                </TouchableOpacity>
                {index < 3 && <View style={styles.quickDivider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* ── AT-RISK ALERT CARD ───────────────────────────────────── */}
        {atRiskClients.length > 0 && (
          <AtRiskAlertCard
            atRiskClients={atRiskClients}
            onMessageClient={(id) => router.push(`/chat/${id}` as any)}
            onViewAll={() => router.push('/(tabs)/clients')}
          />
        )}

        {/* ── MINI ACTIVITY — 3 most recent, above the fold ────────── */}
        {feedItems.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Activity</Text>
            </View>
            <View style={styles.feedList}>
              {feedItems.map(item => (
                <FeedCard key={item.id} item={item} />
              ))}
            </View>
          </>
        )}

        {/* ── HERO BANNER — Live Studio CTA ───────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.heroBanner}
          onPress={() => router.push('/(tabs)/studio')}
        >
          <LinearGradient
            colors={['#1A1040', '#2D1B69', '#0F0A2E']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.heroBannerInner}
          >
            <View style={styles.glowBlob1} />
            <View style={styles.glowBlob2} />
            <View style={styles.heroBannerContent}>
              <View style={styles.heroBannerBadge}>
                <Text style={styles.heroBannerBadgeText}>✦ LIVE STUDIO</Text>
              </View>
              <Text style={styles.heroBannerTitle}>Go Live with{'\n'}Your Clients</Text>
              <Text style={styles.heroBannerSub}>
                Start a broadcast, run a class, or host a 1-on-1 session — all in one tap.
              </Text>
              <View style={styles.heroBannerCta}>
                <Text style={styles.heroBannerCtaText}>Start Broadcast →</Text>
              </View>
            </View>
            <View style={styles.heroBannerIcon}>
              <Ionicons name="videocam" size={64} color="rgba(200,241,53,0.12)" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── CLIENT ROSTER CAROUSEL ──────────────────────────────── */}
        {attentionClients.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Roster</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/clients')}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rosterRow}
            >
              {attentionClients.map(c => (
                <ClientCard
                  key={c.id}
                  client={c}
                  clientSessions={sessions.filter(s => s.client_id === c.id)}
                />
              ))}
            </ScrollView>
          </>
        )}

        {/* ── CHECK-IN INBOX ───────────────────────────────────────── */}
        {trainer?.id && (
          <CheckInInbox trainerId={trainer.id} />
        )}

      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ── At-Risk Alert Card ────────────────────────────────────────────────────────
type AtRiskEntry = { client: Client; daysSince: number };

function AtRiskAlertCard({
  atRiskClients,
  onMessageClient,
  onViewAll,
}: {
  atRiskClients: AtRiskEntry[];
  onMessageClient: (clientId: string) => void;
  onViewAll: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const anim = useRef(new Animated.Value(1)).current;

  const toggle = () => {
    const toValue = expanded ? 0 : 1;
    Animated.spring(anim, { toValue, useNativeDriver: false, tension: 60, friction: 12 }).start();
    setExpanded(!expanded);
  };

  // Show up to 3 clients, rest folded
  const PREVIEW = 3;
  const visible = atRiskClients.slice(0, PREVIEW);
  const extra   = atRiskClients.length - PREVIEW;

  return (
    <View style={ar.card}>
      {/* Amber accent bar */}
      <View style={ar.accentBar} />

      {/* Header row — always visible */}
      <TouchableOpacity style={ar.header} onPress={toggle} activeOpacity={0.75}>
        <View style={ar.headerLeft}>
          <View style={ar.warningDot} />
          <View>
            <Text style={ar.headerTitle}>
              {atRiskClients.length} client{atRiskClients.length !== 1 ? 's' : ''} at risk
            </Text>
            <Text style={ar.headerSub}>
              No activity in {7}+ days — reach out now
            </Text>
          </View>
        </View>
        <View style={ar.headerRight}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="rgba(255,255,255,0.4)"
          />
        </View>
      </TouchableOpacity>

      {/* Collapsible client list */}
      {expanded && (
        <View style={ar.list}>
          {visible.map(({ client, daysSince }) => {
            const initials = client.name
              .split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            const urgency =
              daysSince >= 21 ? '#EF4444' :   // red — 3+ weeks
              daysSince >= 14 ? '#F97316' :   // orange — 2+ weeks
                                '#F59E0B';    // amber — 1 week+

            return (
              <View key={client.id} style={ar.row}>
                {/* Avatar */}
                <View style={[ar.avatar, { borderColor: urgency + '50' }]}>
                  {client.avatar_url ? (
                    <Image source={{ uri: client.avatar_url }} style={ar.avatarImg} />
                  ) : (
                    <Text style={ar.avatarText}>{initials}</Text>
                  )}
                </View>

                {/* Info */}
                <View style={ar.rowInfo}>
                  <Text style={ar.rowName} numberOfLines={1}>{toTitleCase(client.name)}</Text>
                  <View style={ar.daysBadge}>
                    <Ionicons name="time-outline" size={11} color={urgency} />
                    <Text style={[ar.daysText, { color: urgency }]}>
                      {daysSince >= 90 ? '90+' : daysSince}d inactive
                    </Text>
                  </View>
                </View>

                {/* Message CTA */}
                <TouchableOpacity
                  style={ar.msgBtn}
                  onPress={() => onMessageClient(client.id)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="chatbubble-outline" size={13} color="#60A5FA" />
                  <Text style={ar.msgBtnText}>Message</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Footer */}
          <TouchableOpacity style={ar.footer} onPress={onViewAll} activeOpacity={0.7}>
            <Text style={ar.footerText}>
              {extra > 0 ? `+${extra} more · ` : ''}View all clients
            </Text>
            <Ionicons name="arrow-forward" size={13} color="rgba(255,255,255,0.35)" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function StatPill({ icon, label, value, color }: {
  icon: string; label: string; value: string; color: string;
}) {
  return (
    <View style={[styles.statPill, { borderColor: color + '30' }]}>
      <Ionicons name={icon as any} size={14} color={color} style={{ marginBottom: 4 }} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ClientCard({ client, clientSessions }: { client: Client; clientSessions: any[] }) {
  const router = useRouter();
  const initials = client.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const statusColor = client.status === 'trial' ? '#F59E0B' : client.status === 'active' ? '#22C55E' : '#6B7280';

  // Engagement ring — based on session attendance if data is available, else status color
  const ringColor = (() => {
    if (clientSessions.length === 0) return statusColor;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recent = clientSessions.filter(s => new Date(s.date).getTime() > thirtyDaysAgo);
    if (recent.length === 0) return '#EF4444'; // no sessions in 30 days → at risk
    const rate = recent.filter(s => s.status === 'completed').length / recent.length;
    if (rate >= 0.8) return '#22C55E';
    if (rate >= 0.5) return '#F59E0B';
    return '#EF4444';
  })();

  return (
    <TouchableOpacity
      style={styles.clientCard}
      activeOpacity={0.8}
      onPress={() => router.push(`/client/${client.id}` as any)}
    >
      <LinearGradient
        colors={['#1C1C28', '#141420']}
        style={styles.clientCardInner}
      >
        {/* Avatar with engagement ring */}
        <View style={[styles.clientAvatar, { borderColor: ringColor + '80' }]}>
          {client.avatar_url ? (
            <Image source={{ uri: client.avatar_url }} style={styles.clientAvatarImg} />
          ) : (
            <Text style={styles.clientAvatarText}>{initials}</Text>
          )}
        </View>
        <View style={[styles.clientStatusDot, { backgroundColor: ringColor }]} />
        <Text style={styles.clientName} numberOfLines={1}>{toTitleCase(client.name)}</Text>
        <Text style={styles.clientStatus}>{client.status}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function FeedCard({ item }: { item: { type: string; title: string; body: string; time: string } }) {
  const meta = getFeedMeta(item.type);
  return (
    <View style={styles.feedCard}>
      <View style={[styles.feedIconWrap, { backgroundColor: meta.color + '18' }]}>
        <Ionicons name={meta.icon as any} size={18} color={meta.color} />
      </View>
      <View style={styles.feedCardBody}>
        <Text style={styles.feedCardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.feedCardSub} numberOfLines={2}>{item.body}</Text>
      </View>
      <Text style={styles.feedCardTime}>{getRelTime(item.time)}</Text>
    </View>
  );
}

function EmptyFeed() {
  return (
    <View style={styles.emptyFeed}>
      <Ionicons name="pulse-outline" size={32} color="rgba(255,255,255,0.15)" />
      <Text style={styles.emptyFeedText}>No activity yet</Text>
      <Text style={styles.emptyFeedSub}>Client updates and events will appear here</Text>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  if (!str) return '';
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function getRelTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function getFeedMeta(type: string): { icon: string; color: string } {
  switch (type) {
    case 'workout':   return { icon: 'barbell',        color: '#C8F135' };
    case 'message':   return { icon: 'chatbubble',     color: '#60A5FA' };
    case 'score':     return { icon: 'trophy',         color: '#FBBF24' };
    case 'water':     return { icon: 'water',          color: '#38BDF8' };
    case 'nutrition': return { icon: 'nutrition',      color: '#A78BFA' };
    case 'file':      return { icon: 'document-text',  color: '#94A3B8' };
    default:          return { icon: 'notifications',  color: '#E5E7EB' };
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0D12',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  greetingText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
  nameText: {
    fontFamily: FontFamily.bold,
    fontSize: 24,
    color: '#FFFFFF',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#C8F135',
  },
  badgeText: { display: 'none' },
  avatarCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#C8F135',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: FontFamily.bold,
    fontSize: 16, color: '#0D0D12',
  },

  // Stats strip
  statsStrip: {
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 4,
  },
  statPill: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    minWidth: 90,
  },
  statValue: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
  },
  statLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 28,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  seeAll: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    color: '#C8F135',
  },

  // Quick Actions — 2×4 visible grid with dividers
  quickRow: {
    marginHorizontal: 20,
    marginTop: 22,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
  },
  quickGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Horizontal divider between the two rows
  quickRowDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginHorizontal: 0,
  },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
  },
  quickIconWrap: {
    width: 50, height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(200,241,53,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(200,241,53,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: '#C8F135',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  quickLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  // Vertical divider between columns
  quickDivider: {
    width: 1,
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'center',
  },

  // Hero Banner
  heroBanner: {
    marginHorizontal: 20,
    marginTop: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroBannerInner: {
    padding: 24,
    minHeight: 170,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  glowBlob1: {
    position: 'absolute',
    width: 140, height: 140,
    borderRadius: 70,
    backgroundColor: '#C8F135',
    opacity: 0.06,
    top: -40, left: -20,
  },
  glowBlob2: {
    position: 'absolute',
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: '#7C3AED',
    opacity: 0.15,
    bottom: -30, right: 60,
  },
  heroBannerContent: { flex: 1, zIndex: 2 },
  heroBannerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200,241,53,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(200,241,53,0.3)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  heroBannerBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: 9,
    letterSpacing: 1.5,
    color: '#C8F135',
  },
  heroBannerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 22,
    color: '#FFFFFF',
    lineHeight: 28,
    marginBottom: 8,
  },
  heroBannerSub: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
    marginBottom: 16,
  },
  heroBannerCta: {
    alignSelf: 'flex-start',
    backgroundColor: '#C8F135',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  heroBannerCtaText: {
    fontFamily: FontFamily.bold,
    fontSize: 12,
    color: '#0D0D12',
  },
  heroBannerIcon: {
    position: 'absolute',
    right: 16, bottom: 16,
    opacity: 1,
    zIndex: 1,
  },

  // Client Roster Carousel
  rosterRow: {
    paddingHorizontal: 20,
    gap: 12,
  },
  clientCard: {
    width: 90,
    borderRadius: 16,
    overflow: 'hidden',
  },
  clientCardInner: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  clientAvatar: {
    width: 48, height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
    marginBottom: 8,
  },
  clientAvatarImg: {
    width: 48, height: 48, borderRadius: 24,
  },
  clientAvatarText: {
    fontFamily: FontFamily.bold,
    fontSize: 16, color: '#FFFFFF',
  },
  clientStatusDot: {
    position: 'absolute',
    top: 10, right: 10,
    width: 8, height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#141420',
  },
  clientName: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  clientStatus: {
    fontFamily: FontFamily.regular,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginTop: 2,
    textTransform: 'capitalize',
  },

  // Discover tabs
  tabRow: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 4,
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabPillActive: {
    backgroundColor: '#C8F135',
    borderColor: '#C8F135',
  },
  tabPillText: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  tabPillTextActive: {
    color: '#0D0D12',
  },

  // Feed
  feedList: {
    paddingHorizontal: 20,
    marginTop: 12,
    gap: 10,
  },
  feedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    gap: 12,
  },
  feedIconWrap: {
    width: 40, height: 40,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  feedCardBody: { flex: 1 },
  feedCardTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  feedCardSub: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  feedCardTime: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
  },

  // Empty
  emptyFeed: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyFeedText: {
    fontFamily: FontFamily.bold,
    fontSize: 15,
    color: 'rgba(255,255,255,0.25)',
  },
  emptyFeedSub: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.15)',
    textAlign: 'center',
  },
});

// ── At-Risk card styles ────────────────────────────────────────────────────────
const ar = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 4,
    borderRadius: 16,
    backgroundColor: '#16151F',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    overflow: 'hidden',
  },
  accentBar: {
    height: 3,
    backgroundColor: '#F59E0B',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  warningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    // pulsing handled by parent opacity anim in future; static for now
  },
  headerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 1,
  },
  headerSub: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  headerRight: {
    paddingLeft: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarText: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  rowInfo: {
    flex: 1,
    gap: 3,
  },
  rowName: {
    fontFamily: FontFamily.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  daysBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  daysText: {
    fontFamily: FontFamily.regular,
    fontSize: 11,
  },
  msgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(96,165,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  msgBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: '#60A5FA',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    marginTop: 4,
  },
  footerText: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
});

