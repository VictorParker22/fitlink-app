import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const { width, height } = Dimensions.get('window');

const getDietImage = (category: string) => {
  const lower = category?.toLowerCase() || '';
  if (lower.includes('keto') || lower.includes('carb')) return require('../../assets/images/welcome-2.png');
  if (lower.includes('vegan') || lower.includes('plant')) return require('../../assets/images/welcome-3.png');
  return require('../../assets/images/welcome-1.png');
};

export default function DietDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { diets, deleteDietPlan, assignDietPlan, activeClients } = useApp();
  const [showAssign, setShowAssign] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const diet = useMemo(() => diets.find((d) => d.id === id), [diets, id]);

  if (!diet) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => router.back()} style={styles.glassBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Diet plan not found</Text>
        </View>
      </View>
    );
  }

  const mealsList = diet.diet_plan_meals || [];
  const totals = mealsList.reduce((acc, m) => {
    if (m.meals) {
      acc.calories += m.meals.calories;
      acc.protein += m.meals.protein;
      acc.carbs += m.meals.carbs;
      acc.fat += m.meals.fat;
    }
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

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
    return (
      <View style={[styles.container, { backgroundColor: Colors.bgPrimary, paddingTop: insets.top }]}>
        <View style={styles.assignHeader}>
          <TouchableOpacity onPress={() => setShowAssign(false)} style={styles.backBtnDark}>
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.assignHeaderTitle}>Assign to Client</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.assignList}>
          {activeClients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No active clients</Text>
              <Text style={styles.emptyText}>Add clients first to assign diet plans</Text>
            </View>
          ) : (
            activeClients.map((client) => (
              <TouchableOpacity
                key={client.id}
                style={styles.assignItem}
                onPress={() => handleAssign(client.id)}
              >
                <Avatar name={client.name} size="sm" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.assignName}>{client.name}</Text>
                  <Text style={styles.assignMeta}>{client.email || client.phone || 'No contact'}</Text>
                </View>
                <View style={styles.assignBtn}>
                  <Ionicons name="arrow-forward" size={16} color={Colors.white} />
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  const heroImage = getDietImage(diet.name);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        
        <View style={styles.heroContainer}>
          <Image source={heroImage} style={styles.heroImage} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)']}
            style={styles.heroGradient}
          >
            <View style={[styles.topNav, { marginTop: insets.top || Spacing.lg }]}>
              <TouchableOpacity onPress={() => router.back()} style={styles.glassBtn}>
                <Ionicons name="chevron-back" size={24} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.glassBtn} disabled={deleting}>
                <Ionicons name="settings-outline" size={22} color={Colors.white} />
              </TouchableOpacity>
            </View>

            <View style={styles.heroTitleBlock}>
              <View style={styles.totalPill}>
                <Text style={styles.totalPillText}>{mealsList.length} Meals</Text>
              </View>
              <Text style={styles.heroTitle}>{diet.name}</Text>
              <Text style={styles.heroSubtitle}>With {diet.description || 'Nutrition Coach'}</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.contentSheet}>
          <Text style={styles.descText}>
            Transform your health with this optimized nutrition protocol tailored specifically for your goals.
          </Text>

          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Ionicons name="flame" size={16} color={Colors.accent} />
              <Text style={styles.statValue}>{totals.calories}</Text>
              <Text style={styles.statLabel}>Kcal</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="barbell" size={16} color={Colors.blue} />
              <Text style={styles.statValue}>{totals.protein}g</Text>
              <Text style={styles.statLabel}>Protein</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="leaf" size={16} color={Colors.green} />
              <Text style={styles.statValue}>{totals.carbs}g</Text>
              <Text style={styles.statLabel}>Carbs</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="water" size={16} color={Colors.purple} />
              <Text style={styles.statValue}>{totals.fat}g</Text>
              <Text style={styles.statLabel}>Fat</Text>
            </View>
          </View>

          <View style={styles.mealList}>
            <Text style={styles.sectionTitle}>Daily Meals</Text>
            {mealsList
              .sort((a, b) => a.order_index - b.order_index)
              .map((dm, index) => {
                const m = dm.meals;
                if (!m) return null;
                return (
                  <View key={dm.id} style={styles.mealCard}>
                    <View style={styles.mealImgWrap}>
                      <Ionicons name="restaurant" size={24} color={Colors.accent} />
                    </View>

                    <View style={styles.mealInfo}>
                      <View style={styles.mealCatPill}>
                        <Text style={styles.mealCatText}>{m.category}</Text>
                      </View>
                      <Text style={styles.mealName}>{m.name}</Text>
                      <View style={styles.mealMacrosRow}>
                        <Text style={styles.mealMacroText}>{m.calories} kcal</Text>
                        <Text style={styles.mealMacroDot}>•</Text>
                        <Text style={styles.mealMacroText}>{m.protein}g P</Text>
                        <Text style={styles.mealMacroDot}>•</Text>
                        <Text style={styles.mealMacroText}>{m.carbs}g C</Text>
                        <Text style={styles.mealMacroDot}>•</Text>
                        <Text style={styles.mealMacroText}>{m.fat}g F</Text>
                      </View>
                    </View>
                  </View>
                );
            })}
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
          <Text style={styles.bottomBtnText}>Assign to Client</Text>
          <Ionicons name="restaurant" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  heroContainer: { width: '100%', height: height * 0.45 },
  heroImage: { width: '100%', height: '100%', position: 'absolute' },
  heroGradient: { flex: 1, justifyContent: 'space-between' },

  topNav: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
  },
  glassBtn: {
    width: 44, height: 44, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(10px)',
  },

  heroTitleBlock: { alignItems: 'center', paddingBottom: 60 },
  totalPill: {
    paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: Spacing.sm,
  },
  totalPillText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.white },
  heroTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 32, color: Colors.white, marginBottom: 4 },
  heroSubtitle: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)' },

  contentSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    marginTop: -40, paddingHorizontal: Spacing.lg, paddingTop: Spacing['2xl'],
    minHeight: height * 0.6,
  },

  descText: {
    fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 22, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },

  statsContainer: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md, marginBottom: Spacing['2xl'],
  },
  statItem: { flex: 1, alignItems: 'center', gap: 6 },
  statDivider: { width: 1, height: 40, backgroundColor: Colors.border },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  statLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: Colors.textTertiary, textTransform: 'uppercase' },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary, marginBottom: Spacing.md },
  mealList: { gap: Spacing.md },
  mealCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgElevated, borderRadius: 24, padding: Spacing.sm,
  },
  mealImgWrap: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  mealInfo: { flex: 1, justifyContent: 'center', paddingRight: Spacing.sm },
  mealCatPill: {
    alignSelf: 'flex-start', backgroundColor: Colors.border,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 6,
  },
  mealCatText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: Colors.textSecondary },
  mealName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: Colors.textPrimary, marginBottom: 4 },
  mealMacrosRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  mealMacroText: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: Colors.textTertiary },
  mealMacroDot: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.borderStrong },

  bottomCTAWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'transparent', paddingHorizontal: Spacing.lg,
  },
  bottomBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accent, paddingVertical: 18, borderRadius: Radius.full,
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10,
  },
  bottomBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.white },

  assignHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtnDark: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  assignHeaderTitle: { flex: 1, fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary, textAlign: 'center' },
  assignList: { paddingHorizontal: Spacing.lg, paddingBottom: 100, paddingTop: Spacing.md },
  assignItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  assignName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  assignMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },
  assignBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
