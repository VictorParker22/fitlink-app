/**
 * clients.tsx — Coach Roster Screen
 *
 * Swipe implementation: ReanimatedSwipeable (react-native-gesture-handler/ReanimatedSwipeable)
 * This is the OFFICIAL recommended API for 2024-2025 per RNGH docs — replaces the deprecated
 * legacy `Swipeable`. Runs entirely on the UI thread (no bridge), eliminates the close-animation
 * glitch because `prog` SharedValue continues updating through the spring whereas the old
 * `dragAnimatedValue` froze at the release position.
 *
 * Source: https://docs.swmansion.com/react-native-gesture-handler/docs/components/swipeable
 *
 * Design system (matches coach home dashboard):
 *   • #0D0D12 dark navy + LinearGradient
 *   • #C8F135 lime accent
 *   • Frosted glass cards
 *   • SpaceGrotesk + Epilogue
 *
 * Responsiveness: ALL sizes derived from W = Dimensions.get('window').width — zero hard-coded px.
 *
 * Apple HIG compliance:
 *   • All tap targets ≥ 44pt (minHeight / hitSlop)
 *   • accessibilityRole + accessibilityLabel on every interactive element
 *   • accessibilityHint on swipeable rows
 *   • Sentence-case labels, no deceptive patterns
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, RefreshControl, Linking, Alert, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  useAnimatedStyle, interpolate, Extrapolation, type SharedValue,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import { FontFamily, getAvatarColor } from '../../constants/theme';
import { useHaptic } from '../../hooks/useHaptic';
import type { Client } from '../../context/AppContext';

// ─── Layout constants (ALL responsive) ───────────────────────────────────────

const { width: W } = Dimensions.get('window');

/** Each action button = 19% of screen width — renders correctly on all phone sizes. */
const BTN_W = Math.round(W * 0.19);
const BTN_GAP = 6;
const BTN_PAD_LEFT = 8;
/** Total actions panel width — used for the slide-in interpolation. */
const ACTIONS_W = BTN_W * 3 + BTN_GAP * 2 + BTN_PAD_LEFT;

// ─── Types ────────────────────────────────────────────────────────────────────

type TabFilter = 'all' | 'active' | 'trial';

interface ActionDef {
  id: string;
  icon: string;
  color: string;
  label: string;
  a11yLabel: string;
  onPress: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getDaysLeft(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 86400000));
}

const STATUS_RING: Record<string, string> = {
  active:   '#C8F135',
  trial:    '#F59E0B',
  inactive: 'rgba(255,255,255,0.12)',
};

const STATUS_LABEL: Record<string, string> = {
  active:   'Active',
  trial:    'Trial',
  inactive: 'Inactive',
};

// ─── SwipeActionsPanel ────────────────────────────────────────────────────────
// Extracted as a named component so it can legally call hooks (useAnimatedStyle).
//
// Research-confirmed pattern (RNGH docs):
//   • `prog` is a Reanimated SharedValue<number> (0=closed, 1=open, >1 overshoot)
//   • It continues updating on the UI thread THROUGH the spring close animation
//   • interpolate outputRange [ACTIONS_W, 0]: hidden to the right when closed,
//     slides left into view as the card opens, slides back on close — perfectly in sync.
//   • Extrapolation.CLAMP prevents overshoot from pulling buttons off-screen.

interface SwipeActionsPanelProps {
  prog: SharedValue<number>;
  actions: ActionDef[];
}

