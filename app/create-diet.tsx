import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, FlatList, Alert
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { decode } from 'base64-arraybuffer';

import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { searchNutrition, nutritionToMeal } from '../lib/nutritionApi';
import { Spacing, FontFamily, Radius } from '../constants/theme';

const MEAL_TIMES = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅', color: '#F59E0B' },
  { key: 'lunch', label: 'Lunch', icon: '☀️', color: '#22C55E' },
  { key: 'dinner', label: 'Dinner', icon: '🌙', color: '#6366F1' },
  { key: 'snack', label: 'Snacks', icon: '🍎', color: '#EF4444' },
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
    { key: 'high-protein', label: 'High Protein', icon: '💪' },
    { key: 'keto', label: 'Keto', icon: '🥑' },
    { key: 'vegan', label: 'Vegan', icon: '🌱' },
    { key: 'weight-loss', label: 'Weight Loss', icon: '🔥' },
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
            <Ionicons name={isEditing ? "arrow-back" : "close"} size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={wz.stepLabel}>STEP 1 OF 2</Text>
          <TouchableOpacity onPress={() => setWizardStep(-1)} style={wz.skipBtn}>
            <Text style={wz.skipText}>{isEditing ? 'BUILDER' : 'SKIP'}</Text>
          </TouchableOpacity>
        </View>
        <View style={wz.progressBar}><View style={[wz.progressFill, { width: '50%' }]} /></View>
        
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={wz.scroll}>
            <Text style={wz.title}>Set Daily Targets</Text>
            <Text style={wz.subtitle}>Establish the macronutrient goals for this plan.</Text>
            
            <View style={wz.inputCard}>
              <View style={wz.inputRow}>
                <View style={[wz.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                  <Ionicons name="flame" size={20} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={wz.inputLabel}>Calories (kcal)</Text>
                  <TextInput 
                    style={wz.textInput} keyboardType="number-pad" placeholder="2000" placeholderTextColor="rgba(255,255,255,0.2)"
                    value={targetCalories} onChangeText={setTargetCalories}
                  />
                </View>
              </View>
            </View>

            <View style={wz.inputCard}>
              <View style={wz.inputRow}>
                <View style={[wz.iconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                  <Ionicons name="fish" size={20} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={wz.inputLabel}>Protein (g)</Text>
                  <TextInput 
                    style={wz.textInput} keyboardType="number-pad" placeholder="150" placeholderTextColor="rgba(255,255,255,0.2)"
                    value={targetProtein} onChangeText={setTargetProtein}
                  />
                </View>
              </View>
            </View>

            <View style={wz.inputCard}>
              <View style={wz.inputRow}>
                <View style={[wz.iconBox, { backgroundColor: 'rgba(34, 197, 94, 0.1)' }]}>
                  <Ionicons name="leaf" size={20} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={wz.inputLabel}>Carbs (g)</Text>
                  <TextInput 
                    style={wz.textInput} keyboardType="number-pad" placeholder="200" placeholderTextColor="rgba(255,255,255,0.2)"
                    value={targetCarbs} onChangeText={setTargetCarbs}
                  />
                </View>
              </View>
            </View>

            <View style={wz.inputCard}>
              <View style={wz.inputRow}>
                <View style={[wz.iconBox, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                  <Ionicons name="water" size={20} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={wz.inputLabel}>Fat (g)</Text>
                  <TextInput 
                    style={wz.textInput} keyboardType="number-pad" placeholder="65" placeholderTextColor="rgba(255,255,255,0.2)"
                    value={targetFat} onChangeText={setTargetFat}
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
          >
            <View style={wz.nextBtnGradient}>
              <Text style={wz.nextBtnText}>CONTINUE</Text>
              <Ionicons name="arrow-forward" size={16} color="#000000" />
            </View>
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
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={wz.stepLabel}>STEP 2 OF 2</Text>
          <TouchableOpacity onPress={() => setWizardStep(-1)} style={wz.skipBtn}>
            <Text style={wz.skipText}>{isEditing ? 'BUILDER' : 'SKIP'}</Text>
          </TouchableOpacity>
        </View>
        <View style={wz.progressBar}><View style={[wz.progressFill, { width: '100%' }]} /></View>
        
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={wz.scroll}>
            <Text style={wz.title}>Plan Details</Text>
            <Text style={wz.subtitle}>Give this diet plan a name and category.</Text>
            
            <View style={wz.nameInputWrap}>
              <Ionicons name="create-outline" size={20} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={wz.nameInput}
                placeholder="e.g. 2500 Calorie Cut"
                placeholderTextColor="rgba(255,255,255,0.2)"
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </View>

             <View style={[wz.nameInputWrap, { height: 100, alignItems: 'flex-start', marginTop: 16 }]}>
               <TextInput
                 style={[wz.nameInput, { marginTop: 16 }]}
                 placeholder="Description (Optional)"
                 placeholderTextColor="rgba(255,255,255,0.2)"
                 multiline
                 value={description}
                 onChangeText={setDescription}
               />
            </View>

            <Text style={[wz.stepLabel, { marginTop: 24, marginBottom: 12 }]}>BACKGROUND IMAGE (OPTIONAL)</Text>
            <TouchableOpacity 
              style={[wz.imageUploadBtn, imageUrl && wz.imageUploadBtnActive]} 
              onPress={pickImage}
              disabled={uploadingImage}
            >
              {uploadingImage ? (
                <ActivityIndicator color="#FFF" />
              ) : imageUrl ? (
                <>
                  <Image source={{ uri: imageUrl }} style={wz.uploadedImage} resizeMode="cover" />
                  <View style={wz.imageOverlay}>
                    <Ionicons name="camera" size={24} color="#FFF" />
                    <Text style={wz.imageOverlayText}>Change Image</Text>
                  </View>
                </>
              ) : (
                <>
                  <Ionicons name="image-outline" size={28} color="rgba(255,255,255,0.4)" />
                  <Text style={wz.imageUploadText}>Tap to add cover image</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[wz.stepLabel, { marginTop: 24, marginBottom: 12 }]}>DIET TYPE</Text>
            <View style={wz.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c.key}
                  style={[wz.nameChip, category === c.key && { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' }]}
                  onPress={() => setCategory(c.key)}
                >
                  <Text style={[wz.nameChipText, category === c.key && { color: '#000', fontFamily: FontFamily.headingExtraBold }]}>
                    {c.icon} {c.label.toUpperCase()}
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
          >
            <View style={wz.nextBtnGradient}>
              <Text style={wz.nextBtnText}>ENTER BUILDER</Text>
              <Ionicons name="build" size={16} color="#000000" style={{ marginLeft: 6 }} />
            </View>
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
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Diet' : 'Builder'}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={() => setWizardStep(1)} style={styles.iconBtn}>
              <Ionicons name="settings-outline" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAiSheet(true)} style={styles.iconBtn}>
              <Ionicons name="sparkles" size={20} color="#FBBF24" />
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
                <View style={[styles.macroBarFill, { width: `${progress.pro * 100}%`, backgroundColor: '#3B82F6' }]} />
              </View>
            </View>
            <View style={styles.macroBarWrap}>
              <View style={styles.macroBarLabelRow}>
                <Text style={styles.macroBarLabel}>Carbs ({Math.round(totals.carbs)}g)</Text>
              </View>
              <View style={styles.macroBarBg}>
                <View style={[styles.macroBarFill, { width: `${progress.carb * 100}%`, backgroundColor: '#22C55E' }]} />
              </View>
            </View>
            <View style={styles.macroBarWrap}>
              <View style={styles.macroBarLabelRow}>
                <Text style={styles.macroBarLabel}>Fat ({Math.round(totals.fat)}g)</Text>
              </View>
              <View style={styles.macroBarBg}>
                <View style={[styles.macroBarFill, { width: `${progress.fat * 100}%`, backgroundColor: '#F59E0B' }]} />
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
                <Text style={styles.sectionTitle}>{mt.icon} {mt.label.toUpperCase()}</Text>
                <TouchableOpacity 
                  style={styles.quickAddBtn}
                  onPress={() => { setActiveMealTime(mt.key); setShowSearch(true); }}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              
              {mealsInTime.length === 0 ? (
                <View style={styles.emptySection}>
                  <Text style={styles.emptyText}>TAP + TO ADD {mt.label.toUpperCase()}</Text>
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
                      <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.4)" />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
          <View style={styles.saveBtnGradient}>
            {saving ? <ActivityIndicator color="#000000" /> : (
              <>
                <Ionicons name="checkmark" size={18} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>SAVE DIET PLAN</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* AI Generate Sheet */}
      <Modal visible={showAiSheet} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✨ Generate with AI</Text>
              <TouchableOpacity onPress={() => setShowAiSheet(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalLabel}>Describe the perfect diet</Text>
            <View style={styles.aiInputWrap}>
              <TextInput 
                style={styles.aiInput}
                placeholder="e.g. A 2500 calorie high-protein meal plan..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                value={aiPrompt}
                onChangeText={setAiPrompt}
              />
            </View>
            <TouchableOpacity style={styles.aiGenerateBtn} onPress={handleAiGenerate} disabled={isGenerating}>
              <LinearGradient colors={isGenerating ? ['#6B7280', '#4B5563'] : ['#FBBF24', '#D97706']} style={styles.aiGenerateGradient}>
                {isGenerating ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Ionicons name="sparkles" size={20} color="#FFF" />
                )}
                <Text style={styles.aiGenerateText}>{isGenerating ? 'Generating...' : 'Generate Diet'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Meal Bottom Sheet */}
      <Modal visible={editingMealIndex !== null} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Meal</Text>
              <TouchableOpacity onPress={() => setEditingMealIndex(null)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            {editingMealIndex !== null && (
              <>
                <Text style={styles.modalLabel}>{selectedMeals[editingMealIndex]?.name}</Text>
                
                <View style={[styles.portionEditor, { backgroundColor: 'transparent', padding: 0 }]}>
                  <Text style={[styles.portionLabel, { fontSize: 16 }]}>Servings:</Text>
                  <View style={[styles.portionControls, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                    <TouchableOpacity style={styles.portionBtn} onPress={() => setEditServings(Math.max(0.25, editServings - 0.25))}>
                      <Ionicons name="remove" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <Text style={[styles.portionValue, { fontSize: 18 }]}>{editServings}</Text>
                    <TouchableOpacity style={styles.portionBtn} onPress={() => setEditServings(editServings + 0.25)}>
                      <Ionicons name="add" size={24} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={[styles.portionAddBtn, { marginTop: 16 }]} onPress={updateMealServings}>
                  <Text style={styles.portionAddText}>Save Servings</Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                  <TouchableOpacity style={styles.editActionBtn} onPress={() => moveMeal(editingMealIndex, 'up')}>
                    <Ionicons name="arrow-up" size={20} color="#FFF" />
                    <Text style={styles.editActionText}>Move Up</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editActionBtn} onPress={() => moveMeal(editingMealIndex, 'down')}>
                    <Ionicons name="arrow-down" size={20} color="#FFF" />
                    <Text style={styles.editActionText}>Move Down</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={[styles.editActionBtn, { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)', marginTop: 12 }]} 
                  onPress={() => removeMeal(editingMealIndex)}
                >
                  <Ionicons name="trash" size={20} color="#EF4444" />
                  <Text style={[styles.editActionText, { color: '#EF4444' }]}>Remove Meal</Text>
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
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={20} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.searchInput}
                placeholder={searchMode === 'api' ? "Search USDA Database (e.g. Chicken)" : "Search My Saved Meals"}
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => searchMode === 'api' && performSearch()}
                returnKeyType="search"
                autoFocus
              />
              {searchMode === 'api' && (
                <TouchableOpacity onPress={performSearch} style={{ padding: 8, paddingHorizontal: 16, backgroundColor: '#3B82F6', borderRadius: 8, marginLeft: 8 }}>
                  <Text style={{ fontFamily: FontFamily.bodySemiBold, color: '#FFF' }}>Search</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.searchTabs}>
              <TouchableOpacity style={[styles.searchTab, searchMode === 'saved' && styles.searchTabActive]} onPress={() => setSearchMode('saved')}>
                <Text style={[styles.searchTabText, searchMode === 'saved' && styles.searchTabTextActive]}>My Meals</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.searchTab, searchMode === 'api' && styles.searchTabActive]} onPress={() => setSearchMode('api')}>
                <Text style={[styles.searchTabText, searchMode === 'api' && styles.searchTabTextActive]}>USDA DB</Text>
              </TouchableOpacity>
            </View>

            {searching && searchMode === 'api' ? (
              <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
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
                        <Ionicons name={isExpanded ? "chevron-up" : "add-circle"} size={28} color={isExpanded ? "rgba(255,255,255,0.4)" : "#3B82F6"} />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.portionEditor}>
                          <Text style={styles.portionLabel}>Servings:</Text>
                          <View style={styles.portionControls}>
                            <TouchableOpacity style={styles.portionBtn} onPress={() => setTempServings(Math.max(0.25, tempServings - 0.25))}>
                              <Ionicons name="remove" size={20} color="#FFF" />
                            </TouchableOpacity>
                            <Text style={styles.portionValue}>{tempServings}</Text>
                            <TouchableOpacity style={styles.portionBtn} onPress={() => setTempServings(tempServings + 0.25)}>
                              <Ionicons name="add" size={20} color="#FFF" />
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
  safeArea: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  backBtn: { width: 36, height: 36, borderRadius: Radius.xs, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 1 },
  skipBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  skipText: { fontFamily: FontFamily.heading, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  progressBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 20, marginTop: 8, borderRadius: 2 },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: '#FFFFFF' },
  scroll: { paddingHorizontal: 24, paddingTop: 16 },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: 26, color: '#FFF', lineHeight: 32, marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 },
  
  inputCard: { backgroundColor: '#0A0A0A', borderRadius: Radius.xs, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBox: { width: 40, height: 40, borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center' },
  inputLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: 0.5 },
  textInput: { flex: 1, fontFamily: FontFamily.headingExtraBold, fontSize: 18, color: '#FFF', padding: 0 },
  
  nameInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 0, height: 50 },
  nameInput: { flex: 1, color: '#FFF', fontFamily: FontFamily.body, fontSize: 16 },
  
  imageUploadBtn: { height: 120, borderRadius: Radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imageUploadBtnActive: { borderWidth: 0, borderStyle: 'solid' },
  imageUploadText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 8, letterSpacing: 0.5 },
  uploadedImage: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0, width: '100%', height: '100%' },
  imageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  imageOverlayText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: '#FFF', marginTop: 4, letterSpacing: 0.5 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nameChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  nameChipText: { fontFamily: FontFamily.headingSemiBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },

  footer: { padding: 24, paddingBottom: 32 },
  nextBtn: { height: 50, borderRadius: Radius.sm, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  nextBtnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#000000', letterSpacing: 1, marginRight: 6 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: 20, paddingBottom: 16, backgroundColor: '#111' },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFF' },
  
  macroCard: { backgroundColor: '#050505', borderRadius: Radius.sm, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  macroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 },
  macroCol: { flexDirection: 'row', alignItems: 'baseline' },
  macroVal: { fontFamily: FontFamily.headingExtraBold, fontSize: 32, color: '#FFF' },
  macroLabel: { fontFamily: FontFamily.heading, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 4, letterSpacing: 0.5 },
  macroBars: { gap: 12 },
  macroBarWrap: { flex: 1 },
  macroBarLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  macroBarLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 },
  macroBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 2 },

  scrollContent: { padding: 20, paddingBottom: 120 },
  section: { marginBottom: 32 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: '#FFF', letterSpacing: 1 },
  quickAddBtn: { width: 32, height: 32, borderRadius: Radius.xs, backgroundColor: '#141414', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  emptySection: { padding: 24, backgroundColor: '#050505', borderRadius: Radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed', alignItems: 'center' },
  emptyText: { fontFamily: FontFamily.headingSemiBold, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 },
  
  mealCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A0A0A', padding: 16, borderRadius: Radius.sm, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  mealCardText: { flex: 1 },
  mealCardName: { fontFamily: FontFamily.headingSemiBold, fontSize: 15, color: '#FFF', marginBottom: 4 },
  mealCardMacros: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  deleteBtn: { padding: 8 },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.9)' },
  saveBtn: { height: 50, borderRadius: Radius.sm, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  saveBtnGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#000000', letterSpacing: 1 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0A0A0A', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, paddingBottom: Spacing['3xl'], borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  modalTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: '#FFFFFF', letterSpacing: 1 },
  modalLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8, letterSpacing: 1 },
  
  editActionBtn: { flex: 1, flexDirection: 'row', height: 44, backgroundColor: '#141414', borderRadius: Radius.xs, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  editActionText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#FFF', letterSpacing: 0.5 },

  aiInputWrap: { backgroundColor: '#050505', borderRadius: Radius.xs, padding: Spacing.md, height: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginBottom: 16 },
  aiInput: { flex: 1, color: '#FFF', fontFamily: FontFamily.body },
  aiGenerateBtn: { height: 48, borderRadius: Radius.sm, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  aiGenerateGradient: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  aiGenerateText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#000000', letterSpacing: 1 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#050505', borderRadius: Radius.xs, paddingHorizontal: 16, height: 48, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  searchInput: { flex: 1, color: '#FFF', fontFamily: FontFamily.body, fontSize: 14, marginLeft: 10 },
  
  searchTabs: { flexDirection: 'row', backgroundColor: '#050505', borderRadius: Radius.xs, padding: 4, marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  searchTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 4 },
  searchTabActive: { backgroundColor: '#FFFFFF' },
  searchTabText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  searchTabTextActive: { color: '#000000' },

  resultCard: { backgroundColor: '#0A0A0A', borderRadius: Radius.xs, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  resultName: { fontFamily: FontFamily.headingSemiBold, fontSize: 15, color: '#FFF', marginBottom: 4 },
  resultMacros: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  resultMacrosSub: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  
  portionEditor: { backgroundColor: '#050505', padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  portionLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  portionControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141414', borderRadius: Radius.xs, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  portionBtn: { padding: 8 },
  portionValue: { fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: '#FFF', minWidth: 40, textAlign: 'center' },
  portionAddBtn: { backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.xs },
  portionAddText: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: '#000000', letterSpacing: 0.5 }
});
