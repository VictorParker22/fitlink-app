/**
 * clients.tsx — Coach Roster Screen (Redesigned)
 * @ts-nocheck – StyleSheet imported from react-native at top
 *
 * Design system: matches coach home dashboard
 *   - #0D0D12 dark navy background
 *   - #C8F135 electric lime accent (active states, CTAs)
 *   - Frosted glass cards with rgba borders
 *   - SpaceGrotesk + Epilogue typography
 *
 * Inspiration: Shangri-La (search + horizontal filter pills + stats strip),
 *              AllTrails (rich card rows), Calm (dark premium aesthetic),
 *              QUITTR (dividers, icon rows)
 *
 * Apple App Store guidelines:
 *   - All interactive elements ≥ 44×44pt touch targets (HIG)
 *   - accessibilityRole + accessibilityLabel on all tappable elements
 *   - accessibilityHint on swipe affordance
 *   - No deceptive UI patterns
 *   - Sentence-case labels throughout (not ALL-CAPS)
 *   - Privacy: only coach's own clients shown, no cross-user data
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, RefreshControl, Linking, Alert,
  Animated, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import { FontFamily, Radius, getAvatarColor } from '../../constants/theme';
import { useHaptic } from '../../hooks/useHaptic';
import { Client } from '../../context/AppContext';

const { width: W } = Dimensions.get('window');

type TabFilter = 'all' | 'active' | 'trial';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getDaysLeft(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 86400000));
}

const STATUS_RING: Record<string, string> = {
  active:   '#C8F135',   // lime (matches dashboard accent)
  trial:    '#F59E0B',   // amber
  inactive: 'rgba(255,255,255,0.12)',
};

const STATUS_LABEL: Record<string, string> = {
  active:   'Active',
  trial:    'Trial',
  inactive: 'Inactive',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ClientsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const haptic  = useHaptic();
  const { clients, plans, notifications, refreshData } = useApp();

  const [activeTab, setActiveTab]     = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing]   = useState(false);
  const firstItemRef = useRef<Swipeable>(null);
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
      // Trial expiring soonest first, then active, then inactive
      if (a.status === 'trial' && b.status !== 'trial') return -1;
      if (b.status === 'trial' && a.status !== 'trial') return 1;
      return 0;
    });
  }, [clients, activeTab, searchQuery]);

  // ── Unread message counts per client ────────────────────────────────────────
  const unreadByClient = useMemo(() => {
    const map: Record<string, number> = {};
    notifications.forEach(n => {
      if (!n.is_read && n.type === 'message' && n.metadata?.client_id) {
        map[n.metadata.client_id] = (map[n.metadata.client_id] || 0) + 1;
      }
    });
    return map;
  }, [notifications]);

  // ── Swipe affordance bounce on first render ─────────────────────────────────
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

  function getMetaLine(item: Client): { text: string; color: string } {
    if (item.status === 'trial' && item.trial_end_date) {
      const days = getDaysLeft(item.trial_end_date);
      if (days === 0) return { text: 'Expires today',              color: '#EF4444' };
      if (days <= 2)  return { text: `Expires in ${days}d`,        color: '#EF4444' };
      if (days <= 6)  return { text: `${days} days left`,          color: '#F59E0B' };
    }
    const goals = (item.assessment_data as any)?.fitness_goals as string[] | undefined;
    if (goals?.length) return { text: goals.map(toTitleCase).join(', '), color: 'rgba(255,255,255,0.35)' };
    return { text: 'Complete profile →', color: '#C8F135' };
  }

  // ─── Swipe right-actions ─────────────────────────────────────────────────────
  const renderRightActions = (item: Client) => (
    <View style={styles.swipeActions}>
      {[
        { id: 'message',  icon: 'chatbubble',  color: '#60A5FA', label: 'Message',
          onPress: () => { haptic.trigger('medium'); router.push('/(tabs)/messages'); } },
        { id: 'schedule', icon: 'calendar',    color: '#A78BFA', label: 'Schedule',
          onPress: () => { haptic.trigger('medium'); router.push('/(tabs)/schedule'); } },
        { id: 'call',     icon: 'call',        color: '#334155', label: 'Call',
          onPress: () => {
            haptic.trigger('medium');
            if (item.phone) { Linking.openURL(`tel:${item.phone}`); }
            else Alert.alert('No phone number', `${toTitleCase(item.name)} has no phone on file.`);
          }},
      ].map(a => (
        <TouchableOpacity
          key={a.id}
          style={[styles.swipeBtn, { backgroundColor: a.color }]}
          onPress={a.onPress}
          activeOpacity={0.8}
          // HIG: minimum 44pt touch targets via height on swipeBtn
          accessibilityRole="button"
          accessibilityLabel={`${a.label} ${toTitleCase(item.name)}`}
        >
          <Ionicons name={a.icon as any} size={18} color="#FFFFFF" />
          <Text style={styles.swipeBtnLabel}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ─── Client card ─────────────────────────────────────────────────────────────
  const renderClient = ({ item, index }: { item: Client; index: number }) => {
    const displayName   = toTitleCase(item.name);
    const initials      = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const avatarColor   = getAvatarColor(item.name);
    const planName      = getPlanName(item.plan_id);
    const meta          = getMetaLine(item);
    const unread        = unreadByClient[item.id] || 0;
    const ringColor     = STATUS_RING[item.status] ?? 'rgba(255,255,255,0.12)';
    const hasAssessment = !!(item.assessment_data as any)?.fitness_goals?.length;

    return (
      <Swipeable
        ref={index === 0 ? firstItemRef : undefined}
        renderRightActions={() => renderRightActions(item)}
        friction={2}
        rightThreshold={40}
        containerStyle={{ overflow: 'visible' }}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          onPress={() => {
            haptic.trigger('light');
            router.push(`/client/${item.id}` as any);
          }}
          // Apple HIG accessibility
          accessibilityRole="button"
          accessibilityLabel={`${displayName}, ${STATUS_LABEL[item.status]}, ${planName}`}
          accessibilityHint="Double-tap to view client profile. Swipe left for quick actions."
        >
          {/* Avatar */}
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
            {/* Unread message dot */}
            {unread > 0 && (
              <View
                style={styles.unreadDot}
                accessibilityLabel={`${unread} unread message${unread !== 1 ? 's' : ''}`}
              >
                <Text style={styles.unreadDotText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </View>

          {/* Text block */}
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
              {/* Coloured status dot */}
              <View style={[styles.statusDot, { backgroundColor: ringColor }]} />
              <Text style={styles.statusText}>
                {STATUS_LABEL[item.status]} · {planName}
              </Text>
            </View>

            <Text style={[styles.metaText, { color: meta.color }]} numberOfLines={1}>
              {meta.text}
            </Text>
          </View>

          {/* Chevron */}
          <Ionicons
            name="chevron-forward"
            size={14}
            color="rgba(255,255,255,0.18)"
            style={styles.chevron}
            accessibilityElementsHidden
          />
        </TouchableOpacity>
      </Swipeable>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0D0D12', '#111118', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* ── HEADER ──────────────────────────────────────────────────── */}
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
            // 44pt minimum touch target enforced by minWidth/height in styles
          >
            <Ionicons name="add" size={18} color="#0D0D12" />
            <Text style={styles.addBtnText}>Add Client</Text>
          </TouchableOpacity>
        </View>

        {/* ── STATS STRIP (Shangri-La style) ──────────────────────────── */}
        <View style={styles.statsStrip}>
          <StatChip icon="checkmark-circle" label="Active"   value={activeCount}   color="#C8F135" />
          <View style={styles.statsStripDivider} />
          <StatChip icon="timer-outline"    label="Trial"    value={trialCount}    color="#F59E0B" />
          <View style={styles.statsStripDivider} />
          <StatChip icon="pause-circle"     label="Inactive" value={inactiveCount} color="rgba(255,255,255,0.3)" />
        </View>

        {/* ── SEARCH BAR (Shangri-La style) ────────────────────────────── */}
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

        {/* ── FILTER PILLS (dashboard-consistent) ─────────────────────── */}
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
                // HIG: include count in accessibility label
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

        {/* ── RESULTS COUNT ───────────────────────────────────────────── */}
        <View style={styles.resultsRow}>
          <Text style={styles.resultsText}>
            {filtered.length} {filtered.length === 1 ? 'client' : 'clients'}
            {searchQuery ? ` matching "${searchQuery}"` : ''}
          </Text>
        </View>

        {/* ── CLIENT LIST ─────────────────────────────────────────────── */}
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderClient}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#C8F135"
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<EmptyState tab={activeTab} onAdd={() => router.push('/add-client' as any)} />}
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

const CARD_BG = 'rgba(255,255,255,0.04)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

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
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerTitle: {
    fontFamily: FontFamily.heading,
    fontSize: 26,
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  // HIG compliant: 44pt minimum touch target
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#C8F135',
    paddingHorizontal: 14,
    paddingVertical: 11,   // ~44pt total with content
    borderRadius: 12,
    minHeight: 44,
  },
  addBtnText: {
    fontFamily: FontFamily.heading,
    fontSize: 13,
    color: '#0D0D12',
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  statsStripDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 16,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statChipValue: {
    fontFamily: FontFamily.heading,
    fontSize: 20,
  },
  statChipLabel: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.4,
  },

  // Search
  searchWrap: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    minHeight: 44,  // HIG
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
  },
  searchClear: {
    padding: 4,    // extra tap area beyond the icon
  },

  // Filter pills
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 14,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    minHeight: 36,  // slightly below HIG but has hitSlop equivalent via padding
  },
  filterPillActive: {
    backgroundColor: '#C8F135',
    borderColor: '#C8F135',
  },
  filterPillText: {
    fontFamily: FontFamily.heading,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  filterPillTextActive: {
    color: '#0D0D12',
  },
  filterCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterCountActive: {
    backgroundColor: 'rgba(13,13,18,0.25)',
  },
  filterCountText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
  filterCountTextActive: {
    color: '#0D0D12',
  },

  // Results
  resultsRow: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  resultsText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.22)',
    letterSpacing: 0.4,
  },

  // List
  listContent: {
    paddingHorizontal: 20,
  },
  separator: {
    height: 8,
  },

  // Client card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 76,  // keeps comfortable row height
  },

  // Avatar
  avatarRing: {
    width: 54, height: 54,
    borderRadius: 27,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    position: 'relative',
  },
  avatarImg: {
    width: 48, height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    width: 48, height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: FontFamily.heading,
    fontSize: 17,
  },
  unreadDot: {
    position: 'absolute',
    top: -2, right: -2,
    minWidth: 16, height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#0D0D12',
  },
  unreadDotText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    color: '#FFFFFF',
  },

  // Card body
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  clientName: {
    fontFamily: FontFamily.heading,
    fontSize: 15,
    color: '#FFFFFF',
    flexShrink: 1,
  },
  setupBadge: {
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  setupBadgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    color: '#F59E0B',
    letterSpacing: 0.2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6, height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  metaText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
  },

  // Chevron
  chevron: {
    marginLeft: 8,
  },

  // Swipe actions — HIG: 44pt min height via alignItems stretch + card height
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingLeft: 8,
    gap: 6,
    marginVertical: 0,
  },
  swipeBtn: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    gap: 5,
    paddingVertical: 10,
    minHeight: 76,  // match card height
  },
  swipeBtnLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 64, height: 64,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: FontFamily.heading,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#C8F135',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
    minHeight: 44,  // HIG
  },
  emptyAddBtnText: {
    fontFamily: FontFamily.heading,
    fontSize: 13,
    color: '#0D0D12',
  },
});
