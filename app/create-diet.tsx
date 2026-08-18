import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, FlatList, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { decode } from 'base64-arraybuffer';

import { useApp, DietWeekStructure, DietSwapsMap, DietPlanExtras } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { searchNutrition, nutritionToMeal } from '../lib/nutritionApi';
import { Spacing, Radius } from '../constants/theme';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { useAndroidBack } from '../hooks/useAndroidBack';

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

interface Slot {
  label: string;
  meal_time: MealTimeKey;
  meal: SelectedMeal | null;
  swaps: { allowedMealIds: string[]; allowOwnLog: boolean };
}

type DayVariant = 'training' | 'rest';
type PresetKey = 'building' | 'cutting' | 'holding' | 'custom';

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
    ...t, meal: null, swaps: { allowedMealIds: [], allowOwnLog: false },
  }));

const slotTotals = (slots: Slot[]) =>
  slots.reduce((acc, s) => {
    if (!s.meal) return acc;
    const sv = s.meal.servings || 1;
    acc.calories += s.meal.calories * sv;
    acc.protein += s.meal.protein * sv;
    acc.carbs += s.meal.carbs * sv;
    acc.fat += s.meal.fat * sv;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;

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

  // ── Step 1: targets ──
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState(2400);
  const [preset, setPreset] = useState<PresetKey>('holding');
  const [customP, setCustomP] = useState('150');
  const [customC, setCustomC] = useState('240');
  const [customF, setCustomF] = useState('80');
  const [mealsPerDay, setMealsPerDay] = useState(4);
  const [category, setCategory] = useState<string>('balanced');

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
  const [searchSlotIndex, setSearchSlotIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiResults, setApiResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'saved' | 'api'>('saved');
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [tempServings, setTempServings] = useState<number>(1);

  // ── Slot detail sheet + swap sheet ──
  const [slotSheetIndex, setSlotSheetIndex] = useState<number | null>(null);
  const [editServings, setEditServings] = useState<number>(1);
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

    // Fill training slots from diet_plan_meals in order.
    const orderedMeals = (editDiet.diet_plan_meals || [])
      .slice().sort((a, b) => a.order_index - b.order_index)
      .map(dpm => ({
        dpm,
        meal: {
          id: dpm.meal_id,
          name: dpm.meals?.name || 'Unknown',
          category: dpm.meals?.category || 'Snack',
          calories: dpm.meals?.calories || 0,
          protein: dpm.meals?.protein || 0,
          carbs: dpm.meals?.carbs || 0,
          fat: dpm.meals?.fat || 0,
          servings: dpm.servings || 1,
        } as SelectedMeal,
      }));

    const base = emptySlots(count);
    if (ws?.slotLabels) {
      ws.slotLabels.forEach((label, i) => { if (base[i]) base[i].label = label; });
    }
    const savedSwaps = editDiet.swaps || {};
    orderedMeals.forEach(({ dpm, meal }, i) => {
      const sw = savedSwaps[String(i)];
      const swaps = sw ? { allowedMealIds: sw.allowedMealIds || [], allowOwnLog: !!sw.allowOwnLog } : { allowedMealIds: [], allowOwnLog: false };
      if (i < base.length) {
        base[i] = { ...base[i], meal_time: (dpm.meal_time as MealTimeKey) || base[i].meal_time, meal, swaps };
      } else {
        base.push({ label: `Meal ${i + 1}`, meal_time: (dpm.meal_time as MealTimeKey) || 'snack', meal, swaps });
      }
    });
    setTrainingSlots(base);

    // Rest variant from week_structure snapshot.
    const rest = emptySlots(count);
    if (ws?.restVariant?.mealList) {
      ws.restVariant.mealList.forEach((m, i) => {
        const meal: SelectedMeal = {
          id: m.meal_id, name: m.name, category: 'Custom',
          calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat,
          servings: m.servings || 1,
        };
        const slot: Slot = { label: m.slotLabel || `Meal ${i + 1}`, meal_time: (m.meal_time as MealTimeKey) || 'snack', meal, swaps: { allowedMealIds: [], allowOwnLog: false } };
        if (i < rest.length) rest[i] = slot; else rest.push(slot);
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
      const filled = prev.filter(s => s.meal);
      const next = emptySlots(count);
      let extra = 0;
      filled.forEach((s, i) => {
        if (i < next.length) {
          next[i] = { ...next[i], meal: s.meal, swaps: s.swaps, meal_time: s.meal_time };
        } else {
          extra += 1;
          next.push({ label: `Meal ${next.length + 1}`, meal_time: s.meal_time, meal: s.meal, swaps: s.swaps });
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

  const fillSlot = (slotIndex: number, meal: SelectedMeal) => {
    setSlots(prev => {
      const copy = [...prev];
      if (copy[slotIndex]) copy[slotIndex] = { ...copy[slotIndex], meal };
      return copy;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchSlotIndex(null);
    setSearchQuery('');
    setApiResults([]);
    setSelectedResultId(null);
    setTempServings(1);
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
        category: slot ? slot.meal_time.charAt(0).toUpperCase() + slot.meal_time.slice(1) : 'Snack',
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
      Alert.alert('Error', err.message || 'Failed to save meal');
    }
  };

  const clearSlot = (index: number) => {
    setSlots(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], meal: null, swaps: { allowedMealIds: [], allowOwnLog: false } };
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
      label: `Meal ${prev.length + 1}`, meal_time: 'snack', meal: null,
      swaps: { allowedMealIds: [], allowOwnLog: false },
    }]);
    setSearchSlotIndex(slots.length);
  };

  const saveSlotServings = () => {
    if (slotSheetIndex === null) return;
    setSlots(prev => {
      const copy = [...prev];
      const s = copy[slotSheetIndex];
      if (s?.meal) copy[slotSheetIndex] = { ...s, meal: { ...s.meal, servings: editServings } };
      return copy;
    });
    setSlotSheetIndex(null);
  };

  // Copy training day into rest slots at reduced portions (85%, snapped to 0.25).
  const copyTrainingToRest = () => {
    setRestSlots(trainingSlots.map(s => s.meal ? {
      ...s,
      swaps: { allowedMealIds: [], allowOwnLog: false },
      meal: { ...s.meal, servings: Math.max(0.25, Math.round((s.meal.servings * 0.85) / 0.25) * 0.25) },
    } : { ...s, swaps: { allowedMealIds: [], allowOwnLog: false } }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── Swap candidates: within ±40 kcal and ±5 g protein of the slot meal ──
  const swapSlot = swapSheetIndex !== null ? trainingSlots[swapSheetIndex] : null;
  const swapCandidates = useMemo(() => {
    if (!swapSlot?.meal) return { inRange: [], outOfRange: [] as { meal: any; reason: string }[] };
    const ref = swapSlot.meal;
    const refCal = ref.calories * ref.servings;
    const refPro = ref.protein * ref.servings;
    const inRange: any[] = [];
    const outOfRange: { meal: any; reason: string }[] = [];
    meals.forEach(m => {
      if (m.id === ref.id) return;
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
    const filledTraining = trainingSlots.filter(s => s.meal);
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Missing name', message: 'Please enter a plan name.' });
    if (filledTraining.length === 0) return showAlert({ type: 'warning', title: 'No meals', message: 'Add at least one meal to the training day.' });

    setSaving(true);
    try {
      const mealList = filledTraining.map(s => ({
        meal_id: s.meal!.id,
        meal_time: s.meal_time,
        servings: s.meal!.servings,
      }));

      // Swaps keyed by the meal's order_index in mealList.
      const swaps: DietSwapsMap = {};
      filledTraining.forEach((s, i) => {
        if (s.swaps.allowedMealIds.length > 0 || s.swaps.allowOwnLog) {
          swaps[String(i)] = { allowedMealIds: s.swaps.allowedMealIds, allowOwnLog: s.swaps.allowOwnLog };
        }
      });

      const week_structure: DietWeekStructure = {
        mealsPerDay,
        slotLabels: trainingSlots.map(s => s.label),
        trainingDays,
        restVariant: {
          mealList: restSlots.filter(s => s.meal).map(s => ({
            meal_id: s.meal!.id,
            name: s.meal!.name,
            calories: s.meal!.calories,
            protein: s.meal!.protein,
            carbs: s.meal!.carbs,
            fat: s.meal!.fat,
            meal_time: s.meal_time,
            servings: s.meal!.servings,
            slotLabel: s.label,
          })),
        },
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
  const stepSubtitles = { 1: 'Targets', 2: 'Training day', 3: 'Week and assignment' };
  // Android hardware back steps the wizard back rather than discarding the
  // whole meal plan. The sheets above own their own onRequestClose, so back
  // closes an open sheet first and only then walks the steps.
  useAndroidBack(useCallback(() => {
    if (step === 1) return false;
    setStep((s) => (s - 1) as 1 | 2);
    return true;
  }, [step]));

  const renderHeader = () => (
    <>
      <View style={s.header}>
        <TouchableOpacity hitSlop={4}
          onPress={() => step === 1 ? router.back() : setStep((step - 1) as 1 | 2)}
          style={s.backBtn}
        >
          <Ionicons name={step === 1 ? 'close' : 'arrow-back'} size={25} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle} numberOfLines={1}>{name.trim() || (isEditing ? 'Edit meal plan' : 'New meal plan')}</Text>
          <Text style={s.headerSub}>Step {step} of 3 · {stepSubtitles[step]}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>
      <View style={s.progressRow}>
        {[1, 2, 3].map(n => (
          <View key={n} style={[s.progressSeg, n <= step && s.progressSegActive]} />
        ))}
      </View>
    </>
  );

  // ────────────────────────────── STEP 1 ──────────────────────────────
  const renderStep1 = () => (
    <>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <Text style={s.eyebrow}>Plan name</Text>
          <TextInput
            style={s.nameInput}
            placeholder="e.g. Marcus off-season"
            placeholderTextColor={CoachColors.textFaint}
            value={name}
            onChangeText={setName}
            selectionColor={CoachColors.accent}
          />

          {/* Daily calories */}
          <View style={s.card}>
            <Text style={s.eyebrow}>Daily calories</Text>
            <View style={s.kcalRow}>
              <TouchableOpacity
                style={s.stepBtn}
                onPress={() => { setKcal(k => Math.max(1600, k - 50)); Haptics.selectionAsync(); }}
              >
                <Ionicons name="remove" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.kcalValue}>{kcal.toLocaleString()} <Text style={s.kcalUnit}>kcal</Text></Text>
                <Text style={s.kcalRange}>1,600 – 3,200 in steps of 50</Text>
              </View>
              <TouchableOpacity
                style={s.stepBtn}
                onPress={() => { setKcal(k => Math.min(3200, k + 50)); Haptics.selectionAsync(); }}
              >
                <Ionicons name="add" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Split it */}
          <View style={s.card}>
            <Text style={s.eyebrow}>Split it</Text>
            <View style={s.splitBar}>
              <View style={[s.splitSeg, { flex: splitShares.p, backgroundColor: CoachColors.accent }]} />
              <View style={[s.splitSeg, { flex: splitShares.c, backgroundColor: '#7A8072' }]} />
              <View style={[s.splitSeg, { flex: splitShares.f, backgroundColor: '#4A4F45' }]} />
            </View>
            <View style={s.legendRow}>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: CoachColors.accent }]} /><Text style={s.legendText}>Protein {grams.p}g</Text></View>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#7A8072' }]} /><Text style={s.legendText}>Carbs {grams.c}g</Text></View>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#4A4F45' }]} /><Text style={s.legendText}>Fat {grams.f}g</Text></View>
            </View>
            <View style={s.chipRow}>
              {(['building', 'cutting', 'holding', 'custom'] as PresetKey[]).map(k => (
                <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                  key={k}
                  style={[s.chip, preset === k && s.chipActive]}
                  onPress={() => changePreset(k)}
                >
                  <Text style={[s.chipText, preset === k && s.chipTextActive]}>
                    {k === 'custom' ? 'Custom' : PRESETS[k].label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {preset === 'custom' && (
              <View style={s.customRow}>
                {([['Protein g', customP, setCustomP], ['Carbs g', customC, setCustomC], ['Fat g', customF, setCustomF]] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                  <View key={label} style={s.customField}>
                    <Text style={s.customLabel}>{label}</Text>
                    <TextInput
                      style={s.customInput}
                      keyboardType="number-pad"
                      value={val}
                      onChangeText={setter}
                      selectionColor={CoachColors.accent}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Meals a day */}
          <View style={s.card}>
            <Text style={s.eyebrow}>Meals a day</Text>
            <View style={s.chipRow}>
              {[3, 4, 5, 6].map(n => (
                <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                  key={n}
                  style={[s.chip, mealsPerDay === n && s.chipActive]}
                  onPress={() => { changeMealsPerDay(n); Haptics.selectionAsync(); }}
                >
                  <Text style={[s.chipText, mealsPerDay === n && s.chipTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

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
          <Text style={s.macroKcal}>
            {Math.round(activeTotals.calories).toLocaleString()}
            <Text style={s.macroKcalTarget}> of {kcal.toLocaleString()} kcal</Text>
          </Text>
          <View style={[s.statusChip, onTarget && s.statusChipOn]}>
            <Text style={[s.statusChipText, onTarget && s.statusChipTextOn]}>
              {onTarget ? 'On target' : `${Math.abs(kcalDiff)} ${kcalDiff < 0 ? 'under' : 'over'}`}
            </Text>
          </View>
        </View>
        <View style={s.macroStack}>
          {seg(pShare, activeTotals.protein, grams.p, CoachColors.accent)}
          {seg(cShare, activeTotals.carbs, grams.c, '#7A8072')}
          {seg(fShare, activeTotals.fat, grams.f, '#4A4F45')}
        </View>
        <Text style={s.macroLine}>{macroLine(activeTotals)}</Text>
      </View>
    );
  };

  const renderStep2 = () => {
    const restEmpty = restSlots.every(sl => !sl.meal);
    const trainingHasMeals = trainingSlots.some(sl => sl.meal);
    return (
      <>
        {renderMacroHeader()}

        <View style={s.segmented}>
          {(['training', 'rest'] as DayVariant[]).map(v => (
            <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
              key={v}
              style={[s.segment, dayVariant === v && s.segmentActive]}
              onPress={() => { setDayVariant(v); Haptics.selectionAsync(); }}
            >
              <Text style={[s.segmentText, dayVariant === v && s.segmentTextActive]}>
                {v === 'training' ? 'Training day' : 'Rest day'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.scroll}>
          {dayVariant === 'rest' && restEmpty && trainingHasMeals && (
            <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }} style={s.copyBtn} onPress={copyTrainingToRest} activeOpacity={0.8}>
              <Ionicons name="copy-outline" size={18} color={CoachColors.accent} />
              <Text style={s.copyBtnText}>Copy training day at reduced portions</Text>
            </TouchableOpacity>
          )}

          {slots.map((slot, index) => {
            const swapCount = slot.swaps.allowedMealIds.length;
            return (
              <View key={`${dayVariant}-${index}`} style={{ marginBottom: 12 }}>
                <Text style={s.slotLabel}>{slot.label}</Text>
                {slot.meal ? (
                  <TouchableOpacity
                    style={s.slotCard}
                    activeOpacity={0.8}
                    onPress={() => { setSlotSheetIndex(index); setEditServings(slot.meal!.servings); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.slotMealName} numberOfLines={1}>{slot.meal.name}</Text>
                      <Text style={s.slotMealMacros}>
                        P {Math.round(slot.meal.protein * slot.meal.servings)}  C {Math.round(slot.meal.carbs * slot.meal.servings)}  F {Math.round(slot.meal.fat * slot.meal.servings)}
                        {slot.meal.servings !== 1 ? `  ·  ${slot.meal.servings}x` : ''}
                      </Text>
                      {dayVariant === 'training' && swapCount > 0 && (
                        <View style={s.swapTag}>
                          <Ionicons name="swap-horizontal" size={12} color={CoachColors.accent} />
                          <Text style={s.swapTagText}>{swapCount} swap{swapCount === 1 ? '' : 's'} allowed</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.slotKcal}>{Math.round(slot.meal.calories * slot.meal.servings)} kcal</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={s.slotEmpty}
                    activeOpacity={0.7}
                    onPress={() => setSearchSlotIndex(index)}
                  >
                    <Ionicons name="add" size={18} color={CoachColors.textMuted} />
                    <Text style={s.slotEmptyText}>Pick a meal</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          <TouchableOpacity style={s.addSlotRow} onPress={appendSlot} activeOpacity={0.7}>
            <Ionicons name="add" size={18} color={CoachColors.textSecondary} />
            <Text style={s.addSlotText}>Add a meal</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.cta, !trainingHasMeals && { opacity: 0.5 }]}
            disabled={!trainingHasMeals}
            onPress={() => setStep(3)}
            activeOpacity={0.85}
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
        <Text style={s.h1}>Training days eat more</Text>
        <Text style={s.sub}>
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
              >
                <Text style={[s.dayChipDay, isTraining && s.dayChipDayActive]}>{d.short}</Text>
                <Text style={[s.dayChipKcal, isTraining && s.dayChipKcalActive]}>
                  {fmtK(isTraining ? trainingTotals.calories : restTotals.calories)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={s.toggleRow} onPress={() => setFreeMealEnabled(v => !v)} activeOpacity={0.7}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleTitle}>One free meal a week</Text>
            <Text style={s.toggleSub}>{freeMealDayFull} dinner, off the books</Text>
          </View>
          <View style={[s.toggle, freeMealEnabled && s.toggleOn]}>
            <View style={[s.toggleKnob, freeMealEnabled && s.toggleKnobOn]} />
          </View>
        </TouchableOpacity>

        <Text style={[s.eyebrow, { marginTop: 28, marginBottom: 12 }]}>Where does it go</Text>
        {dietPasses.map(p => {
          const nodeCount = p.track!.filter(n => n.type === 'diet').length;
          const selected = assignTarget === p.id;
          return (
            <TouchableOpacity key={p.id} style={[s.radioRow, selected && s.radioRowActive]} onPress={() => setAssignTarget(p.id)} activeOpacity={0.7}>
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
        <TouchableOpacity style={[s.radioRow, assignTarget === 'library' && s.radioRowActive]} onPress={() => setAssignTarget('library')} activeOpacity={0.7}>
          <View style={[s.radio, assignTarget === 'library' && s.radioActive]}>
            {assignTarget === 'library' && <View style={s.radioDot} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.radioTitle}>Library only</Text>
            <Text style={s.radioSub}>Assign it to someone later</Text>
          </View>
        </TouchableOpacity>

        <Text style={[s.eyebrow, { marginTop: 28, marginBottom: 12 }]}>Cover and notes (optional)</Text>
        <TouchableOpacity
          style={[s.imageUploadBtn, imageUrl && s.imageUploadBtnActive]}
          onPress={pickImage}
          disabled={uploadingImage}
          activeOpacity={0.85}
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
        <TouchableOpacity style={[s.cta, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
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

  // ── Sheets / modals ──
  const slotSheetSlot = slotSheetIndex !== null ? slots[slotSheetIndex] : null;
  const isExtraSlot = slotSheetIndex !== null && slotSheetIndex >= (SLOT_TEMPLATES[mealsPerDay]?.length ?? 4);

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      {renderHeader()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}

      {/* Slot detail sheet */}
      <Modal visible={slotSheetIndex !== null} animationType="slide" transparent onRequestClose={() => setSlotSheetIndex(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{slotSheetSlot?.label || 'Meal'}</Text>
              <TouchableOpacity hitSlop={12} onPress={() => setSlotSheetIndex(null)}>
                <Ionicons name="close" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {slotSheetSlot?.meal && slotSheetIndex !== null && (
              <>
                <Text style={s.modalLabel}>{slotSheetSlot.meal.name}</Text>

                <View style={s.servingRow}>
                  <Text style={s.servingLabel}>Servings</Text>
                  <View style={s.portionControls}>
                    <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={s.portionBtn} onPress={() => setEditServings(v => Math.max(0.25, v - 0.25))}>
                      <Ionicons name="remove" size={25} color={CoachColors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={s.portionValue}>{editServings}</Text>
                    <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={s.portionBtn} onPress={() => setEditServings(v => v + 0.25)}>
                      <Ionicons name="add" size={25} color={CoachColors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={s.sheetPrimaryBtn} onPress={saveSlotServings}>
                  <Text style={s.sheetPrimaryText}>Save servings</Text>
                </TouchableOpacity>

                {dayVariant === 'training' && (
                  <TouchableOpacity
                    style={s.sheetActionBtn}
                    onPress={() => { const i = slotSheetIndex; setSlotSheetIndex(null); setSwapSheetIndex(i); }}
                  >
                    <Ionicons name="swap-horizontal" size={20} color={CoachColors.accent} />
                    <Text style={s.sheetActionText}>
                      Manage swaps{slotSheetSlot.swaps.allowedMealIds.length > 0 ? ` (${slotSheetSlot.swaps.allowedMealIds.length})` : ''}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={s.sheetActionBtn}
                  onPress={() => { const i = slotSheetIndex; setSlotSheetIndex(null); setSearchSlotIndex(i); }}
                >
                  <Ionicons name="repeat" size={20} color={CoachColors.textPrimary} />
                  <Text style={s.sheetActionText}>Replace meal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.sheetActionBtn, s.dangerBtn]}
                  onPress={() => isExtraSlot ? removeExtraSlot(slotSheetIndex) : clearSlot(slotSheetIndex)}
                >
                  <Ionicons name="trash" size={20} color={CoachColors.danger} />
                  <Text style={[s.sheetActionText, { color: CoachColors.danger }]}>
                    {isExtraSlot ? 'Remove this meal slot' : 'Clear this slot'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Swap sheet (training day only) */}
      <Modal visible={swapSheetIndex !== null} animationType="slide" transparent onRequestClose={() => setSwapSheetIndex(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalContent, { maxHeight: '85%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle} numberOfLines={1}>
                If they can't have {swapSlot?.meal ? swapSlot.meal.name.split(',')[0].split(' with ')[0] : 'this'}
              </Text>
              <TouchableOpacity hitSlop={12} onPress={() => setSwapSheetIndex(null)}>
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
                  <TouchableOpacity key={m.id} hitSlop={{ top: 4, bottom: 4 }} style={s.swapRow} onPress={() => toggleSwapMeal(m.id)} activeOpacity={0.7}>
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

            <TouchableOpacity style={s.ownLogRow} onPress={toggleAllowOwnLog} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleTitle}>Let them log their own</Text>
                <Text style={s.toggleSub}>You see it in their check-in either way</Text>
              </View>
              <View style={[s.toggle, swapSlot?.swaps.allowOwnLog && s.toggleOn]}>
                <View style={[s.toggleKnob, swapSlot?.swaps.allowOwnLog && s.toggleKnobOn]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={s.sheetPrimaryBtn} onPress={() => setSwapSheetIndex(null)}>
              <Text style={s.sheetPrimaryText}>
                Allow these {swapSlot?.swaps.allowedMealIds.length || 0}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Food search modal (saved + USDA) */}
      <Modal visible={searchSlotIndex !== null} animationType="slide" transparent onRequestClose={() => { setSearchSlotIndex(null); setSelectedResultId(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.modalContent, { height: '90%' }]}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {searchSlotIndex !== null && slots[searchSlotIndex] ? slots[searchSlotIndex].label : 'Add a meal'}
              </Text>
              <TouchableOpacity hitSlop={12} onPress={() => { setSearchSlotIndex(null); setSelectedResultId(null); }}>
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
                <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={performSearch} style={s.searchBtn}>
                  <Text style={s.searchBtnText}>Search</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={s.searchTabs}>
              <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={[s.searchTab, searchMode === 'saved' && s.searchTabActive]} onPress={() => setSearchMode('saved')}>
                <Text style={[s.searchTabText, searchMode === 'saved' && s.searchTabTextActive]}>My meals</Text>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={[s.searchTab, searchMode === 'api' && s.searchTabActive]} onPress={() => setSearchMode('api')}>
                <Text style={[s.searchTabText, searchMode === 'api' && s.searchTabTextActive]}>USDA DB</Text>
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
                            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={s.portionBtn} onPress={() => setTempServings(v => Math.max(0.25, v - 0.25))}>
                              <Ionicons name="remove" size={22} color={CoachColors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={s.portionValue}>{tempServings}</Text>
                            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={s.portionBtn} onPress={() => setTempServings(v => v + 0.25)}>
                              <Ionicons name="add" size={22} color={CoachColors.textPrimary} />
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }} style={s.portionAddBtn} onPress={() => {
                            if (searchMode === 'saved') addFromLocal(item, tempServings);
                            else addFromApi(item, tempServings);
                          }}>
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

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: Radius.xs, backgroundColor: CoachColors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, maxWidth: 240 },
  headerSub: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginTop: 2 },
  progressRow: { flexDirection: 'row', gap: 6, marginHorizontal: 20, marginBottom: 8 },
  progressSeg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: CoachColors.borderMuted },
  progressSegActive: { backgroundColor: CoachColors.accent },

  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  eyebrow: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },
  h1: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary, marginBottom: 8 },
  sub: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, lineHeight: 21.5, marginBottom: 20 },
  footnote: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint, lineHeight: 20, marginTop: 8 },

  nameInput: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 20, color: CoachColors.textPrimary,
    borderBottomWidth: 1, borderBottomColor: CoachColors.border, paddingVertical: 14, marginBottom: 24, marginTop: 8,
  },

  card: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: CoachColors.border },

  kcalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  kcalValue: { fontFamily: CoachFonts.headingBold, fontSize: 38, color: CoachColors.accent },
  kcalUnit: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textMuted },
  kcalRange: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint, marginTop: 4 },

  splitBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 14, gap: 2 },
  splitSeg: { height: '100%' },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 12, marginBottom: 14, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textSecondary },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: Radius.full, backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.border },
  chipActive: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  chipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },
  chipTextActive: { color: CoachColors.accent, fontFamily: CoachFonts.bodySemiBold },

  customRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  customField: { flex: 1 },
  customLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 12.5, color: CoachColors.textMuted, marginBottom: 6 },
  customInput: { backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 12, fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary },

  // Inside SafeAreaView edges={['top','bottom']} — the inset is already applied,
  // so this is breathing room only (was 28, stacking to ~62pt of dead space).
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: CoachColors.bg },
  cta: { height: 52, borderRadius: Radius.full, backgroundColor: CoachColors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.onAccent },

  // Step 2
  macroCard: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: 16, marginHorizontal: 20, marginTop: 8, borderWidth: 1, borderColor: CoachColors.border },
  macroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  macroKcal: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary },
  macroKcalTarget: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted },
  statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: CoachColors.borderMuted },
  statusChipOn: { backgroundColor: CoachColors.accentSoft },
  statusChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textSecondary },
  statusChipTextOn: { color: CoachColors.accent },
  macroStack: { flexDirection: 'row', gap: 3, height: 6 },
  macroSeg: { height: 6, borderRadius: 3, backgroundColor: CoachColors.borderMuted, overflow: 'hidden' },
  macroSegFill: { height: '100%', borderRadius: 3 },
  macroLine: { fontFamily: CoachFonts.mono, fontSize: 12.5, color: CoachColors.textSecondary, marginTop: 10 },

  segmented: { flexDirection: 'row', backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: 4, marginHorizontal: 20, marginTop: 12, borderWidth: 1, borderColor: CoachColors.border },
  segment: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: Radius.sm },
  segmentActive: { backgroundColor: CoachColors.accent },
  segmentText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },
  segmentTextActive: { color: CoachColors.onAccent, fontFamily: CoachFonts.bodySemiBold },

  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSofter, marginBottom: 16 },
  copyBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.accent },

  slotLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textSecondary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  slotCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.surface, padding: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.borderMuted, gap: 12 },
  slotMealName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 3 },
  slotMealMacros: { fontFamily: CoachFonts.mono, fontSize: 12.5, color: CoachColors.textMuted },
  slotKcal: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  swapTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: CoachColors.accentSofter, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full, marginTop: 6 },
  swapTagText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.accent },
  slotEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16, backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed' },
  slotEmptyText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textMuted },
  addSlotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed', marginTop: 4 },
  addSlotText: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textSecondary },

  // Step 3
  weekRow: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  dayChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: Radius.sm, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border },
  dayChipActive: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  dayChipDay: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textSecondary },
  dayChipDayActive: { color: CoachColors.accent },
  dayChipKcal: { fontFamily: CoachFonts.mono, fontSize: 11, color: CoachColors.textFaint, marginTop: 4 },
  dayChipKcalActive: { color: CoachColors.accent },

  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: 16, borderWidth: 1, borderColor: CoachColors.border, gap: 12 },
  toggleTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 2 },
  toggleSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: CoachColors.borderMuted, padding: 3 },
  toggleOn: { backgroundColor: CoachColors.accent },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: CoachColors.textSecondary },
  toggleKnobOn: { backgroundColor: CoachColors.onAccent, alignSelf: 'flex-end' },

  radioRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: 16, borderWidth: 1, borderColor: CoachColors.border, gap: 12, marginBottom: 10 },
  radioRowActive: { borderColor: CoachColors.accent },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: CoachColors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: CoachColors.accent },
  radioTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 2 },
  radioSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },

  imageUploadBtn: { height: 110, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed', backgroundColor: CoachColors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imageUploadBtnActive: { borderWidth: 0, borderStyle: 'solid' },
  imageUploadText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 8 },
  uploadedImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  imageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  imageOverlayText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textPrimary, marginTop: 4 },
  descInput: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border, padding: 14, marginTop: 12, minHeight: 96, textAlignVertical: 'top', fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: CoachColors.bg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: Spacing['3xl'], borderWidth: 1, borderColor: CoachColors.border, borderBottomWidth: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md, gap: 12 },
  modalTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary, flex: 1 },
  modalLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, color: CoachColors.textMuted, marginBottom: 16 },

  servingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  servingLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 15.5, color: CoachColors.textPrimary },
  sheetPrimaryBtn: { height: 48, borderRadius: Radius.full, backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  sheetPrimaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.onAccent },
  sheetActionBtn: { flexDirection: 'row', height: 46, backgroundColor: CoachColors.surface, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: CoachColors.border, marginTop: 10 },
  sheetActionText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  dangerBtn: { backgroundColor: CoachColors.dangerSoft, borderColor: 'transparent' },

  swapSubtext: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, lineHeight: 20, marginBottom: 16 },
  swapEmpty: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textFaint, paddingVertical: 16, textAlign: 'center' },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  swapName: { fontFamily: CoachFonts.bodyMedium, fontSize: 15.5, color: CoachColors.textPrimary, marginBottom: 2 },
  swapMacros: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  ownLogRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, marginTop: 8 },

  // Search modal (unchanged pattern)
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.surface, borderRadius: Radius.md, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: CoachColors.border },
  searchInput: { flex: 1, color: CoachColors.textPrimary, fontFamily: CoachFonts.body, fontSize: 15.5, marginLeft: 10 },
  searchBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: CoachColors.accent, borderRadius: Radius.full, marginLeft: 8 },
  searchBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.onAccent },
  searchTabs: { flexDirection: 'row', backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: 4, marginTop: 16, borderWidth: 1, borderColor: CoachColors.border },
  searchTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  searchTabActive: { backgroundColor: CoachColors.accent },
  searchTabText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textSecondary },
  searchTabTextActive: { color: CoachColors.onAccent, fontFamily: CoachFonts.bodySemiBold },
  resultCard: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  resultName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textPrimary, marginBottom: 4 },
  resultMacros: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, marginBottom: 2 },
  resultMacrosSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  addCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  portionEditor: { backgroundColor: CoachColors.surface, padding: 16, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  portionLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textMuted },
  portionControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border },
  portionBtn: { padding: 8 },
  portionValue: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary, minWidth: 40, textAlign: 'center' },
  portionAddBtn: { backgroundColor: CoachColors.accent, paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.full },
  portionAddText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.onAccent },
});
