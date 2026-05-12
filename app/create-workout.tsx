import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import Button from '../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme'
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';

interface SelectedExercise {
  exercise_id: string;
  name: string;
  muscle_group: string;
  sets: number;
  reps: number;
  rest_seconds: number;
}

export default function CreateWorkoutScreen() {
  const router = useRouter();
  const { exercises, createWorkout } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<SelectedExercise[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const { showAlert } = useAlert();

  const filteredExercises = useMemo(() => {
    if (!exerciseSearch.trim()) return exercises;
    const q = exerciseSearch.toLowerCase();
    return exercises.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      e.muscle_group.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q)
    );
  }, [exercises, exerciseSearch]);

  const addExercise = (exercise: typeof exercises[0]) => {
    if (selectedExercises.find((e) => e.exercise_id === exercise.id)) return;
    setSelectedExercises((prev) => [...prev, {
      exercise_id: exercise.id,
      name: exercise.name,
      muscle_group: exercise.muscle_group,
      sets: 3,
      reps: 10,
      rest_seconds: 60,
    }]);
    setShowPicker(false);
    setExerciseSearch('');
  };

  const removeExercise = (id: string) => {
    setSelectedExercises((prev) => prev.filter((e) => e.exercise_id !== id));
  };

  const updateExercise = (id: string, field: string, value: number) => {
    setSelectedExercises((prev) =>
      prev.map((e) => e.exercise_id === id ? { ...e, [field]: value } : e)
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert({ type: 'warning', title: 'Name Required', message: 'Please enter a workout name' });
      return;
    }
    setSaving(true);
    try {
      await createWorkout(name.trim(), description.trim(), selectedExercises.map((e) => ({
        exercise_id: e.exercise_id,
        sets: e.sets,
        reps: e.reps,
        rest_seconds: e.rest_seconds,
      })));
      router.back();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to create workout' });
    } finally {
      setSaving(false);
    }
  };

  // Exercise picker modal
  if (showPicker) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={() => { setShowPicker(false); setExerciseSearch(''); }}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>Add Exercise</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises..."
            placeholderTextColor={Colors.textTertiary}
            value={exerciseSearch}
            onChangeText={setExerciseSearch}
            autoFocus
          />
        </View>

        <FlatList
          data={filteredExercises}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: 100 }}
          renderItem={({ item }) => {
            const isAdded = selectedExercises.some((e) => e.exercise_id === item.id);
            return (
              <TouchableOpacity
                style={[styles.exerciseItem, isAdded && styles.exerciseItemAdded]}
                onPress={() => addExercise(item)}
                disabled={isAdded}
              >
                <View style={styles.exerciseIcon}>
                  <Ionicons name="barbell-outline" size={18} color={isAdded ? Colors.white : Colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{item.name}</Text>
                  <View style={styles.exerciseTags}>
                    <Text style={styles.exerciseTag}>{item.muscle_group}</Text>
                    <Text style={styles.exerciseTagDot}>·</Text>
                    <Text style={styles.exerciseTag}>{item.category}</Text>
                    {item.equipment && (
                      <>
                        <Text style={styles.exerciseTagDot}>·</Text>
                        <Text style={styles.exerciseTag}>{item.equipment}</Text>
                      </>
                    )}
                  </View>
                </View>
                {isAdded ? (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.green} />
                ) : (
                  <Ionicons name="add-circle-outline" size={22} color={Colors.accent} />
                )}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Workout</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Name Input */}
          <Text style={styles.label}>Workout Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Upper Body Push"
            placeholderTextColor={Colors.textTertiary}
            value={name}
            onChangeText={setName}
          />

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Brief description of this workout..."
            placeholderTextColor={Colors.textTertiary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />

          {/* Exercises Section */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Exercises ({selectedExercises.length})
            </Text>
            <TouchableOpacity
              style={styles.addExerciseBtn}
              onPress={() => setShowPicker(true)}
            >
              <Ionicons name="add" size={16} color={Colors.accent} />
              <Text style={styles.addExerciseText}>Add</Text>
            </TouchableOpacity>
          </View>

          {selectedExercises.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyExercises}
              onPress={() => setShowPicker(true)}
            >
              <Ionicons name="barbell-outline" size={24} color={Colors.textTertiary} />
              <Text style={styles.emptyExercisesText}>Tap to add exercises</Text>
            </TouchableOpacity>
          ) : (
            selectedExercises.map((ex, index) => (
              <Card key={ex.exercise_id} style={styles.exerciseCard}>
                <View style={styles.exerciseCardTop}>
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderBadgeText}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exerciseCardName}>{ex.name}</Text>
                    <Text style={styles.exerciseCardMuscle}>{ex.muscle_group}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeExercise(ex.exercise_id)}>
                    <Ionicons name="trash-outline" size={18} color={Colors.red} />
                  </TouchableOpacity>
                </View>

                {/* Sets / Reps / Rest */}
                <View style={styles.paramRow}>
                  {[
                    { label: 'Sets', field: 'sets', value: ex.sets },
                    { label: 'Reps', field: 'reps', value: ex.reps },
                    { label: 'Rest (s)', field: 'rest_seconds', value: ex.rest_seconds },
                  ].map((param) => (
                    <View key={param.field} style={styles.paramItem}>
                      <Text style={styles.paramLabel}>{param.label}</Text>
                      <View style={styles.paramControls}>
                        <TouchableOpacity
                          style={styles.paramBtn}
                          onPress={() => updateExercise(ex.exercise_id, param.field, Math.max(1, param.value - (param.field === 'rest_seconds' ? 15 : 1)))}
                        >
                          <Ionicons name="remove" size={14} color={Colors.textSecondary} />
                        </TouchableOpacity>
                        <Text style={styles.paramValue}>{param.value}</Text>
                        <TouchableOpacity
                          style={styles.paramBtn}
                          onPress={() => updateExercise(ex.exercise_id, param.field, param.value + (param.field === 'rest_seconds' ? 15 : 1))}
                        >
                          <Ionicons name="add" size={14} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </Card>
            ))
          )}

          {/* Save Button */}
          <View style={styles.saveArea}>
            <Button
              title={saving ? 'Creating...' : 'Create Workout'}
              onPress={handleSave}
              disabled={saving || !name.trim()}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },

  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  label: {
    fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm,
    color: Colors.textSecondary, marginBottom: 6, marginTop: Spacing.lg,
  },
  input: {
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textPrimary,
  },
  textArea: { height: 80, textAlignVertical: 'top' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.xl, marginBottom: Spacing.md,
  },
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  addExerciseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.accentSoft,
  },
  addExerciseText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.accent },

  emptyExercises: {
    alignItems: 'center', paddingVertical: Spacing['2xl'], gap: Spacing.sm,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
  },
  emptyExercisesText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textTertiary },

  exerciseCard: { marginBottom: Spacing.sm },
  exerciseCardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  orderBadge: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  orderBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.white },
  exerciseCardName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  exerciseCardMuscle: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },

  paramRow: {
    flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md,
    paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  paramItem: { flex: 1, alignItems: 'center', gap: 4 },
  paramLabel: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.textTertiary },
  paramControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paramBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  paramValue: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary, minWidth: 28, textAlign: 'center' },

  saveArea: { marginTop: Spacing.xl },

  // Picker styles
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  pickerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.md, marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md, height: 42,
  },
  searchInput: {
    flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.base,
    color: Colors.textPrimary, paddingVertical: 0,
  },

  exerciseItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  exerciseItemAdded: { opacity: 0.5 },
  exerciseIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  exerciseName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  exerciseTags: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  exerciseTag: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  exerciseTagDot: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  separator: { height: 1, backgroundColor: Colors.border },
});
