import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { decode } from 'base64-arraybuffer';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

import { useApp, DietWeekStructure, DietSwapsMap, DietPlanExtras, DietPlanMealInput, DietRestMealSnapshot } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { searchNutrition, nutritionToMeal } from '../lib/nutritionApi';
import { foodTotals, groupRowsBySlot } from '../lib/dietSlots';
import { Spacing, Radius } from '../constants/theme';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useAndroidBack } from '../hooks/useAndroidBack';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useFoodImage } from '../lib/foodImages';
import { WizardTopBar, WizardHeading, GhostSlot } from '../components/wizard/WizardChrome';

type MealTimeKey = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface SelectedMeal {
  id: string;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servings: number;
  serving_size_g?: number;
}

/**
 * One meal slot of the day. A slot holds one or more foods (`items`); each
 * food becomes its own diet_plan_meals row with slot_index = the slot's
 * position and order_index = its position here. Swaps are slot-level.
 */
interface Slot {
  label: string;
  meal_time: MealTimeKey;
  items: SelectedMeal[];
  swaps: { allowedMealIds: string[]; allowOwnLog: boolean };
}

type DayVariant = 'training' | 'rest';
type PresetKey = 'building' | 'cutting' | 'holding' | 'custom';
type ScreenMode = 'wizard' | 'describe';

const MEAL_TIME_KEYS: MealTimeKey[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_TIME_LABELS: Record<MealTimeKey, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
};
const asMealTime = (v: unknown, fallback: MealTimeKey = 'snack'): MealTimeKey =>
  MEAL_TIME_KEYS.includes(v as MealTimeKey) ? (v as MealTimeKey) : fallback;
// meals.category is checked against Breakfast|Lunch|Dinner|Snack — always
// derive it from the slot's meal_time for any row this screen creates.
const categoryForMealTime = (mt: MealTimeKey) => MEAL_TIME_LABELS[mt];
const snapServings = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(0.25, Math.round(n * 4) / 4);
};
const emptySwaps = () => ({ allowedMealIds: [] as string[], allowOwnLog: false });

const DIET_CATEGORIES = ['balanced', 'high-protein', 'keto', 'vegan', 'weight-loss', 'custom'];
const AI_EXAMPLE_PROMPTS = [
  'High-protein day for a 75 kg lifter cutting, 1,850 kcal, no dairy',
  'Vegan bulk, 3,000 kcal, four meals, cheap staples',
  'Balanced 2,200 kcal day for a runner, two snacks around a lunchtime session',
];

// Percent splits (protein / carbs / fat, of calories).
const PRESETS: Record<Exclude<PresetKey, 'custom'>, { p: number; c: number; f: number; label: string; category: string }> = {
  building: { p: 30, c: 45, f: 25, label: 'Building', category: 'high-protein' },
  cutting: { p: 40, c: 30, f: 30, label: 'Cutting', category: 'weight-loss' },
  holding: { p: 30, c: 40, f: 30, label: 'Holding', category: 'balanced' },
};

const SLOT_TEMPLATES: Record<number, { label: string; meal_time: MealTimeKey }[]> = {
  3: [
    { label: 'Breakfast', meal_time: 'breakfast' },
    { label: 'Lunch', meal_time: 'lunch' },
    { label: 'Dinner', meal_time: 'dinner' },
  ],
  4: [
    { label: 'Breakfast', meal_time: 'breakfast' },
    { label: 'Lunch', meal_time: 'lunch' },
    { label: 'Around training', meal_time: 'snack' },
    { label: 'Dinner', meal_time: 'dinner' },
  ],
  5: [
    { label: 'Breakfast', meal_time: 'breakfast' },
    { label: 'Mid-morning', meal_time: 'snack' },
    { label: 'Lunch', meal_time: 'lunch' },
    { label: 'Around training', meal_time: 'snack' },
    { label: 'Dinner', meal_time: 'dinner' },
  ],
  6: [
    { label: 'Breakfast', meal_time: 'breakfast' },
    { label: 'Mid-morning', meal_time: 'snack' },
    { label: 'Lunch', meal_time: 'lunch' },
    { label: 'Around training', meal_time: 'snack' },
    { label: 'Dinner', meal_time: 'dinner' },
    { label: 'Evening snack', meal_time: 'snack' },
  ],
};

const WEEK_DAYS = [
  { key: 'mon', short: 'M', full: 'Monday' },
  { key: 'tue', short: 'T', full: 'Tuesday' },
  { key: 'wed', short: 'W', full: 'Wednesday' },
  { key: 'thu', short: 'T', full: 'Thursday' },
  { key: 'fri', short: 'F', full: 'Friday' },
  { key: 'sat', short: 'S', full: 'Saturday' },
  { key: 'sun', short: 'S', full: 'Sunday' },
];

const emptySlots = (count: number): Slot[] =>
  (SLOT_TEMPLATES[count] || SLOT_TEMPLATES[4]).map(t => ({
    ...t, items: [], swaps: emptySwaps(),
  }));

const slotTotals = (slots: Slot[]) => foodTotals(slots.flatMap(s => s.items));

const itemLine = (it: SelectedMeal) =>
  `${Math.round(it.calories * it.servings)} kcal · P ${Math.round(it.protein * it.servings)} C ${Math.round(it.carbs * it.servings)} F ${Math.round(it.fat * it.servings)}`
  + (it.servings !== 1 ? ` · ${it.servings}x` : '');

const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;

// The one macro palette this screen speaks: protein wears the accent, carbs
// and fat step down the grey text ramp (tokens only, no bespoke greys).
const MACRO_COLORS = {
  p: CoachColors.accent,
  c: CoachColors.textSecondary,
  f: CoachColors.textFaint,
};

const MEAL_TIME_ICONS: Record<MealTimeKey, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny-outline',
  lunch: 'restaurant-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};

/**
 * The signature's living bar: three proportional segments that grow in from
 * zero on mount (skipped under Reduce Motion), gram values in mono beneath.
 */
