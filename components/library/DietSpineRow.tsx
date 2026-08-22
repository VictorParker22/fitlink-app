/**
 * DietSpineRow — "recipe spine" row for a meal plan: a 108pt food-image slit
 * on the left, name / meals·calories / category on the right, plus a real
 * macro proportion bar built from the plan's meals (protein/carbs/fat ×
 * servings). The bar is omitted entirely when no macro data exists.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

const CATEGORY_LABELS: Record<string, string> = {
  'balanced': 'Balanced',
  'high-protein': 'High protein',
  'keto': 'Keto',
  'vegan': 'Vegan',
  'weight-loss': 'Weight loss',
  'custom': 'Custom',
};

// PLACEHOLDER IMAGERY: diet plans without an uploaded image_url fall back to a
// deterministic pick from the two food-adjacent purpose shots we already ship
// (DESIGN.md: never add a new stock photo when a purpose-shot asset exists).
// Hashed by diet id so a plan always wears the same photo.
const FALLBACK_IMAGES = [
  require('../../assets/images/supplements.jpg'),
  require('../../assets/images/fitness_experience.jpg'),
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface DietSpineRowProps {
  item: any; // DietPlan (AppContext) — id, name, category, image_url, diet_plan_meals
  onPress: () => void;
  onDelete: () => void;
}

export default function DietSpineRow({ item, onPress, onDelete }: DietSpineRowProps) {
  const meals = item.diet_plan_meals || [];
  const mealCount = meals.length;

  let totalCals = 0;
  const macros = { p: 0, c: 0, f: 0 };
  meals.forEach((m: any) => {
    if (!m.meals) return;
    const servings = m.servings || 1;
    totalCals += (m.meals.calories || 0) * servings;
    macros.p += (m.meals.protein || 0) * servings;
    macros.c += (m.meals.carbs || 0) * servings;
    macros.f += (m.meals.fat || 0) * servings;
  });
  const macroTotal = macros.p + macros.c + macros.f;

  const catLabel = item.category ? (CATEGORY_LABELS[item.category] || 'Custom') : null;
  const subtitle = `${mealCount} meal${mealCount === 1 ? '' : 's'} · ${Math.round(totalCals)} cal`;

  const imageSource = item.image_url
    ? { uri: item.image_url }
    : FALLBACK_IMAGES[hashId(item.id) % FALLBACK_IMAGES.length];

  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.8}
      onPress={onPress}
      onLongPress={onDelete}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}. ${subtitle}. Long press to delete.`}
    >
      <Image
        source={imageSource}
        style={s.slit}
        contentFit="cover"
        transition={180}
        recyclingKey={item.id}
        accessible={false}
      />
      <View style={s.body}>
        <View style={s.titleRow}>
          <Text style={s.name} numberOfLines={1}>{item.name}</Text>
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.name}`}
          >
            <Ionicons name="trash-outline" size={16} color={CoachColors.textFaint} />
          </TouchableOpacity>
        </View>
        <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>
        {catLabel && (
          <View style={s.catPill}>
            <Text style={s.catPillText}>{catLabel}</Text>
          </View>
        )}
        {macroTotal > 0 && (
          <View style={s.macroBlock}>
            <View style={s.macroBar}>
              <View style={[s.macroSeg, { flex: macros.p, backgroundColor: CoachColors.accent }]} />
              <View style={[s.macroSeg, { flex: macros.c, backgroundColor: CoachColors.warning }]} />
              <View style={[s.macroSeg, { flex: macros.f, backgroundColor: CoachColors.textSecondary }]} />
            </View>
            <Text style={s.macroLegend} numberOfLines={1}>
              P {Math.round(macros.p)}g · C {Math.round(macros.c)}g · F {Math.round(macros.f)}g
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: 118,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  slit: {
    width: 108,
    height: '100%',
    backgroundColor: CoachColors.bg,
  },
  body: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  subtitle: {
    fontFamily: CoachFonts.mono,
    fontSize: 11,
    color: CoachColors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  catPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catPillText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textSecondary,
  },
  macroBlock: {
    gap: 4,
    marginTop: 2,
  },
  macroBar: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    borderCurve: 'continuous',
    overflow: 'hidden',
    gap: 2,
  },
  macroSeg: {
    height: '100%',
    borderRadius: 2,
    borderCurve: 'continuous',
  },
  macroLegend: {
    fontFamily: CoachFonts.mono,
    fontSize: 10,
    color: CoachColors.textFaint,
    fontVariant: ['tabular-nums'],
  },
});
