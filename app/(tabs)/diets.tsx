import { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions, TextInput, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

const SCREEN_WIDTH = Dimensions.get('window').width;

function getDietCategory(name: string, desc?: string): string {
  const text = (name + ' ' + (desc || '')).toLowerCase();
  if (text.includes('keto') || text.includes('low carb')) return 'Keto';
  if (text.includes('vegan') || text.includes('plant')) return 'Vegan';
  if (text.includes('muscle') || text.includes('bulk') || text.includes('protein')) return 'High Protein';
  if (text.includes('loss') || text.includes('cut') || text.includes('shred')) return 'Weight Loss';
  return 'Balanced';
}

function getCategoryLabel(key: string): string {
  const map: Record<string, string> = {
    'balanced': 'Balanced',
    'high-protein': 'High Protein',
    'keto': 'Keto',
    'vegan': 'Vegan',
    'weight-loss': 'Weight Loss',
    'custom': 'Balanced',
  };
  return map[key] || 'Balanced';
}

const CATEGORIES = ['All', 'Balanced', 'High Protein', 'Weight Loss', 'Keto', 'Vegan'];

export default function DietsScreen() {
  const router = useRouter();
  const { diets, clientDiets, refreshData } = useApp();
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
      result = result.filter(d => {
        const cat = d.category ? getCategoryLabel(d.category) : getDietCategory(d.name, d.description);
        return cat === activeCategory;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d => d.name.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q));
    }
    return result;
  }, [diets, searchQuery, activeCategory]);

  const renderDiet = ({ item }: { item: typeof diets[0] }) => {
    const mealsList = item.diet_plan_meals || [];
    const cat = item.category ? getCategoryLabel(item.category) : getDietCategory(item.name, item.description);
    
    // Auto-calculate macros from meals
    let totalCals = 0, totalPro = 0, totalCarbs = 0, totalFat = 0;
    mealsList.forEach(m => {
      if (m.meals) {
        const s = m.servings || 1;
        totalCals += m.meals.calories * s;
        totalPro += m.meals.protein * s;
        totalCarbs += (m.meals.carbs || 0) * s;
        totalFat += (m.meals.fat || 0) * s;
      }
    });

    const activeClientsCount = (clientDiets || []).filter(cd => cd.diet_plan_id === item.id).length;

    return (
      <View style={styles.cardContainer}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push(`/diet/${item.id}` as any)}
          accessibilityRole="button"
          accessibilityLabel={`View diet plan ${item.name}`}
        >
          {item.image_url ? (
            <View style={styles.uploadedImageContainer}>
              <Image source={{ uri: item.image_url }} style={styles.uploadedImage} resizeMode="cover" />
              <View style={[styles.categoryPill, styles.categoryPillFloating]}>
                <Text style={styles.categoryPillText}>{cat}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.cardTouch}>
            {!item.image_url && (
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBox}>
                  <Ionicons name="nutrition" size={20} color={CoachColors.textPrimary} />
                </View>
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryPillText}>{cat}</Text>
                </View>
              </View>
            )}
          
            <View style={styles.cardInfo}>
              <Text style={styles.dietName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.dietAuthor} numberOfLines={2}>{item.description || 'Nutrition program'}</Text>
            </View>

            {/* High Density Metric Grid */}
            <View style={styles.metricGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Energy</Text>
                <Text style={styles.metricValue}>{Math.round(totalCals)}</Text>
                <Text style={styles.metricUnit}>kcal</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Protein</Text>
                <Text style={styles.metricValue}>{Math.round(totalPro)}G</Text>
                <Text style={styles.metricUnit}>Target</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Meals</Text>
                <Text style={styles.metricValue}>{mealsList.length}</Text>
                <Text style={styles.metricUnit}>Items</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>Clients</Text>
                <Text style={styles.metricValue}>{activeClientsCount}</Text>
                <Text style={styles.metricUnit}>Assigned</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Nutrition database</Text>
          <Text style={styles.title}>Diet plans</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/create-diet' as any)}
          accessibilityRole="button"
          accessibilityLabel="Create new diet plan"
        >
          <Ionicons name="add" size={20} color={CoachColors.onAccent} />
          <Text style={styles.addBtnText}>Create</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={CoachColors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search nutrition plans..."
            placeholderTextColor={CoachColors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityRole="search"
            accessibilityLabel="Search nutrition plans"
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={CoachColors.textMuted} />
            </TouchableOpacity>
          )}
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
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${cat}`}
              accessibilityState={{ selected: activeCategory === cat }}
            >
              <Text style={[styles.filterPillText, activeCategory === cat && styles.filterPillTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsText}>{filteredDiets.length} plans cataloged</Text>
      </View>

      <FlatList
        data={filteredDiets}
        keyExtractor={(item) => item.id}
        renderItem={renderDiet}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.textPrimary} colors={[CoachColors.textPrimary]} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="nutrition-outline" size={32} color={CoachColors.textFaint} />
            <Text style={styles.emptyTitle}>No diet plans found</Text>
            <Text style={styles.emptyText}>Adjust your search query or filter to locate nutrition programs.</Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              onPress={() => router.push('/create-diet' as any)}
              accessibilityRole="button"
              accessibilityLabel="Create new diet plan"
            >
              <Ionicons name="add" size={16} color={CoachColors.onAccent} />
              <Text style={styles.emptyCTAText}>Build new diet</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerSub: { fontFamily: CoachFonts.headingBold, fontSize: 10, color: CoachColors.textSecondary, letterSpacing: 1.5, marginBottom: 2, textTransform: 'uppercase' },
  title: { fontFamily: CoachFonts.headingBold, fontSize: 26, color: CoachColors.textPrimary, letterSpacing: -0.5 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 38, paddingHorizontal: 14, borderRadius: 4,
    backgroundColor: CoachColors.accent, justifyContent: 'center',
  },
  addBtnText: { fontFamily: CoachFonts.headingBold, fontSize: 11, color: CoachColors.onAccent, letterSpacing: 1, textTransform: 'uppercase' },

  searchContainer: { paddingHorizontal: 20, marginBottom: 12 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 4, paddingHorizontal: 14, height: 46,
  },
  searchInput: {
    flex: 1, fontFamily: CoachFonts.headingBold, fontSize: 12,
    color: CoachColors.textPrimary, paddingVertical: 0, letterSpacing: 0.5,
  },

  filterScroll: { paddingHorizontal: 20, gap: 6, paddingBottom: 12 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 4, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  filterPillActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  filterPillText: { fontFamily: CoachFonts.headingBold, fontSize: 11, color: CoachColors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  filterPillTextActive: { color: CoachColors.onAccent },

  resultsHeader: {
    paddingHorizontal: 20, marginBottom: 12,
  },
  resultsText: { fontFamily: CoachFonts.headingBold, fontSize: 10, color: CoachColors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },

  list: { paddingHorizontal: 20, paddingBottom: 120, gap: 12 },

  cardContainer: {
    backgroundColor: CoachColors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    overflow: 'hidden',
  },
  uploadedImageContainer: {
    width: '100%', height: 120, position: 'relative',
  },
  uploadedImage: { width: '100%', height: '100%' },
  categoryPillFloating: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.border,
  },
  cardTouch: { padding: 16 },
  cardHeaderRow: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 4,
    backgroundColor: CoachColors.borderMuted, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  categoryPill: {
    backgroundColor: CoachColors.borderMuted, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 4, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  categoryPillText: { fontFamily: CoachFonts.headingBold, fontSize: 10, color: CoachColors.textPrimary, letterSpacing: 0.5, textTransform: 'uppercase' },
  
  cardInfo: { marginBottom: 16 },
  dietName: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.textPrimary, marginBottom: 4, letterSpacing: -0.3 },
  dietAuthor: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textSecondary, lineHeight: 18 },

  metricGrid: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: CoachColors.borderMuted, borderRadius: 4, padding: 12,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  metricBox: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, height: 26, backgroundColor: CoachColors.surface },
  metricLabel: { fontFamily: CoachFonts.headingBold, fontSize: 9, color: CoachColors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  metricValue: { fontFamily: CoachFonts.headingBold, fontSize: 15, color: CoachColors.textPrimary, marginVertical: 2 },
  metricUnit: { fontFamily: CoachFonts.headingBold, fontSize: 9, color: CoachColors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },

  emptyState: {
    alignItems: 'center', paddingVertical: 40, gap: 8,
    backgroundColor: CoachColors.surface, borderRadius: 8,
    borderWidth: 1, borderColor: CoachColors.borderMuted, borderStyle: 'dashed',
  },
  emptyTitle: { fontFamily: CoachFonts.headingBold, fontSize: 13, color: CoachColors.textPrimary, letterSpacing: 1 },
  emptyText: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, textAlign: 'center', paddingHorizontal: 32 },
  emptyCTA: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CoachColors.accent, paddingHorizontal: 14, height: 38,
    borderRadius: 4, marginTop: 8,
  },
  emptyCTAText: { fontFamily: CoachFonts.headingBold, fontSize: 11, color: CoachColors.onAccent, letterSpacing: 1, textTransform: 'uppercase' },
});