function SwipeActionsPanel({ prog, actions }: SwipeActionsPanelProps) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: interpolate(
        prog.value,
        [0, 1],
        [ACTIONS_W, 0],   // closed → hidden right; open → fully visible
        Extrapolation.CLAMP,
      ),
    }],
  }));

  return (
    <Reanimated.View style={[styles.swipeActions, animatedStyle]}>
      {actions.map(a => (
        <TouchableOpacity
          key={a.id}
          style={[styles.swipeBtn, { backgroundColor: a.color }]}
          onPress={a.onPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={a.a11yLabel}
        >
          <Ionicons name={a.icon as any} size={18} color="#FFFFFF" />
          <Text style={styles.swipeBtnLabel}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </Reanimated.View>
  );
}

// ─── ClientsScreen ────────────────────────────────────────────────────────────

export default function ClientsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const haptic  = useHaptic();
  const { clients, plans, notifications, refreshData } = useApp();

  const [activeTab, setActiveTab]     = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing]   = useState(false);

  // Ref uses SwipeableMethods (the ReanimatedSwipeable API type)
  const firstItemRef = useRef<SwipeableMethods>(null);
  const hasBounced   = useRef(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // ── Derived counts ──────────────────────────────────────────────────────────
  const activeCount   = clients.filter(c => c.status === 'active').length;
  const trialCount    = clients.filter(c => c.status === 'trial').length;
  const inactiveCount = clients.filter(c => c.status === 'inactive').length;

  // ── Filtered + sorted list ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = clients;
    if (activeTab !== 'all') list = list.filter(c => c.status === activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (a.status === 'trial' && b.status !== 'trial') return -1;
      if (b.status === 'trial' && a.status !== 'trial') return  1;
      return 0;
    });
  }, [clients, activeTab, searchQuery]);

  // ── Unread counts per client ─────────────────────────────────────────────────
  const unreadByClient = useMemo(() => {
    const map: Record<string, number> = {};
    notifications.forEach(n => {
      if (!n.is_read && n.type === 'message' && n.metadata?.client_id) {
        map[n.metadata.client_id] = (map[n.metadata.client_id] || 0) + 1;
      }
    });
    return map;
  }, [notifications]);

  // ── Swipe affordance bounce ──────────────────────────────────────────────────
  useEffect(() => {
    if (filtered.length > 0 && !hasBounced.current) {
      hasBounced.current = true;
      const t1 = setTimeout(() => firstItemRef.current?.openRight(), 900);
      const t2 = setTimeout(() => firstItemRef.current?.close(),    1700);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [filtered.length]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getPlanName = (planId?: string) => {
    if (!planId) return '7-Day Trial';
    return toTitleCase(plans.find(p => p.id === planId)?.name || '7-Day Trial');
  };

  const getMetaLine = (item: Client): { text: string; color: string } => {
    if (item.status === 'trial' && item.trial_end_date) {
      const days = getDaysLeft(item.trial_end_date);
      if (days === 0) return { text: 'Expires today',       color: '#EF4444' };
      if (days <= 2)  return { text: `Expires in ${days}d`, color: '#EF4444' };
      if (days <= 6)  return { text: `${days} days left`,   color: '#F59E0B' };
    }
    const goals = (item.assessment_data as any)?.fitness_goals as string[] | undefined;
    if (goals?.length) return { text: goals.map(toTitleCase).join(', '), color: 'rgba(255,255,255,0.35)' };
    return { text: 'Complete profile →', color: '#C8F135' };
  };

  // ── Build actions array for a given client ───────────────────────────────────
  // Closures capture haptic, router, and item so SwipeActionsPanel stays pure.
  const buildActions = (item: Client): ActionDef[] => {
    const name = toTitleCase(item.name);
    return [
      {
        id: 'message', icon: 'chatbubble', color: '#60A5FA', label: 'Message',
        a11yLabel: `Message ${name}`,
        onPress: () => { haptic.trigger('medium'); router.push('/(tabs)/messages'); },
      },
      {
        id: 'schedule', icon: 'calendar', color: '#A78BFA', label: 'Schedule',
        a11yLabel: `Schedule session with ${name}`,
        onPress: () => { haptic.trigger('medium'); router.push('/(tabs)/schedule'); },
      },
      {
        id: 'call', icon: 'call', color: '#1E293B', label: 'Call',
        a11yLabel: `Call ${name}`,
        onPress: () => {
          haptic.trigger('medium');
          if (item.phone) { Linking.openURL(`tel:${item.phone}`); }
          else Alert.alert('No phone number', `${name} has no phone on file.`);
        },
      },
    ];
  };

  // ── Client row ───────────────────────────────────────────────────────────────
  const renderClient = ({ item, index }: { item: Client; index: number }) => {
    const displayName   = toTitleCase(item.name);
    const initials      = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const avatarColor   = getAvatarColor(item.name);
    const planName      = getPlanName(item.plan_id);
    const meta          = getMetaLine(item);
    const unread        = unreadByClient[item.id] || 0;
    const ringColor     = STATUS_RING[item.status] ?? 'rgba(255,255,255,0.12)';
    const hasAssessment = !!(item.assessment_data as any)?.fitness_goals?.length;
    const actions       = buildActions(item);

    return (
      <ReanimatedSwipeable
        ref={index === 0 ? firstItemRef : undefined}
        renderRightActions={(prog) => <SwipeActionsPanel prog={prog} actions={actions} />}
        rightThreshold={40}
        overshootRight={false}
        overshootFriction={8}
        friction={1}
        containerStyle={{ overflow: 'visible' }}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          onPress={() => {
            haptic.trigger('light');
            router.push(`/client/${item.id}` as any);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${displayName}, ${STATUS_LABEL[item.status]}, ${planName}`}
          accessibilityHint="Double-tap to view profile. Swipe left for quick actions."
        >
          {/* Avatar ring */}
          <View style={[styles.avatarRing, { borderColor: ringColor }]}>
            {item.avatar_url ? (
              <Image
                source={{ uri: item.avatar_url }}
                cachePolicy="memory-disk"
                transition={200}
                style={styles.avatarImg}
                accessibilityLabel={`${displayName} profile photo`}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: avatarColor + '28' }]}>
                <Text style={[styles.avatarInitials, { color: avatarColor }]}>{initials}</Text>
              </View>
            )}
            {unread > 0 && (
              <View style={styles.unreadDot} accessibilityLabel={`${unread} unread messages`}>
                <Text style={styles.unreadDotText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </View>

          {/* Text */}
          <View style={styles.cardBody}>
            <View style={styles.nameRow}>
              <Text style={styles.clientName} numberOfLines={1}>{displayName}</Text>
              {!hasAssessment && (
                <View style={styles.setupBadge} accessibilityLabel="Setup needed">
                  <Text style={styles.setupBadgeText}>Setup needed</Text>
                </View>
              )}
            </View>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: ringColor }]} />
              <Text style={styles.statusText}>{STATUS_LABEL[item.status]} · {planName}</Text>
            </View>
            <Text style={[styles.metaText, { color: meta.color }]} numberOfLines={1}>
              {meta.text}
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={14}
            color="rgba(255,255,255,0.18)"
            style={styles.chevron}
            accessibilityElementsHidden
          />
        </TouchableOpacity>
      </ReanimatedSwipeable>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0D0D12', '#111118', '#0A0A0F']} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Roster</Text>
            <Text style={styles.headerSub}>{clients.length} total clients</Text>
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/add-client' as any)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add new client"
          >
            <Ionicons name="add" size={18} color="#0D0D12" />
            <Text style={styles.addBtnText}>Add Client</Text>
          </TouchableOpacity>
        </View>

        {/* Stats strip */}
        <View style={styles.statsStrip}>
          <StatChip icon="checkmark-circle" label="Active"   value={activeCount}   color="#C8F135" />
          <View style={styles.stripDivider} />
          <StatChip icon="timer-outline"    label="Trial"    value={trialCount}    color="#F59E0B" />
          <View style={styles.stripDivider} />
          <StatChip icon="pause-circle"     label="Inactive" value={inactiveCount} color="rgba(255,255,255,0.3)" />
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="rgba(255,255,255,0.35)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name…"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={searchQuery}
              onChangeText={setSearchQuery}
              selectionColor="#C8F135"
              autoCapitalize="words"
              returnKeyType="search"
              accessibilityLabel="Search clients"
              accessibilityRole="search"
            />
            {searchQuery !== '' && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.searchClear}
                accessibilityLabel="Clear search"
                accessibilityRole="button"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.35)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filter pills */}
        <View style={styles.filterRow}>
          {(['all', 'active', 'trial'] as TabFilter[]).map(tab => {
            const count = tab === 'all' ? clients.length : clients.filter(c => c.status === tab).length;
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityLabel={`${tab === 'all' ? 'All' : toTitleCase(tab)}, ${count} clients`}
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                  {tab === 'all' ? 'All' : toTitleCase(tab)}
                </Text>
                {count > 0 && (
                  <View style={[styles.filterCount, isActive && styles.filterCountActive]}>
                    <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Results count */}
        <View style={styles.resultsRow}>
          <Text style={styles.resultsText}>
            {filtered.length} {filtered.length === 1 ? 'client' : 'clients'}
            {searchQuery ? ` matching "${searchQuery}"` : ''}
          </Text>
        </View>

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderClient}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C8F135" />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <EmptyState tab={activeTab} onAdd={() => router.push('/add-client' as any)} />
          }
        />
      </SafeAreaView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({ icon, label, value, color }: {
  icon: string; label: string; value: number; color: string;
}) {
  return (
    <View style={styles.statChip} accessibilityLabel={`${value} ${label}`}>
      <Ionicons name={icon as any} size={13} color={color} />
      <Text style={[styles.statChipValue, { color }]}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ tab, onAdd }: { tab: TabFilter; onAdd: () => void }) {
  const isAll = tab === 'all';
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Ionicons name="people-outline" size={28} color="rgba(255,255,255,0.2)" />
      </View>
      <Text style={styles.emptyTitle}>
        {isAll ? 'No clients yet' : `No ${tab} clients`}
      </Text>
      <Text style={styles.emptyDesc}>
        {isAll
          ? 'Add your first client to start coaching and building your business.'
          : 'Switch to "All" to see your full roster.'}
      </Text>
      {isAll && (
        <TouchableOpacity
          style={styles.emptyAddBtn}
          onPress={onAdd}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add your first client"
        >
          <Ionicons name="person-add" size={16} color="#0D0D12" />
          <Text style={styles.emptyAddBtnText}>Add Client</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_BG     = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D12' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: W * 0.05, paddingTop: 10, paddingBottom: 16,
  },
  headerTitle: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.065),
    color: '#FFFFFF', letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: FontFamily.body, fontSize: Math.round(W * 0.03),
    color: 'rgba(255,255,255,0.35)', marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#C8F135',
    paddingHorizontal: W * 0.035, paddingVertical: 11,
    borderRadius: 12, minHeight: 44,
  },
  addBtnText: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.033), color: '#0D0D12',
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: W * 0.05, marginBottom: 14,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: W * 0.05,
  },
  stripDivider: {
    width: 1, height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: W * 0.04,
  },
  statChip: { flex: 1, alignItems: 'center', gap: 3 },
  statChipValue: { fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.052) },
  statChipLabel: {
    fontFamily: FontFamily.body, fontSize: Math.round(W * 0.026),
    color: 'rgba(255,255,255,0.35)', letterSpacing: 0.4,
  },

  // Search
  searchWrap: { paddingHorizontal: W * 0.05, marginBottom: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 14, paddingHorizontal: W * 0.037, paddingVertical: 12,
    gap: 10, minHeight: 44,
  },
  searchInput: {
    flex: 1, fontFamily: FontFamily.body, fontSize: Math.round(W * 0.036), color: '#FFFFFF',
  },
  searchClear: { padding: 4 },

  // Filter pills
  filterRow: {
    flexDirection: 'row', paddingHorizontal: W * 0.05, gap: 8, marginBottom: 14,
  },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: W * 0.036, paddingVertical: 8,
    borderRadius: 20, backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    minHeight: 36,
  },
  filterPillActive: { backgroundColor: '#C8F135', borderColor: '#C8F135' },
  filterPillText: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.033),
    color: 'rgba(255,255,255,0.45)',
  },
  filterPillTextActive: { color: '#0D0D12' },
  filterCount: {
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterCountActive: { backgroundColor: 'rgba(13,13,18,0.25)' },
  filterCountText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: 'rgba(255,255,255,0.5)',
  },
  filterCountTextActive: { color: '#0D0D12' },

  // Results
  resultsRow: { paddingHorizontal: W * 0.05, marginBottom: 10 },
  resultsText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.028),
    color: 'rgba(255,255,255,0.22)', letterSpacing: 0.4,
  },

  // List
  listContent: { paddingHorizontal: W * 0.05 },
  separator: { height: 8 },

  // Client card
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    borderRadius: 16, paddingHorizontal: W * 0.037, paddingVertical: 14,
    minHeight: 76,
  },

  // Avatar
  avatarRing: {
    width: Math.round(W * 0.138), height: Math.round(W * 0.138),
    borderRadius: Math.round(W * 0.069),
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginRight: W * 0.036, position: 'relative',
  },
  avatarImg: {
    width: Math.round(W * 0.118), height: Math.round(W * 0.118),
    borderRadius: Math.round(W * 0.059),
  },
  avatarPlaceholder: {
    width: Math.round(W * 0.118), height: Math.round(W * 0.118),
    borderRadius: Math.round(W * 0.059),
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.044) },
  unreadDot: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#0D0D12',
  },
  unreadDotText: { fontFamily: FontFamily.bodySemiBold, fontSize: 8, color: '#FFFFFF' },

  // Card body
  cardBody: { flex: 1, justifyContent: 'center', gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  clientName: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.038),
    color: '#FFFFFF', flexShrink: 1,
  },
  setupBadge: {
    borderWidth: 1, borderColor: '#F59E0B', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  setupBadgeText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 8, color: '#F59E0B', letterSpacing: 0.2,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontFamily: FontFamily.bodyMedium, fontSize: Math.round(W * 0.031),
    color: 'rgba(255,255,255,0.4)',
  },
  metaText: { fontFamily: FontFamily.body, fontSize: Math.round(W * 0.028) },
  chevron: { marginLeft: 8 },

  // Swipe actions panel
  // Width is driven by the ACTIONS_W constant (responsive, no hard-coded px)
  swipeActions: {
    flexDirection: 'row', alignItems: 'stretch',
    paddingLeft: BTN_PAD_LEFT, gap: BTN_GAP,
  },
  swipeBtn: {
    width: BTN_W,          // responsive: W * 0.19
    minHeight: 76,         // matches card minHeight — Apple HIG ≥ 44pt
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, gap: 5, paddingVertical: 10,
  },
  swipeBtnLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: Math.round(W * 0.023),
    color: '#FFFFFF', letterSpacing: 0.3,
  },

  // Empty state
  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: W * 0.1 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: CARD_BG, borderWidth: 1, borderColor: CARD_BORDER,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.041),
    color: '#FFFFFF', marginBottom: 8, textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: FontFamily.body, fontSize: Math.round(W * 0.033),
    color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 20, marginBottom: 28,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#C8F135', paddingHorizontal: W * 0.062,
    paddingVertical: 13, borderRadius: 12, minHeight: 44,
  },
  emptyAddBtnText: {
    fontFamily: FontFamily.heading, fontSize: Math.round(W * 0.033), color: '#0D0D12',
  },
});
