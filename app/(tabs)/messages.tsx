import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

interface Conversation {
  id: string;
  trainer_id: string;
  client_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  clients?: { name: string; avatar_url?: string };
}

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { clients } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*, clients(name, avatar_url)')
      .order('last_message_at', { ascending: false });
    if (data) setConversations(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  }, [fetchConversations]);

  const startConversation = async (clientId: string) => {
    const existing = conversations.find((c) => c.client_id === clientId);
    if (existing) {
      router.push(`/chat/${existing.id}` as any);
      return;
    }
    const { data, error } = await supabase
      .from('conversations')
      .insert({ trainer_id: user!.id, client_id: clientId })
      .select()
      .single();
    if (!error && data) {
      router.push(`/chat/${data.id}` as any);
    }
  };

  const filtered = conversations.filter((c) => {
    const name = c.clients?.name || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const connectedIds = new Set(conversations.map((c) => c.client_id));
  const unconnectedClients = clients.filter((c) => !connectedIds.has(c.id) && c.status !== 'inactive');

  const formatTime = (ts: string | null) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconBox}>
        <Ionicons name="chatbubble-outline" size={28} color={colors.textSecondary} />
      </View>
      <Text style={styles.emptyTitle}>NO CONVERSATIONS YET</Text>
      <Text style={styles.emptyText}>Start a direct message channel with one of your clients below.</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>MESSAGES</Text>
          <Text style={styles.subtitle}>{conversations.length} ACTIVE CHANNEL{conversations.length !== 1 ? 'S' : ''}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="SEARCH CLIENT CHANNELS..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          accessibilityRole="search"
          accessibilityLabel="Search conversations"
        />
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
          ListHeaderComponent={filtered.length === 0 && unconnectedClients.length === 0 ? renderEmptyState() : null}
          renderItem={({ item: conv }) => (
            <TouchableOpacity
              style={styles.convItem}
              activeOpacity={0.7}
              onPress={() => router.push(`/chat/${conv.id}` as any)}
              accessibilityRole="button"
              accessibilityLabel={`Open conversation with ${conv.clients?.name || 'Unknown'}${conv.unread_count > 0 ? `, ${conv.unread_count} unread messages` : ''}`}
            >
              <Avatar name={conv.clients?.name || '?'} size="md" imageUrl={conv.clients?.avatar_url} />
              <View style={styles.convContent}>
                <View style={styles.convTop}>
                  <Text style={styles.convName} numberOfLines={1}>{conv.clients?.name || 'Unknown'}</Text>
                  <Text style={styles.convTime}>{formatTime(conv.last_message_at).toUpperCase()}</Text>
                </View>
                <Text style={styles.convPreview} numberOfLines={1}>
                  {conv.last_message || 'No messages yet...'}
                </Text>
              </View>
              {conv.unread_count > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{conv.unread_count}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={
            unconnectedClients.length > 0 ? (
              <View style={styles.quickStartSection}>
                <Text style={styles.sectionTitle}>NEW DIRECT CHANNEL</Text>
                {unconnectedClients.slice(0, 8).map((client) => (
                  <TouchableOpacity
                    key={client.id}
                    style={styles.qsItem}
                    activeOpacity={0.7}
                    onPress={() => startConversation(client.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Start conversation with ${client.name}`}
                  >
                    <Avatar name={client.name} size="sm" imageUrl={client.avatar_url} />
                    <Text style={styles.qsName}>{client.name}</Text>
                    <View style={styles.qsActionBtn}>
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textPrimary} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 2, letterSpacing: 0.8 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: Radius.xs, marginHorizontal: Spacing.lg, marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md, height: 42,
  },
  searchInput: { flex: 1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary, paddingVertical: 0, letterSpacing: 0.3 },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  convItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  convContent: { flex: 1 },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { fontFamily: FontFamily.bodyBold, fontSize: FontSize.md, color: colors.textPrimary, flex: 1, marginRight: 8 },
  convTime: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, letterSpacing: 0.5 },
  convPreview: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 3 },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: Radius.xs,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: Colors.white },
  separator: { height: 1, backgroundColor: colors.border },

  quickStartSection: { marginTop: Spacing.xl, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  sectionTitle: { fontFamily: FontFamily.heading, fontSize: FontSize.xs, color: colors.textSecondary, marginBottom: Spacing.md, letterSpacing: 1 },
  qsItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  qsName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary, flex: 1 },
  qsActionBtn: {
    width: 28, height: 28, borderRadius: Radius.xs, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgElevated
  },

  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing['3xl'], gap: Spacing.sm },
  emptyIconBox: {
    width: 56, height: 56, borderRadius: Radius.xs,
    borderWidth: 1, borderColor: colors.borderStrong, borderStyle: 'dashed',
    backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  emptyTitle: { fontFamily: FontFamily.heading, fontSize: FontSize.md, color: colors.textPrimary, letterSpacing: 0.5 },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: Spacing.lg },
});
