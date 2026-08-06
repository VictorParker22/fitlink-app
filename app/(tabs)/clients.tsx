/**
 * clients.tsx — Coach Roster Screen (Renovated)
 *
 * Changes from audit:
 * - Title-case names (no more ALL-CAPS screaming)
 * - "Setup needed" amber pill replaces red "INCOMPLETE"
 * - Color-coded avatar rings: green = active, amber = trial
 * - Unread message dot on avatar via notifications from AppContext
 * - Recency/activity metadata as 3rd line (trial expiry, goals, prompt)
 * - Swipe reveals Message + Schedule + Call (3 actions, not just call)
 * - Row chevron so coaches know rows are tappable
 * - Sentence-case throughout (search, counts, empty state)
 * - Haptic feedback: light on row tap, medium on swipe actions
 */
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, RefreshControl, Linking, Alert, Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { useApp } from '../../context/AppContext';
import { Colors, Spacing, FontFamily, Radius } from '../../constants/theme';
import { useHaptic } from '../../hooks/useHaptic';

type TabState = 'all' | 'active' | 'trial';

// ── Helpers ────────────────────────────────────────────────────────────────────
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getDaysLeft(isoDate: string): number {
  return Math.max(0, Math.round((new Date(isoDate).getTime() - Date.now()) / 86400000));
}

