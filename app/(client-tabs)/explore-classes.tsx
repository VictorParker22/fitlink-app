import React, { useState, useMemo, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Platform,
  Modal, ScrollView, TextInput, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontSize, Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { Bolt } from '../../components/mascot/Bolt';
import { PrecisionIcons } from '../../components/icons/PrecisionIcons';
import { CATEGORY_COLORS } from '../../data/categoryColors';
import { FitnessClass, MOCK_CLASSES } from '../../data/classes';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import { useRevenueCat } from '../../context/RevenueCatContext';
import ClientPaywall from '../../components/paywalls/ClientPaywall';
import FitLinkPassPreview from '../../components/client-tabs/explore/FitLinkPassPreview';

type SortKey = 'newest' | 'duration' | 'level' | 'a-z';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'a-z', label: 'A–Z' },
  { key: 'duration', label: 'Duration' },
  { key: 'level', label: 'Level' },
];

// ─── COMPONENT ───────────────────────────────────────────
export default function ExploreClassesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { clientData, subscription } = useClient();
  const { isClientPremium } = useRevenueCat();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [showSortModal, setShowSortModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const [liveClasses, setLiveClasses] = useState<any[]>([]);
  const [activeLiveStreams, setActiveLiveStreams] = useState<any[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Refetch on every tab focus so new classes appear without a full app restart
  const fetchLiveClasses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*, trainers(name, avatar_url)')
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      if (data && data.length > 0) {
        setLiveClasses(data.map(c => ({
          id: c.id,
          title: c.title,
          instructor: c.trainers?.name || 'Coach',
          instructorAvatar: c.trainers?.avatar_url || '',
          brand: c.brand || 'FitLink',
          category: c.category,
          durationMin: c.duration_minutes || 0,
          level: c.difficulty || 'All Levels',
          thumbnail: c.thumbnail_url || '',
          description: c.description || '',
          equipment: c.equipment || [],
          tags: c.tags || [],
          rating: c.avg_rating || 0,
          takeCount: c.take_count || 0,
          isFree: c.is_free || false,
          videoUrl: c.video_url,
        })));
      }

      // Use the client's trainer_id as an explicit filter.
      // This bypasses the RLS EXISTS join and directly fetches the trainer's classes.
      // Falls back to fetching all accessible classes if trainer_id isn't loaded yet.
      const trainerId = clientData?.trainer_id;
      let liveQuery = supabase
        .from('live_classes')
        .select('*, trainers(name, avatar_url)')
        .in('status', ['live', 'scheduled'])
        .order('scheduled_for', { ascending: true });

      if (trainerId) {
        liveQuery = liveQuery.eq('trainer_id', trainerId);
      }

      const { data: liveData, error: liveError } = await liveQuery;

      console.log('[explore-classes] live_classes response:', {
        trainerId,
        count: liveData?.length ?? 0,
        statuses: liveData?.map(s => ({ id: s.id, title: s.title, status: s.status })),
        error: liveError?.message,
      });

      if (liveError) {
        console.warn('[explore-classes] live_classes fetch failed:', liveError.message, liveError.code);
      }

      if (liveData) {
        // Keep only the most recent active stream per trainer (prevents ghost old streams)
        const latestPerTrainer = new Map<string, any>();
        for (const stream of liveData) {
          const existing = latestPerTrainer.get(stream.trainer_id);
          if (!existing || new Date(stream.scheduled_for) > new Date(existing.scheduled_for)) {
            latestPerTrainer.set(stream.trainer_id, stream);
          }
        }
        setActiveLiveStreams(Array.from(latestPerTrainer.values()));
      }
    } catch (e) {
      console.log('[explore-classes] Supabase fetch error:', e);
    } finally {
      setLoadingClasses(false);
    }
  }, [clientData?.trainer_id]);


  // Clear stale data immediately on focus, then refetch fresh
  useFocusEffect(
    useCallback(() => {
      setActiveLiveStreams([]);   // ← clear before fetch so old stream never lingers
      setLoadingClasses(true);
      fetchLiveClasses();
    }, [fetchLiveClasses])
  );

  // Realtime: self-update when trainer starts, ends, or creates a stream
  // Client never needs to navigate away and back — list updates instantly
  React.useEffect(() => {
    const channel = supabase
      .channel('explore-live-classes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_classes' },
        () => {
          // Re-run full fetch on any live_classes change (insert, update, delete)
          fetchLiveClasses();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchLiveClasses]);

  React.useEffect(() => {
    async function loadFavorites() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('class_favorites')
          .select('class_id')
          .eq('client_id', user.id);
        if (error) throw error;
        if (data) {
          setFavoriteIds(new Set(data.map(d => d.class_id)));
        }
      } catch (err) {
        console.log('Could not load favorites:', err);
      }
    }
    loadFavorites();
  }, [user]);

  const toggleFavorite = async (classId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!user) return;
    
    const isFav = favoriteIds.has(classId);
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (isFav) next.delete(classId);
      else next.add(classId);
      return next;
    });
    
    try {
      if (isFav) {
        await supabase
          .from('class_favorites')
          .delete()
          .eq('client_id', user.id)
          .eq('class_id', classId);
      } else {
        await supabase
          .from('class_favorites')
          .insert({ client_id: user.id, class_id: classId });
      }
    } catch (err) {
      console.log('Error toggling favorite:', err);
    }
  };

  const classSource = liveClasses.length > 0 ? liveClasses : MOCK_CLASSES;

  // Derive filter categories strictly from available class data (avoids 14 dead chips)
  const filterCategories = useMemo(() => {
    return Array.from(new Set(classSource.map(c => c.category)));
  }, [classSource]);

  const toggleFilter = (cat: string) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const sortedClasses = useMemo(() => {
    let list = [...classSource];

    // Apply filters
    if (activeFilters.size > 0) {
      list = list.filter(c => activeFilters.has(c.category));
    }

    // Apply search
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => 
        c.title.toLowerCase().includes(q) ||
        c.instructor.toLowerCase().includes(q) ||
        c.brand.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.tags.some((t: string) => t.toLowerCase().includes(q))
      );
    }

    // Apply sort
    switch (sortKey) {
      case 'a-z':
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'duration':
        list.sort((a, b) => a.durationMin - b.durationMin);
        break;
      case 'level': {
        const order = { Beginner: 0, Intermediate: 1, Advanced: 2 };
        list.sort((a, b) => (order[a.level as keyof typeof order] || 0) - (order[b.level as keyof typeof order] || 0));
        break;
      }
      default:
        break;
    }

    return list;
  }, [classSource, sortKey, activeFilters, searchQuery]);

  const formatDuration = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:00`;
    return `${m.toString().padStart(2, '0')}:00`;
  };

  const renderClassItem = useCallback(({ item }: { item: FitnessClass }) => {
    const catColor = CATEGORY_COLORS[item.category] || '#FFFFFF';

    return (
      <TouchableOpacity
        style={s.classRow}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`View class: ${item.title}, ${item.category}, ${item.level}, ${item.durationMin} minutes`}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: ClientRoute.classDetail as any,
            params: {
              id: item.id,
              title: item.title,
              category: item.category,
              tags: item.tags.join(','),
              level: item.level,
              instructor: item.instructor,
              instructorAvatar: item.instructorAvatar,
              brand: item.brand,
              durationMin: String(item.durationMin),
              thumbnail: item.thumbnail,
              is_free: item.isFree ? 'true' : 'false',   // ← required for class-detail paywall gate
            },
          });
        }}
      >
        {/* Thumbnail */}
        <View style={s.thumbWrap}>
          <Image
            source={{ uri: item.thumbnail }}
            style={s.thumb}
            cachePolicy="memory-disk"
            transition={200}
            accessibilityLabel={`${item.title} class thumbnail`}
          />
          <View style={s.durationBadge}>
            <Text style={s.durationText}>{formatDuration(item.durationMin)}</Text>
          </View>
        </View>

        {/* Info */}
        <View style={s.classInfo}>
          <Text style={s.classTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={s.classTags} numberOfLines={1}>
            <Text style={{ color: catColor }}>{item.category}</Text>
            {item.tags.length > 0 && (
              <Text style={s.classTagDot}>  •  {item.tags.join('  •  ')}</Text>
            )}
            <Text style={s.classTagDot}>  •  {item.level}</Text>
          </Text>
          <Text style={s.classInstructor} numberOfLines={1}>
            {item.instructor}  •  {item.brand}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 4 }}>
            {(item as any).isFree ? (
              <View style={s.freeBadge}>
                <Text style={s.freeBadgeText}>FREE</Text>
              </View>
            ) : (
              <View style={s.passBadge}>
                <Ionicons name="lock-closed" size={8} color={CoachColors.textSecondary} style={{ marginRight: 2 }} />
                <Text style={s.passBadgeText}>PASS</Text>
              </View>
            )}
          </View>
          {/* Phase 3: star rating display placeholder */}
          {/* <View style={s.ratingPlaceholder} /> */}
        </View>

        {/* Favorite */}
        <TouchableOpacity
          style={s.favBtn}
          onPress={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
        >
          <Ionicons 
            name={favoriteIds.has(item.id) ? 'heart' : 'heart-outline'} 
            size={20} 
            color={favoriteIds.has(item.id) ? CoachColors.accent : CoachColors.textMuted} 
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }, [router, favoriteIds]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Go back to workouts"
        >
          <Ionicons name="chevron-back" size={24} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} accessibilityRole="header">Explore classes</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Search Input Box */}
      <View style={s.searchBarContainer}>
        <Ionicons name="search" size={16} color={CoachColors.textMuted} style={s.searchIcon} />
        <TextInput
          style={s.searchInputField}
          placeholder="Search classes, instructors..."
          placeholderTextColor={CoachColors.textFaint}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
        />
        {searchQuery !== '' && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={s.searchClearBtn}>
            <Ionicons name="close-circle" size={16} color={CoachColors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Count + Sort Toolbar */}
      <View style={s.toolbar}>
        <Text style={s.classCount}>{sortedClasses.length} CLASSES</Text>
        <TouchableOpacity
          style={s.sortBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSortModal(true);
          }}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Sort classes"
        >
          <Text style={s.sortText}>SORT BY</Text>
          <Ionicons name="chevron-down" size={14} color={CoachColors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Structural Hairline Divider */}
      <View style={s.divider} />

      {/* Live Streams Section (if any) */}
      {activeLiveStreams.length > 0 && (
        <View style={s.liveSection}>
          <Text style={s.liveSectionTitle}>LIVE & UPCOMING</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.liveScroll}>
            {activeLiveStreams.map((stream) => (
              <TouchableOpacity
                key={stream.id}
                style={s.liveCard}
                onPress={() => router.push(`/live-player/${stream.id}` as any)}
                activeOpacity={0.8}
              >
                <View style={s.liveThumb}>
                  <Image source={{ uri: stream.trainers?.avatar_url }} style={s.liveAvatar} />
                  <View style={[s.liveBadge, stream.status !== 'live' && s.upcomingBadge]}>
                    <Text style={s.liveBadgeText}>{stream.status === 'live' ? 'LIVE NOW' : 'UPCOMING'}</Text>
                  </View>
                </View>
                <View style={s.liveInfo}>
                  <Text style={s.liveTitle} numberOfLines={1}>{stream.title}</Text>
                  <Text style={s.liveInstructor}>{stream.trainers?.name || 'Coach'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Class List */}
      <FlatList
        data={sortedClasses}
        keyExtractor={(item) => item.id}
        renderItem={renderClassItem}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await fetchLiveClasses();
              setRefreshing(false);
            }}
            tintColor={CoachColors.accent}
            colors={[CoachColors.accent]}
            progressBackgroundColor={CoachColors.surface}
          />
        }
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListHeaderComponent={
          <FitLinkPassPreview
            hasActivePlan={isClientPremium || !!subscription}
            onExplorePlansPress={() => router.push(ClientRoute.mySubscription as any)}
            onSubscribePress={() => setPaywallVisible(true)}
          />
        }
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Bolt pose="Analyze" size={100} />
            <Text style={s.emptyTitle}>No classes found</Text>
            <Text style={s.emptySubtitle}>Try adjusting or clearing your active filters</Text>
            {activeFilters.size > 0 && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveFilters(new Set());
                }}
                style={s.emptyClearBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
              >
                <Text style={s.emptyClearText}>Clear all filters</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* FitLink Pass Paywall modal */}
      <ClientPaywall
        visible={paywallVisible}
        onDismiss={() => setPaywallVisible(false)}
      />

      {/* Brutalist Floating Filter Button (FAB) */}
      <TouchableOpacity
        style={s.filterFab}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowFilterModal(true);
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Filter classes${activeFilters.size > 0 ? `, ${activeFilters.size} active` : ''}`}
      >
        <Ionicons name="options-outline" size={18} color={CoachColors.accent} />
        <Text style={s.filterFabText}>FILTER</Text>
        {activeFilters.size > 0 && (
          <View style={s.filterBadge}>
            <Text style={s.filterBadgeText}>{activeFilters.size}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── SORT MODAL ── */}
      <Modal visible={showSortModal} transparent animationType="fade" onRequestClose={() => setShowSortModal(false)}>
        <TouchableOpacity
          style={s.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={s.sortSheet}>
            <Text style={s.sortSheetTitle}>Sort by</Text>
            <View style={s.sortSheetDivider} />
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={s.sortOption}
                onPress={() => {
                  setSortKey(opt.key);
                  setShowSortModal(false);
                  Haptics.selectionAsync();
                }}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${opt.label}${sortKey === opt.key ? ', selected' : ''}`}
              >
                <Text style={[s.sortOptionText, sortKey === opt.key && s.sortOptionActive]}>{opt.label}</Text>
                {sortKey === opt.key && <Ionicons name="checkmark" size={20} color={CoachColors.accent} />}
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── FILTER MODAL ── */}
      <Modal visible={showFilterModal} transparent animationType="slide" onRequestClose={() => setShowFilterModal(false)}>
        <View style={s.filterOverlay}>
          <View style={s.filterSheet}>
            <View style={s.filterDragHandle} />
            <View style={s.filterHeader}>
              <Text style={s.filterTitle}>Filter</Text>
              {activeFilters.size > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setActiveFilters(new Set());
                    Haptics.selectionAsync();
                  }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all filters"
                >
                  <Text style={s.filterClear}>Clear all</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={s.sortSheetDivider} />

            <Text style={s.filterSectionTitle}>CATEGORY</Text>
            <ScrollView
              contentContainerStyle={s.filterChips}
              showsVerticalScrollIndicator={false}
            >
              {filterCategories.map(cat => {
                const isActive = activeFilters.has(cat);
                const catColor = CATEGORY_COLORS[cat] || '#FFFFFF';
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      s.filterChip,
                      isActive && { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent }
                    ]}
                    onPress={() => {
                      toggleFilter(cat);
                      Haptics.selectionAsync();
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${isActive ? 'Remove' : 'Add'} ${cat} filter`}
                  >
                    <Text style={[s.filterChipText, isActive && { color: CoachColors.onAccent }]}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={s.filterApplyBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowFilterModal(false);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Apply filters, show ${sortedClasses.length} classes`}
            >
              <Text style={s.filterApplyText}>Show {sortedClasses.length} classes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    letterSpacing: -0.5,
    color: CoachColors.textPrimary,
  },

  // Search Bar
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInputField: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },
  searchClearBtn: { padding: 4 },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  classCount: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: CoachColors.textMuted,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sortText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: CoachColors.textMuted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
  },

  // List
  listContent: {
    paddingBottom: 120,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginLeft: 20,
  },

  // Class row
  liveSection: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  liveSectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  liveScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  liveCard: {
    width: 200,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  liveThumb: {
    height: 100,
    backgroundColor: CoachColors.borderMuted,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  liveAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: CoachColors.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  upcomingBadge: {
    backgroundColor: CoachColors.borderMuted,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  liveBadgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 9,
    color: CoachColors.textPrimary,
    letterSpacing: 1,
  },
  liveInfo: {
    padding: 12,
  },
  liveTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  liveInstructor: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textMuted,
  },
  classRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
  },
  thumbWrap: {
    width: 110,
    height: 90,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: CoachColors.surface,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: CoachColors.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: CoachColors.textPrimary,
  },
  classInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  classTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    letterSpacing: -0.3,
    color: CoachColors.textPrimary,
    lineHeight: 21,
  },
  classTags: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: CoachColors.textSecondary,
  },
  classTagDot: {
    color: CoachColors.textMuted,
  },
  classInstructor: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textMuted,
  },
  freeBadge: {
    backgroundColor: CoachColors.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: CoachColors.accent,
  },
  freeBadgeText: {
    color: CoachColors.accent,
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1,
  },
  passBadge: {
    backgroundColor: CoachColors.surface,
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: CoachColors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passBadgeText: {
    color: CoachColors.textSecondary,
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1,
  },
  favBtn: {
    padding: 8,
    alignSelf: 'center',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
    marginTop: 12,
  },
  emptySubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyClearBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  emptyClearText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.accent,
    letterSpacing: 1.5,
    textDecorationLine: 'underline',
  },

  // Brutalist Floating Filter FAB
  filterFab: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoachColors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  filterFabText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  filterBadge: {
    backgroundColor: CoachColors.accent,
    borderRadius: Radius.xs,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  filterBadgeText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.onAccent,
  },

  // Sort modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sortSheet: {
    width: '85%',
    backgroundColor: CoachColors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CoachColors.border,
    padding: 20,
  },
  sortSheetTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  sortSheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginBottom: 8,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  sortOptionText: {
    fontFamily: CoachFonts.body,
    fontSize: 16,
    color: CoachColors.textSecondary,
  },
  sortOptionActive: {
    color: CoachColors.accent,
    fontFamily: CoachFonts.headingSemiBold,
  },

  // Filter modal
  filterOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  filterSheet: {
    backgroundColor: CoachColors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: CoachColors.border,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '75%',
  },
  filterDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoachColors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: FontSize.lg,
    color: CoachColors.textPrimary,
  },
  filterClear: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
    textDecorationLine: 'underline',
  },
  filterSectionTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginTop: 16,
    marginBottom: 12,
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 20,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CoachColors.border,
    backgroundColor: CoachColors.bg,
  },
  filterChipText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  filterApplyBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  filterApplyText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 14,
    color: CoachColors.onAccent,
    letterSpacing: 1.5,
  },
});
