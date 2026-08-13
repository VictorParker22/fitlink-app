import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, FlatList, Alert
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { decode } from 'base64-arraybuffer';

import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { searchNutrition, nutritionToMeal } from '../lib/nutritionApi';
import { Spacing, Radius } from '../constants/theme';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const MEAL_TIMES = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { key: 'lunch', label: 'Lunch', icon: '☀️' },
  { key: 'dinner', label: 'Dinner', icon: '🌙' },
  { key: 'snack', label: 'Snacks', icon: '🍎' },
] as const;

type MealTimeKey = typeof MEAL_TIMES[number]['key'];

interface SelectedMeal {
  id: string;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal_time: MealTimeKey;
  servings: number;
  serving_size_g?: number;
}

export default function CreateDietScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ editId?: string }>();
  const { createDietPlan, updateDietPlan, createMeal, meals, diets } = useApp();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const insets = useSafeAreaInsets();

  const isEditing = !!params.editId;
  const editDiet = isEditing ? diets.find(d => d.id === params.editId) : null;

  // ── WIZARD STATE ──
  const [wizardStep, setWizardStep] = useState<number>(isEditing ? -1 : 1);

  // Targets
  const [targetCalories, setTargetCalories] = useState<string>('2000');
  const [targetProtein, setTargetProtein] = useState<string>('150');
  const [targetCarbs, setTargetCarbs] = useState<string>('200');
  const [targetFat, setTargetFat] = useState<string>('65');

  // Details
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('balanced');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [selectedMeals, setSelectedMeals] = useState<SelectedMeal[]>([]);
  const [saving, setSaving] = useState(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [activeMealTime, setActiveMealTime] = useState<MealTimeKey>('breakfast');
  const [searchQuery, setSearchQuery] = useState('');
  const [apiResults, setApiResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<'saved' | 'api'>('saved');

  // Selected result portion
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [tempServings, setTempServings] = useState<number>(1);

  // Edit Meal Sheet
  const [editingMealIndex, setEditingMealIndex] = useState<number | null>(null);
  const [editServings, setEditServings] = useState<number>(1);

  // AI State
  const [showAiSheet, setShowAiSheet] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Pre-populate in edit mode
  useEffect(() => {
    if (editDiet) {
      setName(editDiet.name);
      setDescription(editDiet.description || '');
      setCategory(editDiet.category || 'custom');
      setImageUrl(editDiet.image_url || null);

      setTargetCalories(editDiet.target_calories?.toString() || '2000');
      setTargetProtein(editDiet.target_protein?.toString() || '150');
      setTargetCarbs(editDiet.target_carbs?.toString() || '200');
      setTargetFat(editDiet.target_fat?.toString() || '65');

      if (editDiet.diet_plan_meals) {
        const existingMeals: SelectedMeal[] = editDiet.diet_plan_meals
          .sort((a, b) => a.order_index - b.order_index)
          .map(dpm => ({
            id: dpm.meal_id,
            name: dpm.meals?.name || 'Unknown',
            category: dpm.meals?.category || 'Snack',
            calories: dpm.meals?.calories || 0,
            protein: dpm.meals?.protein || 0,
            carbs: dpm.meals?.carbs || 0,
            fat: dpm.meals?.fat || 0,
            meal_time: (dpm.meal_time as MealTimeKey) || 'snack',
            servings: dpm.servings || 1,
          }));
        setSelectedMeals(existingMeals);
      }
    }
  }, [editDiet]);

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
        showAlert({ type: 'warning', title: 'Rate Limit Reached', message: 'You have made too many searches using the free USDA API key. Please wait a bit before searching again.' });
      } else {
        showAlert({ type: 'error', title: 'Search Failed', message: 'Could not fetch nutrition data.' });
      }
    } finally {
      setSearching(false);
    }
  };

  const totals = useMemo(() => {
    return selectedMeals.reduce((acc, m) => {
      const s = m.servings || 1;
      acc.calories += (m.calories * s);
      acc.protein += (m.protein * s);
      acc.carbs += (m.carbs * s);
      acc.fat += (m.fat * s);
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [selectedMeals]);

  const progress = useMemo(() => {
    const tCal = parseInt(targetCalories) || 1;
    const tPro = parseInt(targetProtein) || 1;
    const tCarb = parseInt(targetCarbs) || 1;
    const tFat = parseInt(targetFat) || 1;

    return {
      cal: Math.min(totals.calories / tCal, 1),
      pro: Math.min(totals.protein / tPro, 1),
      carb: Math.min(totals.carbs / tCarb, 1),
      fat: Math.min(totals.fat / tFat, 1),
    };
  }, [totals, targetCalories, targetProtein, targetCarbs, targetFat]);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return showAlert({ type: 'warning', title: 'Empty Prompt', message: 'Please describe the diet plan first.' });

    setIsGenerating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const availableMeals = meals.slice(0, 100).map(m => ({
        id: m.id,
        name: m.name,
        calories: m.calories,
        protein: m.protein,
        carbs: m.carbs,
        fat: m.fat,
      }));

      const { data, error } = await supabase.functions.invoke('generate-diet', {
        body: { prompt: aiPrompt, availableMeals }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Populate plan details and targets
      setName(data.name || 'AI Generated Diet');
      setDescription(data.description || '');
      setCategory(data.category || 'balanced');

      if (data.targets) {
        setTargetCalories(data.targets.calories?.toString() || '2000');
        setTargetProtein(data.targets.protein?.toString() || '150');
        setTargetCarbs(data.targets.carbs?.toString() || '200');
        setTargetFat(data.targets.fat?.toString() || '65');
      }

      // Process meals
      const newSelectedMeals: SelectedMeal[] = [];
      if (data.meals && Array.isArray(data.meals)) {
        for (const aiMeal of data.meals) {
          const rawMealTime = (aiMeal.meal_time || 'snack').toString().toLowerCase();
          const validMealTime = ['breakfast', 'lunch', 'dinner', 'snack'].includes(rawMealTime) ? rawMealTime : 'snack';
          const validCategory = validMealTime.charAt(0).toUpperCase() + validMealTime.slice(1);

          // Check if AI used an existing meal from the library
          const existingMeal = meals.find(m => m.name.toLowerCase() === aiMeal.name.toLowerCase());
          const mealId = existingMeal ? existingMeal.id : `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

          newSelectedMeals.push({
            id: mealId,
            name: existingMeal ? existingMeal.name : aiMeal.name,
            category: existingMeal ? (existingMeal.category || validCategory) : validCategory,
            calories: existingMeal ? existingMeal.calories : Math.round(Number(aiMeal.calories || 0)),
            protein: existingMeal ? existingMeal.protein : Math.round(Number(aiMeal.protein || 0)),
            carbs: existingMeal ? existingMeal.carbs : Math.round(Number(aiMeal.carbs || 0)),
            fat: existingMeal ? existingMeal.fat : Math.round(Number(aiMeal.fat || 0)),
            meal_time: validMealTime as MealTimeKey,
            servings: Number(aiMeal.servings || 1),
          });
        }
      }

      setSelectedMeals(newSelectedMeals);
      setShowAiSheet(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert({ type: 'success', title: 'Generation Complete', message: 'Your diet plan has been generated and populated!' });

    } catch (err: any) {
      console.error(err);
      showAlert({ type: 'error', title: 'Generation Failed', message: err.message || 'Could not generate diet plan.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const addMealFromLocal = (item: any, finalServings: number) => {
    setSelectedMeals(prev => [...prev, {
      id: item.id,
      name: item.name,
      category: item.category || 'Custom',
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      meal_time: activeMealTime,
      servings: finalServings,
    }]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSearch(false);
    setSearchQuery('');
    setSelectedResultId(null);
    setTempServings(1);
  };

  const addMealFromApi = async (item: any, finalServings: number) => {
    try {
      const saved = await createMeal({
        name: item.name,
        category: activeMealTime.charAt(0).toUpperCase() + activeMealTime.slice(1),
        calories: item.calories,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        serving_size_g: item.serving_size_g,
        fiber: item.fiber,
        sugar: item.sugar,
        sodium_mg: item.sodium_mg,
      });
      setSelectedMeals(prev => [...prev, {
        id: saved.id,
        name: saved.name,
        category: saved.category,
        calories: saved.calories,
        protein: saved.protein,
        carbs: saved.carbs,
        fat: saved.fat,
        meal_time: activeMealTime,
        servings: finalServings,
      }]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setShowSearch(false);
      setSearchQuery('');
      setApiResults([]);
      setSelectedResultId(null);
      setTempServings(1);
    } catch (err: any) {
      console.log('[addMealFromApi] Error:', err);
      Alert.alert('Error', err.message || 'Failed to save meal');
    }
  };

  const removeMeal = (index: number) => {
    setSelectedMeals(prev => prev.filter((_, i) => i !== index));
    if (editingMealIndex === index) {
      setEditingMealIndex(null);
    }
  };

  const updateMealServings = () => {
    if (editingMealIndex === null) return;
    setSelectedMeals(prev => {
      const copy = [...prev];
      copy[editingMealIndex].servings = editServings;
      return copy;
    });
    setEditingMealIndex(null);
  };

  const moveMeal = (index: number, direction: 'up' | 'down') => {
    setSelectedMeals(prev => {
      const copy = [...prev];
      const meal = copy[index];
      // Find previous or next meal with the same meal_time
      const groupMeals = copy.map((m, i) => ({ ...m, origIndex: i })).filter(m => m.meal_time === meal.meal_time);
      const groupIndex = groupMeals.findIndex(m => m.origIndex === index);

      if (direction === 'up' && groupIndex > 0) {
        const swapOrigIndex = groupMeals[groupIndex - 1].origIndex;
        [copy[index], copy[swapOrigIndex]] = [copy[swapOrigIndex], copy[index]];
      } else if (direction === 'down' && groupIndex < groupMeals.length - 1) {
        const swapOrigIndex = groupMeals[groupIndex + 1].origIndex;
        [copy[index], copy[swapOrigIndex]] = [copy[swapOrigIndex], copy[index]];
      }
      return copy;
    });
    setEditingMealIndex(null); // Close sheet after moving
  };

  const CATEGORIES = [
    { key: 'balanced', label: 'Balanced', icon: '⚖️' },
    { key: 'high-protein', label: 'High protein', icon: '💪' },
    { key: 'keto', label: 'Keto', icon: '🥑' },
    { key: 'vegan', label: 'Vegan', icon: '🌱' },
    { key: 'weight-loss', label: 'Weight loss', icon: '🔥' },
    { key: 'custom', label: 'Custom', icon: '✨' },
  ] as const;

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
        const fileName = `${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('diet-images')
          .upload(fileName, decode(result.assets[0].base64), { contentType: `image/${ext}`, upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('diet-images').getPublicUrl(fileName);
        setImageUrl(urlData.publicUrl);
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Upload Failed', message: err.message || 'Could not upload image.' });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Missing Name', message: 'Please enter a plan name.' });
    if (selectedMeals.length === 0) return showAlert({ type: 'warning', title: 'No Meals', message: 'Add at least one meal to your plan.' });

    setSaving(true);
    try {
      const mealList = [];
      for (const m of selectedMeals) {
        if (m.id.startsWith('temp-')) {
          // It's a generated meal that hasn't been saved to the DB yet.
          // We pass isGlobal = true so it gets added to the shared global database!
          const savedMeal = await createMeal({
            name: m.name,
            category: m.category,
            calories: m.calories,
            protein: m.protein,
            carbs: m.carbs,
            fat: m.fat,
          }, true);
          mealList.push({ meal_id: savedMeal.id, meal_time: m.meal_time, servings: m.servings });
        } else {
          mealList.push({ meal_id: m.id, meal_time: m.meal_time, servings: m.servings });
        }
      }
      const targets = {
        calories: parseInt(targetCalories) || 2000,
        protein: parseInt(targetProtein) || 150,
        carbs: parseInt(targetCarbs) || 200,
        fat: parseInt(targetFat) || 65
      };

      if (isEditing) {
        await updateDietPlan(params.editId as string, name.trim(), description.trim(), mealList, category, targets, imageUrl);
        showAlert({ type: 'success', title: 'Plan Updated!', message: `"${name.trim()}" has been saved.` });
      } else {
        await createDietPlan(name.trim(), description.trim(), mealList, category, targets, imageUrl);
        showAlert({ type: 'success', title: 'Plan Created!', message: `"${name.trim()}" has been saved.` });
      }
      setTimeout(() => {
        router.back();
      }, 1200);
    } catch (err: any) {
      console.log(err);
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to save diet plan' });
      setSaving(false);
    }
  };

  // ── WIZARD UI ──

  if (wizardStep === 1) {
    return (
      <SafeAreaView style={wz.safeArea}>
        <View style={wz.header}>
          <TouchableOpacity onPress={() => isEditing ? setWizardStep(-1) : router.back()} style={wz.backBtn}>
            <Ionicons name={isEditing ? "arrow-back" : "close"} size={22} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={wz.stepLabel}>Step 1 of 2</Text>
          <TouchableOpacity onPress={() => setWizardStep(-1)} style={wz.skipBtn}>
            <Text style={wz.skipText}>{isEditing ? 'Builder' : 'Skip'}</Text>
          </TouchableOpacity>
        </View>
        <View style={wz.progressBar}><View style={[wz.progressFill, { width: '50%' }]} /></View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={wz.scroll}>
            <Text style={wz.title}>Set daily targets</Text>
            <Text style={wz.subtitle}>Establish the macronutrient goals for this plan.</Text>

            <View style={wz.inputCard}>
              <View style={wz.inputRow}>
                <View style={wz.iconBox}>
                  <Ionicons name="flame" size={20} color={CoachColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={wz.inputLabel}>Calories (kcal)</Text>
                  <TextInput
                    style={wz.textInput} keyboardType="number-pad" placeholder="2000" placeholderTextColor={CoachColors.textFaint}
                    value={targetCalories} onChangeText={setTargetCalories} selectionColor={CoachColors.accent}
                  />
                </View>
              </View>
            </View>

            <View style={wz.inputCard}>
              <View style={wz.inputRow}>
                <View style={wz.iconBox}>
                  <Ionicons name="fish" size={20} color={CoachColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={wz.inputLabel}>Protein (g)</Text>
                  <TextInput
                    style={wz.textInput} keyboardType="number-pad" placeholder="150" placeholderTextColor={CoachColors.textFaint}
                    value={targetProtein} onChangeText={setTargetProtein} selectionColor={CoachColors.accent}
                  />
                </View>
              </View>
            </View>

            <View style={wz.inputCard}>
              <View style={wz.inputRow}>
                <View style={wz.iconBox}>
                  <Ionicons name="leaf" size={20} color={CoachColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={wz.inputLabel}>Carbs (g)</Text>
                  <TextInput
                    style={wz.textInput} keyboardType="number-pad" placeholder="200" placeholderTextColor={CoachColors.textFaint}
                    value={targetCarbs} onChangeText={setTargetCarbs} selectionColor={CoachColors.accent}
                  />
                </View>
              </View>
            </View>

            <View style={wz.inputCard}>
              <View style={wz.inputRow}>
                <View style={wz.iconBox}>
                  <Ionicons name="water" size={20} color={CoachColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={wz.inputLabel}>Fat (g)</Text>
                  <TextInput
                    style={wz.textInput} keyboardType="number-pad" placeholder="65" placeholderTextColor={CoachColors.textFaint}
                    value={targetFat} onChangeText={setTargetFat} selectionColor={CoachColors.accent}
                  />
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={wz.footer}>
          <TouchableOpacity
            style={[wz.nextBtn, !targetCalories && { opacity: 0.5 }]}
            disabled={!targetCalories}
            onPress={() => setWizardStep(2)}
            activeOpacity={0.85}
          >
            <Text style={wz.nextBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={16} color={CoachColors.onAccent} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (wizardStep === 2) {
    return (
      <SafeAreaView style={wz.safeArea}>
        <View style={wz.header}>
          <TouchableOpacity onPress={() => setWizardStep(1)} style={wz.backBtn}>
            <Ionicons name="arrow-back" size={22} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={wz.stepLabel}>Step 2 of 2</Text>
          <TouchableOpacity onPress={() => setWizardStep(-1)} style={wz.skipBtn}>
            <Text style={wz.skipText}>{isEditing ? 'Builder' : 'Skip'}</Text>
          </TouchableOpacity>
        </View>
        <View style={wz.progressBar}><View style={[wz.progressFill, { width: '100%' }]} /></View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={wz.scroll}>
            <Text style={wz.title}>Plan details</Text>
            <Text style={wz.subtitle}>Give this diet plan a name and category.</Text>

            <View style={wz.nameInputWrap}>
              <Ionicons name="create-outline" size={20} color={CoachColors.textFaint} />
              <TextInput
                style={wz.nameInput}
                placeholder="e.g. 2500 Calorie Cut"
                placeholderTextColor={CoachColors.textFaint}
                value={name}
                onChangeText={setName}
                autoFocus
                selectionColor={CoachColors.accent}
              />
            </View>

             <View style={[wz.nameInputWrap, { height: 100, alignItems: 'flex-start', marginTop: 16 }]}>
               <TextInput
                 style={[wz.nameInput, { marginTop: 16 }]}
                 placeholder="Description (optional)"
                 placeholderTextColor={CoachColors.textFaint}
                 multiline
                 value={description}
                 onChangeText={setDescription}
                 selectionColor={CoachColors.accent}
               />
            </View>

            <Text style={[wz.eyebrow, { marginTop: 24, marginBottom: 12 }]}>Background image (optional)</Text>
            <TouchableOpacity
              style={[wz.imageUploadBtn, imageUrl && wz.imageUploadBtnActive]}
              onPress={pickImage}
              disabled={uploadingImage}
              activeOpacity={0.85}
            >
              {uploadingImage ? (
                <ActivityIndicator color={CoachColors.accent} />
              ) : imageUrl ? (
                <>
                  <Image source={{ uri: imageUrl }} style={wz.uploadedImage} resizeMode="cover" />
                  <View style={wz.imageOverlay}>
                    <Ionicons name="camera" size={24} color={CoachColors.textPrimary} />
                    <Text style={wz.imageOverlayText}>Change image</Text>
                  </View>
                </>
              ) : (
                <>
                  <Ionicons name="image-outline" size={28} color={CoachColors.textFaint} />
                  <Text style={wz.imageUploadText}>Tap to add cover image</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[wz.eyebrow, { marginTop: 24, marginBottom: 12 }]}>Diet type</Text>
            <View style={wz.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.key}
                  style={[wz.nameChip, category === c.key && wz.nameChipActive]}
                  onPress={() => setCategory(c.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[wz.nameChipText, category === c.key && wz.nameChipTextActive]}>
                    {c.icon} {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={wz.footer}>
          <TouchableOpacity
            style={[wz.nextBtn, !name.trim() && { opacity: 0.5 }]}
            disabled={!name.trim()}
            onPress={() => setWizardStep(-1)}
            activeOpacity={0.85}
          >
            <Text style={wz.nextBtnText}>Enter builder</Text>
            <Ionicons name="build" size={16} color={CoachColors.onAccent} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── STEP -1: BUILDER ──
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit diet' : 'Builder'}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={() => setWizardStep(1)} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={18} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAiSheet(true)} style={styles.iconBtn}>
              <Ionicons name="sparkles" size={18} color={CoachColors.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Visual Macro Targets */}
        <View style={styles.macroCard}>
          <View style={styles.macroRow}>
            <View style={styles.macroCol}>
              <Text style={styles.macroVal}>{Math.round(totals.calories)}</Text>
              <Text style={styles.macroLabel}>/ {targetCalories} kcal</Text>
            </View>
          </View>
          <View style={styles.macroBars}>
            <View style={styles.macroBarWrap}>
              <View style={styles.macroBarLabelRow}>
                <Text style={styles.macroBarLabel}>Protein ({Math.round(totals.protein)}g)</Text>
              </View>
              <View style={styles.macroBarBg}>
                <View style={[styles.macroBarFill, { width: `${progress.pro * 100}%` }]} />
              </View>
            </View>
            <View style={styles.macroBarWrap}>
              <View style={styles.macroBarLabelRow}>
                <Text style={styles.macroBarLabel}>Carbs ({Math.round(totals.carbs)}g)</Text>
              </View>
              <View style={styles.macroBarBg}>
                <View style={[styles.macroBarFill, { width: `${progress.carb * 100}%` }]} />
              </View>
            </View>
            <View style={styles.macroBarWrap}>
              <View style={styles.macroBarLabelRow}>
                <Text style={styles.macroBarLabel}>Fat ({Math.round(totals.fat)}g)</Text>
              </View>
              <View style={styles.macroBarBg}>
                <View style={[styles.macroBarFill, { width: `${progress.fat * 100}%` }]} />
              </View>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {MEAL_TIMES.map(mt => {
          const mealsInTime = selectedMeals.filter(m => m.meal_time === mt.key);
          return (
            <View key={mt.key} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{mt.icon}  {mt.label}</Text>
                <TouchableOpacity
                  style={styles.quickAddBtn}
                  onPress={() => { setActiveMealTime(mt.key); setShowSearch(true); }}
                >
                  <Ionicons name="add" size={18} color={CoachColors.accent} />
                </TouchableOpacity>
              </View>

              {mealsInTime.length === 0 ? (
                <View style={styles.emptySection}>
                  <Text style={styles.emptyText}>Tap + to add {mt.label.toLowerCase()}</Text>
                </View>
              ) : (
                selectedMeals.map((meal, index) => {
                  if (meal.meal_time !== mt.key) return null;
                  return (
                    <TouchableOpacity key={index} style={styles.mealCard} onPress={() => {
                      setEditingMealIndex(index);
                      setEditServings(meal.servings);
                    }}>
                      <View style={styles.mealCardText}>
                        <Text style={styles.mealCardName}>{meal.name}</Text>
                        <Text style={styles.mealCardMacros}>
                          {Math.round(meal.calories * meal.servings)} kcal • {meal.servings} serving(s)
                        </Text>
                      </View>
                      <Ionicons name="create-outline" size={18} color={CoachColors.textFaint} />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
          {saving ? <ActivityIndicator color={CoachColors.onAccent} /> : (
            <>
              <Ionicons name="checkmark" size={18} color={CoachColors.onAccent} style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Save diet plan</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* AI Generate Sheet */}
      <Modal visible={showAiSheet} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Generate with AI</Text>
              <TouchableOpacity onPress={() => setShowAiSheet(false)}>
                <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>Describe the perfect diet</Text>
            <View style={styles.aiInputWrap}>
              <TextInput
                style={styles.aiInput}
                placeholder="e.g. A 2500 calorie high-protein meal plan..."
                placeholderTextColor={CoachColors.textFaint}
                multiline
                value={aiPrompt}
                onChangeText={setAiPrompt}
                selectionColor={CoachColors.accent}
              />
            </View>
            <TouchableOpacity style={[styles.aiGenerateBtn, isGenerating && { opacity: 0.7 }]} onPress={handleAiGenerate} disabled={isGenerating} activeOpacity={0.85}>
              {isGenerating ? (
                <ActivityIndicator color={CoachColors.onAccent} />
              ) : (
                <Ionicons name="sparkles" size={18} color={CoachColors.onAccent} />
              )}
              <Text style={styles.aiGenerateText}>{isGenerating ? 'Generating…' : 'Generate diet'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Meal Bottom Sheet */}
      <Modal visible={editingMealIndex !== null} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit meal</Text>
              <TouchableOpacity onPress={() => setEditingMealIndex(null)}>
                <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {editingMealIndex !== null && (
              <>
                <Text style={styles.modalLabel}>{selectedMeals[editingMealIndex]?.name}</Text>

                <View style={[styles.portionEditor, { backgroundColor: 'transparent', padding: 0, borderTopWidth: 0 }]}>
                  <Text style={[styles.portionLabel, { fontSize: 15 }]}>Servings:</Text>
                  <View style={styles.portionControls}>
                    <TouchableOpacity style={styles.portionBtn} onPress={() => setEditServings(Math.max(0.25, editServings - 0.25))}>
                      <Ionicons name="remove" size={22} color={CoachColors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={[styles.portionValue, { fontSize: 17 }]}>{editServings}</Text>
                    <TouchableOpacity style={styles.portionBtn} onPress={() => setEditServings(editServings + 0.25)}>
                      <Ionicons name="add" size={22} color={CoachColors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={[styles.portionAddBtn, { marginTop: 16, alignSelf: 'stretch', alignItems: 'center' }]} onPress={updateMealServings}>
                  <Text style={styles.portionAddText}>Save servings</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                  <TouchableOpacity style={styles.editActionBtn} onPress={() => moveMeal(editingMealIndex, 'up')}>
                    <Ionicons name="arrow-up" size={18} color={CoachColors.textPrimary} />
                    <Text style={styles.editActionText}>Move up</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editActionBtn} onPress={() => moveMeal(editingMealIndex, 'down')}>
                    <Ionicons name="arrow-down" size={18} color={CoachColors.textPrimary} />
                    <Text style={styles.editActionText}>Move down</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.editActionBtn, styles.dangerBtn, { marginTop: 12 }]}
                  onPress={() => removeMeal(editingMealIndex)}
                >
                  <Ionicons name="trash" size={18} color={CoachColors.danger} />
                  <Text style={[styles.editActionText, { color: CoachColors.danger }]}>Remove meal</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Food Search Modal */}
      <Modal visible={showSearch} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add to {MEAL_TIMES.find(m => m.key === activeMealTime)?.label}</Text>
              <TouchableOpacity onPress={() => { setShowSearch(false); setSelectedResultId(null); }}>
                <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={CoachColors.textFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder={searchMode === 'api' ? "Search USDA database (e.g. Chicken)" : "Search my saved meals"}
                placeholderTextColor={CoachColors.textFaint}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => searchMode === 'api' && performSearch()}
                returnKeyType="search"
                autoFocus
                selectionColor={CoachColors.accent}
              />
              {searchMode === 'api' && (
                <TouchableOpacity onPress={performSearch} style={styles.searchBtn}>
                  <Text style={styles.searchBtnText}>Search</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.searchTabs}>
              <TouchableOpacity style={[styles.searchTab, searchMode === 'saved' && styles.searchTabActive]} onPress={() => setSearchMode('saved')}>
                <Text style={[styles.searchTabText, searchMode === 'saved' && styles.searchTabTextActive]}>My meals</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.searchTab, searchMode === 'api' && styles.searchTabActive]} onPress={() => setSearchMode('api')}>
                <Text style={[styles.searchTabText, searchMode === 'api' && styles.searchTabTextActive]}>USDA DB</Text>
              </TouchableOpacity>
            </View>

            {searching && searchMode === 'api' ? (
              <ActivityIndicator size="large" color={CoachColors.accent} style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                data={searchMode === 'saved' ? filteredSavedMeals.map(m => ({ ...m, _uid: m.id })) : apiResults}
                keyExtractor={(item) => item._uid}
                contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
                renderItem={({ item }) => {
                  const isExpanded = selectedResultId === item._uid;
                  return (
                    <View style={styles.resultCard}>
                      <TouchableOpacity
                        style={styles.resultRow}
                        onPress={() => {
                          setSelectedResultId(isExpanded ? null : item._uid);
                          setTempServings(1);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.resultName} numberOfLines={2}>{item.name}</Text>
                          <Text style={styles.resultMacros}>
                            {item.calories} kcal • {item.serving_size_g || 100}g serving
                          </Text>
                          <Text style={styles.resultMacrosSub}>
                            P: {item.protein}g | C: {item.carbs}g | F: {item.fat}g
                          </Text>
                        </View>
                        {isExpanded ? (
                          <Ionicons name="chevron-up" size={26} color={CoachColors.textFaint} />
                        ) : (
                          <View style={styles.addCircle}>
                            <Ionicons name="add" size={18} color={CoachColors.textSecondary} />
                          </View>
                        )}
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.portionEditor}>
                          <Text style={styles.portionLabel}>Servings:</Text>
                          <View style={styles.portionControls}>
                            <TouchableOpacity style={styles.portionBtn} onPress={() => setTempServings(Math.max(0.25, tempServings - 0.25))}>
                              <Ionicons name="remove" size={20} color={CoachColors.textPrimary} />
                            </TouchableOpacity>
                            <Text style={styles.portionValue}>{tempServings}</Text>
                            <TouchableOpacity style={styles.portionBtn} onPress={() => setTempServings(tempServings + 0.25)}>
                              <Ionicons name="add" size={20} color={CoachColors.textPrimary} />
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity style={styles.portionAddBtn} onPress={() => {
                            if (searchMode === 'saved') {
                              addMealFromLocal(item, tempServings);
                            } else {
                              addMealFromApi(item, tempServings);
                            }
                          }}>
                            <Text style={styles.portionAddText}>Add</Text>
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

    </View>
  );
}

const wz = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: CoachColors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { width: 36, height: 36, borderRadius: Radius.xs, backgroundColor: CoachColors.surface, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textSecondary, letterSpacing: 0.3 },
  eyebrow: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textSecondary, letterSpacing: 0.3 },
  skipBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  skipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textSecondary },
  progressBar: { height: 3, backgroundColor: CoachColors.borderMuted, marginHorizontal: 20, marginTop: 8, borderRadius: 2 },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: CoachColors.accent },
  scroll: { paddingHorizontal: 24, paddingTop: 16 },
  title: { fontFamily: CoachFonts.headingBold, fontSize: 24, color: CoachColors.textPrimary, lineHeight: 30, marginBottom: 8 },
  subtitle: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginBottom: 24, lineHeight: 18 },

  inputCard: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: CoachColors.border },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBox: { width: 40, height: 40, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center', backgroundColor: CoachColors.accentSofter },
  inputLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 11, color: CoachColors.textMuted, marginBottom: 4 },
  textInput: { flex: 1, fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary, padding: 0 },

  nameInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: CoachColors.border, paddingHorizontal: 0, height: 50 },
  nameInput: { flex: 1, color: CoachColors.textPrimary, fontFamily: CoachFonts.body, fontSize: 16 },

  imageUploadBtn: { height: 120, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed', backgroundColor: CoachColors.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imageUploadBtnActive: { borderWidth: 0, borderStyle: 'solid' },
  imageUploadText: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textMuted, marginTop: 8 },
  uploadedImage: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, width: '100%', height: '100%' },
  imageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  imageOverlayText: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textPrimary, marginTop: 4 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nameChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.full, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border },
  nameChipActive: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  nameChipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textSecondary },
  nameChipTextActive: { color: CoachColors.accent, fontFamily: CoachFonts.bodySemiBold },

  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  nextBtn: { height: 52, borderRadius: Radius.full, backgroundColor: CoachColors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.onAccent, marginRight: 6 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: CoachColors.bg },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  iconBtn: { width: 36, height: 36, borderRadius: Radius.xs, backgroundColor: CoachColors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary },

  macroCard: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: 20, borderWidth: 1, borderColor: CoachColors.border },
  macroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 },
  macroCol: { flexDirection: 'row', alignItems: 'baseline' },
  macroVal: { fontFamily: CoachFonts.headingBold, fontSize: 32, color: CoachColors.textPrimary },
  macroLabel: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginLeft: 4 },
  macroBars: { gap: 12 },
  macroBarWrap: { flex: 1 },
  macroBarLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  macroBarLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textSecondary },
  macroBarBg: { height: 4, backgroundColor: CoachColors.borderMuted, borderRadius: 2, overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 2, backgroundColor: CoachColors.accent },

  scrollContent: { padding: 20, paddingBottom: 120 },
  section: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  quickAddBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'transparent', borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  emptySection: { padding: 24, backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border, borderStyle: 'dashed', alignItems: 'center' },
  emptyText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textMuted },

  mealCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.surface, padding: 16, borderRadius: Radius.md, marginBottom: 8, borderWidth: 1, borderColor: CoachColors.borderMuted },
  mealCardText: { flex: 1 },
  mealCardName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary, marginBottom: 4 },
  mealCardMacros: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, backgroundColor: CoachColors.bg },
  saveBtn: { height: 52, borderRadius: Radius.full, backgroundColor: CoachColors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.onAccent },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: CoachColors.bg, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: Spacing['3xl'], borderWidth: 1, borderColor: CoachColors.border, borderBottomWidth: 0 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 16, color: CoachColors.textPrimary },
  modalLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textMuted, marginBottom: 8 },

  editActionBtn: { flex: 1, flexDirection: 'row', height: 46, backgroundColor: CoachColors.surface, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: CoachColors.border },
  editActionText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },
  dangerBtn: { backgroundColor: CoachColors.dangerSoft, borderColor: 'transparent' },

  aiInputWrap: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: Spacing.md, height: 100, borderWidth: 1, borderColor: CoachColors.border, marginBottom: 16 },
  aiInput: { flex: 1, color: CoachColors.textPrimary, fontFamily: CoachFonts.body, fontSize: 14 },
  aiGenerateBtn: { height: 50, borderRadius: Radius.full, backgroundColor: CoachColors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  aiGenerateText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.onAccent },

  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.surface, borderRadius: Radius.md, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: CoachColors.border },
  searchInput: { flex: 1, color: CoachColors.textPrimary, fontFamily: CoachFonts.body, fontSize: 14, marginLeft: 10 },
  searchBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: CoachColors.accent, borderRadius: Radius.full, marginLeft: 8 },
  searchBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.onAccent },

  searchTabs: { flexDirection: 'row', backgroundColor: CoachColors.surface, borderRadius: Radius.md, padding: 4, marginTop: 16, borderWidth: 1, borderColor: CoachColors.border },
  searchTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: Radius.sm },
  searchTabActive: { backgroundColor: CoachColors.accent },
  searchTabText: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textSecondary },
  searchTabTextActive: { color: CoachColors.onAccent, fontFamily: CoachFonts.bodySemiBold },

  resultCard: { backgroundColor: CoachColors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  resultName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary, marginBottom: 4 },
  resultMacros: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary, marginBottom: 2 },
  resultMacrosSub: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },

  addCircle: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },

  portionEditor: { backgroundColor: CoachColors.surface, padding: 16, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  portionLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textMuted },
  portionControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: CoachColors.bg, borderRadius: Radius.md, borderWidth: 1, borderColor: CoachColors.border },
  portionBtn: { padding: 8 },
  portionValue: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary, minWidth: 40, textAlign: 'center' },
  portionAddBtn: { backgroundColor: CoachColors.accent, paddingHorizontal: 18, paddingVertical: 9, borderRadius: Radius.full },
  portionAddText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.onAccent }
});
