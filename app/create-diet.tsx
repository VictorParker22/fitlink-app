import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { useAlert } from '../context/AlertContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme'
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

export default function CreateDietScreen() {
  const router = useRouter();
  const { createDietPlan, meals } = useApp();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const styles = useMemo(() => getStyles(colors), [colors]);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMeals, setSelectedMeals] = useState<typeof meals>([]);
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredMeals = useMemo(() => {
    if (!searchQuery.trim()) return meals;
    const q = searchQuery.toLowerCase();
    return meals.filter(m => m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
  }, [meals, searchQuery]);

  const totals = useMemo(() => {
    return selectedMeals.reduce((acc, m) => {
      acc.calories += m.calories;
      acc.protein += m.protein;
      acc.carbs += m.carbs;
      acc.fat += m.fat;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }, [selectedMeals]);

  const handleSave = async () => {
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Missing Name', message: 'Please enter a plan name.' });
    if (selectedMeals.length === 0) return showAlert({ type: 'warning', title: 'No Meals', message: 'Please add at least one meal.' });
    
    setSaving(true);
    try {
      const mealMap = selectedMeals.map(m => ({ meal_id: m.id }));
      await createDietPlan(name.trim(), description.trim(), mealMap);
      router.back();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to create diet plan' });
      setSaving(false);
    }
  };

  const removeMeal = (index: number) => {
    Alert.alert('Remove Meal', 'Are you sure you want to remove this meal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        const newMeals = [...selectedMeals];
        newMeals.splice(index, 1);
        setSelectedMeals(newMeals);
      }},
    ]);
  };

  if (isSearching) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setIsSearching(false)} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Meal</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search foods..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>

        <ScrollView contentContainerStyle={styles.searchList}>
          {filteredMeals.map(meal => (
            <TouchableOpacity
              key={meal.id}
              style={styles.mealResult}
              onPress={() => {
                setSelectedMeals(prev => [...prev, meal]);
                setIsSearching(false);
                setSearchQuery('');
              }}
            >
              <View style={styles.mealResultIcon}>
                <Ionicons name="restaurant" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mealResultName}>{meal.name}</Text>
                <Text style={styles.mealResultCategory}>{meal.category}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.mealResultKcal}>{meal.calories} kcal</Text>
                <Text style={styles.mealResultMacros}>P:{meal.protein} C:{meal.carbs} F:{meal.fat}</Text>
              </View>
              <Ionicons name="add-circle" size={24} color={colors.accent} style={{ marginLeft: Spacing.sm }} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Diet Plan</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Basics */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Plan Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 4-Week Cut"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Add some notes about this plan..."
              placeholderTextColor={colors.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Meals List */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Meals</Text>
            <TouchableOpacity onPress={() => setIsSearching(true)} style={styles.addSmallBtn}>
              <Ionicons name="add" size={16} color={colors.accent} />
              <Text style={styles.addSmallText}>Add Meal</Text>
            </TouchableOpacity>
          </View>

          {selectedMeals.length === 0 ? (
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setIsSearching(true)}>
              <Ionicons name="restaurant-outline" size={32} color={colors.textTertiary} />
              <Text style={styles.emptyAddText}>Tap to add your first meal</Text>
            </TouchableOpacity>
          ) : (
            selectedMeals.map((meal, index) => (
              <View key={`${meal.id}-${index}`} style={styles.selectedMealCard}>
                <View style={styles.selectedMealHeader}>
                  <View style={styles.mealNumber}><Text style={styles.mealNumberText}>{index + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedMealName}>{meal.name}</Text>
                    <Text style={styles.selectedMealCategory}>{meal.category}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeMeal(index)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
                <View style={styles.macrosRow}>
                  <View style={styles.macroItem}><Text style={styles.macroVal}>{meal.calories}</Text><Text style={styles.macroLbl}>Kcal</Text></View>
                  <View style={styles.macroItem}><Text style={styles.macroVal}>{meal.protein}g</Text><Text style={styles.macroLbl}>Protein</Text></View>
                  <View style={styles.macroItem}><Text style={styles.macroVal}>{meal.carbs}g</Text><Text style={styles.macroLbl}>Carbs</Text></View>
                  <View style={styles.macroItem}><Text style={styles.macroVal}>{meal.fat}g</Text><Text style={styles.macroLbl}>Fat</Text></View>
                </View>
              </View>
            ))
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Floating Totals Banner */}
        <View style={styles.totalsBanner}>
          <Text style={styles.totalsTitle}>Daily Targets</Text>
          <View style={styles.totalsRow}>
            <View style={styles.totalItem}><Text style={styles.totalVal}>{totals.calories}</Text><Text style={styles.totalLbl}>Kcal</Text></View>
            <View style={styles.totalItem}><Text style={styles.totalVal}>{totals.protein}g</Text><Text style={styles.totalLbl}>Protein</Text></View>
            <View style={styles.totalItem}><Text style={styles.totalVal}>{totals.carbs}g</Text><Text style={styles.totalLbl}>Carbs</Text></View>
            <View style={styles.totalItem}><Text style={styles.totalVal}>{totals.fat}g</Text><Text style={styles.totalLbl}>Fat</Text></View>
          </View>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary },
  saveBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full },
  saveBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.white },
  
  content: { padding: Spacing.lg },
  inputGroup: { marginBottom: Spacing.xl },
  label: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm },
  input: {
    backgroundColor: colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md,
    fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border,
  },
  textArea: { height: 100 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary },
  addSmallBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addSmallText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.accent },

  emptyAddBtn: {
    borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed',
    borderRadius: Radius.lg, padding: Spacing['2xl'], alignItems: 'center', gap: Spacing.sm,
  },
  emptyAddText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textTertiary },

  selectedMealCard: {
    backgroundColor: colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  selectedMealHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  mealNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  mealNumberText: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: colors.accent },
  selectedMealName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: colors.textPrimary },
  selectedMealCategory: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  removeBtn: { padding: 4 },

  macrosRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.bgPrimary, padding: Spacing.sm, borderRadius: Radius.md },
  macroItem: { alignItems: 'center' },
  macroVal: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: colors.textPrimary },
  macroLbl: { fontFamily: FontFamily.body, fontSize: 10, color: colors.textTertiary },

  totalsBanner: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.bgElevated, borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 40,
  },
  totalsTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: colors.textPrimary, marginBottom: Spacing.sm },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalItem: { alignItems: 'center', flex: 1 },
  totalVal: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, color: colors.accent },
  totalLbl: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textSecondary },

  // Search UI
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: colors.bgElevated, margin: Spacing.lg, paddingHorizontal: Spacing.md,
    borderRadius: Radius.full, borderWidth: 1, borderColor: colors.border, height: 48,
  },
  searchInput: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textPrimary },
  searchList: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  mealResult: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  mealResultIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  mealResultName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary },
  mealResultCategory: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  mealResultKcal: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary, textAlign: 'right' },
  mealResultMacros: { fontFamily: FontFamily.body, fontSize: 10, color: colors.textTertiary, textAlign: 'right' },
});
