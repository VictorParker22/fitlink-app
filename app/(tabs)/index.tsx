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

  const [discoverTab, setDiscoverTab] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

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

  // Clients needing attention (sorted by last check-in)
  const attentionClients = useMemo(() =>
    [...activeClients].slice(0, 8), [activeClients]);

  // Activity feed items
  const feedItems = useMemo(() => {
    const base = notifications.slice(0, 8).map(n => ({
      id: n.id,
      type: n.type,
      title: n.title || 'Update',
      body: n.body || '',
      time: n.created_at,
    }));
    return base;
  }, [notifications, discoverTab]);

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

        {/* ── QUICK ACTIONS — QUITTR style divider row ────────────── */}
        <View style={styles.quickRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRowInner}
          >
            {QUICK_ACTIONS.map((a, index) => (
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
                {/* Vertical divider between items, not after last */}
                {index < QUICK_ACTIONS.length - 1 && (
                  <View style={styles.quickDivider} />
                )}
              </React.Fragment>
            ))}
          </ScrollView>
        </View>

        {/* ── HERO BANNER ─────────────────────────────────────────── */}
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
            {/* Decorative glow blobs */}
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

            {/* Right decorative icon */}
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
                <ClientCard key={c.id} client={c} />
              ))}
            </ScrollView>
          </>
        )}

        {/* ── DISCOVER FEED ───────────────────────────────────────── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Activity</Text>
        </View>

        {/* Tab pills */}
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {DISCOVER_TABS.map((t, i) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabPill, discoverTab === i && styles.tabPillActive]}
              onPress={() => setDiscoverTab(i)}
            >
              <Text style={[styles.tabPillText, discoverTab === i && styles.tabPillTextActive]}>
                {t}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Feed cards */}
        <View style={styles.feedList}>
          {feedItems.length === 0 ? (
            <EmptyFeed />
          ) : (
            feedItems.map(item => (
              <FeedCard key={item.id} item={item} />
            ))
          )}
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function ClientCard({ client }: { client: Client }) {
  const router = useRouter();
  const initials = client.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const statusColor = client.status === 'trial' ? '#F59E0B' : client.status === 'active' ? '#22C55E' : '#6B7280';

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
        {/* Avatar */}
        <View style={[styles.clientAvatar, { borderColor: statusColor + '60' }]}>
          {client.avatar_url ? (
            <Image source={{ uri: client.avatar_url }} style={styles.clientAvatarImg} />
          ) : (
            <Text style={styles.clientAvatarText}>{initials}</Text>
          )}
        </View>
        <View style={[styles.clientStatusDot, { backgroundColor: statusColor }]} />
        <Text style={styles.clientName} numberOfLines={1}>{client.name}</Text>
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

  // Quick Actions — QUITTR divider row
  quickRow: {
    marginHorizontal: 20,
    marginTop: 22,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
  },
  quickRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  quickItem: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  quickIconWrap: {
    width: 50, height: 50,
    borderRadius: 25,
    // Subtle lime glow ring
    backgroundColor: 'rgba(200,241,53,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(200,241,53,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    // Inner shadow feel
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
  // Vertical divider between quick action items
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
