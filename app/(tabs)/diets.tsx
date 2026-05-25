import { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions, Image, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

function getDietCategory(name: string, desc?: string): string {
  const text = (name + ' ' + (desc || '')).toLowerCase();
  if (text.includes('keto') || text.includes('low carb')) return 'Keto';
  if (text.includes('vegan') || text.includes('plant')) return 'Vegan';
  if (text.includes('muscle') || text.includes('bulk') || text.includes('protein')) return 'High Protein';
  if (text.includes('loss') || text.includes('cut') || text.includes('shred')) return 'Weight Loss';
  return 'Balanced';
}

const getDietImage = (category: string) => {
  switch (category) {
    case 'Keto': return require('../../assets/images/welcome-2.png');
    case 'Vegan': return require('../../assets/images/welcome-3.png');
    case 'High Protein': return require('../../assets/images/welcome-1.png');
    default: return require('../../assets/images/welcome-1.png'); // Fallback for food
  }
};

const CATEGORIES = ['All', 'Balanced', 'High Protein', 'Weight Loss', 'Keto', 'Vegan'];

export default function DietsScreen() {
  const router = useRouter();
  const { diets, refreshData } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const filteredDiets = useMemo(() => {
    let result = diets || [];
    if (activeCategory !== 'All') {
      result = result.filter(d => getDietCategory(d.name, d.description) === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q));
    }
    return result;
  }, [diets, searchQuery, activeCategory]);

  const renderDiet = ({ item }: { item: typeof diets[0] }) => {
    const mealsList = item.diet_plan_meals || [];
    const cat = getDietCategory(item.name, item.description);
    
    // Auto-calculate macros from meals
    let totalCals = 0, totalPro = 0;
    mealsList.forEach(m => {
      if (m.meals) {
        totalCals += m.meals.calories;
        totalPro += m.meals.protein;
      }
    });

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => router.push(`/diet/${item.id}` as any)}
        style={styles.cardContainer}
      >
        <Image
          source={getDietImage(cat)}
          style={styles.cardImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
          style={styles.cardGradient}
        >
          <View style={styles.cardTop}>
            <View style={styles.categoryPill}>
              <Text style={styles.categoryPillText}>{cat}</Text>
            </View>
          </View>

          <View style={styles.cardBottom}>
            <View style={styles.cardInfo}>
              <Text style={styles.dietName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.dietAuthor} numberOfLines={1}>{item.description || 'Nutrition Plan'}</Text>
              
              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="flame" size={14} color={colors.textTertiary} />
                  <Text style={styles.metaText}>{totalCals} kcal</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="restaurant" size={14} color={colors.textTertiary} />
                  <Text style={styles.metaText}>{mealsList.length} Meals</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="barbell" size={14} color={colors.textTertiary} />
                  <Text style={styles.metaText}>{totalPro}g Pro</Text>
                </View>
              </View>
            </View>

            <View style={styles.playBtn}>
              <Ionicons name="eye" size={24} color={colors.white} />
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Diet Plans</Text>
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/create-diet' as any)}
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search Nutrition Plans..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <Ionicons name="search" size={20} color={colors.textTertiary} />
        </View>
      </View>

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
              {cat === 'High Protein' && <Ionicons name="barbell" size={14} color={activeCategory === cat ? colors.white : colors.textSecondary} />}
              {cat === 'Weight Loss' && <Ionicons name="trending-down" size={14} color={activeCategory === cat ? colors.white : colors.textSecondary} />}
              {(cat === 'Keto' || cat === 'Balanced' || cat === 'Vegan') && <Ionicons name="nutrition" size={14} color={activeCategory === cat ? colors.white : colors.textSecondary} />}
              <Text style={[styles.filterPillText, activeCategory === cat && styles.filterPillTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsText}>{filteredDiets.length} Results Found.</Text>
        <TouchableOpacity style={styles.sortBtn}>
          <Ionicons name="bar-chart" size={14} color={colors.textSecondary} />
          <Text style={styles.sortText}>Popularity</Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredDiets}
        keyExtractor={(item) => item.id}
        renderItem={renderDiet}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="nutrition-outline" size={32} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>No diets found</Text>
            <Text style={styles.emptyText}>Adjust your filters or create a new nutrition plan.</Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              onPress={() => router.push('/create-diet' as any)}
            >
              <Ionicons name="add" size={16} color={colors.white} />
              <Text style={styles.emptyCTAText}>Create Plan</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: colors.textPrimary, letterSpacing: -0.5 },
  addBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },

  searchContainer: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: Radius.xl, paddingHorizontal: Spacing.lg, height: 56,
  },
  searchInput: {
    flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.base,
    color: colors.textPrimary, paddingVertical: 0,
  },

  filterScroll: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.md },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: Radius.full, backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: colors.border,
  },
  filterPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterPillText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textSecondary },
  filterPillTextActive: { color: colors.white },

  resultsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md,
  },
  resultsText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: colors.textPrimary },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textSecondary },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 120, gap: Spacing.lg },

  cardContainer: {
    height: 220,
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
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
  },
  categoryPillText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.white, textTransform: 'uppercase', letterSpacing: 0.5 },
  
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardInfo: { flex: 1, paddingRight: Spacing.md },
  dietName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: colors.white, marginBottom: 4 },
  dietAuthor: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textTertiary, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textSecondary },
  
  playBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: Spacing['2xl'] },
  emptyCTA: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accent, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: Radius.full, marginTop: Spacing.md,
  },
  emptyCTAText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.white },
});
