import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useClient } from '../context/ClientContext';
import { Radius, Spacing } from '../constants/theme';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { useHaptic } from '../hooks/useHaptic';
import * as Haptics from 'expo-haptics';

// Chart palette: accent + neutral variants (single-accent design system)
const MACRO_COLORS = {
  protein: CoachColors.accent,
  carbs: CoachColors.textSecondary,
  fat: CoachColors.textFaint,
};

function MacroDonut({ size, cals, protein, carbs, fat }: { size: number; cals: number; protein: number; carbs: number; fat: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const total = protein + carbs + fat || 1;
  const protPct = protein / total;
  const carbPct = carbs / total;
  const hasCalorieData = cals > 0;

  return (
    <Svg width={size} height={size}>
      <Circle cx={size/2} cy={size/2} r={r} stroke={CoachColors.border} strokeWidth={6} fill="none" />
      <Circle cx={size/2} cy={size/2} r={r} stroke={hasCalorieData ? MACRO_COLORS.protein : 'transparent'} strokeWidth={6} fill="none" strokeDasharray={`${c * protPct} ${c * (1 - protPct)}`} transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      <Circle cx={size/2} cy={size/2} r={r} stroke={hasCalorieData ? MACRO_COLORS.carbs : 'transparent'} strokeWidth={6} fill="none" strokeDasharray={`${c * carbPct} ${c * (1 - carbPct)}`} strokeDashoffset={-c * protPct} transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      <Circle cx={size/2} cy={size/2} r={r} stroke={hasCalorieData ? MACRO_COLORS.fat : 'transparent'} strokeWidth={6} fill="none" strokeDasharray={`${c * (1 - protPct - carbPct)} ${c * (protPct + carbPct)}`} strokeDashoffset={-c * (protPct + carbPct)} transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
    </Svg>
  );
}

export default function NutritionWidget() {
  const { diets, mealLogs, logMealEaten } = useClient();
  const [loggingId, setLoggingId] = useState<string | null>(null);

  // Compute macros
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

  const { trigger } = useHaptic();

  // Fire medium haptic on first meal logged — oncePerDay survives tab switches/remounts
  useEffect(() => {
    if ((consumedMacros?.cals ?? 0) > 0) {
      trigger('medium', { oncePerDay: 'nutrition_first_log' });
    }
  }, [consumedMacros?.cals]);

  // Find next meal
  const nextMealInfo = useMemo(() => {
    if (!diets.length) return null;
    let nextMeal = null;
    let parentPlanId = '';

    // Simple logic: Find the first meal in the active plan that hasn't been logged today.
    for (const d of diets) {
      if (d.status !== 'active') continue;
      const meals = d.diet_plans?.diet_plan_meals || [];
      // Ideally sorted by time, assuming array order is chronological
      for (const m of meals) {
        if (!mealLogs[m.id]) {
          nextMeal = m;
          parentPlanId = d.diet_plans?.id;
          break;
        }
      }
      if (nextMeal) break;
    }

    return nextMeal ? { meal: nextMeal, planId: parentPlanId } : null;
  }, [diets, mealLogs]);

  if (!diets.length) return null;

  const handleLogMeal = async () => {
    if (!nextMealInfo) return;
    try {
      setLoggingId(nextMealInfo.meal.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await logMealEaten(nextMealInfo.planId, nextMealInfo.meal.id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoggingId(null);
    }
  };

  // Derived flags — used for empty-state logic
  const hasCalorieData = globalMacros.cals > 0;
  const hasLoggedAnything = consumedMacros.cals > 0;

  // No calorie data in the plan yet — show a helpful prompt instead of zeros
  if (!hasCalorieData) {
    return (
      <View style={st.container}>
        <Text style={st.sectionTitle}>Nutrition · daily macros</Text>
        <View style={[st.card, { alignItems: 'center', paddingVertical: 24, gap: 8 }]}>
          <Ionicons name="nutrition-outline" size={28} color={CoachColors.textFaint} />
          <Text style={{ fontFamily: CoachFonts.headingBold, fontSize: 14, color: CoachColors.textSecondary, textAlign: 'center' }}>
            Add calories to your meals
          </Text>
          <Text style={{ fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 17 }}>
            Set calorie & macro targets in your nutrition plan to start tracking here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <Text style={st.sectionTitle}>Nutrition · daily macros</Text>
      <View style={st.card}>
        <View style={st.topRow}>
          <View style={st.macroDonutContainer}>
            <MacroDonut
              size={64}
              cals={consumedMacros.cals}
              protein={consumedMacros.protein}
              carbs={consumedMacros.carbs}
              fat={consumedMacros.fat}
            />
            <View style={st.donutCenter}>
              {hasLoggedAnything ? (
                <>
                  <Text style={st.donutCals}>{consumedMacros.cals}</Text>
                  <Text style={st.donutLabel}>kcal</Text>
                </>
              ) : (
                <>
                  <Text style={[st.donutCals, { fontSize: 10 }]}>Log{`\n`}meal</Text>
                </>
              )}
            </View>
          </View>

          <View style={st.macroBars}>
            <View style={st.macroBarRow}>
              <Text style={st.macroBarLabel}>P</Text>
              <View style={st.track}><View style={[st.fill, { width: `${Math.min(100, (consumedMacros.protein / (globalMacros.protein || 1)) * 100)}%`, backgroundColor: MACRO_COLORS.protein }]} /></View>
              <Text style={st.macroBarVal}>{consumedMacros.protein}g</Text>
            </View>
            <View style={st.macroBarRow}>
              <Text style={st.macroBarLabel}>C</Text>
              <View style={st.track}><View style={[st.fill, { width: `${Math.min(100, (consumedMacros.carbs / (globalMacros.carbs || 1)) * 100)}%`, backgroundColor: MACRO_COLORS.carbs }]} /></View>
              <Text style={st.macroBarVal}>{consumedMacros.carbs}g</Text>
            </View>
            <View style={st.macroBarRow}>
              <Text style={st.macroBarLabel}>F</Text>
              <View style={st.track}><View style={[st.fill, { width: `${Math.min(100, (consumedMacros.fat / (globalMacros.fat || 1)) * 100)}%`, backgroundColor: MACRO_COLORS.fat }]} /></View>
              <Text style={st.macroBarVal}>{consumedMacros.fat}g</Text>
            </View>
          </View>
        </View>

        {nextMealInfo ? (
          <Animated.View entering={FadeInUp} exiting={FadeOut} style={st.nextMealBox}>
            <View style={st.nextMealLeft}>
              <Text style={st.nextMealLabel}>Up next</Text>
              <Text style={st.nextMealName}>{nextMealInfo.meal.meals.name}</Text>
              <Text style={st.nextMealMeta}>
                {nextMealInfo.meal.meals.calories} kcal · {nextMealInfo.meal.meals.protein}g protein
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleLogMeal}
              style={st.logBtn}
              disabled={!!loggingId}
            >
              {loggingId === nextMealInfo.meal.id ? (
                <ActivityIndicator size="small" color={CoachColors.onAccent} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color={CoachColors.onAccent} />
                  <Text style={st.logBtnText}>Log</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : hasLoggedAnything ? (
          // All meals logged AND there were real calories — genuine completion
          <Animated.View entering={FadeInUp} style={[st.nextMealBox, { justifyContent: 'center', gap: 8 }]}>
            <Ionicons name="checkmark-circle" size={20} color={CoachColors.accent} />
            <Text style={[st.nextMealName, { marginLeft: 0 }]}>All meals logged today</Text>
          </Animated.View>
        ) : (
          // nextMealInfo is null but 0 cals — edge case: plan exists, meals have no data
          <Animated.View entering={FadeInUp} style={[st.nextMealBox, { justifyContent: 'center', gap: 8 }]}>
            <Ionicons name="information-circle-outline" size={20} color={CoachColors.textMuted} />
            <Text style={[st.nextMealName, { color: CoachColors.textMuted, fontSize: 13 }]}>Add meals to your plan to track progress</Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  macroDonutContainer: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  donutCals: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },
  donutLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textSecondary,
  },
  macroBars: {
    flex: 1,
    marginLeft: Spacing.lg,
    gap: 8,
  },
  macroBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  macroBarLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textSecondary,
    width: 10,
  },
  track: {
    flex: 1,
    height: 10,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
  macroBarVal: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textPrimary,
    width: 32,
    textAlign: 'right',
  },
  nextMealBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.bg,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    justifyContent: 'space-between',
  },
  nextMealLeft: {
    flex: 1,
  },
  nextMealLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  nextMealName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginTop: 2,
  },
  nextMealMeta: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    marginTop: 2,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    gap: 4,
  },
  logBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.onAccent,
  },
});
