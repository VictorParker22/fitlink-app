/**
 * explore-classes — the full list of THIS athlete's coach's published classes.
 *
 * Coach-scoped, like every class surface: the `classes` query filters on the
 * athlete's own trainer_id rather than trusting RLS alone, so the screen shows
 * one coach's library and never a cross-coach catalogue.
 *
 * The live rail states real scheduled times. An upcoming class is not
 * joinable — pushing into /live-player before the coach is actually streaming
 * showed an indefinite "starting in just a moment" spinner and counted the
 * athlete as a viewer.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Platform,
  Modal, ScrollView, TextInput, RefreshControl, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontSize, Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { Bolt } from '../../components/mascot/Bolt';
import { CATEGORY_COLORS } from '../../data/categoryColors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';

/** A published row from the `classes` table, mapped for this screen. */
interface FitnessClass {
  id: string;
  title: string;
  category: string;
  tags: string[];
  level: string;
  instructor: string;
  instructorAvatar: string;
  brand: string;
  durationMin: number;
  thumbnail: string;
  isFree?: boolean;
  description?: string;
  equipment?: string[];
  videoUrl?: string;
}

type SortKey = 'newest' | 'duration' | 'level' | 'a-z';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'a-z', label: 'A–Z' },
  { key: 'duration', label: 'Duration' },
  { key: 'level', label: 'Level' },
];

