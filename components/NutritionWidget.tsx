import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { useClient } from '../context/ClientContext';
import { FontFamily, FontSize, Radius, Spacing } from '../constants/theme';
import Animated, { FadeInUp, FadeOut } from 'react-native-reanimated';
import { useHaptic } from '../hooks/useHaptic';
import * as Haptics from 'expo-haptics';

const MEAL_ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
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

function MacroDonut({ size, cals, protein, carbs, fat, color }: { size: number; cals: number; protein: number; carbs: number; fat: number; color: string }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const total = protein + carbs + fat || 1;
  const protPct = protein / total;
  const carbPct = carbs / total;
  const hasCalorieData = cals > 0;
  
  return (
    <Svg width={size} height={size}>
      <Circle cx={size/2} cy={size/2} r={r} stroke="#2D2D2E" strokeWidth={6} fill="none" />
      <Circle cx={size/2} cy={size/2} r={r} stroke={hasCalorieData ? "#FF6B35" : "transparent"} strokeWidth={6} fill="none" strokeDasharray={`${c * protPct} ${c * (1 - protPct)}`} transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      <Circle cx={size/2} cy={size/2} r={r} stroke={hasCalorieData ? "#6C9BF2" : "transparent"} strokeWidth={6} fill="none" strokeDasharray={`${c * carbPct} ${c * (1 - carbPct)}`} strokeDashoffset={-c * protPct} transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      <Circle cx={size/2} cy={size/2} r={r} stroke={hasCalorieData ? "#22C55E" : "transparent"} strokeWidth={6} fill="none" strokeDasharray={`${c * (1 - protPct - carbPct)} ${c * (protPct + carbPct)}`} strokeDashoffset={-c * (protPct + carbPct)} transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
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
        <Text style={st.sectionTitle}>NUTRITION PROTOCOL // DAILY MACROS</Text>
        <View style={[st.card, { alignItems: 'center', paddingVertical: 24, gap: 8 }]}>
          <Ionicons name="nutrition-outline" size={28} color="rgba(255,255,255,0.2)" />
          <Text style={{ fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
            Add calories to your meals
          </Text>
          <Text style={{ fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 17 }}>
            Set calorie & macro targets in your nutrition plan to start tracking here.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <Text style={st.sectionTitle}>NUTRITION PROTOCOL // DAILY MACROS</Text>
      <LinearGradient 
        colors={['rgba(28,28,33,0.9)', 'rgba(42,42,50,0.9)']} 
        start={{ x: 0, y: 0 }} 
        end={{ x: 1, y: 1 }} 
        style={st.card}
      >
        <View style={st.topRow}>
          <View style={st.macroDonutContainer}>
            <MacroDonut 
              size={64} 
              cals={consumedMacros.cals} 
              protein={consumedMacros.protein} 
              carbs={consumedMacros.carbs} 
              fat={consumedMacros.fat} 
              color="#FFFFFF" 
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
              <View style={st.track}><View style={[st.fill, { width: `${Math.min(100, (consumedMacros.protein / (globalMacros.protein || 1)) * 100)}%`, backgroundColor: '#FF6B35' }]} /></View>
              <Text style={st.macroBarVal}>{consumedMacros.protein}g</Text>
            </View>
            <View style={st.macroBarRow}>
              <Text style={st.macroBarLabel}>C</Text>
              <View style={st.track}><View style={[st.fill, { width: `${Math.min(100, (consumedMacros.carbs / (globalMacros.carbs || 1)) * 100)}%`, backgroundColor: '#6C9BF2' }]} /></View>
              <Text style={st.macroBarVal}>{consumedMacros.carbs}g</Text>
            </View>
            <View style={st.macroBarRow}>
              <Text style={st.macroBarLabel}>F</Text>
              <View style={st.track}><View style={[st.fill, { width: `${Math.min(100, (consumedMacros.fat / (globalMacros.fat || 1)) * 100)}%`, backgroundColor: '#22C55E' }]} /></View>
              <Text style={st.macroBarVal}>{consumedMacros.fat}g</Text>
            </View>
          </View>
        </View>

        {nextMealInfo ? (
          <Animated.View entering={FadeInUp} exiting={FadeOut} style={st.nextMealBox}>
            <View style={st.nextMealLeft}>
              <Text style={st.nextMealLabel}>UP NEXT</Text>
              <Text style={st.nextMealName}>{nextMealInfo.meal.meals.name}</Text>
              <Text style={st.nextMealMeta}>
                {nextMealInfo.meal.meals.calories} kcal • {nextMealInfo.meal.meals.protein}g Protein
              </Text>
            </View>
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={handleLogMeal} 
              style={st.logBtn}
              disabled={!!loggingId}
            >
              {loggingId === nextMealInfo.meal.id ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#000" />
                  <Text style={st.logBtnText}>Log</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : hasLoggedAnything ? (
          // All meals logged AND there were real calories — genuine completion
          <Animated.View entering={FadeInUp} style={[st.nextMealBox, { justifyContent: 'center', gap: 8 }]}>
            <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
            <Text style={[st.nextMealName, { marginLeft: 0 }]}>All meals logged today!</Text>
          </Animated.View>
        ) : (
          // nextMealInfo is null but 0 cals — edge case: plan exists, meals have no data
          <Animated.View entering={FadeInUp} style={[st.nextMealBox, { justifyContent: 'center', gap: 8 }]}>
            <Ionicons name="information-circle-outline" size={20} color="rgba(255,255,255,0.3)" />
            <Text style={[st.nextMealName, { color: 'rgba(255,255,255,0.4)', fontSize: 13 }]}>Add meals to your plan to track progress</Text>
          </Animated.View>
        )}
      </LinearGradient>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  donutLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    width: 10,
  },
  track: {
    flex: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
  },
  macroBarVal: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
    width: 32,
    textAlign: 'right',
  },
  nextMealBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    justifyContent: 'space-between',
  },
  nextMealLeft: {
    flex: 1,
  },
  nextMealLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
  nextMealName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.md,
    color: '#FFFFFF',
    marginTop: 2,
  },
  nextMealMeta: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    gap: 4,
  },
  logBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: '#000',
  },
});
