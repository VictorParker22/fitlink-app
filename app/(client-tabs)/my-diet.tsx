import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { ClientRoute } from '../../types/routes';
import * as Haptics from 'expo-haptics';

const MEAL_ICONS: Record<string, { icon: string; color: string }> = {
  breakfast: { icon: 'sunny', color: '#F59E0B' },
  lunch: { icon: 'restaurant', color: '#22C55E' },
  dinner: { icon: 'moon', color: '#6C9BF2' },
  snack: { icon: 'cafe', color: '#A78BFA' },
  'pre-workout': { icon: 'flash', color: '#FF6B35' },
  'post-workout': { icon: 'fitness', color: '#14B8A6' },
};

function getMealIcon(time: string) {
  const key = (time || '').toLowerCase().trim();
  return MEAL_ICONS[key] || { icon: 'nutrition', color: '#22C55E' };
}

// Mini donut for macro breakdown
function MacroDonut({ size, cals, protein, carbs, fat, color }: { size: number; cals: number; protein: number; carbs: number; fat: number; color: ThemeColors }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const total = protein + carbs + fat || 1;
  const protPct = protein / total;
  const carbPct = carbs / total;
  // fat is the remainder
  return (
    <Svg width={size} height={size}>
      <Circle cx={size/2} cy={size/2} r={r} stroke={color.bgElevated} strokeWidth={6} fill="none" />
      <Circle cx={size/2} cy={size/2} r={r} stroke="#FF6B35" strokeWidth={6} fill="none" strokeDasharray={`${c * protPct} ${c * (1 - protPct)}`} transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      <Circle cx={size/2} cy={size/2} r={r} stroke="#6C9BF2" strokeWidth={6} fill="none" strokeDasharray={`${c * carbPct} ${c * (1 - carbPct)}`} strokeDashoffset={-c * protPct} transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      <Circle cx={size/2} cy={size/2} r={r} stroke="#22C55E" strokeWidth={6} fill="none" strokeDasharray={`${c * (1 - protPct - carbPct)} ${c * (protPct + carbPct)}`} strokeDashoffset={-c * (protPct + carbPct)} transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
    </Svg>
  );
}

