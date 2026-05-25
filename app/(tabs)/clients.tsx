import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, Image, Dimensions, Linking, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import Avatar from '../../components/Avatar';

type TabState = 'all' | 'active';

export default function ClientsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clients, plans, sessions, refreshData } = useApp();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<TabState>('all');
  const [refreshing, setRefreshing] = useState(false);
  const firstItemRef = useRef<Swipeable>(null);
  const hasBounced = useRef(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const filtered = useMemo(() => {
    let list = clients;
    if (activeTab === 'active') {
      list = list.filter((c) => c.status === 'active');
    }
    return list;
  }, [clients, activeTab]);

  useEffect(() => {
    if (filtered.length > 0 && !hasBounced.current) {
      hasBounced.current = true;
      const timer1 = setTimeout(() => {
        firstItemRef.current?.openRight();
      }, 800);
      const timer2 = setTimeout(() => {
        firstItemRef.current?.close();
      }, 1500);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [filtered.length]);

  const getPlanName = (planId?: string) => {
    if (!planId) return 'Trial Plan';
    const plan = plans.find(p => p.id === planId);
    return plan ? plan.name : 'Premium Plan';
  };

  const getClientCompletedSessions = (clientId: string) => {
    return sessions.filter(s => s.client_id === clientId && s.status === 'completed').length;
  };

  const handleCallClient = (client: typeof clients[0]) => {
    if (client.phone) {
      Linking.openURL(`tel:${client.phone}`);
    } else {
      Alert.alert('No Phone Number', `${client.name} doesn't have a phone number on file.`);
    }
  };

  const renderRightActions = (client: typeof clients[0]) => {
    return (
      <View style={styles.swipeActions}>
        <TouchableOpacity
          style={[styles.swipeBtn, { backgroundColor: '#F97316' }]}
          onPress={() => handleCallClient(client)}
        >
          <Ionicons name="call" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderClient = ({ item, index }: { item: typeof clients[0]; index: number }) => {
    return (
      <Swipeable
        ref={index === 0 ? firstItemRef : undefined}
        renderRightActions={() => renderRightActions(item)}
        containerStyle={{ overflow: 'visible' }}
        friction={2}
      >
        <TouchableOpacity
          style={[styles.card, { backgroundColor: colors.bgElevated }]}
          activeOpacity={0.9}
          onPress={() => router.push(`/client/${item.id}` as any)}
        >
          {/* Left: Rounded Square Avatar */}
          <Avatar name={item.name} size="xl" imageUrl={item.avatar_url} />

          {/* Right: Info Area */}
          <View style={styles.cardInfo}>
            {/* Pill */}
            <View style={{ alignSelf: 'flex-start', backgroundColor: isDark ? colors.bgElevated : '#E5E7EB', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 6 }}>
              <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.textSecondary, textTransform: 'capitalize' }}>
                {item.status}
              </Text>
            </View>

            {/* Title Row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[styles.cardName, { color: colors.textPrimary }]} numberOfLines={1}>{item.name}</Text>
              <Ionicons name="checkmark-circle" size={14} color={colors.textPrimary} style={{ marginLeft: 4 }} />
            </View>

            {/* Stats Row */}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="fitness" size={12} color="#F97316" />
              <Text style={[styles.statText, { color: colors.textTertiary }]}> {getClientCompletedSessions(item.id)} sessions  ·  </Text>
              <Ionicons name="person" size={12} color="#3B82F6" />
              <Text style={[styles.statText, { color: colors.textTertiary }]}> {getPlanName(item.plan_id)}</Text>
            </View>
          </View>

          {/* Chevron */}
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.cardListBg }]}>
      {/* ── Dark Header ── */}
      <View style={[styles.headerContainer, { backgroundColor: colors.headerBg, paddingTop: insets.top || Spacing.xl }]}>
        <View style={styles.headerTopRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity style={styles.backBtnWrapper} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={20} color={Colors.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>My Clients</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/add-client' as any)}>
            <Ionicons name="add-circle" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Segmented Control */}
        <View style={styles.segmentContainer}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'all' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeTab === 'all' && styles.segmentTextActive]}>All Clients</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'active' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('active')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeTab === 'active' && styles.segmentTextActive]}>Active Only</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Main List ── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderClient}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
        ListHeaderComponent={
          <View style={styles.listHeaderRow}>
            <Text style={[styles.listHeaderTitle, { color: colors.textPrimary }]}>{activeTab === 'all' ? 'All Clients' : 'Active Clients'}</Text>
            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.listHeaderRightText, { color: colors.textSecondary }]}>Most Popular</Text>
              <Ionicons name="wifi" size={16} color="#F97316" style={{ marginLeft: 4, transform: [{ rotate: '45deg' }] }} />
            </TouchableOpacity>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={{ fontFamily: FontFamily.bodyMedium, color: colors.textTertiary }}>No clients found.</Text>
          </View>
        }
      />
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },

  // Header
  headerContainer: {
    backgroundColor: '#1C1C21',
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    marginBottom: Spacing.md,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  backBtnWrapper: {
    width: 40, height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.md,
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: Colors.white,
  },

  // Segmented Control
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 6,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 16,
  },
  segmentBtnActive: {
    backgroundColor: '#374151', // Lighter dark gray
  },
  segmentText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.5)',
  },
  segmentTextActive: {
    color: Colors.white,
  },

  // List Layout
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  listHeaderTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.md,
    color: '#111827',
  },
  listHeaderRightText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: '#6B7280',
  },

  // Client Card
  card: {
    borderRadius: 24,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },
  cardName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#111827',
  },
  statText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: '#6B7280',
  },

  // Swipe Actions
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.md,
  },
  swipeBtn: {
    width: 56,
    height: '100%',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
});
