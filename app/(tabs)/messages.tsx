import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator, Switch, Modal, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { loadSnapshot, saveSnapshot } from '../../lib/offlineCache';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

interface Conversation {
  id: string;
  trainer_id: string;
  client_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  clients?: { name: string; avatar_url?: string };
}

// Longest-waiting-first is the sort signal this screen is built around. The
// data model only exposes `unread_count` + `last_message_at` per
// conversation (no per-message "answered" flag), so "waiting time" is
// approximated as: unread conversations, oldest last_message_at first. That
// holds as long as unread_count only clears on open (see loadMessages in
// chat/[id].tsx) — a true "time since last unanswered client message" would
// need a dedicated timestamp captured server-side.
const WAITING_WARN_MS = 12 * 60 * 60 * 1000; // 12h+ waiting gets the warning color

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
}

function formatShort(ts: string | null) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLong(ts: string | null) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { clients } = useApp();
  const { showAlert } = useAlert();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [showComposePicker, setShowComposePicker] = useState(false);

  const fetchConversations = useCallback(async () => {
    // No session yet — nothing to scope the query to, so don't run it. Clear
    // the loading gate so the empty state shows rather than a spinner forever.
    if (!user?.id) { setLoading(false); return; }
    // DEFENCE IN DEPTH — do not delete this as redundant.
    //
    // RLS on `conversations` is still the real gate; this predicate cannot
    // replace it and is not trying to. But this query had NO owner filter at
    // all, so 100% of the ACL lived in one policy, and the result is written
    // straight to plain-AsyncStorage disk cache below. A single policy
    // regression would therefore not just leak another coach's inbox, it would
    // persist it on this device. `trainers.id` IS `auth.uid()` (INVARIANTS §1),
    // so the coach's own user id is the correct value for `trainer_id`.
    const { data } = await supabase
      .from('conversations')
      .select('*, clients(name, avatar_url)')
      .eq('trainer_id', user.id)
      .order('last_message_at', { ascending: false });
    if (data) {
      setConversations(data);
      saveSnapshot(user?.id, 'conversations', data);
    }
    setLoading(false);
  }, [user?.id]);

  // Hydrate from the offline snapshot first so the inbox renders instantly
  // (and in airplane mode), then let the network fetch replace it silently.
  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    loadSnapshot<Conversation[]>(user.id, 'conversations').then((snap) => {
      if (mounted && snap?.length) {
        setConversations((prev) => (prev.length ? prev : snap));
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [user?.id]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  const startConversation = async (clientId: string) => {
    // The compose picker is a native Modal — it must finish dismissing
    // before we navigate, or the pushed screen ends up underneath it and
    // the app appears frozen. Same fix as create-plan's content picker.
    const wasPickerOpen = showComposePicker;
    setShowComposePicker(false);
    const navigate = (convId: string) => {
      const push = () => router.push(`/chat/${convId}` as any);
      if (wasPickerOpen) setTimeout(push, 350); else push();
    };

    const existing = conversations.find((c) => c.client_id === clientId);
    if (existing) {
      navigate(existing.id);
      return;
    }
    const { data, error } = await supabase
      .from('conversations')
      .insert({ trainer_id: user!.id, client_id: clientId })
      .select()
      .single();
    if (error || !data) {
      // Without this the picker just closed and nothing happened — the coach
      // had no way to know the conversation was never created.
      showAlert({ type: 'error', title: 'Could not start the chat', message: error?.message || 'Please try again.' });
      return;
    }
    navigate(data.id);
  };

  const matchesSearch = useCallback((name: string) => name.toLowerCase().includes(search.toLowerCase()), [search]);

  // Waiting on you: unread conversations, longest-waiting first.
  const waiting = useMemo(() => conversations
    .filter((c) => c.unread_count > 0 && matchesSearch(c.clients?.name || ''))
    .sort((a, b) => new Date(a.last_message_at || 0).getTime() - new Date(b.last_message_at || 0).getTime()),
    [conversations, matchesSearch]);

  // Earlier: everything already answered, most recent first.
  const earlier = useMemo(() => conversations
    .filter((c) => c.unread_count === 0 && matchesSearch(c.clients?.name || ''))
    .sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()),
    [conversations, matchesSearch]);

  const connectedIds = new Set(conversations.map((c) => c.client_id));
  const unconnectedClients = clients.filter((c) => !connectedIds.has(c.id) && c.status !== 'inactive');
  const composeClients = useMemo(
    () => [...clients].filter((c) => c.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
  const oldestWaiting = waiting[0]?.last_message_at || null;

  const isFullyEmpty = conversations.length === 0 && unconnectedClients.length === 0;

  // Only gate when there is truly nothing to show — cached conversations
  // render immediately while the fetch refreshes in the background.
  if (loading && conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={CoachColors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isFullyEmpty) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.emptyScroll, { paddingBottom: insets.bottom + 130 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} colors={[CoachColors.accent]} />}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Messages</Text>
            <Text style={styles.subtitle}>Nothing waiting on you</Text>
          </View>

          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardTitle}>Every athlete gets a thread</Text>
            <Text style={styles.emptyCardBody}>
              Add someone and their conversation opens here. You can send workouts and meal plans straight into it.
            </Text>
            <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
              style={styles.emptyCta}
              activeOpacity={0.85}
              onPress={() => router.push('/add-client' as any)}
              accessibilityRole="button"
              accessibilityLabel="Add an athlete"
            >
              <Text style={styles.emptyCtaText}>Add an athlete</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.emptySection}>
            <Text style={styles.sectionLabel}>A thread looks like this</Text>
            <View style={styles.previewThread}>
              <View style={styles.previewBubbleRight}>
                <Text style={styles.previewBubbleTextRight}>Week 1 is live — start with the lower body session.</Text>
              </View>
              <View style={styles.previewBubbleLeft}>
                <Text style={styles.previewBubbleTextLeft}>Done. Felt strong today.</Text>
              </View>
            </View>
          </View>

          <View style={styles.emptySection}>
            <View style={styles.reminderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderTitle}>Set a reply reminder</Text>
                <Text style={styles.reminderSub}>Nudge me if an athlete waits over 12 hours</Text>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={setReminderEnabled}
                trackColor={{ false: CoachColors.borderMuted, true: CoachColors.accentSoft }}
                thumbColor={reminderEnabled ? CoachColors.accent : CoachColors.textFaint}
                accessibilityRole="switch"
                accessibilityLabel="Reply reminder"
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>
            {waiting.length === 0
              ? 'All caught up'
              : `${unreadTotal} unread · oldest waiting ${formatLong(oldestWaiting)}`}
          </Text>
        </View>
        <TouchableOpacity hitSlop={3}
          style={styles.composeBadge}
          activeOpacity={0.8}
          onPress={() => setShowComposePicker(true)}
          accessibilityRole="button"
          accessibilityLabel="New message"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={19} color={CoachColors.onAccent} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <Ionicons name="search" size={17} color={CoachColors.textFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages"
          placeholderTextColor={CoachColors.textFaint}
          value={search}
          onChangeText={setSearch}
          accessibilityRole="search"
          accessibilityLabel="Search conversations"
        />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 130 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} colors={[CoachColors.accent]} />}
      >
        {waiting.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Waiting on you</Text>
            <View>
              {waiting.map((conv, i) => {
                const hours = conv.last_message_at ? (Date.now() - new Date(conv.last_message_at).getTime()) : 0;
                const timeColor = hours >= WAITING_WARN_MS ? CoachColors.warning : CoachColors.textMuted;
                return (
                  <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
                    key={conv.id}
                    style={[styles.convItem, i < waiting.length - 1 && styles.convItemBorder]}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/chat/${conv.id}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open conversation with ${conv.clients?.name || 'Unknown'}, ${conv.unread_count} unread messages`}
                  >
                    <ConvAvatar name={conv.clients?.name || '?'} imageUrl={conv.clients?.avatar_url} />
                    <View style={styles.convContent}>
                      <View style={styles.convTop}>
                        <Text style={styles.convNameStrong} numberOfLines={1}>{conv.clients?.name || 'Unknown'}</Text>
                        <Text style={[styles.convTime, { color: timeColor }]}>{formatShort(conv.last_message_at)}</Text>
                      </View>
                      <Text style={styles.convPreviewStrong} numberOfLines={1}>
                        {conv.last_message || 'No messages yet'}
                      </Text>
                    </View>
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{conv.unread_count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {earlier.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Earlier</Text>
            <View>
              {earlier.map((conv, i) => (
                <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
                  key={conv.id}
                  style={[styles.convItem, i < earlier.length - 1 && styles.convItemBorder]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/chat/${conv.id}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open conversation with ${conv.clients?.name || 'Unknown'}`}
                >
                  <ConvAvatar name={conv.clients?.name || '?'} imageUrl={conv.clients?.avatar_url} muted />
                  <View style={styles.convContent}>
                    <View style={styles.convTop}>
                      <Text style={styles.convName} numberOfLines={1}>{conv.clients?.name || 'Unknown'}</Text>
                      <Text style={styles.convTimeMuted}>{formatShort(conv.last_message_at)}</Text>
                    </View>
                    <Text style={styles.convPreview} numberOfLines={1}>
                      {conv.last_message || 'No messages yet'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {waiting.length === 0 && earlier.length === 0 && search.length > 0 && (
          <View style={styles.noMatches}>
            <Text style={styles.noMatchesText}>No conversations match "{search}"</Text>
          </View>
        )}

        {unconnectedClients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Haven't spoken yet</Text>
            <View style={styles.pillRow}>
              {unconnectedClients.slice(0, 3).map((client) => (
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }}
                  key={client.id}
                  style={styles.pill}
                  activeOpacity={0.7}
                  onPress={() => startConversation(client.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Start conversation with ${client.name}`}
                >
                  <ConvAvatar name={client.name} imageUrl={client.avatar_url} size={26} fontSize={10.5} />
                  <Text style={styles.pillName}>{client.name}</Text>
                </TouchableOpacity>
              ))}
              {unconnectedClients.length > 3 && (
                <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                  style={styles.pillMore}
                  activeOpacity={0.7}
                  onPress={() => setShowComposePicker(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`${unconnectedClients.length - 3} more athletes you haven't spoken to yet`}
                >
                  <Text style={styles.pillMoreText}>+{unconnectedClients.length - 3} more</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Compose — pick anyone to message, not just unconnected athletes */}
      <Modal visible={showComposePicker} transparent animationType="slide" onRequestClose={() => setShowComposePicker(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowComposePicker(false)} />
          {/* A Modal inherits no safe area — the sheet supplies its own bottom clearance. */}
          <View style={[styles.composeSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.composeSheetHeader}>
              <Text style={styles.composeSheetTitle}>New message</Text>
              <TouchableOpacity hitSlop={12} onPress={() => setShowComposePicker(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList keyboardShouldPersistTaps="handled"
              data={composeClients}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 420 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: client }) => (
                <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }}
                  style={styles.composeRow}
                  activeOpacity={0.7}
                  onPress={() => startConversation(client.id)}
                >
                  <ConvAvatar name={client.name} imageUrl={client.avatar_url} size={38} fontSize={13} />
                  <Text style={styles.composeRowName} numberOfLines={1}>{client.name}</Text>
                  {connectedIds.has(client.id) ? (
                    <Text style={styles.composeRowHint}>Open</Text>
                  ) : (
                    <Text style={[styles.composeRowHint, { color: CoachColors.accent }]}>Start</Text>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <Text style={{ fontFamily: CoachFonts.body, color: CoachColors.textMuted, fontSize: 14.5 }}>No athletes yet.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ConvAvatar({ name, imageUrl, size = 44, fontSize = 14, muted = false }: { name: string; imageUrl?: string; size?: number; fontSize?: number; muted?: boolean }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize, color: muted ? CoachColors.textMuted : CoachColors.textSecondary }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4,
  },
  title: { fontFamily: CoachFonts.headingBold, fontSize: 27, color: CoachColors.textPrimary, letterSpacing: -0.4 },
  subtitle: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 2 },
  composeBadge: {
    width: 38, height: 38, borderRadius: 19, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center',
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, borderCurve: 'continuous', marginHorizontal: 20, marginTop: 18, marginBottom: 6,
    paddingHorizontal: 14, height: 50,
  },
  searchInput: { flex: 1, fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textPrimary, paddingVertical: 0 },

  // paddingBottom is applied inline from the real bottom inset + tab-bar height.
  list: { paddingHorizontal: 20 },
  section: { marginTop: 20 },
  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 6,
  },

  convItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  convItemBorder: { borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted },
  convContent: { flex: 1, minWidth: 0 },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  convNameStrong: { fontFamily: CoachFonts.bodyBold, fontSize: 16, color: CoachColors.textPrimary, flex: 1 },
  convName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textSecondary, flex: 1 },
  convTime: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13 },
  convTimeMuted: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textFaint },
  convPreviewStrong: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textPrimary, marginTop: 2 },
  convPreview: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 2 },

  unreadBadge: {
    // minHeight so the unread count is not clipped at large Dynamic Type sizes.
    minWidth: 20, minHeight: 20, borderRadius: 10, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.onAccent },

  avatar: {
    backgroundColor: CoachColors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  avatarText: { fontFamily: CoachFonts.bodyBold },

  noMatches: { paddingVertical: 24, alignItems: 'center' },
  noMatchesText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textFaint },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 6, paddingRight: 13, paddingLeft: 6,
  },
  pillName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  pillMore: { justifyContent: 'center', borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 999, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 9 },
  pillMoreText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textMuted },

  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  composeSheet: {
    backgroundColor: CoachColors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: CoachColors.border, padding: 20, // paddingBottom applied inline from the real bottom inset (Modal).
  },
  composeSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  composeSheetTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary },
  composeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted,
  },
  composeRowName: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  composeRowHint: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textMuted },

  // paddingBottom is applied inline from the real bottom inset + tab-bar height.
  emptyScroll: {},
  emptyCard: {
    marginHorizontal: 20, marginTop: 24,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 16, borderCurve: 'continuous', padding: 18,
  },
  emptyCardTitle: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary },
  emptyCardBody: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, marginTop: 8, lineHeight: 21.5 },
  emptyCta: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 13, alignItems: 'center', marginTop: 16,
  },
  emptyCtaText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },

  emptySection: { marginHorizontal: 20, marginTop: 24 },
  previewThread: { gap: 8, opacity: 0.5 },
  previewBubbleRight: {
    alignSelf: 'flex-end', maxWidth: '74%',
    backgroundColor: CoachColors.border, borderRadius: 16, borderCurve: 'continuous', borderBottomRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  previewBubbleTextRight: { fontFamily: CoachFonts.body, fontSize: 14.5, lineHeight: 21.5, color: CoachColors.textSecondary },
  previewBubbleLeft: {
    alignSelf: 'flex-start', maxWidth: '74%',
    backgroundColor: CoachColors.surface, borderRadius: 16, borderCurve: 'continuous', borderBottomLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  previewBubbleTextLeft: { fontFamily: CoachFonts.body, fontSize: 14.5, lineHeight: 21.5, color: CoachColors.textSecondary },

  reminderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, borderCurve: 'continuous', padding: 15,
  },
  reminderTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  reminderSub: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 2 },
});