// ── Ring colors ────────────────────────────────────────────────────────────────
const STATUS_RING: Record<string, string> = {
  active:   '#22C55E',
  trial:    '#F59E0B',
  inactive: 'transparent',
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function ClientsScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const haptic   = useHaptic();
  const { clients, plans, sessions, notifications, refreshData } = useApp();

  const [activeTab, setActiveTab]   = useState<TabState>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing]   = useState(false);
  const firstItemRef = useRef<Swipeable>(null);
  const hasBounced   = useRef(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = clients;
    if (activeTab === 'active') list = list.filter(c => c.status === 'active');
    else if (activeTab === 'trial') list = list.filter(c => c.status === 'trial');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    // Sort: trial-expiring soonest → active recent → inactive last
    return [...list].sort((a, b) => {
      if (a.status === 'trial' && b.status !== 'trial') return -1;
      if (b.status === 'trial' && a.status !== 'trial') return  1;
      return 0;
    });
  }, [clients, activeTab, searchQuery]);

  // ── Unread notifications keyed by client_id ───────────────────────────────
  const unreadByClient = useMemo(() => {
    const map: Record<string, number> = {};
    notifications.forEach(n => {
      if (!n.is_read && n.type === 'message' && n.metadata?.client_id) {
        map[n.metadata.client_id] = (map[n.metadata.client_id] || 0) + 1;
      }
    });
    return map;
  }, [notifications]);

  // ── Affordance bounce on first item ──────────────────────────────────────
  useEffect(() => {
    if (filtered.length > 0 && !hasBounced.current) {
      hasBounced.current = true;
      const t1 = setTimeout(() => firstItemRef.current?.openRight(), 900);
      const t2 = setTimeout(() => firstItemRef.current?.close(),     1700);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [filtered.length]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getPlanName = (planId?: string) => {
    if (!planId) return '7-Day Trial';
    const plan = plans.find(p => p.id === planId);
    if (!plan) return '7-Day Trial';
    return toTitleCase(plan.name);
  };

  /**
   * 3rd line metadata — priority queue:
   * 1. Trial expiry (most urgent)
   * 2. Fitness goals (human-readable, lowercase)
   * 3. Actionable prompt to complete profile
   */
  function getMetadata(item: typeof clients[0]): { text: string; color: string } {
    if (item.status === 'trial') {
      if (item.trial_end_date) {
        const days = getDaysLeft(item.trial_end_date);
        if (days === 0)  return { text: 'Trial expires today',          color: '#EF4444' };  // 🔴 crisis
        if (days <= 2)   return { text: `Expires in ${days} day${days !== 1 ? 's' : ''}`, color: '#EF4444' };  // 🔴 urgent
        if (days <= 6)   return { text: `Trial · ${days} days left`,    color: '#F59E0B' };  // 🟡 watch
        // 7+ days → plan name only, no trial noise
        return { text: getPlanName(item.plan_id), color: 'rgba(255,255,255,0.35)' };
      }
      // No expiry date → show plan name, don't repeat "trial" endlessly
      return { text: getPlanName(item.plan_id), color: 'rgba(255,255,255,0.35)' };
    }
    const assessment = item.assessment_data as any;
    const goals: string[] = assessment?.fitness_goals || [];
    if (goals.length > 0) {
      const readable = goals.map(g => toTitleCase(g)).join(', ');
      return { text: readable, color: 'rgba(255,255,255,0.35)' };
    }
    return { text: 'Tap to complete profile →', color: '#6C9BF2' };
  }

  // ── Avatar ───────────────────────────────────────────────────────────────────
  const renderAvatar = (
    item: typeof clients[0],
    unreadCount: number,
  ) => {
    const name     = item.name;
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const ringColor = STATUS_RING[item.status] ?? 'transparent';
    const size = 52;

    return (
      <View style={styles.avatarOuter}>
        {/* Status ring */}
        <View style={[
          styles.avatarRing,
          { borderColor: ringColor, width: size + 6, height: size + 6, borderRadius: Radius.xs + 3 },
        ]}>
          {item.avatar_url ? (
            <Image
              source={{ uri: item.avatar_url }}
              cachePolicy="memory-disk"
              transition={200}
              style={{ width: size, height: size, borderRadius: Radius.xs }}
            />
          ) : (
            <View style={[styles.avatarBox, { width: size, height: size, borderRadius: Radius.xs }]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>

        {/* Unread message dot */}
        {unreadCount > 0 && (
          <View style={styles.unreadDot}>
            <Text style={styles.unreadDotText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
          </View>
        )}
      </View>
    );
  };

  // ── Swipe actions — Message, Schedule, Call ─────────────────────────────────
  const renderRightActions = (
    item: typeof clients[0],
    progress: Animated.AnimatedInterpolation<number>,
  ) => {
    const actions = [
      {
        id: 'message',
        icon: 'chatbubble',
        color: '#6C9BF2',
        label: 'Message',
        onPress: () => {
          haptic.trigger('medium');
          router.push('/(tabs)/messages');
        },
      },
      {
        id: 'schedule',
        icon: 'calendar',
        color: '#A855F7',
        label: 'Schedule',
        onPress: () => {
          haptic.trigger('medium');
          router.push('/(tabs)/schedule');
        },
      },
      {
        id: 'call',
        icon: 'call',
        color: '#334155',
        label: 'Call',
        onPress: () => {
          haptic.trigger('medium');
          if (item.phone) {
            Linking.openURL(`tel:${item.phone}`);
          } else {
            Alert.alert('No Phone Number', `${toTitleCase(item.name)} doesn't have a phone number on file.`);
          }
        },
      },
    ];

    return (
      <View style={styles.swipeActions}>
        {actions.map(action => (
          <TouchableOpacity
            key={action.id}
            style={[styles.swipeBtn, { backgroundColor: action.color }]}
            onPress={action.onPress}
            activeOpacity={0.8}
          >
            <Ionicons name={action.icon as any} size={18} color="#FFFFFF" />
            <Text style={styles.swipeBtnLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // ── Row ──────────────────────────────────────────────────────────────────────
  const renderClient = ({ item, index }: { item: typeof clients[0]; index: number }) => {
    const displayName  = toTitleCase(item.name);
    const planName     = getPlanName(item.plan_id);
    const metadata     = getMetadata(item);
    const unread       = unreadByClient[item.id] || 0;
    const assessment   = item.assessment_data as any;
    const hasAssessment = assessment?.fitness_goals?.length > 0;

    return (
      <Swipeable
        ref={index === 0 ? firstItemRef : undefined}
        renderRightActions={(progress) => renderRightActions(item, progress)}
        containerStyle={{ overflow: 'visible' }}
        friction={2}
        rightThreshold={40}
      >
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => {
            haptic.trigger('light');
            router.push(`/client/${item.id}` as any);
          }}
          accessibilityRole="button"
          accessibilityLabel={`View ${displayName}`}
        >
          {/* Avatar + ring + unread badge */}
          <View style={styles.avatarWrapper}>
            {renderAvatar(item, unread)}
          </View>

          {/* Text */}
          <View style={styles.textContainer}>
            {/* Name + "Setup needed" badge */}
            <View style={styles.nameRow}>
              <Text style={styles.rowTitle} numberOfLines={1}>{displayName}</Text>
              {!hasAssessment && (
                <View style={styles.setupBadge}>
                  <Text style={styles.setupBadgeText}>Setup needed</Text>
                </View>
              )}
            </View>

            {/* Status · Plan */}
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {item.status === 'active' ? 'Active' : item.status === 'trial' ? 'Trial' : 'Inactive'}
              {' · '}{planName}
            </Text>

            {/* Dynamic 3rd line */}
            <Text style={[styles.rowMeta, { color: metadata.color }]} numberOfLines={1}>
              {metadata.text}
            </Text>
          </View>

          {/* Tap affordance chevron */}
          <Ionicons
            name="chevron-forward"
            size={14}
            color="rgba(255,255,255,0.2)"
            style={styles.chevron}
          />
        </TouchableOpacity>
      </Swipeable>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Roster</Text>
          <TouchableOpacity
            style={styles.headerAddBtn}
            onPress={() => router.push('/add-client' as any)}
          >
            <Ionicons name="add" size={18} color="#000000" />
            <Text style={styles.headerAddText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.3)" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search roster..."
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            selectionColor="#FFFFFF"
            autoCapitalize="words"
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter tabs */}
        <View style={styles.filtersWrapper}>
          {(['all', 'active', 'trial'] as TabState[]).map(tab => {
            const count = tab === 'all'
              ? clients.length
              : clients.filter(c => c.status === tab).length;
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.toggleBtn, activeTab === tab && styles.toggleBtnActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.toggleText, activeTab === tab && styles.toggleTextActive]}>
                  {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </Text>
                {count > 0 && (
                  <View style={[styles.tabBubble, activeTab === tab && styles.tabBubbleActive]}>
                    <Text style={[styles.tabBubbleText, activeTab === tab && styles.tabBubbleTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Count label */}
        <View style={styles.resultsInfoRow}>
          <Text style={styles.resultsText}>
            {filtered.length} {filtered.length === 1 ? 'client' : 'clients'}
          </Text>
        </View>

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderClient}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 60 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="people-outline" size={24} color="rgba(255,255,255,0.3)" />
              </View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'all' ? 'No clients yet' : `No ${activeTab} clients`}
              </Text>
              <Text style={styles.emptyDesc}>
                {activeTab === 'all'
                  ? 'Add your first client to start coaching and building your business.'
                  : `Switch to "All" to see your full roster.`}
              </Text>
              {activeTab === 'all' && (
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={() => router.push('/add-client' as any)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add" size={16} color="#000" />
                  <Text style={styles.emptyAddBtnText}>Add Client</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: Radius.xs,
  },
  headerAddText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#000000',
  },

  // ── Search ──────────────────────────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
  },

  // ── Filter tabs ─────────────────────────────────────────────────────────────
  filtersWrapper: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 24,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  toggleBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#FFFFFF',
  },
  toggleText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  toggleTextActive: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  tabBubble: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBubbleActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tabBubbleText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  tabBubbleTextActive: {
    color: '#FFFFFF',
  },

  // ── Count label ─────────────────────────────────────────────────────────────
  resultsInfoRow: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  resultsText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: 0.5,
  },

  // ── List rows ───────────────────────────────────────────────────────────────
  listContent: {
    paddingHorizontal: 20,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingVertical: 2,
  },
  avatarWrapper: {
    marginRight: 14,
  },

  // ── Avatar + ring ───────────────────────────────────────────────────────────
  avatarOuter: {
    position: 'relative',
  },
  avatarRing: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBox: {
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  avatarInitials: {
    fontFamily: FontFamily.headingSemiBold,
    color: '#FFFFFF',
    fontSize: 16,
  },
  unreadDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#000000',
  },
  unreadDotText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    color: '#FFFFFF',
  },

  // ── Row text ────────────────────────────────────────────────────────────────
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 3,
  },
  rowTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
    flexShrink: 1,         // prevents badge from being pushed off-screen
  },
  rowSubtitle: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 3,
  },
  rowMeta: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15,
  },

  // ── "Setup needed" badge (replaces red "INCOMPLETE") ──────────────────────
  setupBadge: {
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    flexShrink: 0,
  },
  setupBadgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 8,
    color: '#F59E0B',
    letterSpacing: 0.3,
  },

  // ── Chevron tap affordance ──────────────────────────────────────────────────
  chevron: {
    marginLeft: 8,
  },

  // ── Swipe actions ──────────────────────────────────────────────────────────
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingLeft: 10,
    gap: 6,
  },
  swipeBtn: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.xs,
    gap: 4,
    paddingVertical: 8,
  },
  swipeBtnLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // ── Empty state ─────────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: Radius.xs,
    backgroundColor: '#0F0F0F',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
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
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24, paddingVertical: 13,
    borderRadius: Radius.xs,
  },
  emptyAddBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#000000',
  },
});
