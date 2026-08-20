import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const PRESET_CERTS = [
  'NASM-CPT', 'ACE-CPT', 'ISSA-CPT', 'NSCA-CSCS', 'ACSM-CEP',
  'CrossFit Level 1', 'CrossFit Level 2', 'NASM-CES', 'NASM-PES',
  'ACE-GFI', 'ISSA-SFN', 'Precision Nutrition L1', 'TRX Suspension',
  'Kettlebell Athletics', 'USA Weightlifting', 'Yoga Alliance RYT-200',
];

const MAX_CERTS = 20;

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean);
  if (typeof value === 'string' && value) return value.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

export default function CertificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { trainer, updateTrainer } = useApp();

  const [certs, setCerts] = useState<string[]>(() => parseList(trainer?.certifications));
  const [customCert, setCustomCert] = useState('');
  const [saving, setSaving] = useState(false);

  const addCert = (cert: string) => {
    if (certs.length >= MAX_CERTS) {
      Alert.alert('Limit reached', `You can list up to ${MAX_CERTS} certifications.`);
      return;
    }
    setCerts((prev) => (prev.includes(cert) ? prev : [...prev, cert]));
  };

  const removeCert = (cert: string) => setCerts((prev) => prev.filter((c) => c !== cert));

  const addCustom = () => {
    const trimmed = customCert.trim();
    if (!trimmed) return;
    if (certs.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Already added', 'This certification is already on your list.');
      return;
    }
    addCert(trimmed);
    setCustomCert('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // trainers.certifications is a text column — persist as a comma-joined string.
      await updateTrainer({ certifications: certs.join(', ') });
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
          <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={s.headerBack} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={25} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Certifications</Text>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleSave} disabled={saving} style={[s.saveBtn, saving && s.saveBtnDisabled]} accessibilityRole="button" accessibilityLabel="Save certifications">
            <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Current */}
          <Text style={s.sectionLabel}>Your certifications{certs.length > 0 ? ` (${certs.length})` : ''}</Text>
          {certs.length > 0 ? (
            <View style={s.chipGrid}>
              {certs.map((cert) => (
                <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                  key={cert}
                  style={s.chipSelected}
                  onPress={() => removeCert(cert)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${cert}`}
                >
                  <Text style={s.chipSelectedText}>{cert}</Text>
                  <Ionicons name="close" size={15} color={CoachColors.accent} />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={s.emptyText}>
              Certifications you add here appear on your coach profile. Pick from the list below or type your own.
            </Text>
          )}

          {/* Add custom */}
          <Text style={s.sectionLabel}>Add your own</Text>
          <View style={s.addRow}>
            <TextInput
              style={s.addInput}
              placeholder="e.g. First Aid / CPR"
              placeholderTextColor={CoachColors.textFaint}
              value={customCert}
              onChangeText={setCustomCert}
              onSubmitEditing={addCustom}
              returnKeyType="done"
              selectionColor={CoachColors.accent}
            />
            <TouchableOpacity
              style={[s.addBtn, !customCert.trim() && s.addBtnDisabled]}
              onPress={addCustom}
              disabled={!customCert.trim()}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Add certification"
            >
              <Ionicons name="add" size={25} color={customCert.trim() ? CoachColors.onAccent : CoachColors.textFaint} />
            </TouchableOpacity>
          </View>

          {/* Presets */}
          <Text style={s.sectionLabel}>Common certifications</Text>
          <View style={s.chipGrid}>
            {PRESET_CERTS.filter((c) => !certs.includes(c)).map((cert) => (
              <TouchableOpacity hitSlop={{ top: 5, bottom: 5 }}
                key={cert}
                style={s.chip}
                onPress={() => addCert(cert)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Add ${cert}`}
              >
                <Ionicons name="add-outline" size={16} color={CoachColors.textFaint} />
                <Text style={s.chipText}>{cert}</Text>
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
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 20, color: CoachColors.textPrimary },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.onAccent },

  // paddingBottom is applied inline from the real bottom inset (pushed route: no tab bar).
  scroll: { paddingHorizontal: 20 },

  sectionLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 24,
    marginBottom: 10,
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    lineHeight: 21.5,
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
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    backgroundColor: 'transparent',
  },
  chipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },
  chipSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accentSofter,
  },
  chipSelectedText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.accent },

  addRow: { flexDirection: 'row', gap: 10 },
  addInput: {
    flex: 1,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontFamily: CoachFonts.body,
    fontSize: 16,
    color: CoachColors.textPrimary,
  },
  addBtn: {
    width: 46,
    borderRadius: 14,
    borderCurve: 'continuous',
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
