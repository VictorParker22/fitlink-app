import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme'
import { useTheme } from '../context/ThemeContext';

const PRESET_SPECS = [
  'Strength Training', 'HIIT', 'CrossFit', 'Yoga', 'Pilates',
  'Powerlifting', 'Olympic Lifting', 'Bodybuilding', 'Functional Fitness',
  'Sports Performance', 'Mobility & Flexibility', 'Pre/Postnatal',
  'Senior Fitness', 'Youth Training', 'Boxing / MMA', 'Endurance / Running',
  'Nutrition Coaching', 'Weight Loss', 'Rehab / Corrective Exercise', 'Group Fitness',
];

export default function SpecializationsScreen() {
  const router = useRouter();
  const { trainer, updateTrainer } = useApp();

  const existingSpecs: string[] = Array.isArray(trainer?.specialization)
    ? trainer.specialization
    : (typeof trainer?.specialization === 'string' && trainer.specialization)
      ? trainer.specialization.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

  const [specs, setSpecs] = useState<string[]>(existingSpecs);
  const [customSpec, setCustomSpec] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleSpec = (spec: string) => {
    setSpecs((prev) => prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]);
  };

  const addCustom = () => {
    const trimmed = customSpec.trim();
    if (!trimmed) return;
    if (specs.includes(trimmed)) return Alert.alert('Duplicate', 'Already added.');
    setSpecs((prev) => [...prev, trimmed]);
    setCustomSpec('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTrainer({ specialization: specs.join(', ') } as any);
      Alert.alert('Saved!', `${specs.length} specialization${specs.length !== 1 ? 's' : ''} updated.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Specializations</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveBtn, saving && { opacity: 0.5 }]}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {specs.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>YOUR SPECIALIZATIONS ({specs.length})</Text>
            <View style={styles.chipGrid}>
              {specs.map((spec) => (
                <TouchableOpacity key={spec} style={styles.chipActive} onPress={() => toggleSpec(spec)}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.blue} />
                  <Text style={styles.chipTextActive}>{spec}</Text>
                  <Ionicons name="close" size={12} color={Colors.textTertiary} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>ADD CUSTOM</Text>
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="e.g. Aquatic Training"
            placeholderTextColor={Colors.textTertiary}
            value={customSpec}
            onChangeText={setCustomSpec}
            onSubmitEditing={addCustom}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBtn} onPress={addCustom} disabled={!customSpec.trim()}>
            <Ionicons name="add" size={20} color={customSpec.trim() ? Colors.white : Colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>POPULAR SPECIALIZATIONS</Text>
        <View style={styles.chipGrid}>
          {PRESET_SPECS.filter((s) => !specs.includes(s)).map((spec) => (
            <TouchableOpacity key={spec} style={styles.chip} onPress={() => toggleSpec(spec)}>
              <Ionicons name="add-circle-outline" size={14} color={Colors.textTertiary} />
              <Text style={styles.chipText}>{spec}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  saveBtn: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.accent },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  sectionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.md },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  chipText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textSecondary },
  chipActive: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: `${Colors.blue}12`, borderWidth: 1, borderColor: `${Colors.blue}30` },
  chipTextActive: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.blue },
  addRow: { flexDirection: 'row', gap: Spacing.sm },
  addInput: { flex: 1, backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textPrimary },
  addBtn: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
});
