import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Dimensions, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import Avatar from '../../components/Avatar';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

const getDietGradient = (category: string) => {
  const lower = category?.toLowerCase() || '';
  if (lower.includes('keto') || lower.includes('carb')) return ['#4f46e5', '#312e81'];
  if (lower.includes('vegan') || lower.includes('plant')) return ['#059669', '#064e3b'];
  if (lower.includes('muscle') || lower.includes('bulk') || lower.includes('protein')) return ['#e11d48', '#881337'];
  if (lower.includes('loss') || lower.includes('cut') || lower.includes('shred')) return ['#0284c7', '#0c4a6e'];
  return ['#1e293b', '#0f172a'];
};

export default function DietDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { diets, deleteDietPlan, duplicateDietPlan, assignDietPlan, activeClients, clientDiets } = useApp();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const [showAssign, setShowAssign] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const diet = useMemo(() => diets.find((d) => d.id === id), [diets, id]);

  if (!diet) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bgPrimary }]}>
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => router.back()} style={styles.glassBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Diet plan not found</Text>
        </View>
      </View>
    );
  }

  const mealsList = diet.diet_plan_meals || [];
  const totals = mealsList.reduce((acc, m) => {
    const servings = m.servings || 1;
    if (m.meals) {
      acc.calories += m.meals.calories * servings;
      acc.protein += m.meals.protein * servings;
      acc.carbs += m.meals.carbs * servings;
      acc.fat += m.meals.fat * servings;
    }
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const MEAL_SECTIONS: { key: string; emoji: string; label: string }[] = [
    { key: 'breakfast', emoji: '🌅', label: 'Breakfast' },
    { key: 'lunch', emoji: '☀️', label: 'Lunch' },
    { key: 'dinner', emoji: '🌙', label: 'Dinner' },
    { key: 'snack', emoji: '🍎', label: 'Snacks' },
  ];

  const groupedMeals = useMemo(() => {
    const groups: Record<string, typeof mealsList> = {};
    for (const dm of mealsList) {
      const key = dm.meal_time || dm.meals?.category?.toLowerCase() || 'other';
      const normalised = MEAL_SECTIONS.some(s => s.key === key) ? key : 'other';
      if (!groups[normalised]) groups[normalised] = [];
      groups[normalised].push(dm);
    }
    return groups;
  }, [mealsList]);

  const handleEdit = () => {
    router.push(`/create-diet?editId=${diet.id}`);
  };

  const handleDuplicate = () => {
    showAlert({
      type: 'confirm',
      title: 'Duplicate Plan',
      message: `Create a copy of "${diet.name}"?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Duplicate',
          onPress: async () => {
            setDuplicating(true);
            try {
              await duplicateDietPlan(diet.id);
              showAlert({ type: 'success', title: 'Duplicated!', message: `"${diet.name}" has been duplicated.` });
              router.back();
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to duplicate' });
            } finally {
              setDuplicating(false);
            }
          },
        },
      ],
    });
  };

  const handleDelete = () => {
    Alert.alert('Delete Diet Plan', `Are you sure you want to delete "${diet.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await deleteDietPlan(diet.id);
            router.back();
          } catch (err: any) {
            Alert.alert('Error', err.message || 'Failed to delete');
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const handleAssign = async (clientId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      await assignDietPlan(diet.id, clientId, today);
      setShowAssign(false);
      Alert.alert('Success', 'Diet plan assigned!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to assign diet plan');
    }
  };

  if (showAssign) {
    const filteredClients = activeClients.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <View style={[styles.container, { backgroundColor: colors.bgPrimary, paddingTop: insets.top }]}>
        <View style={styles.assignHeader}>
          <TouchableOpacity onPress={() => { setShowAssign(false); setSearchQuery(''); }} style={[styles.backBtnDark, { backgroundColor: colors.bgElevated }]}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.assignHeaderTitle, { color: colors.textPrimary }]}>Assign to Client</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md }}>
          <View style={[styles.searchBox, { backgroundColor: colors.bgElevated }]}>
            <Ionicons name="search" size={20} color={colors.textTertiary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search clients..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery !== '' && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.assignList} showsVerticalScrollIndicator={false}>
          {filteredClients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No clients found</Text>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Try a different search term</Text>
            </View>
          ) : (
            filteredClients.map((client) => {
              const alreadyAssigned = clientDiets.some(cd => cd.client_id === client.id && cd.diet_plan_id === diet.id);
              
              return (
                <TouchableOpacity
                  key={client.id}
                  style={[styles.assignItem, { borderBottomColor: colors.border, opacity: alreadyAssigned ? 0.6 : 1 }]}
                  onPress={() => !alreadyAssigned && handleAssign(client.id)}
                  disabled={alreadyAssigned}
                  activeOpacity={0.7}
                >
                  <Avatar name={client.name} size="sm" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.assignName, { color: colors.textPrimary }]}>{client.name}</Text>
                    <Text style={[styles.assignMeta, { color: colors.textTertiary }]}>{client.email || client.phone || 'No contact'}</Text>
                  </View>
                  {alreadyAssigned ? (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: Colors.greenSoft, borderRadius: Radius.full }}>
                      <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.green }}>Assigned</Text>
                    </View>
                  ) : (
                    <View style={styles.assignBtn}>
                      <Ionicons name="add" size={16} color={Colors.white} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  const fallbackGradient = getDietGradient(diet.name);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        
        <View style={styles.heroContainer}>
          {diet.image_url ? (
            <Image 
              source={{ uri: diet.image_url }} 
              style={styles.heroImage} 
              resizeMode="cover" 
            />
          ) : (
            <LinearGradient
              colors={fallbackGradient as any}
              style={styles.heroImage}
            />
          )}
          <LinearGradient
            colors={diet.image_url ? ['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)'] : ['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.6)']}
            style={styles.heroGradient}
          >
            <View style={[styles.topNav, { marginTop: insets.top || Spacing.lg }]}>
              <TouchableOpacity onPress={() => router.back()} style={styles.glassBtn}>
                <Ionicons name="chevron-back" size={24} color={Colors.white} />
              </TouchableOpacity>
              <View style={styles.topNavActions}>
                <TouchableOpacity onPress={handleEdit} style={styles.glassBtn}>
                  <Ionicons name="create-outline" size={22} color={Colors.white} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDuplicate} style={styles.glassBtn} disabled={duplicating}>
                  <Ionicons name="copy-outline" size={22} color={Colors.white} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDelete} style={[styles.glassBtn, { backgroundColor: 'rgba(255,59,48,0.35)' }]} disabled={deleting}>
                  <Ionicons name="trash-outline" size={22} color={Colors.white} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.heroTitleBlock}>
              <View style={styles.totalPill}>
                <Text style={styles.totalPillText}>{mealsList.length} MEALS</Text>
              </View>
              <Text style={styles.heroTitle}>{diet.name}</Text>
              <Text style={styles.heroSubtitle}>With {diet.description || 'Nutrition Coach'}</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.contentSheet}>
          <Text style={styles.descText}>
            {diet.description || 'No description provided'}
          </Text>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Ionicons name="flame" size={16} color="#FFFFFF" />
              <Text style={styles.statValue}>{totals.calories}</Text>
              <Text style={styles.statLabel}>/ {diet.target_calories || 2000} KCAL</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="barbell" size={16} color="#FFFFFF" />
              <Text style={styles.statValue}>{totals.protein}g</Text>
              <Text style={styles.statLabel}>/ {diet.target_protein || 150}G PRO</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="leaf" size={16} color="#FFFFFF" />
              <Text style={styles.statValue}>{totals.carbs}g</Text>
              <Text style={styles.statLabel}>/ {diet.target_carbs || 200}G CARB</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="water" size={16} color="#FFFFFF" />
              <Text style={styles.statValue}>{totals.fat}g</Text>
              <Text style={styles.statLabel}>/ {diet.target_fat || 65}G FAT</Text>
            </View>
          </View>

          <View style={styles.mealList}>
            <Text style={styles.sectionTitle}>DAILY MEALS</Text>
            {MEAL_SECTIONS.map((section) => {
              const meals = groupedMeals[section.key];
              if (!meals || meals.length === 0) return null;
              return (
                <View key={section.key} style={styles.mealSection}>
                  <View style={styles.mealSectionHeader}>
                    <Text style={styles.mealSectionEmoji}>{section.emoji}</Text>
                    <Text style={styles.mealSectionLabel}>{section.label.toUpperCase()}</Text>
                    <View style={styles.mealSectionLine} />
                  </View>
                  {meals
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((dm) => {
                      const m = dm.meals;
                      if (!m) return null;
                      const servings = dm.servings || 1;
                      return (
                        <View key={dm.id} style={styles.mealCard}>
                          <View style={styles.mealImgWrap}>
                            <Ionicons name="restaurant-outline" size={20} color="#FFFFFF" />
                            {servings > 1 && (
                              <View style={styles.servingBadge}>
                                <Text style={styles.servingBadgeText}>{servings}x</Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.mealInfo}>
                            <View style={styles.mealCatPill}>
                              <Text style={styles.mealCatText}>{m.category.toUpperCase()}</Text>
                            </View>
                            <Text style={styles.mealName}>{m.name}</Text>
                            <View style={styles.mealMacrosRow}>
                              <Text style={styles.mealMacroText}>{m.calories * servings} kcal</Text>
                              <Text style={styles.mealMacroDot}>•</Text>
                              <Text style={styles.mealMacroText}>{m.protein * servings}g P</Text>
                              <Text style={styles.mealMacroDot}>•</Text>
                              <Text style={styles.mealMacroText}>{m.carbs * servings}g C</Text>
                              <Text style={styles.mealMacroDot}>•</Text>
                              <Text style={styles.mealMacroText}>{m.fat * servings}g F</Text>
                            </View>
                          </View>
                        </View>
                      );
                  })}
                </View>
              );
            })}
            {/* Ungrouped / "other" meals */}
            {groupedMeals['other'] && groupedMeals['other'].length > 0 && (
              <View style={styles.mealSection}>
                <View style={styles.mealSectionHeader}>
                  <Text style={styles.mealSectionEmoji}>🍽️</Text>
                  <Text style={styles.mealSectionLabel}>OTHER</Text>
                  <View style={styles.mealSectionLine} />
                </View>
                {groupedMeals['other']
                  .sort((a, b) => a.order_index - b.order_index)
                  .map((dm) => {
                    const m = dm.meals;
                    if (!m) return null;
                    const servings = dm.servings || 1;
                    return (
                      <View key={dm.id} style={styles.mealCard}>
                        <View style={styles.mealImgWrap}>
                          <Ionicons name="restaurant-outline" size={20} color="#FFFFFF" />
                          {servings > 1 && (
                            <View style={styles.servingBadge}>
                              <Text style={styles.servingBadgeText}>{servings}x</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.mealInfo}>
                          <View style={styles.mealCatPill}>
                            <Text style={styles.mealCatText}>{m.category.toUpperCase()}</Text>
                          </View>
                          <Text style={styles.mealName}>{m.name}</Text>
                          <View style={styles.mealMacrosRow}>
                            <Text style={styles.mealMacroText}>{m.calories * servings} kcal</Text>
                            <Text style={styles.mealMacroDot}>•</Text>
                            <Text style={styles.mealMacroText}>{m.protein * servings}g P</Text>
                            <Text style={styles.mealMacroDot}>•</Text>
                            <Text style={styles.mealMacroText}>{m.carbs * servings}g C</Text>
                            <Text style={styles.mealMacroDot}>•</Text>
                            <Text style={styles.mealMacroText}>{m.fat * servings}g F</Text>
                          </View>
                        </View>
                      </View>
                    );
                })}
              </View>
            )}
          </View>
          
          <View style={{ height: 100 }} />
        </View>

      </ScrollView>

      <View style={[styles.bottomCTAWrapper, { paddingBottom: insets.bottom || Spacing.xl }]}>
        <TouchableOpacity
          style={styles.bottomBtn}
          onPress={() => setShowAssign(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.bottomBtnText}>ASSIGN TO CLIENT</Text>
          <Ionicons name="restaurant" size={18} color="#000000" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },

  heroContainer: { width: '100%', height: height * 0.4, position: 'relative' },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroGradient: { flex: 1, justifyContent: 'space-between' },

  topNav: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  topNavActions: {
    flexDirection: 'row', gap: Spacing.sm,
  },
  glassBtn: {
    width: 38, height: 38, borderRadius: Radius.xs,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },

  heroTitleBlock: { alignItems: 'center', paddingBottom: 60 },
  totalPill: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: '#000000',
    marginBottom: Spacing.sm,
  },
  totalPillText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#FFFFFF', letterSpacing: 0.5 },
  heroTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 30, color: '#FFFFFF', marginBottom: 4, letterSpacing: -0.5 },
  heroSubtitle: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.7)' },

  contentSheet: {
    backgroundColor: '#000000',
    marginTop: -40, paddingHorizontal: Spacing.lg, paddingTop: Spacing['2xl'],
    minHeight: height * 0.6,
  },

  descText: {
    fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.6)',
    textAlign: 'center', lineHeight: 22, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },

  statsContainer: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md, marginBottom: Spacing.xl,
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: 18, color: '#FFFFFF' },
  statLabel: { fontFamily: FontFamily.heading, fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },

  sectionTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: '#FFFFFF', letterSpacing: 1, marginBottom: Spacing.md },
  mealList: { gap: Spacing.md },
  mealSection: { gap: Spacing.sm },
  mealSectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing.md, marginBottom: Spacing.xs,
  },
  mealSectionEmoji: { fontSize: 18 },
  mealSectionLabel: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 13,
    color: '#FFFFFF', letterSpacing: 0.8,
  },
  mealSectionLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  mealCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: '#0A0A0A', borderRadius: Radius.sm, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  mealImgWrap: {
    width: 48, height: 48, borderRadius: Radius.xs, backgroundColor: '#111111',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  servingBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#FFFFFF', borderRadius: 4,
    minWidth: 18, height: 18, paddingHorizontal: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  servingBadgeText: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 9.5,
    color: '#000000',
  },
  mealInfo: { flex: 1, justifyContent: 'center', paddingRight: Spacing.sm },
  mealCatPill: {
    alignSelf: 'flex-start', backgroundColor: '#1A1A1A',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  mealCatText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 },
  mealName: { fontFamily: FontFamily.headingSemiBold, fontSize: 15, color: '#FFFFFF', marginBottom: 2 },
  mealMacrosRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  mealMacroText: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  mealMacroDot: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.3)' },

  bottomCTAWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'transparent', paddingHorizontal: Spacing.lg,
  },
  bottomBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFFFFF', paddingVertical: 16, borderRadius: Radius.sm,
  },
  bottomBtnText: { fontFamily: FontFamily.headingExtraBold, fontSize: 13, color: '#000000', letterSpacing: 1 },

  assignHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtnDark: {
    width: 36, height: 36, borderRadius: Radius.xs,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  assignHeaderTitle: { flex: 1, fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: '#FFFFFF', textAlign: 'center', letterSpacing: 0.5 },
  assignList: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  assignItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  assignName: { fontFamily: FontFamily.headingSemiBold, fontSize: 15, color: '#FFFFFF' },
  assignMeta: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  assignBtn: { width: 32, height: 32, borderRadius: Radius.xs, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  searchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: 0, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  searchInput: { flex: 1, fontFamily: FontFamily.body, fontSize: 14, color: '#FFFFFF', padding: 0 },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: '#FFFFFF', letterSpacing: 0.5 },
  emptyText: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)' },
});
