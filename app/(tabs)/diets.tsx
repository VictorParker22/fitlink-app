import { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Dimensions, TextInput, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import Card from '../../components/Card';

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

const getDietIcon = (category: string) => {
  switch (category) {
    case 'Keto': return { name: 'water-outline', color: '#6366f1' };
    case 'Vegan': return { name: 'leaf-outline', color: '#10b981' };
    case 'High Protein': return { name: 'barbell-outline', color: '#f43f5e' };
    case 'Weight Loss': return { name: 'trending-down-outline', color: '#0ea5e9' };
    default: return { name: 'nutrition-outline', color: '#8b5cf6' };
  }
};

const CATEGORIES = ['All', 'Balanced', 'High Protein', 'Weight Loss', 'Keto', 'Vegan'];

export default function DietsScreen() {
  const router = useRouter();
  const { diets, clientDiets, refreshData } = useApp();
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
                <Text style={styles.categoryPillText}>{cat.toUpperCase()}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.cardTouch}>
            {!item.image_url && (
              <View style={styles.cardHeaderRow}>
                <View style={styles.iconBox}>
                  <Ionicons name="nutrition" size={20} color="#FFFFFF" />
                </View>
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryPillText}>{cat.toUpperCase()}</Text>
                </View>
              </View>
            )}
          
            <View style={styles.cardInfo}>
              <Text style={styles.dietName} numberOfLines={1}>{item.name.toUpperCase()}</Text>
              <Text style={styles.dietAuthor} numberOfLines={2}>{item.description || 'NUTRITION PROGRAM'}</Text>
            </View>

            {/* High Density Metric Grid */}
            <View style={styles.metricGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>ENERGY</Text>
                <Text style={styles.metricValue}>{Math.round(totalCals)}</Text>
                <Text style={styles.metricUnit}>KCAL</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>PROTEIN</Text>
                <Text style={styles.metricValue}>{Math.round(totalPro)}G</Text>
                <Text style={styles.metricUnit}>TARGET</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>MEALS</Text>
                <Text style={styles.metricValue}>{mealsList.length}</Text>
                <Text style={styles.metricUnit}>ITEMS</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>CLIENTS</Text>
                <Text style={styles.metricValue}>{activeClientsCount}</Text>
                <Text style={styles.metricUnit}>ASSIGNED</Text>
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
          <Text style={styles.headerSub}>NUTRITION DATABASE</Text>
          <Text style={styles.title}>DIET PLANS</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/create-diet' as any)}
          accessibilityRole="button"
          accessibilityLabel="Create new diet plan"
        >
          <Ionicons name="add" size={20} color="#000000" />
          <Text style={styles.addBtnText}>CREATE</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={styles.searchInput}
            placeholder="SEARCH NUTRITION PLANS..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityRole="search"
            accessibilityLabel="Search nutrition plans"
          />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
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
                {cat.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsText}>{filteredDiets.length} PLANS CATALOGED</Text>
      </View>

      <FlatList
        data={filteredDiets}
        keyExtractor={(item) => item.id}
        renderItem={renderDiet}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFFFFF" colors={['#FFFFFF']} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="nutrition-outline" size={32} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyTitle}>NO DIET PLANS FOUND</Text>
            <Text style={styles.emptyText}>Adjust your search query or filter to locate nutrition programs.</Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              onPress={() => router.push('/create-diet' as any)}
              accessibilityRole="button"
              accessibilityLabel="Create new diet plan"
            >
              <Ionicons name="add" size={16} color="#000000" />
              <Text style={styles.emptyCTAText}>BUILD NEW DIET</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerSub: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 2 },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: 26, color: '#FFFFFF', letterSpacing: -0.5 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 38, paddingHorizontal: 14, borderRadius: Radius.xs,
    backgroundColor: '#FFFFFF', justifyContent: 'center',
  },
  addBtnText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#000000', letterSpacing: 1 },

  searchContainer: { paddingHorizontal: 20, marginBottom: 12 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.xs, paddingHorizontal: 14, height: 46,
  },
  searchInput: {
    flex: 1, fontFamily: FontFamily.headingExtraBold, fontSize: 12,
    color: '#FFFFFF', paddingVertical: 0, letterSpacing: 0.5,
  },

  filterScroll: { paddingHorizontal: 20, gap: 6, paddingBottom: 12 },
  filterPill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: Radius.xs, backgroundColor: '#0A0A0A',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  filterPillActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  filterPillText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 },
  filterPillTextActive: { color: '#000000' },

  resultsHeader: {
    paddingHorizontal: 20, marginBottom: 12,
  },
  resultsText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },

  list: { paddingHorizontal: 20, paddingBottom: 120, gap: 12 },

  cardContainer: {
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  uploadedImageContainer: {
    width: '100%', height: 120, position: 'relative',
  },
  uploadedImage: { width: '100%', height: '100%' },
  categoryPillFloating: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: '#000000', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  cardTouch: { padding: 16 },
  cardHeaderRow: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: Radius.xs,
    backgroundColor: '#111111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  categoryPill: {
    backgroundColor: '#111111', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: Radius.xs, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  categoryPillText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: '#FFFFFF', letterSpacing: 0.5 },
  
  cardInfo: { marginBottom: 16 },
  dietName: { fontFamily: FontFamily.headingExtraBold, fontSize: 17, color: '#FFFFFF', marginBottom: 4, letterSpacing: -0.3 },
  dietAuthor: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 18 },

  metricGrid: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#111111', borderRadius: Radius.xs, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  metricBox: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.08)' },
  metricLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  metricValue: { fontFamily: FontFamily.headingExtraBold, fontSize: 15, color: '#FFFFFF', marginVertical: 2 },
  metricUnit: { fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5 },

  emptyState: {
    alignItems: 'center', paddingVertical: 40, gap: 8,
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderStyle: 'dashed',
  },
  emptyTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 13, color: '#FFFFFF', letterSpacing: 1 },
  emptyText: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', paddingHorizontal: 32 },
  emptyCTA: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', paddingHorizontal: 14, height: 38,
    borderRadius: Radius.xs, marginTop: 8,
  },
  emptyCTAText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#000000', letterSpacing: 1 },
});
