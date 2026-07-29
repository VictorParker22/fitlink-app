import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme'
import type { ThemeColors } from '../constants/theme';
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
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SPECIALIZATIONS</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveHeaderBtn} accessibilityRole="button">
          <Text style={[styles.saveBtnText, saving && { opacity: 0.5 }]}>{saving ? 'SAVING...' : 'SAVE'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {specs.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>YOUR SPECIALIZATIONS ({specs.length})</Text>
            <View style={styles.chipGrid}>
              {specs.map((spec) => (
                <TouchableOpacity key={spec} style={styles.chipActive} onPress={() => toggleSpec(spec)} activeOpacity={0.8}>
                  <Ionicons name="checkmark" size={13} color={colors.bgPrimary} />
                  <Text style={styles.chipTextActive}>{spec}</Text>
                  <Ionicons name="close" size={12} color={colors.bgPrimary} style={{ opacity: 0.7 }} />
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
            placeholderTextColor={colors.textTertiary}
            value={customSpec}
            onChangeText={setCustomSpec}
            onSubmitEditing={addCustom}
            returnKeyType="done"
          />
          <TouchableOpacity style={[styles.addBtn, !customSpec.trim() && styles.addBtnDisabled]} onPress={addCustom} disabled={!customSpec.trim()} activeOpacity={0.8}>
            <Ionicons name="add" size={20} color={customSpec.trim() ? colors.bgPrimary : colors.textTertiary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>POPULAR SPECIALIZATIONS</Text>
        <View style={styles.chipGrid}>
          {PRESET_SPECS.filter((s) => !specs.includes(s)).map((spec) => (
            <TouchableOpacity key={spec} style={styles.chip} onPress={() => toggleSpec(spec)} activeOpacity={0.7}>
              <Ionicons name="add-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.chipText}>{spec}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  saveHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.textPrimary,
    borderRadius: Radius.xs,
  },
  saveBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: colors.bgPrimary,
    letterSpacing: 1,
  },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 110 },
  sectionLabel: {
    fontFamily: FontFamily.heading,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.5,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  chipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.xs,
    backgroundColor: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },
  chipTextActive: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: colors.bgPrimary,
    letterSpacing: 0.5,
  },
  addRow: { flexDirection: 'row', gap: Spacing.xs },
  addInput: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.xs,
    backgroundColor: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.border,
  },
});