function MacroBar({ shares, grams }: {
  shares: { p: number; c: number; f: number };
  grams: { p: number; c: number; f: number };
}) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduced) { progress.value = 1; return; }
    progress.value = withTiming(1, { duration: 900, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const segs: { key: 'p' | 'c' | 'f'; label: string }[] = [
    { key: 'p', label: 'P' }, { key: 'c', label: 'C' }, { key: 'f', label: 'F' },
  ];
  return (
    <View>
      <View style={s.macroBarRow}>
        {segs.map(({ key }) => (
          <View key={key} style={[s.macroBarSeg, { flex: shares[key] || 0.0001 }]}>
            <Animated.View style={[s.macroBarFill, { backgroundColor: MACRO_COLORS[key] }, fill]} />
          </View>
        ))}
      </View>
      <View style={s.macroBarLegend}>
        {segs.map(({ key, label }) => (
          <View key={key} style={{ flex: shares[key] || 0.0001 }}>
            <Text style={[s.macroBarGrams, { color: MACRO_COLORS[key] }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {label} {grams[key]}g
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Meal-row slit: the coach's own photo for the meal when the library has one,
 * otherwise a Spoonacular dish photo resolved (and persisted) by useFoodImage
 * — same path the diet detail screen takes — falling back to the slot's
 * time-of-day icon while resolving or on a miss.
 */
function SlotThumb({ name, existingUrl, mealId, mealTime }: {
  name: string; existingUrl?: string | null; mealId?: string; mealTime: MealTimeKey;
}) {
  const url = useFoodImage(name, existingUrl, mealId);
  if (url) {
    return <ExpoImage source={{ uri: url }} style={s.slotThumb} contentFit="cover" transition={150} recyclingKey={mealId} />;
  }
  return (
    <View style={[s.slotThumb, s.slotThumbFallback]}>
      <Ionicons name={MEAL_TIME_ICONS[mealTime]} size={20} color={CoachColors.textSecondary} />
    </View>
  );
}

export default function CreateDietScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();
  const { createDietPlan, updateDietPlan, createMeal, meals, diets, plans, updatePlanTrack } = useApp();
  const { user } = useAuth();
  const { showAlert } = useAlert();

  const isEditing = !!params.editId;
  const editDiet = isEditing ? diets.find(d => d.id === params.editId) : null;

  // ── STEP MACHINE ──
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // 'describe' is the AI describe-it screen reached from Step 1; it returns
  // to the wizard on Step 2 with the day filled in.
  const [mode, setMode] = useState<ScreenMode>('wizard');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // ── Step 1: targets ──
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState(2400);
  const [preset, setPreset] = useState<PresetKey>('holding');
  const [customP, setCustomP] = useState('150');
  const [customC, setCustomC] = useState('240');
  const [customF, setCustomF] = useState('80');
  const [mealsPerDay, setMealsPerDay] = useState(4);
  const [category, setCategory] = useState<string>('balanced');
  // Which text field currently has the caret — drives the lime active-input
  // treatment (accent border + lime micro-label). Purely visual.
  const [focusField, setFocusField] = useState<'name' | 'p' | 'c' | 'f' | null>(null);

  // ── Step 2: day variants ──
  const [dayVariant, setDayVariant] = useState<DayVariant>('training');
  const [trainingSlots, setTrainingSlots] = useState<Slot[]>(emptySlots(4));
  const [restSlots, setRestSlots] = useState<Slot[]>(emptySlots(4));

  // ── Step 3: week + assignment ──
  const [trainingDays, setTrainingDays] = useState<string[]>(['mon', 'wed', 'fri']);
  const [freeMealEnabled, setFreeMealEnabled] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string>('library'); // 'library' | plan id
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Search modal (reused meal search, scoped to a slot) ──
  // searchItemIndex: null appends a food to the slot; a number replaces that food.
  const [searchSlotIndex, setSearchSlotIndex] = useState<number | null>(null);
  const [searchItemIndex, setSearchItemIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiResults, setApiResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'saved' | 'api'>('saved');
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [tempServings, setTempServings] = useState<number>(1);

  // ── Sheets: one food (servings / replace / remove), one slot (swaps / clear), swaps ──
  const [itemSheet, setItemSheet] = useState<{ slot: number; item: number } | null>(null);
  const [editServings, setEditServings] = useState<number>(1);
  const [slotSheetIndex, setSlotSheetIndex] = useState<number | null>(null);
  const [swapSheetIndex, setSwapSheetIndex] = useState<number | null>(null);

  const slots = dayVariant === 'training' ? trainingSlots : restSlots;
  const setSlots = dayVariant === 'training' ? setTrainingSlots : setRestSlots;

  // ── Edit-mode prefill ──
  useEffect(() => {
    if (!editDiet) return;
    setName(editDiet.name);
    setDescription(editDiet.description || '');
    setCategory(editDiet.category || 'custom');
    setImageUrl(editDiet.image_url || null);

    const cal = editDiet.target_calories || 2400;
    const pro = editDiet.target_protein || 150;
    const carb = editDiet.target_carbs || 240;
    const fat = editDiet.target_fat || 80;
    setKcal(cal);
    setCustomP(String(pro));
    setCustomC(String(carb));
    setCustomF(String(fat));

    // Detect which preset the stored targets correspond to.
    const pPct = (pro * 4 / cal) * 100, cPct = (carb * 4 / cal) * 100, fPct = (fat * 9 / cal) * 100;
    const match = (Object.keys(PRESETS) as (keyof typeof PRESETS)[]).find(k =>
      Math.abs(PRESETS[k].p - pPct) < 3 && Math.abs(PRESETS[k].c - cPct) < 3 && Math.abs(PRESETS[k].f - fPct) < 3
    );
    setPreset(match || 'custom');

    const ws = editDiet.week_structure;
    const count = ws?.mealsPerDay && SLOT_TEMPLATES[ws.mealsPerDay] ? ws.mealsPerDay : 4;
    setMealsPerDay(count);

    // Fill training slots from diet_plan_meals, grouped by slot (legacy rows
    // without slot_index fall back to order_index — one food per slot).
    const base = emptySlots(count);
    if (ws?.slotLabels) {
      ws.slotLabels.forEach((label, i) => { if (base[i]) base[i].label = label; });
    }
    const savedSwaps = editDiet.swaps || {};
    groupRowsBySlot(editDiet.diet_plan_meals || []).forEach(({ slotIndex, items: rows }) => {
      const items: SelectedMeal[] = rows.map(dpm => ({
        id: dpm.meal_id,
        name: dpm.meals?.name || 'Unknown',
        category: dpm.meals?.category || 'Snack',
        calories: dpm.meals?.calories || 0,
        protein: dpm.meals?.protein || 0,
        carbs: dpm.meals?.carbs || 0,
        fat: dpm.meals?.fat || 0,
        servings: dpm.servings || 1,
      }));
      const sw = savedSwaps[String(slotIndex)];
      const swaps = sw ? { allowedMealIds: sw.allowedMealIds || [], allowOwnLog: !!sw.allowOwnLog } : emptySwaps();
      const mealTime = asMealTime(rows[0]?.meal_time, base[slotIndex]?.meal_time || 'snack');
      // Slots past the template are appended in order; any gap between is
      // filled with an empty extra slot so slot positions stay stable.
      while (base.length <= slotIndex) {
        base.push({ label: ws?.slotLabels?.[base.length] || `Meal ${base.length + 1}`, meal_time: 'snack', items: [], swaps: emptySwaps() });
      }
      base[slotIndex] = { ...base[slotIndex], meal_time: mealTime, items, swaps };
    });
    setTrainingSlots(base);

    // Rest variant from week_structure snapshot. Entries carry slot_index
    // since several foods can share a slot; older snapshots are one per entry.
    const rest = emptySlots(count);
    if (ws?.restVariant?.mealList) {
      const restRows = ws.restVariant.mealList.map((m, i) => ({ ...m, order_index: i, slot_index: m.slot_index }));
      groupRowsBySlot(restRows).forEach(({ slotIndex, items: rows }) => {
        const items: SelectedMeal[] = rows.map(m => ({
          id: m.meal_id, name: m.name, category: 'Custom',
          calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat,
          servings: m.servings || 1,
        }));
        while (rest.length <= slotIndex) {
          rest.push({ label: `Meal ${rest.length + 1}`, meal_time: 'snack', items: [], swaps: emptySwaps() });
        }
        rest[slotIndex] = {
          label: rows[0]?.slotLabel || rest[slotIndex].label,
          meal_time: asMealTime(rows[0]?.meal_time, rest[slotIndex].meal_time),
          items,
          swaps: emptySwaps(),
        };
      });
    }
    setRestSlots(rest);

    if (ws?.trainingDays) setTrainingDays(ws.trainingDays);
    if (ws?.freeMeal) setFreeMealEnabled(!!ws.freeMeal.enabled);
  }, [editDiet]);

  // ── Step 1 derived: grams from kcal + split ──
  const grams = useMemo(() => {
    if (preset === 'custom') {
      return {
        p: parseInt(customP) || 0,
        c: parseInt(customC) || 0,
        f: parseInt(customF) || 0,
      };
    }
    const sp = PRESETS[preset];
    return {
      p: Math.round(kcal * sp.p / 100 / 4),
      c: Math.round(kcal * sp.c / 100 / 4),
      f: Math.round(kcal * sp.f / 100 / 9),
    };
  }, [preset, kcal, customP, customC, customF]);

  // Calorie share of each macro, for the stacked split bar.
  const splitShares = useMemo(() => {
    const pCal = grams.p * 4, cCal = grams.c * 4, fCal = grams.f * 9;
    const sum = pCal + cCal + fCal || 1;
    return { p: pCal / sum, c: cCal / sum, f: fCal / sum };
  }, [grams]);

  const changePreset = (key: PresetKey) => {
    setPreset(key);
    if (key === 'custom') {
      setCategory('custom');
      // Seed custom inputs from the current computed grams.
      setCustomP(String(grams.p));
      setCustomC(String(grams.c));
      setCustomF(String(grams.f));
    } else {
      setCategory(PRESETS[key].category);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const changeMealsPerDay = (count: number) => {
    setMealsPerDay(count);
    const resize = (prev: Slot[]): Slot[] => {
      const filled = prev.filter(s => s.items.length > 0);
      const next = emptySlots(count);
      filled.forEach((s, i) => {
        if (i < next.length) {
          next[i] = { ...next[i], items: s.items, swaps: s.swaps, meal_time: s.meal_time };
        } else {
          next.push({ label: `Meal ${next.length + 1}`, meal_time: s.meal_time, items: s.items, swaps: s.swaps });
        }
      });
      return next;
    };
    setTrainingSlots(resize);
    setRestSlots(resize);
  };

  // ── Step 2 derived ──
  const trainingTotals = useMemo(() => slotTotals(trainingSlots), [trainingSlots]);
  const restTotals = useMemo(() => slotTotals(restSlots), [restSlots]);
  const activeTotals = dayVariant === 'training' ? trainingTotals : restTotals;

  const kcalDiff = Math.round(activeTotals.calories - kcal);
  const onTarget = Math.abs(kcalDiff) <= kcal * 0.05;

  // ── Meal search (saved + USDA, unchanged behaviour, scoped to a slot) ──
  const filteredSavedMeals = useMemo(() => {
    if (!searchQuery.trim()) return meals;
    const q = searchQuery.toLowerCase();
    return meals.filter(m => m.name.toLowerCase().includes(q) || m.category?.toLowerCase().includes(q));
  }, [meals, searchQuery]);

  const performSearch = async () => {
    if (!searchQuery.trim()) { setApiResults([]); return; }
    setSearching(true);
    try {
      const results = await searchNutrition(searchQuery);
      setApiResults(results.map((r, index) => ({ ...nutritionToMeal(r), _uid: index.toString() })));
    } catch (err: any) {
      if (err.message === 'RATE_LIMIT') {
        showAlert({ type: 'warning', title: 'Rate limit reached', message: 'You have made too many searches using the free USDA API key. Please wait a bit before searching again.' });
      } else {
        showAlert({ type: 'error', title: 'Search failed', message: 'Could not fetch nutrition data.' });
      }
    } finally {
      setSearching(false);
    }
  };

  const openSearch = (slotIndex: number, itemIndex: number | null) => {
    setSearchItemIndex(itemIndex);
    setSearchSlotIndex(slotIndex);
  };

  const closeSearch = () => {
    setSearchSlotIndex(null);
    setSearchItemIndex(null);
    setSearchQuery('');
    setApiResults([]);
    setSelectedResultId(null);
    setTempServings(1);
  };

  // The one mutation point for foods entering a slot: appends, or replaces
  // the food the search was opened for.
  const fillSlot = (slotIndex: number, meal: SelectedMeal, itemIndex: number | null = searchItemIndex) => {
    setSlots(prev => {
      const copy = [...prev];
      const slot = copy[slotIndex];
      if (!slot) return prev;
      const items = itemIndex !== null && slot.items[itemIndex]
        ? slot.items.map((it, i) => (i === itemIndex ? meal : it))
        : [...slot.items, meal];
      copy[slotIndex] = { ...slot, items };
      return copy;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeSearch();
  };

  const addFromLocal = (item: any, finalServings: number) => {
    if (searchSlotIndex === null) return;
    fillSlot(searchSlotIndex, {
      id: item.id, name: item.name, category: item.category || 'Custom',
      calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
      servings: finalServings,
    });
  };

  const addFromApi = async (item: any, finalServings: number) => {
    if (searchSlotIndex === null) return;
    try {
      const slot = slots[searchSlotIndex];
      const saved = await createMeal({
        name: item.name,
        category: categoryForMealTime(slot ? slot.meal_time : 'snack'),
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        serving_size_g: item.serving_size_g,
        fiber: item.fiber,
        sugar: item.sugar,
        sodium_mg: item.sodium_mg,
      });
      fillSlot(searchSlotIndex, {
        id: saved.id, name: saved.name, category: saved.category,
        calories: saved.calories, protein: saved.protein, carbs: saved.carbs, fat: saved.fat,
        servings: finalServings,
      });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to save meal' });
    }
  };

  const clearSlot = (index: number) => {
    setSlots(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], items: [], swaps: emptySwaps() };
      return copy;
    });
    setSlotSheetIndex(null);
  };

  const removeExtraSlot = (index: number) => {
    setSlots(prev => prev.filter((_, i) => i !== index));
    setSlotSheetIndex(null);
  };

  const appendSlot = () => {
    setSlots(prev => [...prev, {
      label: `Meal ${prev.length + 1}`, meal_time: 'snack', items: [],
      swaps: emptySwaps(),
    }]);
    openSearch(slots.length, null);
  };

  const openItemSheet = (slot: number, item: number) => {
    const it = slots[slot]?.items[item];
    if (!it) return;
    setEditServings(it.servings);
    setItemSheet({ slot, item });
  };

  const saveItemServings = () => {
    if (!itemSheet) return;
    const { slot, item } = itemSheet;
    setSlots(prev => {
      const copy = [...prev];
      const s = copy[slot];
      if (!s?.items[item]) return prev;
      copy[slot] = { ...s, items: s.items.map((it, i) => (i === item ? { ...it, servings: editServings } : it)) };
      return copy;
    });
    setItemSheet(null);
  };

  const removeItem = (slot: number, item: number) => {
    setSlots(prev => {
      const copy = [...prev];
      const s = copy[slot];
      if (!s) return prev;
      const items = s.items.filter((_, i) => i !== item);
      // Swaps describe the slot's food; an emptied slot has nothing to swap.
      copy[slot] = { ...s, items, swaps: items.length === 0 ? emptySwaps() : s.swaps };
      return copy;
    });
    setItemSheet(null);
  };

  // Copy training day into rest slots at reduced portions (85%, snapped to 0.25).
  const copyTrainingToRest = () => {
    setRestSlots(trainingSlots.map(s => ({
      ...s,
      swaps: emptySwaps(),
      items: s.items.map(it => ({ ...it, servings: Math.max(0.25, Math.round((it.servings * 0.85) / 0.25) * 0.25) })),
    })));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── Swap candidates: within ±40 kcal and ±5 g protein of the slot's foods ──
  const swapSlot = swapSheetIndex !== null ? trainingSlots[swapSheetIndex] : null;
  const swapCandidates = useMemo(() => {
    if (!swapSlot || swapSlot.items.length === 0) return { inRange: [], outOfRange: [] as { meal: any; reason: string }[] };
    const ref = foodTotals(swapSlot.items);
    const refCal = ref.calories;
    const refPro = ref.protein;
    const inSlot = new Set(swapSlot.items.map(it => it.id));
    const inRange: any[] = [];
    const outOfRange: { meal: any; reason: string }[] = [];
    meals.forEach(m => {
      if (inSlot.has(m.id)) return;
      const dCal = m.calories - refCal;
      const dPro = m.protein - refPro;
      if (Math.abs(dCal) <= 40 && Math.abs(dPro) <= 5) {
        inRange.push(m);
      } else {
        const reason = Math.abs(dCal) > 40
          ? `${dCal > 0 ? '+' : '−'}${Math.abs(Math.round(dCal))} kcal`
          : `${dPro > 0 ? '+' : '−'}${Math.abs(Math.round(dPro))}g protein`;
        outOfRange.push({ meal: m, reason });
      }
    });
    return { inRange, outOfRange: outOfRange.slice(0, 12) };
  }, [swapSlot, meals]);

  const toggleSwapMeal = (mealId: string) => {
    if (swapSheetIndex === null) return;
    setTrainingSlots(prev => {
      const copy = [...prev];
      const s = copy[swapSheetIndex];
      const ids = s.swaps.allowedMealIds.includes(mealId)
        ? s.swaps.allowedMealIds.filter(id => id !== mealId)
        : [...s.swaps.allowedMealIds, mealId];
      copy[swapSheetIndex] = { ...s, swaps: { ...s.swaps, allowedMealIds: ids } };
      return copy;
    });
  };

  const toggleAllowOwnLog = () => {
    if (swapSheetIndex === null) return;
    setTrainingSlots(prev => {
      const copy = [...prev];
      const s = copy[swapSheetIndex];
      copy[swapSheetIndex] = { ...s, swaps: { ...s.swaps, allowOwnLog: !s.swaps.allowOwnLog } };
      return copy;
    });
  };

  // ── Step 3 derived ──
  const restDays = WEEK_DAYS.map(d => d.key).filter(d => !trainingDays.includes(d));
  const freeMealDay = restDays.length > 0 ? restDays[restDays.length - 1] : 'sun';
  const freeMealDayFull = WEEK_DAYS.find(d => d.key === freeMealDay)?.full || 'Sunday';

  const dietPasses = useMemo(
    () => plans.filter(p => p.track?.some(n => n.type === 'diet')),
    [plans]
  );

  const toggleTrainingDay = (day: string) => {
    setTrainingDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets[0].uri && result.assets[0].base64) {
        setUploadingImage(true);
        const fileUri = result.assets[0].uri;
        const ext = fileUri.split('.').pop() || 'jpg';
        if (!user) throw new Error('You are signed out. Sign in and try again.');
        // diet-images only accepts writes under `{auth uid}/…`.
        const fileName = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('diet-images')
          .upload(fileName, decode(result.assets[0].base64), { contentType: `image/${ext}`, upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('diet-images').getPublicUrl(fileName);
        setImageUrl(urlData.publicUrl);
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Upload failed', message: err.message || 'Could not upload image.' });
    } finally {
      setUploadingImage(false);
    }
  };

  // ── Save ──
  const handleSave = async () => {
    const trainingFoodCount = trainingSlots.reduce((n, s) => n + s.items.length, 0);
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Missing name', message: 'Please enter a plan name.' });
    if (trainingFoodCount === 0) return showAlert({ type: 'warning', title: 'No meals', message: 'Add at least one food to the training day.' });

    setSaving(true);
    try {
      // One row per food: slot_index = the slot's position (the key of swaps
      // and the index into slotLabels), order_index = position in the slot.
      const mealList: DietPlanMealInput[] = trainingSlots.flatMap((s, slotIndex) =>
        s.items.map((it, orderIndex) => ({
          meal_id: it.id,
          meal_time: s.meal_time,
          servings: it.servings,
          slot_index: slotIndex,
          order_index: orderIndex,
        }))
      );

      // Swaps keyed by slot_index.
      const swaps: DietSwapsMap = {};
      trainingSlots.forEach((s, slotIndex) => {
        if (s.items.length > 0 && (s.swaps.allowedMealIds.length > 0 || s.swaps.allowOwnLog)) {
          swaps[String(slotIndex)] = { allowedMealIds: s.swaps.allowedMealIds, allowOwnLog: s.swaps.allowOwnLog };
        }
      });

      const restMealList: DietRestMealSnapshot[] = restSlots.flatMap((s, slotIndex) =>
        s.items.map(it => ({
          meal_id: it.id,
          name: it.name,
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fat: it.fat,
          meal_time: s.meal_time,
          servings: it.servings,
          slotLabel: s.label,
          slot_index: slotIndex,
        }))
      );

      const week_structure: DietWeekStructure = {
        mealsPerDay,
        // Every slot, filled or not, so slot_index lines up with its label.
        slotLabels: trainingSlots.map(s => s.label),
        trainingDays,
        restVariant: { mealList: restMealList },
        freeMeal: freeMealEnabled ? { enabled: true, day: freeMealDay } : null,
      };

      const targets = { calories: kcal, protein: grams.p, carbs: grams.c, fat: grams.f };
      const extras: DietPlanExtras = { week_structure, swaps: Object.keys(swaps).length > 0 ? swaps : null };

      let planId = params.editId as string;
      if (isEditing) {
        await updateDietPlan(planId, name.trim(), description.trim(), mealList, category, targets, imageUrl, extras);
      } else {
        const created = await createDietPlan(name.trim(), description.trim(), mealList, category, targets, imageUrl, extras);
        planId = created.id;
      }

      // Assignment: fill the chosen pass's diet nodes with this plan.
      if (assignTarget !== 'library') {
        const pass = plans.find(p => p.id === assignTarget);
        if (pass?.track) {
          const newTrack = pass.track.map(n => n.type === 'diet' ? { ...n, id: planId } : n);
          await updatePlanTrack(pass.id, newTrack);
        }
      }

      showAlert({
        type: 'success',
        title: isEditing ? 'Plan updated' : 'Plan created',
        message: `"${name.trim()}" has been saved.`,
      });
      setTimeout(() => { router.back(); }, 1200);
    } catch (err: any) {
      console.log(err);
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to save meal plan' });
      setSaving(false);
    }
  };

  // ── Shared chrome ──
  // Android hardware back steps the wizard back rather than discarding the
  // whole meal plan. The sheets above own their own onRequestClose, so back
  // closes an open sheet first and only then walks the steps.
  useAndroidBack(useCallback(() => {
    if (mode === 'describe') {
      if (!aiLoading) setMode('wizard');
      return true;
    }
    if (step === 1) return false;
    setStep((s) => (s - 1) as 1 | 2);
    return true;
  }, [step, mode, aiLoading]));

  const kickerBase = isEditing ? 'Edit meal plan' : 'New meal plan';

  // ── Describe it: one call to generate-diet, foods matched to the library ──
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    try {
      // Condensed library so the model picks from real rows where it can.
      const availableMeals = meals.slice(0, 50).map(m => ({
        name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat,
      }));
      const { data, error } = await supabase.functions.invoke('generate-diet', {
        body: { prompt: aiPrompt.trim(), availableMeals },
      });
      if (error) {
        const status = (error as any)?.context?.status ?? (error as any)?.status;
        if (status === 429) throw new Error('You’ve hit the hourly limit for AI plans.');
        if (status === 504) throw new Error('That took too long. Try a shorter description.');
        throw new Error('Couldn’t write the day. Try again in a moment.');
      }
      const aiMeals: any[] = Array.isArray(data?.meals) ? data.meals : [];
      if (aiMeals.length === 0) throw new Error('No foods came back. Try describing the day differently.');

      // Targets: the model's numbers, as a custom split.
      const t = data.targets || {};
      const tCal = Math.round(Number(t.calories) || 0);
      if (tCal > 0) setKcal(tCal);
      setPreset('custom');
      setCustomP(String(Math.round(Number(t.protein) || 0)));
      setCustomC(String(Math.round(Number(t.carbs) || 0)));
      setCustomF(String(Math.round(Number(t.fat) || 0)));
      if (typeof data.name === 'string' && data.name.trim()) setName(data.name.trim());
      if (typeof data.description === 'string') setDescription(data.description.trim());
      setCategory(DIET_CATEGORIES.includes(data.category) ? data.category : 'custom');

      // Match each food to the library by name (exact, then contains either
      // way), otherwise save it to the library with the slot's category.
      const library = [...meals];
      let created = 0;
      const resolved: { meal: SelectedMeal; meal_time: MealTimeKey }[] = [];
      for (const ai of aiMeals) {
        const nm = String(ai?.name || '').trim();
        if (!nm) continue;
        const lower = nm.toLowerCase();
        const mt = asMealTime(ai?.meal_time);
        let match = library.find(m => m.name.toLowerCase() === lower);
        if (!match) {
          match = library.find(m => {
            const ln = m.name.toLowerCase();
            const shorter = Math.min(ln.length, lower.length);
            // A three-letter name would "contain" its way into everything.
            return shorter >= 4 && (ln.includes(lower) || lower.includes(ln));
          });
        }
        if (!match) {
          const saved = await createMeal({
            name: nm.slice(0, 80),
            category: categoryForMealTime(mt),
            calories: Math.max(0, Math.round(Number(ai?.calories) || 0)),
            protein: Math.max(0, Math.round(Number(ai?.protein) || 0)),
            carbs: Math.max(0, Math.round(Number(ai?.carbs) || 0)),
            fat: Math.max(0, Math.round(Number(ai?.fat) || 0)),
          });
          created += 1;
          library.push(saved);
          match = saved;
        }
        resolved.push({
          meal_time: mt,
          meal: {
            id: match.id, name: match.name, category: match.category,
            calories: match.calories, protein: match.protein, carbs: match.carbs, fat: match.fat,
            servings: snapServings(ai?.servings),
          },
        });
      }
      if (resolved.length === 0) throw new Error('No foods came back. Try describing the day differently.');

      // Bucket by meal time into the training day. Meals a day = distinct
      // meal times (3–6); a time the template has no slot for gets its own.
      const distinct = new Set(resolved.map(r => r.meal_time)).size;
      const count = Math.min(6, Math.max(3, distinct));
      changeMealsPerDay(count);
      const built = emptySlots(count);
      resolved.forEach(({ meal, meal_time }) => {
        let slot = built.find(s => s.meal_time === meal_time);
        if (!slot) {
          slot = { label: MEAL_TIME_LABELS[meal_time], meal_time, items: [], swaps: emptySwaps() };
          built.push(slot);
        }
        slot.items.push(meal);
      });
      setTrainingSlots(built);
      setDayVariant('training');

      const filledSlots = built.filter(s => s.items.length > 0).length;
      setAiPrompt('');
      setMode('wizard');
      setStep(2);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert({
        type: 'success',
        title: 'Day written',
        message: `Filled ${filledSlots} slot${filledSlots === 1 ? '' : 's'} with ${resolved.length} food${resolved.length === 1 ? '' : 's'} (${created} new in your library).`,
      });
    } catch (err: any) {
      // The prompt stays in the box so the coach can shorten or retry it.
      showAlert({ type: 'error', title: 'Couldn’t generate', message: err?.message || 'Failed to generate the day' });
    } finally {
      setAiLoading(false);
    }
  };

  const renderHeader = () => (
    <View style={s.topBarWrap}>
      <WizardTopBar
        step={step}
        totalSteps={3}
        onBack={() => step === 1 ? router.back() : setStep((step - 1) as 1 | 2)}
      />
    </View>
  );

  // ────────────────────────────── STEP 1 ──────────────────────────────
  const renderStep1 = () => (
    <>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <WizardHeading kicker={`${kickerBase} · Targets`} title={'Set the day’s numbers.'} />

          <View style={[s.fieldWrap, focusField === 'name' && s.fieldWrapActive]}>
            <Text style={[s.microLabel, focusField === 'name' && s.microLabelActive]} maxFontSizeMultiplier={1.2}>Plan name</Text>
            <TextInput
              style={s.nameInput}
              placeholder="e.g. Marcus off-season"
              placeholderTextColor={CoachColors.textFaint}
              value={name}
              onChangeText={setName}
              onFocus={() => setFocusField('name')}
              onBlur={() => setFocusField(null)}
              selectionColor={CoachColors.accent}
            />
          </View>

          {/* The signature: calories as the hero, macros as a living bar */}
          <View style={s.heroCard}>
            <Text style={s.eyebrow} maxFontSizeMultiplier={1.2}>Daily target</Text>
            <View style={s.kcalRow}>
              <TouchableOpacity
                style={s.stepBtn}
                onPress={() => { setKcal(k => Math.max(1600, k - 50)); Haptics.selectionAsync(); }}
                accessibilityRole="button"
                accessibilityLabel="Decrease daily calories"
              >
                <Ionicons name="remove" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.kcalValue} maxFontSizeMultiplier={1.2}>{kcal.toLocaleString()}</Text>
                <Text style={s.kcalUnit}>kcal a day · 1,600 – 3,200</Text>
              </View>
              <TouchableOpacity
                style={s.stepBtn}
                onPress={() => { setKcal(k => Math.min(3200, k + 50)); Haptics.selectionAsync(); }}
                accessibilityRole="button"
                accessibilityLabel="Increase daily calories"
              >
                <Ionicons name="add" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <MacroBar shares={splitShares} grams={grams} />

            <View style={s.chipRow}>
              {(['building', 'cutting', 'holding', 'custom'] as PresetKey[]).map(k => (
                <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                  key={k}
                  style={[s.chip, preset === k && s.chipActive]}
                  onPress={() => changePreset(k)}
                  accessibilityRole="button"
                  accessibilityLabel={k === 'custom' ? 'Custom' : PRESETS[k].label}
                  accessibilityState={{ selected: preset === k }}
                >
                  <Text style={[s.chipText, preset === k && s.chipTextActive]} maxFontSizeMultiplier={1.2}>
                    {k === 'custom' ? 'Custom' : PRESETS[k].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {preset === 'custom' && (
              <View style={s.customRow}>
                {([['Protein g', 'p', customP, setCustomP], ['Carbs g', 'c', customC, setCustomC], ['Fat g', 'f', customF, setCustomF]] as [string, 'p' | 'c' | 'f', string, (v: string) => void][]).map(([label, fieldKey, val, setter]) => (
                  <View key={label} style={s.customField}>
                    <Text style={[s.microLabel, focusField === fieldKey && s.microLabelActive]} maxFontSizeMultiplier={1.2}>{label}</Text>
                    <TextInput
                      style={[s.customInput, focusField === fieldKey && s.customInputActive]}
                      keyboardType="number-pad"
                      value={val}
                      onChangeText={setter}
                      onFocus={() => setFocusField(fieldKey)}
                      onBlur={() => setFocusField(null)}
                      selectionColor={CoachColors.accent}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Meals a day */}
          <View style={s.card}>
            <Text style={s.eyebrow} maxFontSizeMultiplier={1.2}>Meals a day</Text>
            <View style={s.chipRow}>
              {[3, 4, 5, 6].map(n => (
                <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                  key={n}
                  style={[s.chip, mealsPerDay === n && s.chipActive]}
                  onPress={() => { changeMealsPerDay(n); Haptics.selectionAsync(); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} meals a day`}
                  accessibilityState={{ selected: mealsPerDay === n }}
                >
                  <Text style={[s.chipText, mealsPerDay === n && s.chipTextActive]} maxFontSizeMultiplier={1.2}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={s.describeCard}
            onPress={() => setMode('describe')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Describe it instead"
            accessibilityHint="Write the day in a sentence and fill the slots from your library"
          >
            <View style={s.describeCardIcon}>
              <Ionicons name="chatbubble-outline" size={22} color={CoachColors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.describeCardTitle}>Describe it instead</Text>
              <Text style={s.describeCardHint} numberOfLines={1}>"{AI_EXAMPLE_PROMPTS[0]}"</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={CoachColors.textFaint} />
          </TouchableOpacity>

          <Text style={s.footnote}>
            Targets are yours, not medical advice. Athletes see them as a guide with your name on it.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.cta, !name.trim() && { opacity: 0.5 }]}
          disabled={!name.trim()}
          onPress={() => setStep(2)}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Text style={s.ctaText}>Build the day</Text>
          <Ionicons name="arrow-forward" size={18} color={CoachColors.onAccent} />
        </TouchableOpacity>
      </View>
    </>
  );

  // ────────────────────────────── STEP 2 ──────────────────────────────
  const macroLine = (t: { protein: number; carbs: number; fat: number }) =>
    `P ${Math.round(t.protein)}/${grams.p}   C ${Math.round(t.carbs)}/${grams.c}   F ${Math.round(t.fat)}/${grams.f}`;

  const renderMacroHeader = () => {
    const pShare = grams.p * 4, cShare = grams.c * 4, fShare = grams.f * 9;
    const shareSum = pShare + cShare + fShare || 1;
    const seg = (flexShare: number, consumed: number, target: number, color: string) => (
      <View style={[s.macroSeg, { flex: flexShare / shareSum }]}>
        <View style={[s.macroSegFill, { width: `${Math.min(target > 0 ? consumed / target : 0, 1) * 100}%`, backgroundColor: color }]} />
      </View>
    );
    return (
      <View style={s.macroCard}>
        <View style={s.macroTopRow}>
          <Text style={s.macroKcal} maxFontSizeMultiplier={1.2}>
            {Math.round(activeTotals.calories).toLocaleString()}
            <Text style={s.macroKcalTarget}> of {kcal.toLocaleString()} kcal</Text>
          </Text>
          <View style={[s.statusChip, onTarget && s.statusChipOn]}>
            <Text style={[s.statusChipText, onTarget && s.statusChipTextOn]} maxFontSizeMultiplier={1.2}>
              {onTarget ? 'On target' : `${Math.abs(kcalDiff)} ${kcalDiff < 0 ? 'under' : 'over'}`}
            </Text>
          </View>
        </View>
        <View style={s.macroStack}>
          {seg(pShare, activeTotals.protein, grams.p, MACRO_COLORS.p)}
          {seg(cShare, activeTotals.carbs, grams.c, MACRO_COLORS.c)}
          {seg(fShare, activeTotals.fat, grams.f, MACRO_COLORS.f)}
        </View>
        <Text style={s.macroLine} maxFontSizeMultiplier={1.2}>{macroLine(activeTotals)}</Text>
      </View>
    );
  };

  const renderStep2 = () => {
    const restEmpty = restSlots.every(sl => sl.items.length === 0);
    const trainingHasMeals = trainingSlots.some(sl => sl.items.length > 0);
    return (
      <>
        <View style={s.headingWrap}>
          <WizardHeading kicker={`${kickerBase} · The day`} title={'Fill the day’s plates.'} />
        </View>
        {renderMacroHeader()}

        <View style={s.segmented}>
          {(['training', 'rest'] as DayVariant[]).map(v => (
            <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
              key={v}
              style={[s.segment, dayVariant === v && s.segmentActive]}
              onPress={() => { setDayVariant(v); Haptics.selectionAsync(); }}
              accessibilityRole="button"
              accessibilityLabel={v === 'training' ? 'Training day' : 'Rest day'}
              accessibilityState={{ selected: dayVariant === v }}
            >
              <Text style={[s.segmentText, dayVariant === v && s.segmentTextActive]} maxFontSizeMultiplier={1.2}>
                {v === 'training' ? 'Training day' : 'Rest day'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
          {dayVariant === 'rest' && restEmpty && trainingHasMeals && (
            <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }} style={s.copyBtn} onPress={copyTrainingToRest} activeOpacity={0.8} accessibilityRole="button">
              <Ionicons name="copy-outline" size={18} color={CoachColors.accent} />
              <Text style={s.copyBtnText}>Copy training day at reduced portions</Text>
            </TouchableOpacity>
          )}

          {slots.map((slot, index) => {
            const swapCount = slot.swaps.allowedMealIds.length;
            const hasItems = slot.items.length > 0;
            const totals = foodTotals(slot.items);
            return (
              <View key={`${dayVariant}-${index}`} style={{ marginBottom: 12 }}>
                <View style={s.slotLabelRow}>
                  <Text style={s.slotLabel} maxFontSizeMultiplier={1.2}>{slot.label}</Text>
                  {hasItems && (
                    <>
                      <Text style={s.slotKcal} maxFontSizeMultiplier={1.2}>{Math.round(totals.calories)} kcal</Text>
                      <TouchableOpacity
                        style={s.slotOptionsBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => setSlotSheetIndex(index)}
                        accessibilityRole="button"
                        accessibilityLabel={`Options for ${slot.label}`}
                      >
                        <Ionicons name="ellipsis-horizontal" size={19} color={CoachColors.textSecondary} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
                {hasItems ? (
                  <View style={s.slotCard}>
                    {slot.items.map((it, itemIndex) => (
                      <TouchableOpacity
                        key={`${it.id}-${itemIndex}`}
                        style={[s.itemRow, itemIndex > 0 && s.itemRowDivider]}
                        activeOpacity={0.8}
                        onPress={() => openItemSheet(index, itemIndex)}
                        accessibilityRole="button"
                        accessibilityLabel={`Edit ${it.name}, ${itemLine(it)}`}
                      >
                        <SlotThumb
                          name={it.name}
                          existingUrl={meals.find(m => m.id === it.id)?.image_url}
                          mealId={it.id}
                          mealTime={slot.meal_time}
                        />
                        <View style={s.slotBody}>
                          <Text style={s.slotMealName} numberOfLines={1}>{it.name}</Text>
                          <Text style={s.slotMealMacros} maxFontSizeMultiplier={1.3}>{itemLine(it)}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={17} color={CoachColors.textFaint} style={s.slotChevron} />
                      </TouchableOpacity>
                    ))}
                    {dayVariant === 'training' && swapCount > 0 && (
                      <View style={s.swapTagRow}>
                        <View style={s.swapTag}>
                          <Ionicons name="swap-horizontal" size={12} color={CoachColors.accent} />
                          <Text style={s.swapTagText} maxFontSizeMultiplier={1.2}>{swapCount} swap{swapCount === 1 ? '' : 's'} allowed</Text>
                        </View>
                      </View>
                    )}
                    <TouchableOpacity
                      style={s.addFoodRow}
                      activeOpacity={0.7}
                      onPress={() => openSearch(index, null)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add food to ${slot.label}`}
                    >
                      <Ionicons name="add" size={18} color={CoachColors.accent} />
                      <Text style={s.addFoodText} maxFontSizeMultiplier={1.2}>Add food</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={s.slotEmpty}
                    activeOpacity={0.7}
                    onPress={() => openSearch(index, null)}
                    accessibilityRole="button"
                    accessibilityLabel={`Pick a food for ${slot.label}`}
                  >
                    <Ionicons name="add" size={18} color={CoachColors.textMuted} />
                    <Text style={s.slotEmptyText}>Pick a food</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          <GhostSlot label="Add a meal" onPress={appendSlot} />
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.cta, !trainingHasMeals && { opacity: 0.5 }]}
            disabled={!trainingHasMeals}
            onPress={() => setStep(3)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={s.ctaText}>Set the week</Text>
            <Ionicons name="arrow-forward" size={18} color={CoachColors.onAccent} />
          </TouchableOpacity>
        </View>
      </>
    );
  };

  // ────────────────────────────── STEP 3 ──────────────────────────────
  const renderStep3 = () => (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
        <WizardHeading kicker={`${kickerBase} · The week`} title={'Training days eat more.'} />
        <Text style={[s.sub, { marginTop: 12 }]}>
          Tap the days this athlete trains. Training days get the {fmtK(trainingTotals.calories)} kcal day, the rest get the {fmtK(restTotals.calories)} kcal one.
        </Text>

        <View style={s.weekRow}>
          {WEEK_DAYS.map(d => {
            const isTraining = trainingDays.includes(d.key);
            return (
              <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                key={d.key}
                style={[s.dayChip, isTraining && s.dayChipActive]}
                onPress={() => toggleTrainingDay(d.key)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${d.full}, ${isTraining ? 'training day' : 'rest day'}`}
                accessibilityState={{ selected: isTraining }}
              >
                <Text style={[s.dayChipDay, isTraining && s.dayChipDayActive]} maxFontSizeMultiplier={1.2}>{d.short}</Text>
                <Text style={[s.dayChipKcal, isTraining && s.dayChipKcalActive]} maxFontSizeMultiplier={1.2}>
                  {fmtK(isTraining ? trainingTotals.calories : restTotals.calories)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={s.toggleRow}
          onPress={() => setFreeMealEnabled(v => !v)}
          activeOpacity={0.7}
          accessibilityRole="switch"
          accessibilityLabel="One free meal a week"
          accessibilityState={{ checked: freeMealEnabled }}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.toggleTitle}>One free meal a week</Text>
            <Text style={s.toggleSub}>{freeMealDayFull} dinner, off the books</Text>
          </View>
          <View style={[s.toggle, freeMealEnabled && s.toggleOn]}>
            <View style={[s.toggleKnob, freeMealEnabled && s.toggleKnobOn]} />
          </View>
        </TouchableOpacity>

        <Text style={[s.eyebrow, { marginTop: 28, marginBottom: 12 }]} maxFontSizeMultiplier={1.2}>Where does it go</Text>
        {dietPasses.map(p => {
          const nodeCount = p.track!.filter(n => n.type === 'diet').length;
          const selected = assignTarget === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              style={[s.radioRow, selected && s.radioRowActive]}
              onPress={() => setAssignTarget(p.id)}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityLabel={`Into ${p.name}`}
              accessibilityState={{ checked: selected }}
            >
              <View style={[s.radio, selected && s.radioActive]}>
                {selected && <View style={s.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.radioTitle}>Into {p.name}</Text>
                <Text style={s.radioSub}>Fills all {nodeCount} meal-plan node{nodeCount === 1 ? '' : 's'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[s.radioRow, assignTarget === 'library' && s.radioRowActive]}
          onPress={() => setAssignTarget('library')}
          activeOpacity={0.7}
          accessibilityRole="radio"
          accessibilityLabel="Library only"
          accessibilityState={{ checked: assignTarget === 'library' }}
        >
          <View style={[s.radio, assignTarget === 'library' && s.radioActive]}>
            {assignTarget === 'library' && <View style={s.radioDot} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.radioTitle}>Library only</Text>
            <Text style={s.radioSub}>Assign it to someone later</Text>
          </View>
        </TouchableOpacity>

        <Text style={[s.eyebrow, { marginTop: 28, marginBottom: 12 }]} maxFontSizeMultiplier={1.2}>Cover and notes (optional)</Text>
        <TouchableOpacity
          style={[s.imageUploadBtn, imageUrl && s.imageUploadBtnActive]}
          onPress={pickImage}
          disabled={uploadingImage}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={imageUrl ? 'Change cover image' : 'Add cover image'}
        >
          {uploadingImage ? (
            <ActivityIndicator color={CoachColors.accent} />
          ) : imageUrl ? (
            <>
              <Image source={{ uri: imageUrl }} style={s.uploadedImage} resizeMode="cover" />
              <View style={s.imageOverlay}>
                <Ionicons name="camera" size={25} color={CoachColors.textPrimary} />
                <Text style={s.imageOverlayText}>Change image</Text>
              </View>
            </>
          ) : (
            <>
              <Ionicons name="image-outline" size={27} color={CoachColors.textFaint} />
              <Text style={s.imageUploadText}>Tap to add cover image</Text>
            </>
          )}
        </TouchableOpacity>
        <TextInput
          style={s.descInput}
          placeholder="Notes the athlete sees (optional)"
          placeholderTextColor={CoachColors.textFaint}
          multiline
          value={description}
          onChangeText={setDescription}
          selectionColor={CoachColors.accent}
        />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.cta, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Save changes' : 'Save meal plan'}
        >
          {saving ? <ActivityIndicator color={CoachColors.onAccent} /> : (
            <>
              <Ionicons name="checkmark" size={20} color={CoachColors.onAccent} />
              <Text style={s.ctaText}>{isEditing ? 'Save changes' : 'Save meal plan'}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  // ── Describe-it screen (mirrors create-workout's describe mode) ──
  const renderDescribe = () => (
    <>
      <View style={s.describeHeader}>
        <TouchableOpacity
          onPress={() => !aiLoading && setMode('wizard')}
          style={s.describeBackBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={aiLoading}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={19} color={CoachColors.textPrimary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <WizardHeading kicker={`${kickerBase} · Describe it`} title="Describe the day" />
          <Text style={[s.sub, { marginTop: 12 }]}>
            Foods come from your library where they match; new ones are saved to it.
          </Text>

          <View style={[s.describeInputWrap, aiLoading && { opacity: 0.5 }]}>
            <TextInput
              style={s.describeInput}
              placeholder={AI_EXAMPLE_PROMPTS[0]}
              placeholderTextColor={CoachColors.textFaint}
              value={aiPrompt}
              onChangeText={setAiPrompt}
              multiline
              editable={!aiLoading}
              selectionColor={CoachColors.accent}
              accessibilityLabel="Describe the day"
            />
          </View>

          <View style={s.chipRow}>
            {AI_EXAMPLE_PROMPTS.map(ex => (
              <TouchableOpacity
                hitSlop={{ top: 7, bottom: 7 }}
                key={ex}
                style={s.exampleChip}
                onPress={() => !aiLoading && setAiPrompt(ex)}
                activeOpacity={0.7}
                disabled={aiLoading}
                accessibilityRole="button"
                accessibilityLabel={`Use example: ${ex}`}
              >
                <Text style={s.exampleChipText}>{ex}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.cta, (!aiPrompt.trim() || aiLoading) && { opacity: 0.5 }]}
            onPress={handleAiGenerate}
            disabled={!aiPrompt.trim() || aiLoading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Generate the day"
            accessibilityState={{ disabled: !aiPrompt.trim() || aiLoading, busy: aiLoading }}
          >
            {aiLoading ? (
              <>
                <ActivityIndicator size="small" color={CoachColors.onAccent} />
                <Text style={s.ctaText}>Writing the day…</Text>
              </>
            ) : (
              <Text style={s.ctaText}>Generate the day</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );

  // ── Sheets / modals ──
  const itemSheetSlot = itemSheet ? slots[itemSheet.slot] : null;
  const itemSheetFood = itemSheet && itemSheetSlot ? itemSheetSlot.items[itemSheet.item] : null;
  const slotSheetSlot = slotSheetIndex !== null ? slots[slotSheetIndex] : null;
  const slotSheetTotals = slotSheetSlot ? foodTotals(slotSheetSlot.items) : null;
  const isExtraSlot = slotSheetIndex !== null && slotSheetIndex >= (SLOT_TEMPLATES[mealsPerDay]?.length ?? 4);

  if (mode === 'describe') {
    return (
      <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
        {renderDescribe()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      {renderHeader()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}

      {/* Food sheet: servings, replace, remove — for ONE food in a slot */}
      <Modal visible={itemSheet !== null} animationType="slide" transparent onRequestClose={() => setItemSheet(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} maxFontSizeMultiplier={1.3} numberOfLines={2}>{itemSheetFood?.name || 'Food'}</Text>
              <TouchableOpacity
                hitSlop={12}
                onPress={() => setItemSheet(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {itemSheet && itemSheetFood && (
              <>
                <Text style={s.modalLabel}>{itemSheetSlot?.label} · {itemLine({ ...itemSheetFood, servings: editServings })}</Text>

                <View style={s.servingRow}>
                  <Text style={s.servingLabel}>Servings</Text>
                  <View style={s.portionControls}>
                    <TouchableOpacity
                      hitSlop={{ top: 6, bottom: 6 }}
                      style={s.portionBtn}
                      onPress={() => setEditServings(v => Math.max(0.25, v - 0.25))}
                      accessibilityRole="button"
                      accessibilityLabel="Decrease servings"
                    >
                      <Ionicons name="remove" size={25} color={CoachColors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={s.portionValue} maxFontSizeMultiplier={1.2}>{editServings}</Text>
                    <TouchableOpacity
                      hitSlop={{ top: 6, bottom: 6 }}
                      style={s.portionBtn}
                      onPress={() => setEditServings(v => v + 0.25)}
                      accessibilityRole="button"
                      accessibilityLabel="Increase servings"
                    >
                      <Ionicons name="add" size={25} color={CoachColors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={s.sheetPrimaryBtn} onPress={saveItemServings} accessibilityRole="button">
                  <Text style={s.sheetPrimaryText}>Save servings</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.sheetActionBtn}
                  onPress={() => {
                    const { slot, item } = itemSheet;
                    setItemSheet(null);
                    // Two native Modals at once freeze iOS: let this one close first.
                    setTimeout(() => openSearch(slot, item), 300);
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="repeat" size={20} color={CoachColors.textPrimary} />
                  <Text style={s.sheetActionText}>Replace this food</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.sheetActionBtn, s.dangerBtn]}
                  onPress={() => removeItem(itemSheet.slot, itemSheet.item)}
                  accessibilityRole="button"
                >
                  <Ionicons name="trash" size={20} color={CoachColors.danger} />
                  <Text style={[s.sheetActionText, { color: CoachColors.danger }]}>Remove this food</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Slot sheet: swaps and clearing — for the WHOLE slot */}
      <Modal visible={slotSheetIndex !== null} animationType="slide" transparent onRequestClose={() => setSlotSheetIndex(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} maxFontSizeMultiplier={1.3}>{slotSheetSlot?.label || 'Meal'}</Text>
              <TouchableOpacity
                hitSlop={12}
                onPress={() => setSlotSheetIndex(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {slotSheetSlot && slotSheetTotals && slotSheetIndex !== null && (
              <>
                <Text style={s.modalLabel}>
                  {slotSheetSlot.items.length} food{slotSheetSlot.items.length === 1 ? '' : 's'} · {Math.round(slotSheetTotals.calories)} kcal · P {Math.round(slotSheetTotals.protein)} C {Math.round(slotSheetTotals.carbs)} F {Math.round(slotSheetTotals.fat)}
                </Text>

                <TouchableOpacity
                  style={s.sheetActionBtn}
                  onPress={() => {
                    const i = slotSheetIndex;
                    setSlotSheetIndex(null);
                    setTimeout(() => openSearch(i, null), 300);
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="add" size={20} color={CoachColors.textPrimary} />
                  <Text style={s.sheetActionText}>Add food</Text>
                </TouchableOpacity>

                {dayVariant === 'training' && (
                  <TouchableOpacity
                    style={s.sheetActionBtn}
                    onPress={() => {
                      const i = slotSheetIndex;
                      setSlotSheetIndex(null);
                      setTimeout(() => setSwapSheetIndex(i), 300);
                    }}
                    accessibilityRole="button"
                  >
                    <Ionicons name="swap-horizontal" size={20} color={CoachColors.accent} />
                    <Text style={s.sheetActionText}>
                      Manage swaps{slotSheetSlot.swaps.allowedMealIds.length > 0 ? ` (${slotSheetSlot.swaps.allowedMealIds.length})` : ''}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[s.sheetActionBtn, s.dangerBtn]}
                  onPress={() => isExtraSlot ? removeExtraSlot(slotSheetIndex) : clearSlot(slotSheetIndex)}
                  accessibilityRole="button"
                >
                  <Ionicons name="trash" size={20} color={CoachColors.danger} />
                  <Text style={[s.sheetActionText, { color: CoachColors.danger }]}>
                    {isExtraSlot ? 'Remove this meal slot' : 'Clear this slot'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Swap sheet (training day only) */}
      <Modal visible={swapSheetIndex !== null} animationType="slide" transparent onRequestClose={() => setSwapSheetIndex(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxHeight: '85%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                If they can't have {swapSlot && swapSlot.items.length === 1
                  ? swapSlot.items[0].name.split(',')[0].split(' with ')[0]
                  : swapSlot && swapSlot.items.length > 1 ? swapSlot.label.toLowerCase() : 'this'}
              </Text>
              <TouchableOpacity
                hitSlop={12}
                onPress={() => setSwapSheetIndex(null)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={s.swapSubtext}>
              Pick what they're allowed to switch to. Anything you approve lands within 40 kcal and 5g protein of the original.
            </Text>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}>
              {swapCandidates.inRange.length === 0 && (
                <Text style={s.swapEmpty}>None of your saved meals land within range of this one.</Text>
              )}
              {swapCandidates.inRange.map(m => {
                const checked = swapSlot?.swaps.allowedMealIds.includes(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    hitSlop={{ top: 4, bottom: 4 }}
                    style={s.swapRow}
                    onPress={() => toggleSwapMeal(m.id)}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityLabel={m.name}
                    accessibilityState={{ checked: !!checked }}
                  >
                    <View style={[s.checkbox, checked && s.checkboxOn]}>
                      {checked && <Ionicons name="checkmark" size={15} color={CoachColors.onAccent} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.swapName} numberOfLines={1}>{m.name}</Text>
                      <Text style={s.swapMacros}>{m.calories} kcal · P {m.protein}g</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {swapCandidates.outOfRange.map(({ meal: m, reason }) => (
                <View key={m.id} style={[s.swapRow, { opacity: 0.45 }]}>
                  <View style={s.checkbox} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.swapName} numberOfLines={1}>{m.name}</Text>
                    <Text style={s.swapMacros}>Out of range · {reason}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={s.ownLogRow}
              onPress={toggleAllowOwnLog}
              activeOpacity={0.7}
              accessibilityRole="switch"
              accessibilityLabel="Let them log their own"
              accessibilityState={{ checked: !!swapSlot?.swaps.allowOwnLog }}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.toggleTitle}>Let them log their own</Text>
                <Text style={s.toggleSub}>You see it in their check-in either way</Text>
              </View>
              <View style={[s.toggle, swapSlot?.swaps.allowOwnLog && s.toggleOn]}>
                <View style={[s.toggleKnob, swapSlot?.swaps.allowOwnLog && s.toggleKnobOn]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.sheetPrimaryBtn} onPress={() => setSwapSheetIndex(null)} accessibilityRole="button">
              <Text style={s.sheetPrimaryText}>
                Allow these {swapSlot?.swaps.allowedMealIds.length || 0}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Food search modal (saved + USDA) */}
      <Modal visible={searchSlotIndex !== null} animationType="slide" transparent onRequestClose={closeSearch}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.modalContent, { height: '90%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} maxFontSizeMultiplier={1.3}>
                {searchSlotIndex !== null && slots[searchSlotIndex]
                  ? (searchItemIndex !== null ? `Replace in ${slots[searchSlotIndex].label}` : `Add to ${slots[searchSlotIndex].label}`)
                  : 'Add a food'}
              </Text>
              <TouchableOpacity
                hitSlop={12}
                onPress={closeSearch}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={s.searchWrap}>
              <Ionicons name="search" size={20} color={CoachColors.textFaint} />
              <TextInput
                style={s.searchInput}
                placeholder={searchMode === 'api' ? 'Search USDA database (e.g. Chicken)' : 'Search my saved meals'}
                placeholderTextColor={CoachColors.textFaint}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => searchMode === 'api' && performSearch()}
                returnKeyType="search"
                autoFocus
                selectionColor={CoachColors.accent}
              />
              {searchMode === 'api' && (
                <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={performSearch} style={s.searchBtn} accessibilityRole="button">
                  <Text style={s.searchBtnText}>Search</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={s.searchTabs}>
              <TouchableOpacity
                hitSlop={{ top: 6, bottom: 6 }}
                style={[s.searchTab, searchMode === 'saved' && s.searchTabActive]}
                onPress={() => setSearchMode('saved')}
                accessibilityRole="button"
                accessibilityState={{ selected: searchMode === 'saved' }}
              >
                <Text style={[s.searchTabText, searchMode === 'saved' && s.searchTabTextActive]} maxFontSizeMultiplier={1.2}>My meals</Text>
              </TouchableOpacity>
              <TouchableOpacity
                hitSlop={{ top: 6, bottom: 6 }}
                style={[s.searchTab, searchMode === 'api' && s.searchTabActive]}
                onPress={() => setSearchMode('api')}
                accessibilityRole="button"
                accessibilityState={{ selected: searchMode === 'api' }}
              >
                <Text style={[s.searchTabText, searchMode === 'api' && s.searchTabTextActive]} maxFontSizeMultiplier={1.2}>USDA DB</Text>
              </TouchableOpacity>
            </View>

            {searching && searchMode === 'api' ? (
              <ActivityIndicator size="large" color={CoachColors.accent} style={{ marginTop: 40 }} />
            ) : (
              <FlatList keyboardShouldPersistTaps="handled"
                data={searchMode === 'saved' ? filteredSavedMeals.map(m => ({ ...m, _uid: m.id })) : apiResults}
                keyExtractor={(item) => item._uid}
                contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
                renderItem={({ item }) => {
                  const isExpanded = selectedResultId === item._uid;
                  return (
                    <View style={s.resultCard}>
                      <TouchableOpacity
                        style={s.resultRow}
                        onPress={() => {
                          setSelectedResultId(isExpanded ? null : item._uid);
                          setTempServings(1);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name}, ${isExpanded ? 'collapse' : 'add'}`}
                        accessibilityState={{ expanded: isExpanded }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.resultName} numberOfLines={2}>{item.name}</Text>
                          <Text style={s.resultMacros}>
                            {item.calories} kcal · {item.serving_size_g || 100}g serving
                          </Text>
                          <Text style={s.resultMacrosSub}>
                            P {item.protein}g   C {item.carbs}g   F {item.fat}g
                          </Text>
                        </View>
                        {isExpanded ? (
                          <Ionicons name="chevron-up" size={29} color={CoachColors.textFaint} />
                        ) : (
                          <View style={s.addCircle}>
                            <Ionicons name="add" size={20} color={CoachColors.textSecondary} />
                          </View>
                        )}
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={s.portionEditor}>
                          <Text style={s.portionLabel}>Servings:</Text>
                          <View style={s.portionControls}>
                            <TouchableOpacity
                              hitSlop={{ top: 6, bottom: 6 }}
                              style={s.portionBtn}
                              onPress={() => setTempServings(v => Math.max(0.25, v - 0.25))}
                              accessibilityRole="button"
                              accessibilityLabel="Decrease servings"
                            >
                              <Ionicons name="remove" size={22} color={CoachColors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={s.portionValue} maxFontSizeMultiplier={1.2}>{tempServings}</Text>
                            <TouchableOpacity
                              hitSlop={{ top: 6, bottom: 6 }}
                              style={s.portionBtn}
                              onPress={() => setTempServings(v => v + 0.25)}
                              accessibilityRole="button"
                              accessibilityLabel="Increase servings"
                            >
                              <Ionicons name="add" size={22} color={CoachColors.textPrimary} />
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity
                            hitSlop={{ top: 5, bottom: 5 }}
                            style={s.portionAddBtn}
                            onPress={() => {
                              if (searchMode === 'saved') addFromLocal(item, tempServings);
                              else addFromApi(item, tempServings);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Add ${item.name}`}
                          >
                            <Text style={s.portionAddText}>Add</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                }}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: CoachColors.bg },

  topBarWrap: { paddingHorizontal: 20, paddingTop: 8 },
  headingWrap: { paddingHorizontal: 20 },

  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  eyebrow: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  sub: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, lineHeight: 21.5, marginBottom: 20 },
  footnote: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint, lineHeight: 20, marginTop: 8 },

  // Lime active-input treatment (add-client precedent): surface field,
  // accent border + lime micro-label while the caret is in it.
  fieldWrap: {
    backgroundColor: CoachColors.surface, borderRadius: 12, borderCurve: 'continuous',
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
    marginTop: 24, marginBottom: 16,
  },
  fieldWrapActive: { borderColor: CoachColors.accent },
  microLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase', color: CoachColors.textFaint, marginBottom: 2,
  },
  microLabelActive: { color: CoachColors.accent },
  nameInput: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 20, color: CoachColors.textPrimary,
    paddingVertical: 8,
  },

  card: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', padding: 18, marginBottom: 16, borderWidth: 1, borderColor: CoachColors.border },

  // The signature card: hero calorie numeral over the living macro bar.
  heroCard: {
    backgroundColor: CoachColors.surface, borderRadius: 20, borderCurve: 'continuous',
    padding: 20, marginBottom: 16, borderWidth: 1, borderColor: CoachColors.border,
  },
  kcalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 20 },
  stepBtn: { width: 44, height: 44, borderRadius: 999, borderCurve: 'continuous', backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  kcalValue: { fontFamily: CoachFonts.mono, fontSize: 44, lineHeight: 50, color: CoachColors.textPrimary, fontVariant: ['tabular-nums'] },
  kcalUnit: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint, marginTop: 2 },

  macroBarRow: { flexDirection: 'row', height: 10, gap: 2 },
  macroBarSeg: { height: 10, borderRadius: 2, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: CoachColors.borderMuted },
  macroBarFill: { height: '100%', borderRadius: 2, borderCurve: 'continuous' },
  macroBarLegend: { flexDirection: 'row', gap: 2, marginTop: 8 },
  macroBarGrams: { fontFamily: CoachFonts.mono, fontSize: 11.5, fontVariant: ['tabular-nums'] },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.full, borderCurve: 'continuous', backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.border },
  chipActive: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  chipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },
  chipTextActive: { color: CoachColors.accent, fontFamily: CoachFonts.bodySemiBold },

  customRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  customField: { flex: 1 },
  customInput: { backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.border, borderRadius: Radius.sm, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 12, fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, marginTop: 4 },
  customInputActive: { borderColor: CoachColors.accent, backgroundColor: CoachColors.surface },

  // Inside SafeAreaView edges={['top','bottom']} — the inset is already applied,
  // so this is breathing room only (was 28, stacking to ~62pt of dead space).
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: CoachColors.bg },
  cta: { height: 52, borderRadius: Radius.full, borderCurve: 'continuous', backgroundColor: CoachColors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.onAccent },

  // Step 2
  macroCard: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', padding: 16, marginHorizontal: 20, marginTop: 8, borderWidth: 1, borderColor: CoachColors.border },
  macroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  macroKcal: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary, fontVariant: ['tabular-nums'] },
  macroKcalTarget: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted },
  statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted },
  statusChipOn: { backgroundColor: CoachColors.accentSoft },
  statusChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textSecondary },
  statusChipTextOn: { color: CoachColors.accent },
  macroStack: { flexDirection: 'row', gap: 3, height: 6 },
  macroSeg: { height: 6, borderRadius: 3, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted, overflow: 'hidden' },
  macroSegFill: { height: '100%', borderRadius: 3, borderCurve: 'continuous' },
  macroLine: { fontFamily: CoachFonts.mono, fontSize: 12.5, color: CoachColors.textSecondary, marginTop: 10 },

  segmented: { flexDirection: 'row', backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', padding: 4, marginHorizontal: 20, marginTop: 12, borderWidth: 1, borderColor: CoachColors.border },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: Radius.sm, borderCurve: 'continuous' },
  segmentActive: { backgroundColor: CoachColors.accent },
  segmentText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },
  segmentTextActive: { color: CoachColors.onAccent, fontFamily: CoachFonts.bodySemiBold },

  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter, marginBottom: 16 },
  copyBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.accent },

  slotLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, minHeight: 28 },
  slotLabel: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  slotKcal: { fontFamily: CoachFonts.mono, fontSize: 12.5, color: CoachColors.textMuted, fontVariant: ['tabular-nums'] },
  // 28pt glyph, 44pt reach via hitSlop.
  slotOptionsBtn: { width: 28, height: 28, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border },
  // Filled slot: one row per food, the food-image slit leads each row; radius 14 continuous clips it.
  slotCard: { backgroundColor: CoachColors.surface, borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.borderMuted, overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', minHeight: 62 },
  itemRowDivider: { borderTopWidth: 1, borderTopColor: CoachColors.borderMuted },
  swapTagRow: { paddingHorizontal: 12, paddingBottom: 8 },
  addFoodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted },
  addFoodText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.accent },
  slotThumb: { width: 62, alignSelf: 'stretch' },
  slotThumbFallback: { backgroundColor: CoachColors.bg, alignItems: 'center', justifyContent: 'center' },
  slotBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  slotChevron: { marginRight: 12 },
  slotMealName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 3 },
  slotMealMacros: { fontFamily: CoachFonts.mono, fontSize: 12.5, color: CoachColors.textMuted, fontVariant: ['tabular-nums'] },
  swapTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: CoachColors.accentSofter, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, borderCurve: 'continuous' },

  // Describe-it (create-workout precedent)
  describeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: Radius.md, borderCurve: 'continuous', padding: 14, marginBottom: 16, minHeight: 64,
  },
  describeCardIcon: {
    width: 36, height: 36, borderRadius: Radius.xs, borderCurve: 'continuous', backgroundColor: CoachColors.accentSofter,
    alignItems: 'center', justifyContent: 'center',
  },
  describeCardTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 2 },
  describeCardHint: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, fontStyle: 'italic' },
  describeHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  describeBackBtn: { width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', marginLeft: -8, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border },
  describeInputWrap: {
    backgroundColor: CoachColors.surface, borderRadius: Radius.sm, borderCurve: 'continuous',
    borderWidth: 1, borderColor: CoachColors.border,
    paddingHorizontal: 14, marginBottom: 16,
  },
  describeInput: {
    fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary,
    paddingVertical: 14, minHeight: 108, textAlignVertical: 'top',
  },
  exampleChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.full, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  exampleChipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textSecondary },
  swapTagText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.accent },
  slotEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16, backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed' },
  slotEmptyText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textMuted },

  // Step 3
  weekRow: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  dayChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.sm, borderCurve: 'continuous', backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border },
  dayChipActive: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  dayChipDay: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textSecondary },
  dayChipDayActive: { color: CoachColors.accent },
  dayChipKcal: { fontFamily: CoachFonts.mono, fontSize: 11, color: CoachColors.textFaint, marginTop: 4 },
  dayChipKcalActive: { color: CoachColors.accent },

  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', padding: 16, borderWidth: 1, borderColor: CoachColors.border, gap: 12 },
  toggleTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 2 },
  toggleSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  toggle: { width: 44, height: 26, borderRadius: 13, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted, padding: 3 },
  toggleOn: { backgroundColor: CoachColors.accent },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, borderCurve: 'continuous', backgroundColor: CoachColors.textSecondary },
  toggleKnobOn: { backgroundColor: CoachColors.onAccent, alignSelf: 'flex-end' },

  radioRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', padding: 16, borderWidth: 1, borderColor: CoachColors.border, gap: 12, marginBottom: 10 },
  radioRowActive: { borderColor: CoachColors.accent },
  radio: { width: 20, height: 20, borderRadius: 10, borderCurve: 'continuous', borderWidth: 2, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: CoachColors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, borderCurve: 'continuous', backgroundColor: CoachColors.accent },
  radioTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 2 },
  radioSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },

  imageUploadBtn: { height: 110, borderRadius: Radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed', backgroundColor: CoachColors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imageUploadBtnActive: { borderWidth: 0, borderStyle: 'solid' },
  imageUploadText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 8 },
  uploadedImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  imageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  imageOverlayText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textPrimary, marginTop: 4 },
  descInput: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border, padding: 14, marginTop: 12, minHeight: 96, textAlignVertical: 'top', fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: CoachColors.bg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: Spacing['3xl'], borderWidth: 1, borderColor: CoachColors.border, borderBottomWidth: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, gap: 12 },
  modalTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary, flex: 1 },
  modalLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textMuted, marginBottom: 16 },

  servingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  servingLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 15.5, color: CoachColors.textPrimary },
  sheetPrimaryBtn: { height: 48, borderRadius: Radius.full, borderCurve: 'continuous', backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  sheetPrimaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.onAccent },
  sheetActionBtn: { flexDirection: 'row', height: 46, backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: CoachColors.border, marginTop: 10 },
  sheetActionText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  dangerBtn: { backgroundColor: CoachColors.dangerSoft, borderColor: 'transparent' },

  swapSubtext: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, lineHeight: 20, marginBottom: 16 },
  swapEmpty: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textFaint, paddingVertical: 16, textAlign: 'center' },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderCurve: 'continuous', borderWidth: 1.5, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  swapName: { fontFamily: CoachFonts.bodyMedium, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 2 },
  swapMacros: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  ownLogRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, marginTop: 8 },

  // Search modal (unchanged pattern)
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: CoachColors.border },
  searchInput: { flex: 1, color: CoachColors.textPrimary, fontFamily: CoachFonts.body, fontSize: 15.5, marginLeft: 10 },
  searchBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: CoachColors.accent, borderRadius: Radius.full, borderCurve: 'continuous', marginLeft: 8 },
  searchBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.onAccent },
  searchTabs: { flexDirection: 'row', backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', padding: 4, marginTop: 16, borderWidth: 1, borderColor: CoachColors.border },
  searchTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm, borderCurve: 'continuous' },
  searchTabActive: { backgroundColor: CoachColors.accent },
  searchTabText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textSecondary },
  searchTabTextActive: { color: CoachColors.onAccent, fontFamily: CoachFonts.bodySemiBold },
  resultCard: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  resultName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textPrimary, marginBottom: 4 },
  resultMacros: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, marginBottom: 2 },
  resultMacrosSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  addCircle: { width: 30, height: 30, borderRadius: 15, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  portionEditor: { backgroundColor: CoachColors.surface, padding: 16, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  portionLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textMuted },
  portionControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.bg, borderRadius: Radius.md, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.border },
  portionBtn: { padding: 8 },
  portionValue: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, minWidth: 40, textAlign: 'center' },
  portionAddBtn: { backgroundColor: CoachColors.accent, paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.full, borderCurve: 'continuous' },
  portionAddText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.onAccent },
});