export default function ClientDietScreen() {
  const router = useRouter();
  const { diets, refreshData, mealLogs, logMealEaten, unlogMeal } = useClient();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // Compute total macros across all active plans
  const globalMacros = useMemo(() => {
    let cals = 0, protein = 0, carbs = 0, fat = 0;
    diets.forEach((d: any) => {
      (d.diet_plans?.diet_plan_meals || []).forEach((m: any) => {
        cals += m.meals?.calories || 0;
        protein += m.meals?.protein || 0;
        carbs += m.meals?.carbs || 0;
        fat += m.meals?.fat || 0;
      });
    });
    return { cals, protein, carbs, fat };
  }, [diets]);

  // Compute consumed macros based on mealLogs
  const consumedMacros = useMemo(() => {
    let cals = 0, protein = 0, carbs = 0, fat = 0;
    diets.forEach((d: any) => {
      (d.diet_plans?.diet_plan_meals || []).forEach((m: any) => {
        if (mealLogs[m.id]) {
          cals += m.meals?.calories || 0;
          protein += m.meals?.protein || 0;
          carbs += m.meals?.carbs || 0;
          fat += m.meals?.fat || 0;
        }
      });
    });
    return { cals, protein, carbs, fat };
  }, [diets, mealLogs]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.push(ClientRoute.more)} activeOpacity={0.6}>
        <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Nutrition</Text>
          <Text style={styles.subtitle}>{diets.length} plan{diets.length !== 1 ? 's' : ''} from your coach</Text>
        </View>
      </View>

      <FlatList
        data={diets}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListHeaderComponent={diets.length > 0 ? (
          <>
            {/* Daily Macros Summary Card */}
            <LinearGradient colors={isDark ? ['#1A1A24', '#22222E'] : ['#1C1C21', '#2A2A32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.macroSummary}>
              <View style={styles.macroSummaryLeft}>
                <MacroDonut size={80} cals={consumedMacros.cals} protein={consumedMacros.protein} carbs={consumedMacros.carbs} fat={consumedMacros.fat} color={colors} />
                <View style={styles.macroCenter}>
                  <Text style={styles.macroCenterVal}>{consumedMacros.cals}</Text>
                  <Text style={styles.macroCenterLabel}>of {globalMacros.cals}</Text>
                </View>
              </View>
              <View style={styles.macroBreakdown}>
                <View style={styles.macroItem}>
                  <View style={[styles.macroDot, { backgroundColor: '#FF6B35' }]} />
                  <View>
                    <Text style={styles.macroItemVal}>{consumedMacros.protein}g <Text style={{fontSize: 10, color: 'rgba(255,255,255,0.4)'}}>/ {globalMacros.protein}g</Text></Text>
                    <Text style={styles.macroItemLabel}>Protein Eaten</Text>
                  </View>
                </View>
                <View style={styles.macroItem}>
                  <View style={[styles.macroDot, { backgroundColor: '#6C9BF2' }]} />
                  <View>
                    <Text style={styles.macroItemVal}>{consumedMacros.carbs}g <Text style={{fontSize: 10, color: 'rgba(255,255,255,0.4)'}}>/ {globalMacros.carbs}g</Text></Text>
                    <Text style={styles.macroItemLabel}>Carbs Eaten</Text>
                  </View>
                </View>
                <View style={styles.macroItem}>
                  <View style={[styles.macroDot, { backgroundColor: '#22C55E' }]} />
                  <View>
                    <Text style={styles.macroItemVal}>{consumedMacros.fat}g <Text style={{fontSize: 10, color: 'rgba(255,255,255,0.4)'}}>/ {globalMacros.fat}g</Text></Text>
                    <Text style={styles.macroItemLabel}>Fat Eaten</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
            <Text style={styles.sectionTitle}>Your Plans</Text>
          </>
        ) : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="nutrition-outline" size={40} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No diet plans yet</Text>
            <Text style={styles.emptyText}>Your trainer will assign a nutrition plan to you</Text>
          </View>
        }
        renderItem={({ item: diet }) => {
          const plan = diet.diet_plans;
          if (!plan) return null;
          const meals = plan.diet_plan_meals || [];
          const isExpanded = expandedId === diet.id;
          const totalCals = meals.reduce((s: number, m: any) => s + (m.meals?.calories || 0), 0);
          const totalProtein = meals.reduce((s: number, m: any) => s + (m.meals?.protein || 0), 0);

          return (
            <Card style={styles.dietCard}>
              <TouchableOpacity onPress={() => setExpandedId(isExpanded ? null : diet.id)} activeOpacity={0.8} accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} diet plan ${plan.name}`} accessibilityRole="button">
                <View style={styles.dietHeader}>
                  <View style={[styles.dietIconBox, { backgroundColor: `${colors.green}15` }]}>
                    <Ionicons name="nutrition" size={20} color={colors.green} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dietName}>{plan.name}</Text>
                    <Text style={styles.dietMeta}>{meals.length} meals · ~{totalCals} cal · {totalProtein}g protein</Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
                </View>

                {/* Quick macro pills */}
                {!isExpanded && (
                  <View style={styles.quickMacros}>
                    {meals.slice(0, 3).map((dpm: any, i: number) => {
                      const mi = getMealIcon(dpm.meal_time);
                      return (
                        <View key={i} style={[styles.quickMealPill, { backgroundColor: `${mi.color}12` }]}>
                          <Ionicons name={mi.icon as any} size={12} color={mi.color} />
                          <Text style={[styles.quickMealText, { color: mi.color }]}>{dpm.meal_time || 'Meal'}</Text>
                        </View>
                      );
                    })}
                    {meals.length > 3 && <Text style={styles.quickMore}>+{meals.length - 3}</Text>}
                  </View>
                )}
              </TouchableOpacity>

              {/* Expanded meal timeline */}
              {isExpanded && meals.length > 0 && (
                <View style={styles.mealsTimeline}>
                  {meals.map((dpm: any, i: number) => {
                    const meal = dpm.meals;
                    if (!meal) return null;
                    const mi = getMealIcon(dpm.meal_time);
                    const isLast = i === meals.length - 1;
                    return (
                      <View key={i} style={styles.timelineRow}>
                        {/* Timeline left */}
                        <View style={styles.timelineLeft}>
                          <View style={[styles.timelineDot, { backgroundColor: mi.color }]}>
                            <Ionicons name={mi.icon as any} size={14} color="#FFF" />
                          </View>
                          {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
                        </View>
                        {/* Content */}
                        <View style={[styles.timelineContent, !isLast && { paddingBottom: Spacing.lg }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.timelineMealTime}>{dpm.meal_time || 'Meal'}</Text>
                              <Text style={[styles.timelineMealName, mealLogs[dpm.id] && { textDecorationLine: 'line-through', opacity: 0.6 }]}>{meal.name}</Text>
                            </View>
                            
                            <TouchableOpacity 
                              style={[
                                styles.checkBtn, 
                                { borderColor: mealLogs[dpm.id] ? colors.green : colors.border },
                                mealLogs[dpm.id] && { backgroundColor: `${colors.green}20` }
                              ]}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                if (mealLogs[dpm.id]) {
                                  unlogMeal(plan.id, dpm.id);
                                } else {
                                  logMealEaten(plan.id, dpm.id);
                                }
                              }}
                            >
                              {mealLogs[dpm.id] && <Ionicons name="checkmark" size={18} color={colors.green} />}
                            </TouchableOpacity>
                          </View>
                          
                          {meal.description && <Text style={styles.timelineMealDesc}>{meal.description}</Text>}
                          <View style={styles.timelineMacros}>
                            {meal.calories > 0 && (
                              <View style={[styles.tinyMacro, { backgroundColor: colors.bgElevated }]}>
                                <Text style={[styles.tinyMacroText, { color: colors.textSecondary }]}>🔥 {meal.calories} cal</Text>
                              </View>
                            )}
                            {meal.protein > 0 && (
                              <View style={[styles.tinyMacro, { backgroundColor: colors.bgElevated }]}>
                                <Text style={[styles.tinyMacroText, { color: colors.textSecondary }]}>💪 {meal.protein}g</Text>
                              </View>
                            )}
                            {(meal.carbs > 0) && (
                              <View style={[styles.tinyMacro, { backgroundColor: colors.bgElevated }]}>
                                <Text style={[styles.tinyMacroText, { color: colors.textSecondary }]}>🍞 {meal.carbs}g</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  backBtn: { paddingHorizontal: 16, paddingVertical: 12, alignSelf: 'flex-start' },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, marginBottom: Spacing.md },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], letterSpacing: -0.5, color: '#FFFFFF' },
  subtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 120 },
  sectionTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 2, marginTop: Spacing.lg, marginBottom: Spacing.md },

  // Macro summary hero
  macroSummary: { borderRadius: Radius.lg, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  macroSummaryLeft: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  macroCenter: { position: 'absolute', alignItems: 'center' },
  macroCenterVal: { fontFamily: FontFamily.headingExtraBold, fontSize: 18, color: '#FFF' },
  macroCenterLabel: { fontFamily: FontFamily.body, fontSize: 9, color: 'rgba(255,255,255,0.5)' },
  macroBreakdown: { flex: 1, gap: Spacing.md },
  macroItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  macroDot: { width: 8, height: 8, borderRadius: 2 },
  macroItemVal: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.base, color: '#FFF' },
  macroItemLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)' },

  // Diet card
  dietCard: { marginBottom: Spacing.md, backgroundColor: '#0F0F0F', borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  dietHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dietIconBox: { width: 44, height: 44, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  dietName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.md, color: '#FFFFFF' },
  dietMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2 },

  quickMacros: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  quickMealPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.xs },
  quickMealText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, textTransform: 'capitalize' },
  quickMore: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)', alignSelf: 'center' },

  // Timeline
  mealsTimeline: { marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  timelineRow: { flexDirection: 'row' },
  timelineLeft: { width: 36, alignItems: 'center' },
  timelineDot: { width: 28, height: 28, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { width: 2, flex: 1, marginVertical: 4 },
  timelineContent: { flex: 1, marginLeft: Spacing.md },
  timelineMealTime: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: colors.accent, textTransform: 'uppercase', letterSpacing: 1 },
  timelineMealName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.base, color: '#FFFFFF', marginTop: 2 },
  timelineMealDesc: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 16 },
  timelineMacros: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, flexWrap: 'wrap' },
  tinyMacro: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs },
  tinyMacroText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyIcon: { width: 80, height: 80, borderRadius: Radius.lg, backgroundColor: '#0F0F0F', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  emptyTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, color: '#FFFFFF' },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.5)' },

  checkBtn: { width: 32, height: 32, borderRadius: Radius.xs, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginLeft: Spacing.md },
});
