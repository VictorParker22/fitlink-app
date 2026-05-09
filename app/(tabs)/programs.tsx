import { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions, Image, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

function getWorkoutCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('strength') || lower.includes('push') || lower.includes('pull') || lower.includes('leg') || lower.includes('upper') || lower.includes('lower')) return 'Strength';
  if (lower.includes('cardio') || lower.includes('run') || lower.includes('cycle') || lower.includes('aerobics')) return 'Cardio';
  if (lower.includes('flex') || lower.includes('stretch') || lower.includes('yoga')) return 'Yoga';
  if (lower.includes('hiit') || lower.includes('circuit') || lower.includes('tabata') || lower.includes('intervals')) return 'HIIT';
  if (lower.includes('kickboxing') || lower.includes('martial')) return 'Kickboxing';
  return 'Endurance';
}

// Fallback images based on category
const getCategoryImage = (category: string) => {
  switch (category) {
    case 'Strength': return require('../../assets/images/welcome-1.png');
    case 'Cardio': return require('../../assets/images/welcome-2.png');
    case 'Yoga': return require('../../assets/images/welcome-3.png');
    default: return require('../../assets/images/welcome-1.png');
  }
};

const CATEGORIES = ['All', 'Strength', 'Cardio', 'HIIT', 'Yoga', 'Endurance'];

export default function ProgramsScreen() {
  const router = useRouter();
  const { workouts, refreshData } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const filteredWorkouts = useMemo(() => {
    let result = workouts;
    if (activeCategory !== 'All') {
      result = result.filter(w => getWorkoutCategory(w.name) === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(w => w.name.toLowerCase().includes(q) || w.description?.toLowerCase().includes(q));
    }
    return result;
  }, [workouts, searchQuery, activeCategory]);

  const renderWorkout = ({ item, index }: { item: typeof workouts[0]; index: number }) => {
    const exerciseCount = item.workout_exercises?.length || 0;
    const cat = getWorkoutCategory(item.name);
    const estTime = Math.max(15, exerciseCount * 5);
    const kcal = Math.max(150, exerciseCount * 45); // Rough estimate

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push(`/workout/${item.id}` as any)}
        style={styles.cardContainer}
      >
        <Image
          source={getCategoryImage(cat)}
          style={styles.cardImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
          style={styles.cardGradient}
        >
          {/* Top Pill */}
          <View style={styles.cardTop}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{cat}</Text>
            </View>
          </View>

          {/* Bottom Info */}
          <View style={styles.cardBottom}>
            <View style={styles.cardInfo}>
              <Text style={styles.workoutName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.workoutAuthor} numberOfLines={1}>{item.description || 'FitLink Coach'}</Text>
              
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="time" size={14} color={Colors.textTertiary} />
                  <Text style={styles.metaText}>{estTime}min</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="flame" size={14} color={Colors.textTertiary} />
                  <Text style={styles.metaText}>{kcal}kcal</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="barbell" size={14} color={Colors.textTertiary} />
                  <Text style={styles.metaText}>{exerciseCount} moves</Text>
                </View>
              </View>
            </View>

            <View style={styles.playBtn}>
              <Ionicons name="play" size={24} color={Colors.white} style={{ marginLeft: 3 }} />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Programs</Text>
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/create-workout' as any)}
        >
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search Workout..."
            placeholderTextColor={Colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Ionicons name="search" size={20} color={Colors.textTertiary} />
        </View>
      </View>

      {/* Category Filter Pills */}
      <View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.filterScroll}
        >
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterPill, activeCategory === cat && styles.filterPillActive]}
              onPress={() => setActiveCategory(cat)}
            >
              {cat === 'Strength' && <Ionicons name="barbell" size={14} color={activeCategory === cat ? Colors.white : Colors.textSecondary} />}
              {cat === 'Cardio' && <Ionicons name="heart" size={14} color={activeCategory === cat ? Colors.white : Colors.textSecondary} />}
              {cat === 'Yoga' && <Ionicons name="body" size={14} color={activeCategory === cat ? Colors.white : Colors.textSecondary} />}
              <Text style={[styles.filterPillText, activeCategory === cat && styles.filterPillTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Results Header */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsText}>{filteredWorkouts.length} Results Found.</Text>
        <TouchableOpacity style={styles.sortBtn}>
          <Ionicons name="bar-chart" size={14} color={Colors.textSecondary} />
          <Text style={styles.sortText}>Popularity</Text>
          <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Workout List */}
      <FlatList
        data={filteredWorkouts}
        keyExtractor={(item) => item.id}
        renderItem={renderWorkout}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="search-outline" size={32} color={Colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>No programs found</Text>
            <Text style={styles.emptyText}>Adjust your filters or create a new workout program.</Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              onPress={() => router.push('/create-workout' as any)}
            >
              <Ionicons name="add" size={16} color={Colors.white} />
              <Text style={styles.emptyCTAText}>Create Program</Text>
            </TouchableOpacity>
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
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },

  searchContainer: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, height: 56,
  },
  searchInput: {
    flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.base,
    color: Colors.textPrimary, paddingVertical: 0,
  },

  filterScroll: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.md },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: Radius.full, backgroundColor: Colors.bgElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterPillActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterPillText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textSecondary },
  filterPillTextActive: { color: Colors.white },

  resultsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  resultsText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: Colors.textPrimary },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textSecondary },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 120, gap: Spacing.lg },

  cardContainer: {
    height: 220,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: Colors.bgElevated,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  cardGradient: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'space-between',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  categoryPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.sm,
    backdropFilter: 'blur(10px)', // For web, simulating glassmorphism
  },
  categoryPillText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.white, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardInfo: { flex: 1, paddingRight: Spacing.md },
  workoutName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: Colors.white, marginBottom: 4 },
  workoutAuthor: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textTertiary, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textSecondary },
  
  playBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center', paddingHorizontal: Spacing['2xl'] },
  emptyCTA: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, marginTop: Spacing.md,
  },
  emptyCTAText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.white },
});
