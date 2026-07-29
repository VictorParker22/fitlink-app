import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const PRESET_CERTS = [
  'NASM-CPT', 'ACE-CPT', 'ISSA-CPT', 'NSCA-CSCS', 'ACSM-CEP',
  'CrossFit Level 1', 'CrossFit Level 2', 'NASM-CES', 'NASM-PES',
  'ACE-GFI', 'ISSA-SFN', 'Precision Nutrition L1', 'TRX Suspension',
  'Kettlebell Athletics', 'USA Weightlifting', 'Yoga Alliance RYT-200',
];

export default function CertificationsScreen() {
  const router = useRouter();
  const { trainer, updateTrainer } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const existingCerts: string[] = Array.isArray(trainer?.certifications)
    ? trainer.certifications
    : (typeof trainer?.certifications === 'string' && trainer.certifications)
      ? trainer.certifications.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

  const [certs, setCerts] = useState<string[]>(existingCerts);
  const [customCert, setCustomCert] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleCert = (cert: string) => {
    setCerts((prev) => prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert]);
  };

  const addCustom = () => {
    const trimmed = customCert.trim();
    if (!trimmed) return;
    if (certs.includes(trimmed)) return Alert.alert('Duplicate', 'This certification is already added.');
    setCerts((prev) => [...prev, trimmed]);
    setCustomCert('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTrainer({ certifications: certs as any });
      Alert.alert('Saved!', `${certs.length} certification${certs.length !== 1 ? 's' : ''} updated.`, [
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
        <Text style={styles.headerTitle}>CERTIFICATIONS</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveHeaderBtn} accessibilityRole="button">
          <Text style={[styles.saveBtnText, saving && { opacity: 0.5 }]}>{saving ? 'SAVING...' : 'SAVE'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Current */}
        {certs.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>YOUR CERTIFICATIONS ({certs.length})</Text>
            <View style={styles.chipGrid}>
              {certs.map((cert) => (
                <TouchableOpacity key={cert} style={styles.chipActive} onPress={() => toggleCert(cert)} activeOpacity={0.8}>
                  <Ionicons name="checkmark" size={13} color={colors.bgPrimary} />
                  <Text style={styles.chipTextActive}>{cert}</Text>
                  <Ionicons name="close" size={12} color={colors.bgPrimary} style={{ opacity: 0.7 }} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Add Custom */}
        <Text style={styles.sectionLabel}>ADD CUSTOM</Text>
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder="e.g. First Aid / CPR"
            placeholderTextColor={colors.textTertiary}
            value={customCert}
            onChangeText={setCustomCert}
            onSubmitEditing={addCustom}
            returnKeyType="done"
          />
          <TouchableOpacity style={[styles.addBtn, !customCert.trim() && styles.addBtnDisabled]} onPress={addCustom} disabled={!customCert.trim()} activeOpacity={0.8}>
            <Ionicons name="add" size={20} color={customCert.trim() ? colors.bgPrimary : colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Presets */}
        <Text style={styles.sectionLabel}>POPULAR CERTIFICATIONS</Text>
        <View style={styles.chipGrid}>
          {PRESET_CERTS.filter((c) => !certs.includes(c)).map((cert) => (
            <TouchableOpacity key={cert} style={styles.chip} onPress={() => toggleCert(cert)} activeOpacity={0.7}>
              <Ionicons name="add-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.chipText}>{cert}</Text>
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
