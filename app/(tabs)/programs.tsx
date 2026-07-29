import { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, ScrollView, Modal, Image as RNImage } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useApp, ClassItem } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { getWorkoutEmblem } from '../../utils/workoutEmblems';
import { getCategoryColor } from '../../data/categoryColors';

type TabType = 'workouts' | 'exercises' | 'diets' | 'plans' | 'classes';

const stripHtml = (html?: string) => {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
};

export default function ProgramsScreen() {
  const router = useRouter();
  const { workouts, exercises, diets, plans, classes, refreshData, deleteWorkout, deleteDietPlan, deleteClass } = useApp();
  const { colors } = useTheme();
  const { showAlert } = useAlert();

  const [activeTab, setActiveTab] = useState<TabType>('workouts');
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [showAddActionSheet, setShowAddActionSheet] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const categories = useMemo(() => {
    if (activeTab !== 'exercises') return ['All'];
    const set = new Set<string>();
    exercises.forEach(e => {
      if (e.category) set.add(e.category);
      if (e.muscle_group) set.add(e.muscle_group);
    });
    return ['All', ...Array.from(set).sort()];
  }, [exercises, activeTab]);

  const filteredExercises = useMemo(() => {
    if (activeTab !== 'exercises') return [];
    let list = exercises;
    if (activeCategory !== 'All') {
      list = list.filter(e => e.category === activeCategory || e.muscle_group === activeCategory);
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.muscle_group.toLowerCase().includes(q) ||
        (e.category && e.category.toLowerCase().includes(q))
    );
  }, [exercises, searchQuery, activeCategory, activeTab]);

  const filteredWorkouts = useMemo(() => {
    if (activeTab !== 'workouts') return [];
    if (!searchQuery.trim()) return workouts;
    const q = searchQuery.toLowerCase();
    return workouts.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.description?.toLowerCase().includes(q)
    );
  }, [workouts, searchQuery, activeTab]);

  const filteredDiets = useMemo(() => {
    if (activeTab !== 'diets') return [];
    if (!searchQuery.trim()) return diets;
    const q = searchQuery.toLowerCase();
    return diets.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.description?.toLowerCase().includes(q)
    );
  }, [diets, searchQuery, activeTab]);

  const filteredPlans = useMemo(() => {
    if (activeTab !== 'plans') return [];
    if (!searchQuery.trim()) return plans;
    const q = searchQuery.toLowerCase();
    return plans.filter((p) => p.name.toLowerCase().includes(q));
  }, [plans, searchQuery, activeTab]);

  const filteredClasses = useMemo(() => {
    if (activeTab !== 'classes') return [];
    if (!searchQuery.trim()) return classes;
    const q = searchQuery.toLowerCase();
    return classes.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }, [classes, searchQuery, activeTab]);

  const handleDeleteWorkout = (id: string, name: string) => {
    showAlert({
      type: 'warning',
      title: 'Delete Workout',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorkout(id);
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete workout' });
            }
          }
        }
      ]
    });
  };

  const handleDeleteDiet = (id: string, name: string) => {
    showAlert({
      type: 'warning',
      title: 'Delete Diet Plan',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDietPlan(id);
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete diet plan' });
            }
          }
        }
      ]
    });
  };

  const handleDeleteClass = (id: string, title: string) => {
    showAlert({
      type: 'warning',
      title: 'Delete Class',
      message: `Are you sure you want to delete "${title}"? This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClass(id);
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete class' });
            }
          }
        }
      ]
    });
  };

  const currentData = useMemo(() => {
    switch (activeTab) {
      case 'workouts': return filteredWorkouts;
      case 'exercises': return filteredExercises;
      case 'diets': return filteredDiets;
      case 'plans': return filteredPlans;
      case 'classes': return filteredClasses;
    }
  }, [activeTab, filteredWorkouts, filteredExercises, filteredDiets, filteredPlans, filteredClasses]);

  const handleActionSheetNavigate = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAddActionSheet(false);
    router.push(route as any);
  };

  const renderWorkoutItem = ({ item }: { item: typeof workouts[0] }) => {
    const exerciseCount = item.workout_exercises?.length || 0;
    const subtitle = `${exerciseCount} Exercise${exerciseCount !== 1 ? 's' : ''} • On-demand`;
    const desc = item.description || 'No description provided.';

    const muscleGroups = item.workout_exercises?.map((we: any) => we.exercises?.muscle_group).filter(Boolean);
    const emblemImage = getWorkoutEmblem(item.id, item.name, muscleGroups);
    
    return (
      <TouchableOpacity 
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/workout/${item.id}` as any)}
      >
        <View style={styles.thumbnailContainer}>
          <RNImage source={emblemImage} style={{ width: 44, height: 44, borderRadius: Radius.xs }} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.name.toUpperCase()}</Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle.toUpperCase()}</Text>
          <Text style={styles.rowDescription} numberOfLines={2}>{desc.toUpperCase()}</Text>
        </View>
        <TouchableOpacity onPress={() => handleDeleteWorkout(item.id, item.name)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={16} color="rgba(239, 68, 68, 0.7)" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderExerciseItem = ({ item }: { item: typeof exercises[0] }) => {
    const subtitle = `${item.muscle_group.toUpperCase()} • ${item.equipment || 'BODYWEIGHT'}`;
    const desc = stripHtml(item.instructions) || 'No instructions provided.';

    return (
      <TouchableOpacity 
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/create-exercise?editId=${item.id}` as any)}
      >
        <View style={styles.thumbnailContainer}>
          <Ionicons 
            name={item.is_custom ? 'person-outline' : 'globe-outline'} 
            size={22} 
            color="#FFFFFF" 
          />
        </View>
        <View style={styles.textContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.name.toUpperCase()}</Text>
            {item.is_custom && (
              <View style={styles.customBadge}>
                <Text style={styles.customBadgeText}>CUSTOM</Text>
              </View>
            )}
          </View>
          <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle.toUpperCase()}</Text>
          <Text style={styles.rowDescription} numberOfLines={2}>{desc.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDietItem = ({ item }: { item: typeof diets[0] }) => {
    const mealCount = item.diet_plan_meals?.length || 0;
    let totalCals = 0;
    (item.diet_plan_meals || []).forEach(m => {
      if (m.meals) totalCals += m.meals.calories * (m.servings || 1);
    });
    const catLabel = item.category ? { 'balanced': 'BALANCED', 'high-protein': 'HIGH PROTEIN', 'keto': 'KETO', 'vegan': 'VEGAN', 'weight-loss': 'WEIGHT LOSS', 'custom': 'CUSTOM' }[item.category] || 'CUSTOM' : 'NUTRITION';
    const subtitle = `${mealCount} MEALS • ${Math.round(totalCals)} CAL • ${catLabel}`;
    const desc = item.description || 'Nutritional meals plan details.';

    return (
      <TouchableOpacity 
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/diet/${item.id}` as any)}
      >
        <View style={styles.thumbnailContainer}>
          <Ionicons name="nutrition-outline" size={22} color="#FFFFFF" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.name.toUpperCase()}</Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle.toUpperCase()}</Text>
          <Text style={styles.rowDescription} numberOfLines={2}>{desc.toUpperCase()}</Text>
        </View>
        <TouchableOpacity onPress={() => handleDeleteDiet(item.id, item.name)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={16} color="rgba(239, 68, 68, 0.7)" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderPlanItem = ({ item }: { item: typeof plans[0] }) => {
    const subtitle = `${item.period.toUpperCase()} • $${item.price}`;
    const desc = item.features && item.features.length > 0 
      ? item.features.join(', ') 
      : 'Membership subscription plan features.';

    return (
      <TouchableOpacity 
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/plan/${item.id}` as any)}
      >
        <View style={[styles.thumbnailContainer, { borderColor: item.color || 'rgba(255,255,255,0.2)' }]}>
          <Ionicons name="card-outline" size={22} color="#FFFFFF" />
        </View>
        <View style={styles.textContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.name.toUpperCase()}</Text>
            {item.is_popular && (
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>POPULAR</Text>
              </View>
            )}
          </View>
          <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle.toUpperCase()}</Text>
          <Text style={styles.rowDescription} numberOfLines={2}>{desc.toUpperCase()}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderClassItem = ({ item }: { item: ClassItem }) => {
    const statusColors = {
      'DRAFT': '#9CA3AF',
      'PUBLISHED': '#10B981',
      'ARCHIVED': '#F59E0B'
    };
    const statusColor = statusColors[item.status as keyof typeof statusColors] || '#9CA3AF';
    const categoryColor = item.category ? getCategoryColor(item.category) : '#FFFFFF';

    return (
      <TouchableOpacity 
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => router.push(`/class/${item.id}` as any)}
        onLongPress={() => handleDeleteClass(item.id, item.title)}
      >
        <View style={styles.thumbnailContainer}>
          {item.thumbnail_url ? (
            <RNImage source={{ uri: item.thumbnail_url }} style={{ width: 44, height: 44, borderRadius: Radius.xs }} />
          ) : (
            <Ionicons name="videocam-outline" size={22} color="#FFFFFF" />
          )}
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title.toUpperCase()}</Text>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <View style={[styles.pillBadge, { borderColor: categoryColor }]}>
              <Text style={[styles.pillBadgeText, { color: categoryColor }]}>{item.category?.toUpperCase() || 'UNCATEGORIZED'}</Text>
            </View>
            <View style={[styles.pillBadge, { borderColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={[styles.pillBadgeText, { color: '#FFFFFF' }]}>{item.difficulty?.toUpperCase() || 'ALL LEVELS'}</Text>
            </View>
            <View style={[styles.pillBadge, { borderColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={[styles.pillBadgeText, { color: '#FFFFFF' }]}>{item.duration_minutes || 0} MIN</Text>
            </View>
            <View style={[styles.pillBadge, { borderColor: statusColor }]}>
              <Text style={[styles.pillBadgeText, { color: statusColor }]}>{item.status?.toUpperCase() || 'DRAFT'}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="play-outline" size={12} color="rgba(255,255,255,0.4)" />
              <Text style={styles.rowDescription}>{item.take_count || 0}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="star-outline" size={12} color="rgba(255,255,255,0.4)" />
              <Text style={styles.rowDescription}>{(item.avg_rating || 0).toFixed(1)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.4)" />
              <Text style={styles.rowDescription}>{item.total_watch_minutes || 0}M</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity onPress={() => handleDeleteClass(item.id, item.title)} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={16} color="rgba(239, 68, 68, 0.7)" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        
        {/* Luxury Header Row */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>LIBRARY</Text>
          <TouchableOpacity 
            style={styles.headerAddBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAddActionSheet(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Create content menu"
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
            placeholder={`SEARCH ${activeTab.toUpperCase()}...`}
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

        {/* Editorial Text Toggles */}
        <View style={styles.filtersWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.togglesContainer}>
            {(['workouts', 'exercises', 'diets', 'plans', 'classes'] as TabType[]).map((tab) => {
              let iconName: any = '';
              if (tab === 'workouts') iconName = activeTab === tab ? 'barbell' : 'barbell-outline';
              if (tab === 'exercises') iconName = activeTab === tab ? 'fitness' : 'fitness-outline';
              if (tab === 'diets') iconName = activeTab === tab ? 'nutrition' : 'nutrition-outline';
              if (tab === 'plans') iconName = activeTab === tab ? 'card' : 'card-outline';
              if (tab === 'classes') iconName = activeTab === tab ? 'videocam' : 'videocam-outline';
              return (
              <TouchableOpacity
                key={tab}
                style={[styles.toggleBtn, activeTab === tab && styles.toggleBtnActive, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                onPress={() => { 
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(tab); 
                  setSearchQuery(''); 
                  setActiveCategory('All'); 
                }}
                activeOpacity={0.8}
              >
                <Ionicons name={iconName} size={14} color={activeTab === tab ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)'} />
                <Text style={[styles.toggleText, activeTab === tab && styles.toggleTextActive]}>
                  {tab.toUpperCase()}
                </Text>
              </TouchableOpacity>
            )})}
          </ScrollView>
        </View>

        {activeTab === 'exercises' && (
          <View style={styles.categorySubWrapper}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categorySubScroll}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catTag, activeCategory === cat && styles.catTagActive]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveCategory(cat);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.catTagText, activeCategory === cat && styles.catTagTextActive]}>
                    {cat.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Results Counter Info */}
        <View style={styles.resultsInfoRow}>
          <Text style={styles.resultsText}>
            {currentData?.length || 0} {activeTab.toUpperCase()}
          </Text>
        </View>

        {/* Flat List Content */}
        <FlatList
          data={currentData as any}
          keyExtractor={(item: any) => item.id}
          renderItem={
            (activeTab === 'workouts' ? renderWorkoutItem :
            activeTab === 'exercises' ? renderExerciseItem :
            activeTab === 'diets' ? renderDietItem :
            activeTab === 'classes' ? renderClassItem :
            renderPlanItem) as any
          }
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
              <Ionicons name="folder-open-outline" size={40} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyTitle}>NO {activeTab.toUpperCase()} FOUND</Text>
              <Text style={styles.emptyText}>TAP THE "+ ADD" BUTTON IN THE HEADER TO CREATE YOUR FIRST CONTENT ITEM.</Text>
            </View>
          }
        />
      </SafeAreaView>

      {/* Action Sheet Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showAddActionSheet}
        onRequestClose={() => setShowAddActionSheet(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowAddActionSheet(false)}
        >
          <View style={styles.actionSheetContent} onStartShouldSetResponder={() => true}>
            <View style={styles.dragHandle} />
            <Text style={styles.actionSheetTitle}>CREATE NEW CONTENT</Text>

            <TouchableOpacity 
              style={styles.actionSheetItem} 
              onPress={() => handleActionSheetNavigate('/create-class')}
            >
              <View style={[styles.actionSheetIconWrap, { backgroundColor: 'rgba(168, 85, 247, 0.1)' }]}>
                <Ionicons name="videocam-outline" size={20} color="#A855F7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionSheetItemTitle}>ON-DEMAND CLASS</Text>
                <Text style={styles.actionSheetItemSubtitle}>Record and publish video classes</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionSheetItem} 
              onPress={() => handleActionSheetNavigate('/create-live-class')}
            >
              <View style={[styles.actionSheetIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                <Ionicons name="radio-outline" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionSheetItemTitle}>LIVE VIRTUAL CLASS</Text>
                <Text style={styles.actionSheetItemSubtitle}>Broadcast real-time sessions to clients</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionSheetItem} 
              onPress={() => handleActionSheetNavigate('/create-workout')}
            >
              <View style={styles.actionSheetIconWrap}>
                <Ionicons name="barbell-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionSheetItemTitle}>WORKOUT TEMPLATE</Text>
                <Text style={styles.actionSheetItemSubtitle}>Build an exercise routine for your clients</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionSheetItem} 
              onPress={() => handleActionSheetNavigate('/create-exercise')}
            >
              <View style={styles.actionSheetIconWrap}>
                <Ionicons name="fitness-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionSheetItemTitle}>CUSTOM EXERCISE</Text>
                <Text style={styles.actionSheetItemSubtitle}>Add a new movement to your library</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionSheetItem} 
              onPress={() => handleActionSheetNavigate('/create-diet')}
            >
              <View style={styles.actionSheetIconWrap}>
                <Ionicons name="nutrition-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionSheetItemTitle}>NUTRITION PLAN</Text>
                <Text style={styles.actionSheetItemSubtitle}>Design meal targets & macronutrients</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionSheetItem} 
              onPress={() => handleActionSheetNavigate('/create-plan')}
            >
              <View style={styles.actionSheetIconWrap}>
                <Ionicons name="card-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionSheetItemTitle}>BILLING PLAN</Text>
                <Text style={styles.actionSheetItemSubtitle}>Create a membership subscription tier</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.closeSheetBtn} 
              onPress={() => setShowAddActionSheet(false)}
            >
              <Text style={styles.closeSheetText}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingVertical: 18,
  },
  togglesContainer: {
    paddingHorizontal: 20,
    gap: 24,
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
    letterSpacing: 0.8,
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontFamily: FontFamily.headingExtraBold,
  },

  // Exercise Sub-categories
  categorySubWrapper: {
    marginBottom: 12,
  },
  categorySubScroll: {
    paddingHorizontal: 20,
    gap: 8,
  },
  catTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#0A0A0A',
  },
  catTagActive: {
    borderColor: '#FFFFFF',
    backgroundColor: '#FFFFFF',
  },
  catTagText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  catTagTextActive: {
    color: '#000000',
    fontFamily: FontFamily.headingExtraBold,
  },

  // Results Label
  resultsInfoRow: {
    paddingHorizontal: 20,
    marginBottom: 12,
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
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  thumbnailContainer: {
    width: 48,
    height: 48,
    borderRadius: Radius.xs,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
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
  actionBtn: {
    padding: 8,
    justifyContent: 'center',
    alignSelf: 'center',
  },

  // Badges
  customBadge: {
    backgroundColor: '#1A0C0C',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#FF6B6B',
    borderRadius: Radius.xs,
    marginLeft: 8,
  },
  customBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 8,
    color: '#FF6B6B',
    letterSpacing: 0.5,
  },
  popularBadge: {
    backgroundColor: '#1A1408',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: Radius.xs,
    marginLeft: 8,
  },
  popularBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 8,
    color: '#F59E0B',
    letterSpacing: 0.5,
  },
  pillBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: Radius.xs,
    backgroundColor: '#111111',
  },
  pillBadgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 8,
    letterSpacing: 0.5,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 1,
    marginTop: 8,
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 18,
  },

  // Action Sheet Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  actionSheetContent: {
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: Radius.sm,
    borderTopRightRadius: Radius.sm,
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  dragHandle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  actionSheetTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#121212',
    padding: 14,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  actionSheetIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetItemTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  actionSheetItemSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  closeSheetBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  closeSheetText: {
    fontFamily: FontFamily.heading,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
});
