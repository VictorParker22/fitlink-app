import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

interface Conversation {
  id: string;
  trainer_id: string;
  client_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  clients?: { name: string };
}

export default function MessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { clients } = useApp();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*, clients(name)')
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>{conversations.length} conversation{conversations.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          placeholderTextColor={Colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
          ListHeaderComponent={
            filtered.length === 0 && unconnectedClients.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="chatbubble-outline" size={32} color={Colors.accent} />
                </View>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptyText}>Start a conversation with a client</Text>
              </View>
            ) : null
          }
          renderItem={({ item: conv }) => (
            <TouchableOpacity
              style={styles.convItem}
              activeOpacity={0.7}
              onPress={() => router.push(`/chat/${conv.id}` as any)}
            >
              <Avatar name={conv.clients?.name || '?'} size="md" />
              <View style={styles.convContent}>
                <View style={styles.convTop}>
                  <Text style={styles.convName} numberOfLines={1}>{conv.clients?.name || 'Unknown'}</Text>
                  <Text style={styles.convTime}>{formatTime(conv.last_message_at)}</Text>
                </View>
                <Text style={styles.convPreview} numberOfLines={1}>
                  {conv.last_message || 'Start chatting...'}
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
                <Text style={styles.sectionTitle}>Start a conversation</Text>
                {unconnectedClients.slice(0, 8).map((client) => (
                  <TouchableOpacity
                    key={client.id}
                    style={styles.qsItem}
                    activeOpacity={0.7}
                    onPress={() => startConversation(client.id)}
                  >
                    <Avatar name={client.name} size="sm" />
                    <Text style={styles.qsName}>{client.name}</Text>
                    <Ionicons name="chatbubble" size={16} color={Colors.accent} style={{ marginLeft: 'auto' }} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.md, marginHorizontal: Spacing.lg, marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md, height: 42,
  },
  searchInput: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textPrimary, paddingVertical: 0 },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  convItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  convContent: { flex: 1 },
  convTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  convName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: Colors.textPrimary, flex: 1, marginRight: 8 },
  convTime: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  convPreview: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.white },
  separator: { height: 1, backgroundColor: Colors.border },

  quickStartSection: { marginTop: Spacing.xl, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary, marginBottom: Spacing.md },
  qsItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  qsName: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: Colors.textPrimary },

  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
