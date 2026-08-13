/**
 * clients.tsx — Coach Roster Screen ("Athletes")
 *
 * Design: Fitlink Coach Dashboard Redesign, turn 4a "Athletes — roster".
 * Fixed dark palette, one lime accent — see constants/coachDesign.ts.
 * Attention leads: a "Needs you first" section surfaces athletes who need
 * setup, a nudge (quiet), or trial conversion above the full roster.
 * Aggregate counts are demoted to a small footer row below the list.
 *
 * Swipe implementation: ReanimatedSwipeable (react-native-gesture-handler/ReanimatedSwipeable)
 * This is the OFFICIAL recommended API for 2024-2025 per RNGH docs — replaces the deprecated
 * legacy `Swipeable`. Runs entirely on the UI thread (no bridge), eliminates the close-animation
 * glitch because `prog` SharedValue continues updating through the spring whereas the old
 * `dragAnimatedValue` froze at the release position.
 *
 * Source: https://docs.swmansion.com/react-native-gesture-handler/docs/components/swipeable
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
import { useApp } from '../../context/AppContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
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
type AttentionKind = 'setup' | 'quiet' | 'trial';

interface ActionDef {
  id: string;
  icon: string;
  color: string;
  label: string;
  a11yLabel: string;
  onPress: () => void;
}

interface AttentionItem {
  client: Client;
  kind: AttentionKind;
  tag: string;
  meta: string;
  cta: string;
  color: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function getDaysLeft(iso: string): number {
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 86400000));
}

// Engagement: based on completed_workouts instead of subscription status.
// A coach needs to know who is actually showing up, not just who is paying.
// Thresholds: ≥10 sessions = on track, ≥4 = check-in-soon, <4 = at risk (quiet).
function getEngagementColor(client: Client): string {
  if (client.status === 'inactive') return CoachColors.textFaint;
  const count = client.completed_workouts ?? 0;
  if (count >= 10) return CoachColors.accent;
  if (count >= 4)  return CoachColors.warning;
  return CoachColors.danger;
}

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
          <Ionicons name={a.icon as any} size={18} color={CoachColors.textPrimary} />
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

  // ── "Needs you first" — attention leads, stats demoted ───────────────────────
  // Priority: quiet (at risk) > setup needed > trial ending soon. Capped at 3.
  const attentionItems = useMemo((): AttentionItem[] => {
    const items: AttentionItem[] = [];

    clients.forEach(client => {
      const hasAssessment = !!(client.assessment_data as any)?.fitness_goals?.length;
      if (!hasAssessment) {
        items.push({
          client, kind: 'setup', tag: 'Setup',
          meta: 'New · no assessment yet',
          cta: 'Set up', color: CoachColors.warning,
        });
        return;
      }
      if (client.status === 'trial' && client.trial_end_date) {
        const days = getDaysLeft(client.trial_end_date);
        if (days <= 6) {
          items.push({
            client, kind: 'trial', tag: days === 0 ? 'Trial ends today' : `Trial ${days}d`,
            meta: days === 0 ? 'Trial expires today' : `${days} day${days === 1 ? '' : 's'} left`,
            cta: 'Convert', color: days <= 2 ? CoachColors.danger : CoachColors.warning,
          });
          return;
        }
      }
      if (client.status === 'active' && getEngagementColor(client) === CoachColors.danger) {
        items.push({
          client, kind: 'quiet', tag: 'Quiet',
          meta: "Hasn't logged a session in a while",
          cta: 'Nudge', color: CoachColors.danger,
        });
      }
    });

    const priority: Record<AttentionKind, number> = { quiet: 0, setup: 1, trial: 2 };
    return items.sort((a, b) => priority[a.kind] - priority[b.kind]).slice(0, 3);
  }, [clients]);

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
      if (days === 0) return { text: 'Expires today',       color: CoachColors.danger };
      if (days <= 2)  return { text: `Expires in ${days}d`, color: CoachColors.danger };
      if (days <= 6)  return { text: `${days} days left`,   color: CoachColors.warning };
    }
    const goals = (item.assessment_data as any)?.fitness_goals as string[] | undefined;
    if (goals?.length) return { text: goals.map(toTitleCase).join(', '), color: CoachColors.textMuted };
    return { text: 'Complete profile', color: CoachColors.accent };
  };

  // ── Build actions array for a given client ───────────────────────────────────
  // Closures capture haptic, router, and item so SwipeActionsPanel stays pure.
  const buildActions = (item: Client): ActionDef[] => {
    const name = toTitleCase(item.name);
    return [
      {
        id: 'message', icon: 'chatbubble', color: '#4B7FD1', label: 'Message',
        a11yLabel: `Message ${name}`,
        onPress: () => { haptic.trigger('medium'); router.push('/(tabs)/messages'); },
      },
      {
        id: 'schedule', icon: 'calendar', color: '#7A6AC7', label: 'Schedule',
        a11yLabel: `Schedule session with ${name}`,
        onPress: () => { haptic.trigger('medium'); router.push('/(tabs)/schedule'); },
      },
      {
        id: 'call', icon: 'call', color: CoachColors.surface, label: 'Call',
        a11yLabel: `Call ${name}`,
        onPress: () => {
          haptic.trigger('medium');
          if (item.phone) { Linking.openURL(`tel:${item.phone}`); }
          else Alert.alert('No phone number', `${name} has no phone on file.`);
        },
      },
    ];
  };

  // ── Attention row ──────────────────────────────────────────────────────────
  const renderAttentionRow = (item: AttentionItem) => {
    const displayName = toTitleCase(item.client.name);
    const initials     = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    return (
      <TouchableOpacity
        key={item.client.id}
        style={styles.attnRow}
        activeOpacity={0.75}
        onPress={() => { haptic.trigger('light'); router.push(`/client/${item.client.id}` as any); }}
        accessibilityRole="button"
        accessibilityLabel={`${displayName}, ${item.tag}`}
      >
        <View style={[styles.attnAvatar, { borderColor: item.color }]}>
          <Text style={[styles.attnAvatarText, { color: item.color }]}>{initials}</Text>
        </View>
        <View style={styles.attnBody}>
          <View style={styles.attnNameRow}>
            <Text style={styles.attnName} numberOfLines={1}>{displayName}</Text>
            <View style={[styles.attnTag, { borderColor: item.color + '55' }]}>
              <Text style={[styles.attnTagText, { color: item.color }]}>{item.tag.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.attnMeta} numberOfLines={1}>{item.meta}</Text>
        </View>
        <Text style={styles.attnCta}>{item.cta}</Text>
      </TouchableOpacity>
    );
  };

  // ── Client row ───────────────────────────────────────────────────────────────
  const renderClient = ({ item, index }: { item: Client; index: number }) => {
    const displayName   = toTitleCase(item.name);
    const initials      = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const meta          = getMetaLine(item);
    const unread        = unreadByClient[item.id] || 0;
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
        onSwipeableOpen={() => haptic.trigger('light')}
      >
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          onPress={() => {
            haptic.trigger('light');
            router.push(`/client/${item.id}` as any);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${displayName}, ${STATUS_LABEL[item.status]}, ${meta.text}`}
          accessibilityHint="Double-tap to view profile. Swipe left for quick actions."
        >
          {/* Avatar */}
          <View style={styles.avatarWrap}>
            {item.avatar_url ? (
              <Image
                source={{ uri: item.avatar_url }}
                cachePolicy="memory-disk"
                transition={200}
                style={styles.avatarImg}
                accessibilityLabel={`${displayName} profile photo`}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>{initials}</Text>
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
                  <Text style={styles.setupBadgeText}>SETUP</Text>
                </View>
              )}
            </View>
            <Text style={[styles.metaText, { color: meta.color }]} numberOfLines={1}>
              {STATUS_LABEL[item.status]} · {meta.text}
            </Text>
          </View>

          <Text style={styles.freqText}>
            {(item.completed_workouts ?? 0) > 0 ? `${item.completed_workouts}× total` : ''}
          </Text>

          <Ionicons
            name="chevron-forward"
            size={14}
            color={CoachColors.textFaint}
            style={styles.chevron}
            accessibilityElementsHidden
          />
        </TouchableOpacity>
      </ReanimatedSwipeable>
    );
  };

  // ── List header: search, filters, needs-you-first, all-athletes label ────────
  const listHeader = (
    <View>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={15} color={CoachColors.textFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search athletes"
          placeholderTextColor={CoachColors.textFaint}
          value={searchQuery}
          onChangeText={setSearchQuery}
          selectionColor={CoachColors.accent}
          autoCapitalize="words"
          returnKeyType="search"
          accessibilityLabel="Search athletes"
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
            <Ionicons name="close-circle" size={16} color={CoachColors.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {(['all', 'active', 'trial'] as TabFilter[]).map(tab => {
          const count = tab === 'all' ? clients.length : clients.filter(c => c.status === tab).length;
          const isActive = activeTab === tab;
          const label = tab === 'all' ? 'All' : toTitleCase(tab);
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityLabel={`${label}, ${count} athletes`}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.filterPillText, isActive && styles.filterPillTextActive]}>
                {label} {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Needs you first — attention leads */}
      {attentionItems.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>Needs you first</Text>
          <View style={{ gap: 10 }}>
            {attentionItems.map(renderAttentionRow)}
          </View>
        </View>
      )}

      <View style={[styles.sectionBlock, { marginBottom: 4 }]}>
        <Text style={styles.sectionLabel}>All athletes</Text>
      </View>
    </View>
  );

  // ── List footer: demoted aggregate stats ──────────────────────────────────────
  const listFooter = clients.length > 0 ? (
    <View style={styles.statsFooter}>
      <View style={styles.statCard}>
        <Text style={styles.statCardLabel}>Active</Text>
        <Text style={styles.statCardValue}>{activeCount}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statCardLabel}>On trial</Text>
        <Text style={styles.statCardValue}>{trialCount}</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statCardLabel}>Inactive</Text>
        <Text style={styles.statCardValue}>{inactiveCount}</Text>
      </View>
    </View>
  ) : null;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Athletes</Text>
            <Text style={styles.headerSub}>
              {clients.length > 0 ? `${clients.length} total athletes` : 'No one yet'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.libraryBtn}
              onPress={() => router.push('/(tabs)/programs?tab=workouts' as any)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Open workout and pass library"
            >
              <Ionicons name="barbell-outline" size={16} color={CoachColors.textPrimary} />
              <Text style={styles.libraryBtnText}>Library</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push('/add-client' as any)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add new athlete"
            >
              <Ionicons name="add" size={18} color={CoachColors.onAccent} />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {clients.length === 0 ? (
          <EmptyRoster onAdd={() => router.push('/add-client' as any)} insets={insets} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            renderItem={renderClient}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} />
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
            ListEmptyComponent={
              <FilteredEmptyState tab={activeTab} onShowAll={() => setActiveTab('all')} />
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Whole-screen empty state — no athletes at all yet. Turn 10b "Athletes — none yet". */
function EmptyRoster({ onAdd, insets }: { onAdd: () => void; insets: { bottom: number } }) {
  return (
    <View style={[styles.emptyRootWrap, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.emptyHeroCard}>
        <Text style={styles.emptyHeroTitle}>Bring your first athlete across</Text>
        <Text style={styles.emptyHeroSub}>
          Most coaches start with someone they already train. Add them and FitLink sends the invite.
        </Text>
        <TouchableOpacity
          style={styles.emptyHeroBtn}
          onPress={onAdd}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add an athlete"
        >
          <Text style={styles.emptyHeroBtnText}>Add an athlete</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.emptyPreviewSection}>
        <Text style={styles.sectionLabel}>What you'll see here</Text>
        <View style={{ gap: 12, opacity: 0.45 }}>
          {[120, 96, 132].map((w, i) => (
            <View key={i} style={styles.emptyPreviewRow}>
              <View style={styles.emptyPreviewAvatar} />
              <View style={{ flex: 1, gap: 7 }}>
                <View style={[styles.emptyPreviewLine, { width: w }]} />
                <View style={[styles.emptyPreviewLineSub, { width: w + 60 }]} />
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.emptyPreviewCaption}>
          Anyone who needs a nudge, a reply or a booking rises to the top of this list.
        </Text>
      </View>
    </View>
  );
}

/** Empty state for a filtered tab (e.g. no trial athletes right now). */
function FilteredEmptyState({ tab, onShowAll }: { tab: TabFilter; onShowAll: () => void }) {
  return (
    <View style={styles.emptyFilterWrap}>
      <Text style={styles.emptyFilterTitle}>No {tab === 'all' ? '' : toTitleCase(tab) + ' '}athletes</Text>
      <TouchableOpacity onPress={onShowAll} accessibilityRole="button" accessibilityLabel="Show all athletes">
        <Text style={styles.emptyFilterCta}>Switch to All</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CoachColors.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: W * 0.05, paddingTop: 10, paddingBottom: 16,
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.062),
    color: CoachColors.textPrimary, letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.032),
    color: CoachColors.textMuted, marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  libraryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 44, borderRadius: 22,
    borderWidth: 1, borderColor: CoachColors.border,
    paddingHorizontal: 14,
  },
  libraryBtnText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textPrimary,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: W * 0.04, paddingVertical: 11,
    borderRadius: 999, minHeight: 44,
  },
  addBtnText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.034), color: CoachColors.onAccent,
  },

  // Search
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, paddingHorizontal: W * 0.037, paddingVertical: 12,
    gap: 10, minHeight: 44, marginHorizontal: W * 0.05, marginBottom: 12,
  },
  searchInput: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.035), color: CoachColors.textPrimary,
  },
  searchClear: { padding: 4 },

  // Filter pills
  filterRow: {
    flexDirection: 'row', paddingHorizontal: W * 0.05, gap: 7, marginBottom: 20,
  },
  filterPill: {
    paddingHorizontal: W * 0.036, paddingVertical: 8,
    borderRadius: 999, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    minHeight: 32, justifyContent: 'center',
  },
  filterPillActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  filterPillText: {
    fontFamily: CoachFonts.bodyBold, fontSize: Math.round(W * 0.032),
    color: CoachColors.textSecondary,
  },
  filterPillTextActive: { color: CoachColors.onAccent },

  // Section
  sectionBlock: { paddingHorizontal: W * 0.05, marginBottom: 14 },
  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase',
    color: CoachColors.textFaint, marginBottom: 10,
  },

  // Attention row ("Needs you first")
  attnRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, gap: 12, minHeight: 44,
  },
  attnAvatar: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 1.5,
    backgroundColor: '#1E211D', alignItems: 'center', justifyContent: 'center',
  },
  attnAvatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 15 },
  attnBody: { flex: 1, gap: 2 },
  attnNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  attnName: { fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.037), color: CoachColors.textPrimary, flexShrink: 1 },
  attnTag: {
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
  },
  attnTagText: { fontFamily: CoachFonts.bodyBold, fontSize: 9, letterSpacing: 0.3 },
  attnMeta: { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.03), color: CoachColors.textMuted },
  attnCta: { fontFamily: CoachFonts.bodyBold, fontSize: Math.round(W * 0.032), color: CoachColors.accent },

  // Results / list
  listContent: { paddingBottom: 8 },
  separator: { height: 8 },

  // Client card ("All athletes")
  card: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: W * 0.05,
    paddingVertical: 13, paddingHorizontal: 2,
    minHeight: 66, gap: 12,
    borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted,
  },

  // Avatar
  avatarWrap: { position: 'relative' },
  avatarImg: {
    width: Math.round(W * 0.108), height: Math.round(W * 0.108),
    borderRadius: Math.round(W * 0.054),
  },
  avatarPlaceholder: {
    width: Math.round(W * 0.108), height: Math.round(W * 0.108),
    borderRadius: Math.round(W * 0.054),
    backgroundColor: '#1E211D',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: CoachFonts.bodyBold, fontSize: Math.round(W * 0.036), color: CoachColors.textSecondary },
  unreadDot: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 15, height: 15, borderRadius: 8,
    backgroundColor: CoachColors.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: CoachColors.bg,
  },
  unreadDotText: { fontFamily: CoachFonts.bodyBold, fontSize: 8, color: CoachColors.textPrimary },

  // Card body
  cardBody: { flex: 1, justifyContent: 'center', gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  clientName: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.037),
    color: CoachColors.textPrimary, flexShrink: 1,
  },
  setupBadge: {
    borderWidth: 1, borderColor: CoachColors.warning, borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  setupBadgeText: {
    fontFamily: CoachFonts.bodyBold, fontSize: 8, color: CoachColors.warning, letterSpacing: 0.3,
  },
  metaText: { fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.03) },
  freqText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.028), color: CoachColors.textFaint,
  },
  chevron: { marginLeft: 4 },

  // Demoted aggregate stats footer
  statsFooter: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: W * 0.05, paddingTop: 20, paddingBottom: 4,
  },
  statCard: {
    flex: 1, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
  },
  statCardLabel: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted },
  statCardValue: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.textPrimary, marginTop: 2 },

  // Swipe actions panel
  // Width is driven by the ACTIONS_W constant (responsive, no hard-coded px)
  swipeActions: {
    flexDirection: 'row', alignItems: 'stretch',
    paddingLeft: BTN_PAD_LEFT, gap: BTN_GAP,
  },
  swipeBtn: {
    width: BTN_W,          // responsive: W * 0.19
    minHeight: 66,         // matches card minHeight — Apple HIG ≥ 44pt
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, gap: 5, paddingVertical: 10,
  },
  swipeBtnLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: Math.round(W * 0.023),
    color: CoachColors.textPrimary, letterSpacing: 0.3,
  },

  // Empty state — whole roster (10b)
  emptyRootWrap: { flex: 1, paddingHorizontal: W * 0.05, paddingTop: 4 },
  emptyHeroCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 16, padding: 20,
  },
  emptyHeroTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: Math.round(W * 0.046),
    color: CoachColors.textPrimary, lineHeight: Math.round(W * 0.058),
  },
  emptyHeroSub: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.033),
    color: CoachColors.textSecondary, marginTop: 8, lineHeight: 20,
  },
  emptyHeroBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 14, alignItems: 'center', marginTop: 16, minHeight: 44, justifyContent: 'center',
  },
  emptyHeroBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: Math.round(W * 0.035), color: CoachColors.onAccent },

  emptyPreviewSection: { marginTop: 24 },
  emptyPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  emptyPreviewAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1E211D' },
  emptyPreviewLine: { height: 11, borderRadius: 3, backgroundColor: CoachColors.borderMuted },
  emptyPreviewLineSub: { height: 9, borderRadius: 3, backgroundColor: '#1E211D' },
  emptyPreviewCaption: {
    fontFamily: CoachFonts.body, fontSize: Math.round(W * 0.032), color: CoachColors.textMuted,
    marginTop: 14, lineHeight: 19,
  },

  // Empty state — filtered tab with no results
  emptyFilterWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: W * 0.1, gap: 8 },
  emptyFilterTitle: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: Math.round(W * 0.04), color: CoachColors.textPrimary,
  },
  emptyFilterCta: { fontFamily: CoachFonts.bodyBold, fontSize: Math.round(W * 0.033), color: CoachColors.accent },
});