/** Real scheduled day + time for a live row, or null when there is no usable date. */
function scheduleLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const dayLabel =
    diff === 0
      ? 'Today'
      : diff === 1
        ? 'Tomorrow'
        : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${dayLabel} · ${time}`;
}

// ─── COMPONENT ───────────────────────────────────────────
export default function ExploreClassesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { clientData, trainer } = useClient();
  const trainerId = clientData?.trainer_id || null;
  const coachFirst = (trainer?.name || '').split(' ')[0] || 'your coach';
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [showSortModal, setShowSortModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const [liveClasses, setLiveClasses] = useState<FitnessClass[]>([]);
  const [activeLiveStreams, setActiveLiveStreams] = useState<any[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Refetch on every tab focus so new classes appear without a full app restart
  const fetchLiveClasses = useCallback(async () => {
    // No coach means no library — never fall back to "everything readable".
    if (!trainerId) {
      setLiveClasses([]);
      setActiveLiveStreams([]);
      setLoadingClasses(false);
      return;
    }
    try {
      // Coach-scoped in the query, not only by policy.
      const { data } = await supabase
        .from('classes')
        .select('*, trainers(name, avatar_url)')
        .eq('trainer_id', trainerId)
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      // Always mirror the table — an empty table must render an empty screen,
      // never stale or stand-in content.
      setLiveClasses((data || []).map(c => ({
        id: c.id,
        title: c.title,
        instructor: c.trainers?.name || 'Coach',
        instructorAvatar: c.trainers?.avatar_url || '',
        brand: c.brand || '',
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

      // Same coach scope for the live schedule. Every scheduled and live row
      // is kept — this is one coach's calendar, so collapsing it to a single
      // "latest stream" would hide real sessions the athlete can attend.
      const { data: liveData, error: liveError } = await supabase
        .from('live_classes')
        .select('*, trainers(name, avatar_url)')
        .eq('trainer_id', trainerId)
        .in('status', ['live', 'scheduled'])
        .order('scheduled_for', { ascending: true });

      if (liveError) {
        console.warn('[explore-classes] live_classes fetch failed:', liveError.message, liveError.code);
      }
      setActiveLiveStreams(liveData || []);
    } catch (e) {
      console.log('[explore-classes] Supabase fetch error:', e);
    } finally {
      setLoadingClasses(false);
    }
  }, [trainerId]);


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
    
    const { error } = isFav
      ? await supabase
          .from('class_favorites')
          .delete()
          .eq('client_id', user.id)
          .eq('class_id', classId)
      : await supabase
          .from('class_favorites')
          .insert({ client_id: user.id, class_id: classId });

    if (error) {
      // Revert the optimistic heart — it must reflect what is actually stored.
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (isFav) next.add(classId);
        else next.delete(classId);
        return next;
      });
      if (__DEV__) console.warn('[explore-classes] favorite toggle failed:', error.message);
      Alert.alert('Not saved', "We couldn't update your saved classes. Please try again.");
    }
  };

  const classSource = liveClasses;

  // Derive filter categories strictly from available class data (avoids 14
  // dead chips). A chip that cannot match a row is never rendered.
  const filterCategories = useMemo(() => {
    const seen = new Set<string>();
    classSource.forEach(c => {
      const cat = (c.category || '').trim();
      if (cat) seen.add(cat);
    });
    return Array.from(seen);
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
              // Real row data — the detail screen omits whatever isn't set.
              description: item.description || '',
              equipment: Array.isArray(item.equipment) ? item.equipment.join(', ') : '',
              video_url: item.videoUrl || '',
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
            {item.brand ? `${item.instructor}  •  ${item.brand}` : item.instructor}
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

        {/* Favourite — its own touchable, so the tap saves the class and does
            not also open it. (React Native has no DOM event bubbling: the old
            e.stopPropagation() here did nothing; the nested touchable is what
            actually claims the tap, and hitSlop keeps the target honest.) */}
        <TouchableOpacity
          style={s.favBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => toggleFavorite(item.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: favoriteIds.has(item.id) }}
          accessibilityLabel={
            favoriteIds.has(item.id)
              ? `Remove ${item.title} from saved`
              : `Save ${item.title}`
          }
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
        <View style={{ flex: 1 }}>
          {/* The real count. When a filter or search is narrowing the list,
              say so — "3 of 21" is the honest number, not "3". */}
          {!loadingClasses && classSource.length > 0 && (
            <Text style={s.classCount}>
              {sortedClasses.length === classSource.length
                ? `${classSource.length} ${classSource.length === 1 ? 'CLASS' : 'CLASSES'}`
                : `${sortedClasses.length} OF ${classSource.length} CLASSES`}
            </Text>
          )}
        </View>
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

      {/* Live schedule. A class that has not started is NOT tappable — it
          states its real day and time instead. Only a genuinely live row
          offers the join. */}
      {activeLiveStreams.length > 0 && (
        <View style={s.liveSection}>
          <Text style={s.liveSectionTitle}>LIVE &amp; UPCOMING</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.liveScroll}>
            {activeLiveStreams.map((stream) => {
              const isLive = stream.status === 'live';
              const when = scheduleLabel(stream.scheduled_for);
              const label = isLive
                ? `Live now: ${stream.title}, with ${stream.trainers?.name || coachFirst}. Double tap to join`
                : `${stream.title}, with ${stream.trainers?.name || coachFirst}${when ? `, ${when}` : ''}. Not started yet`;

              const body = (
                <>
                  <View style={s.liveThumb}>
                    {stream.trainers?.avatar_url ? (
                      <Image source={{ uri: stream.trainers.avatar_url }} style={s.liveAvatar} />
                    ) : null}
                    <View style={[s.liveBadge, !isLive && s.upcomingBadge]}>
                      <Text style={[s.liveBadgeText, !isLive && s.upcomingBadgeText]}>
                        {isLive ? 'LIVE NOW' : 'UPCOMING'}
                      </Text>
                    </View>
                  </View>
                  <View style={s.liveInfo}>
                    <Text style={s.liveTitle} numberOfLines={1}>{stream.title}</Text>
                    {/* The real scheduled time, or the coach's name when the
                        row carries no usable date. Never a fake countdown. */}
                    <Text style={s.liveInstructor} numberOfLines={1}>
                      {isLive
                        ? `${stream.trainers?.name || coachFirst} is streaming now`
                        : when || (stream.trainers?.name || coachFirst)}
                    </Text>
                  </View>
                </>
              );

              return isLive ? (
                <TouchableOpacity
                  key={stream.id}
                  style={[s.liveCard, s.liveCardActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/live-player/${stream.id}` as any);
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  {body}
                </TouchableOpacity>
              ) : (
                <View key={stream.id} style={s.liveCard} accessible={true} accessibilityLabel={label}>
                  {body}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Class List */}
      <FlatList
        data={sortedClasses}
        keyExtractor={(item) => item.id}
        renderItem={renderClassItem}
        // Floating tab bar (and the WorkoutMiniPlayer above it) sit over this
        // list — same clearance the Train column uses — plus room for the FAB.
        contentContainerStyle={[s.listContent, { paddingBottom: insets.bottom + 190 }]}
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
        ListEmptyComponent={
          loadingClasses ? null : (
          <View style={s.emptyState}>
            <Bolt pose="Analyze" size={100} />
            <Text style={s.emptyTitle}>
              {!trainerId
                ? 'No coach yet'
                : classSource.length === 0
                  ? 'No classes yet'
                  : 'Nothing matches'}
            </Text>
            <Text style={s.emptySubtitle}>
              {!trainerId
                ? 'On-demand classes come from the coach you train with.'
                : classSource.length === 0
                  ? `When ${coachFirst} publishes a class, it lands here.`
                  : 'Clear the filters or the search to see the whole library.'}
            </Text>
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
          )
        }
      />

      {/* Filter FAB — lifted clear of the floating tab bar, and present only
          when the library actually has more than one category to sort into. */}
      {filterCategories.length > 1 && (
      <TouchableOpacity
        style={[s.filterFab, { bottom: insets.bottom + 130 }]}
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
      )}

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

  // List — paddingBottom is applied inline from the safe-area inset.
  listContent: {},
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
  liveCardActive: {
    borderColor: CoachColors.accent,
    borderWidth: 1.5,
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
  upcomingBadgeText: {
    color: CoachColors.textSecondary,
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

  // Floating filter FAB — `bottom` comes from the safe-area inset inline, so
  // it always clears the floating tab bar and the mini player above it.
  filterFab: {
    position: 'absolute',
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
