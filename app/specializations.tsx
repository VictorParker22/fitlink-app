import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const PRESET_SPECS = [
  'Strength Training', 'HIIT', 'CrossFit', 'Yoga', 'Pilates',
  'Powerlifting', 'Olympic Lifting', 'Bodybuilding', 'Functional Fitness',
  'Sports Performance', 'Mobility & Flexibility', 'Pre/Postnatal',
  'Senior Fitness', 'Youth Training', 'Boxing / MMA', 'Endurance / Running',
  'Nutrition Coaching', 'Weight Loss', 'Rehab / Corrective Exercise', 'Group Fitness',
];

const MAX_SPECS = 10;

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === 'string' && value) return value.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

export default function SpecializationsScreen() {
  const router = useRouter();
  const { trainer, updateTrainer } = useApp();

  const [specs, setSpecs] = useState<string[]>(() => parseList(trainer?.specialization));
  const [customSpec, setCustomSpec] = useState('');
  const [saving, setSaving] = useState(false);

  const addSpec = (spec: string) => {
    if (specs.length >= MAX_SPECS) {
      Alert.alert('Limit reached', `You can list up to ${MAX_SPECS} specializations. Keep the ones that best describe your coaching.`);
      return;
    }
    setSpecs((prev) => (prev.includes(spec) ? prev : [...prev, spec]));
  };

  const removeSpec = (spec: string) => setSpecs((prev) => prev.filter((c) => c !== spec));

  const addCustom = () => {
    const trimmed = customSpec.trim();
    if (!trimmed) return;
    if (specs.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Already added', 'This specialization is already on your list.');
      return;
    }
    addSpec(trimmed);
    setCustomSpec('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Stored as a comma-joined string — same contract as settings and the trainer wizard.
      await updateTrainer({ specialization: specs.join(', ') });
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save', err.message || 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.headerBack} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={22} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Specializations</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={[s.saveBtn, saving && s.saveBtnDisabled]} accessibilityRole="button" accessibilityLabel="Save specializations">
            <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Current */}
          <Text style={s.sectionLabel}>Your specializations{specs.length > 0 ? ` (${specs.length})` : ''}</Text>
          {specs.length > 0 ? (
            <View style={s.chipGrid}>
              {specs.map((spec) => (
                <TouchableOpacity
                  key={spec}
                  style={s.chipSelected}
                  onPress={() => removeSpec(spec)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${spec}`}
                >
                  <Text style={s.chipSelectedText}>{spec}</Text>
                  <Ionicons name="close" size={13} color={CoachColors.accent} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={s.emptyText}>
              Specializations tell athletes what you coach best and show on your profile. Pick from the list below or type your own.
            </Text>
          )}

          {/* Add custom */}
          <Text style={s.sectionLabel}>Add your own</Text>
          <View style={s.addRow}>
            <TextInput
              style={s.addInput}
              placeholder="e.g. Aquatic Training"
              placeholderTextColor={CoachColors.textFaint}
              value={customSpec}
              onChangeText={setCustomSpec}
              onSubmitEditing={addCustom}
              returnKeyType="done"
              selectionColor={CoachColors.accent}
            />
            <TouchableOpacity
              style={[s.addBtn, !customSpec.trim() && s.addBtnDisabled]}
              onPress={addCustom}
              disabled={!customSpec.trim()}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add specialization"
            >
              <Ionicons name="add" size={22} color={customSpec.trim() ? CoachColors.onAccent : CoachColors.textFaint} />
            </TouchableOpacity>
          </View>

          {/* Presets */}
          <Text style={s.sectionLabel}>Popular specializations</Text>
          <View style={s.chipGrid}>
            {PRESET_SPECS.filter((c) => !specs.includes(c)).map((spec) => (
              <TouchableOpacity
                key={spec}
                style={s.chip}
                onPress={() => addSpec(spec)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Add ${spec}`}
              >
                <Ionicons name="add-outline" size={14} color={CoachColors.textFaint} />
                <Text style={s.chipText}>{spec}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  headerBack: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: CoachColors.accent,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 13, color: CoachColors.onAccent },

  scroll: { paddingHorizontal: 20, paddingBottom: 48 },

  sectionLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 10,
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: CoachColors.textSecondary,
  },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.border,
    backgroundColor: 'transparent',
  },
  chipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textSecondary },
  chipSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSofter,
  },
  chipSelectedText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.accent },

  addRow: { flexDirection: 'row', gap: 10 },
  addInput: {
    flex: 1,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
  },
  addBtn: {
    width: 46,
    borderRadius: 14,
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
});
