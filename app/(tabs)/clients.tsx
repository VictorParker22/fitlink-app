import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

type StatusFilter = 'all' | 'active' | 'trial' | 'inactive';

export default function ClientsScreen() {
  const router = useRouter();
  const { clients, refreshData } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const filtered = useMemo(() => {
    let list = clients;
    if (statusFilter !== 'all') {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      );
    }
    return list;
  }, [clients, search, statusFilter]);

  const statusColors: Record<string, string> = {
    active: Colors.green,
    trial: Colors.yellow,
    inactive: Colors.textTertiary,
  };

  const filters: { label: string; value: StatusFilter; count: number }[] = [
    { label: 'All', value: 'all', count: clients.length },
    { label: 'Active', value: 'active', count: clients.filter((c) => c.status === 'active').length },
    { label: 'Trial', value: 'trial', count: clients.filter((c) => c.status === 'trial').length },
    { label: 'Inactive', value: 'inactive', count: clients.filter((c) => c.status === 'inactive').length },
  ];

  const renderClient = ({ item }: { item: typeof clients[0] }) => (
    <TouchableOpacity
      style={styles.clientCard}
      activeOpacity={0.7}
      onPress={() => router.push(`/client/${item.id}` as any)}
    >
      <Avatar name={item.name} size="md" />
      <View style={styles.clientInfo}>
        <Text style={styles.clientName}>{item.name}</Text>
        <Text style={styles.clientMeta}>
          {item.email || item.phone || 'No contact info'}
        </Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] || Colors.textTertiary }]} />
      <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Clients</Text>
          <Text style={styles.subtitle}>{clients.length} total</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} activeOpacity={0.8} onPress={() => router.push('/add-client' as any)}>
          <Ionicons name="person-add" size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients..."
          placeholderTextColor={Colors.textTertiary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status Filters */}
      <View style={styles.filters}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.value)}
          >
            <Text style={[styles.filterText, statusFilter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
            <Text style={[styles.filterCount, statusFilter === f.value && styles.filterCountActive]}>
              {f.count}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Client List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderClient}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color={Colors.textTertiary} />
            <Text style={styles.emptyTitle}>
              {search ? 'No results' : 'No clients yet'}
            </Text>
            <Text style={styles.emptyText}>
              {search ? 'Try a different search' : 'Tap + to add your first client'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.md, marginHorizontal: Spacing.lg, marginVertical: Spacing.md,
    paddingHorizontal: Spacing.md, height: 42,
  },
  searchInput: {
    flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.base,
    color: Colors.textPrimary, paddingVertical: 0,
  },

  filters: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full, backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.accentSoft, borderColor: 'rgba(255,95,59,0.3)',
  },
  filterText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent },
  filterCount: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary },
  filterCountActive: { color: Colors.accent },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  clientCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  clientInfo: { flex: 1 },
  clientName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  clientMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  separator: { height: 1, backgroundColor: Colors.border },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
