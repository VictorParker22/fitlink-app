import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme'
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Certifications</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveBtn, saving && { opacity: 0.5 }]}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Current */}
        {certs.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>YOUR CERTIFICATIONS ({certs.length})</Text>
            <View style={styles.chipGrid}>
              {certs.map((cert) => (
                <TouchableOpacity key={cert} style={styles.chipActive} onPress={() => toggleCert(cert)}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.green} />
                  <Text style={styles.chipTextActive}>{cert}</Text>
                  <Ionicons name="close" size={12} color={colors.textTertiary} />
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
          <TouchableOpacity style={styles.addBtn} onPress={addCustom} disabled={!customCert.trim()}>
            <Ionicons name="add" size={20} color={customCert.trim() ? colors.white : colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Presets */}
        <Text style={styles.sectionLabel}>POPULAR CERTIFICATIONS</Text>
        <View style={styles.chipGrid}>
          {PRESET_CERTS.filter((c) => !certs.includes(c)).map((cert) => (
            <TouchableOpacity key={cert} style={styles.chip} onPress={() => toggleCert(cert)}>
              <Ionicons name="add-circle-outline" size={14} color={colors.textTertiary} />
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  saveBtn: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.accent },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  sectionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.md },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textSecondary },
  chipActive: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: `${colors.green}12`, borderWidth: 1, borderColor: `${colors.green}30` },
  chipTextActive: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.green },
  addRow: { flexDirection: 'row', gap: Spacing.sm },
  addInput: { flex: 1, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textPrimary },
  addBtn: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
