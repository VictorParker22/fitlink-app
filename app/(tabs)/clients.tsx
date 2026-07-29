import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, Dimensions, Linking, Alert, ScrollView } from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { useApp } from '../../context/AppContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

type TabState = 'all' | 'active' | 'trial';

export default function ClientsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clients, plans, sessions, refreshData } = useApp();
  
  const [activeTab, setActiveTab] = useState<TabState>('all');
  const [searchQuery, setSearchQuery] = useState('');
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
    
    // Filter by Tab
    if (activeTab === 'active') {
      list = list.filter((c) => c.status === 'active');
    } else if (activeTab === 'trial') {
      list = list.filter((c) => c.status === 'trial');
    }
    
    // Filter by Search Query
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    
    return list;
  }, [clients, activeTab, searchQuery]);

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
    return plan ? plan.name : 'Trial Plan';
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
          style={styles.swipeBtn}
          onPress={() => handleCallClient(client)}
          accessibilityRole="button"
          accessibilityLabel={`Call ${client.name}`}
        >
          <Ionicons name="call" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderClientAvatar = (name: string, imageUrl?: string | null) => {
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    
    // Stark black for missing avatar backgrounds
    const bgColor = '#111111'; 
    const size = 52;
    const radius = Radius.xs; // Sharp geometry

    if (imageUrl) {
      return (
        <Image
          source={{ uri: imageUrl }}
          cachePolicy="memory-disk"
          transition={200}
          style={{ width: size, height: size, borderRadius: radius, backgroundColor: bgColor }}
        />
      );
    }
    
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bgColor, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
        <Text style={{ fontFamily: FontFamily.heading, color: '#FFFFFF', fontSize: 16 }}>{initials}</Text>
      </View>
    );
  };

  const renderClient = ({ item, index }: { item: typeof clients[0]; index: number }) => {
    const statusText = item.status.charAt(0).toUpperCase() + item.status.slice(1);
    const planText = getPlanName(item.plan_id);
    const subtitle = `${statusText} • ${planText}`;
    
    // Read goals from assessment_data (the actual DB column)
    const assessment = item.assessment_data as any;
    const hasAssessment = assessment && assessment.fitness_goals?.length > 0;
    const description = hasAssessment
      ? assessment.fitness_goals.join(', ')
      : 'No fitness goals set';

    return (
      <Swipeable
        ref={index === 0 ? firstItemRef : undefined}
        renderRightActions={() => renderRightActions(item)}
        containerStyle={{ overflow: 'visible' }}
        friction={2}
      >
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => router.push(`/client/${item.id}` as any)}
          accessibilityRole="button"
          accessibilityLabel={`View client ${item.name}, ${subtitle}`}
        >
          {/* Avatar Area */}
          <View style={styles.avatarWrapper}>
            {renderClientAvatar(item.name, item.avatar_url)}
          </View>

          {/* Text Area */}
          <View style={styles.textContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.name.toUpperCase()}</Text>
              {!hasAssessment && (
                <View style={styles.incompleteBadge}>
                  <Text style={styles.incompleteBadgeText}>INCOMPLETE</Text>
                </View>
              )}
            </View>
            <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
            <Text style={styles.rowDescription} numberOfLines={2}>{description.toUpperCase()}</Text>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        
        {/* Luxury Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>ROSTER</Text>
          <TouchableOpacity 
            style={styles.headerAddBtn}
            onPress={() => router.push('/add-client' as any)}
          >
            <Ionicons name="add" size={18} color="#000000" />
            <Text style={styles.headerAddText}>ADD</Text>
          </TouchableOpacity>
        </View>

        {/* Minimalist Search Row */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="rgba(255, 255, 255, 0.4)" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="SEARCH ROSTER..."
            placeholderTextColor="rgba(255, 255, 255, 0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            selectionColor="#FFFFFF"
            autoCapitalize="characters"
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={16} color="rgba(255, 255, 255, 0.4)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Editorial Toggles */}
        <View style={styles.filtersWrapper}>
          <View style={styles.togglesContainer}>
            <TouchableOpacity 
              style={[styles.toggleBtn, activeTab === 'all' && styles.toggleBtnActive]} 
              onPress={() => setActiveTab('all')}
            >
              <Text style={[styles.toggleText, activeTab === 'all' && styles.toggleTextActive]}>ALL</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.toggleBtn, activeTab === 'active' && styles.toggleBtnActive]} 
              onPress={() => setActiveTab('active')}
            >
              <Text style={[styles.toggleText, activeTab === 'active' && styles.toggleTextActive]}>ACTIVE</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.toggleBtn, activeTab === 'trial' && styles.toggleBtnActive]} 
              onPress={() => setActiveTab('trial')}
            >
              <Text style={[styles.toggleText, activeTab === 'trial' && styles.toggleTextActive]}>TRIAL</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Results Info */}
        <View style={styles.resultsInfoRow}>
          <Text style={styles.resultsText}>
            {filtered.length} {filtered.length === 1 ? 'CLIENT' : 'CLIENTS'}
          </Text>
        </View>

        {/* Flat List Content */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderClient}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor="#FFFFFF" 
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.xl }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="people-outline" size={24} color="rgba(255,255,255,0.4)" />
              </View>
              <Text style={styles.emptyTitle}>NO CLIENTS YET</Text>
              <Text style={styles.emptyDesc}>ADD YOUR FIRST CLIENT TO GET STARTED WITH COACHING</Text>
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={() => router.push('/add-client' as any)}
                activeOpacity={0.8}
              >
                <Ionicons name="person-add" size={16} color="#000" />
                <Text style={styles.emptyAddBtnText}>ADD CLIENT</Text>
              </TouchableOpacity>
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
    backgroundColor: '#000000' 
  },
  
  // Luxury Header
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
    fontSize: 24,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.xs,
  },
  headerAddText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: '#000000',
    letterSpacing: 0.5,
  },

  // Minimalist Search Row
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  clearBtn: {
    padding: 4,
  },

  // Editorial Toggles
  filtersWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  togglesContainer: {
    flexDirection: 'row',
    gap: 20,
  },
  toggleBtn: {
    paddingVertical: 4,
  },
  toggleBtnActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#FFFFFF',
  },
  toggleText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 0.5,
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontFamily: FontFamily.headingExtraBold,
  },

  // Results Label
  resultsInfoRow: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  resultsText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 1.5,
  },

  // List Rows
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#000000',
  },
  avatarWrapper: {
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  rowTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 1,
  },
  rowSubtitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  rowDescription: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
    lineHeight: 14,
    letterSpacing: 0.5,
  },

  // Swipe Action
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingLeft: Spacing.md,
  },
  swipeBtn: {
    width: 60,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: Radius.xs,
    backgroundColor: '#0F0F0F',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: '#FFF',
    marginBottom: 8, letterSpacing: 1,
  },
  emptyDesc: {
    fontFamily: FontFamily.bodyBold, fontSize: 11, color: 'rgba(255,255,255,0.4)',
    textAlign: 'center', lineHeight: 20, marginBottom: 24, letterSpacing: 0.5,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: Radius.xs,
  },
  emptyAddBtnText: {
    fontFamily: FontFamily.bodyBold, fontSize: 12, color: '#000000', letterSpacing: 1, textTransform: 'uppercase',
  },

  // Incomplete badge
  incompleteBadge: {
    backgroundColor: '#1A0808',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 4,
  },
  incompleteBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 8,
    color: '#EF4444',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

