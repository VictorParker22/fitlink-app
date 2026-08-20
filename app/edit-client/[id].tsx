import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { readClientGoalsText } from '../../lib/clientGoals';

export default function EditClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getClientById, updateClient, plans } = useApp();
  const { showAlert } = useAlert();

  const client = getClientById(id || '');

  const [name, setName] = useState(client?.name || '');
  const [email, setEmail] = useState(client?.email || '');
  const [phone, setPhone] = useState(client?.phone || '');
  // `client.goals` is not a column — it always read back empty, so the coach
  // saw a blank field every time they reopened this screen and re-saving wiped
  // what was there. Prefill from where the goals actually live.
  const [goals, setGoals] = useState(readClientGoalsText(client) || '');
  const [notes, setNotes] = useState(client?.notes || '');
  const [status, setStatus] = useState(client?.status || 'active');
  const [selectedPlan, setSelectedPlan] = useState(client?.plan_id || null);
  const [saving, setSaving] = useState(false);

  if (!client) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.notFound}>Client not found</Text>
          <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
            style={styles.secondaryBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.secondaryBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSave = async () => {
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Name Required', message: 'Please enter a client name.' });
    setSaving(true);
    try {
      await updateClient(id!, {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        goals: goals.trim() || undefined,
        notes: notes.trim() || undefined,
        status: status as any,
        plan_id: selectedPlan || undefined,
      });
      showAlert({ type: 'success', title: 'Saved!', message: 'Client updated successfully.', buttons: [{ text: 'OK', onPress: () => router.back() }] });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to update client' });
    } finally {
      setSaving(false);
    }
  };

  const statuses = [
    { value: 'active', label: 'Active', color: CoachColors.accent },
    { value: 'trial', label: 'Trial', color: CoachColors.warning },
    { value: 'inactive', label: 'Inactive', color: CoachColors.textMuted },
  ] as const;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity hitSlop={4}
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={25} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit client</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Client name" placeholderTextColor={CoachColors.textFaint} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="email@example.com" placeholderTextColor={CoachColors.textFaint} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" placeholderTextColor={CoachColors.textFaint} keyboardType="phone-pad" />
          </View>

          {/* Status */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
              {statuses.map((s) => (
                <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                  key={s.value}
                  style={[styles.statusChip, status === s.value && { backgroundColor: `${s.color}18`, borderColor: `${s.color}40` }]}
                  onPress={() => setStatus(s.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: status === s.value }}
                  accessibilityLabel={`Set status ${s.label}`}
                >
                  <View style={[styles.statusDot, { backgroundColor: s.color }]} />
                  <Text style={[styles.statusText, status === s.value && { color: s.color }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Plan */}
          {plans.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Plan</Text>
              <View style={styles.planGrid}>
                <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={[styles.planChip, !selectedPlan && styles.planChipActive]} onPress={() => setSelectedPlan(null)}>
                  <Text style={[styles.planChipText, !selectedPlan && styles.planChipTextActive]}>None</Text>
                </TouchableOpacity>
                {plans.map((plan) => (
                  <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} key={plan.id} style={[styles.planChip, selectedPlan === plan.id && styles.planChipActive]} onPress={() => setSelectedPlan(plan.id)}>
                    <Text style={[styles.planChipText, selectedPlan === plan.id && styles.planChipTextActive]}>{plan.name} · ${plan.price}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Goals</Text>
            <TextInput style={[styles.input, styles.textArea]} value={goals} onChangeText={setGoals} placeholder="Client goals..." placeholderTextColor={CoachColors.textFaint} multiline numberOfLines={3} textAlignVertical="top" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} placeholder="Notes about this client..." placeholderTextColor={CoachColors.textFaint} multiline numberOfLines={3} textAlignVertical="top" />
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Save changes"
          >
            {saving
              ? <ActivityIndicator size="small" color={CoachColors.onAccent} />
              : <Text style={styles.saveBtnText}>Save changes</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, borderCurve: 'continuous', backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 20, color: CoachColors.textPrimary },
  // paddingBottom is applied inline from the real bottom inset (pushed route: no tab bar).
  scrollContent: { paddingHorizontal: 16 },
  notFound: { fontFamily: CoachFonts.bodySemiBold, fontSize: 20, color: CoachColors.textSecondary, marginBottom: 16 },

  inputGroup: { marginBottom: 16 },
  label: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textMuted, letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  input: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 12, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 14,
    fontFamily: CoachFonts.body, fontSize: 20, color: CoachColors.textPrimary,
  },
  textArea: { minHeight: 96, paddingTop: 12 },

  statusRow: { flexDirection: 'row', gap: 6 },
  statusChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, borderCurve: 'continuous' },
  statusText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textSecondary },

  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  planChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderCurve: 'continuous', backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted },
  planChipActive: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  planChipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 17, color: CoachColors.textSecondary },
  planChipTextActive: { color: CoachColors.accent },

  saveBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', minHeight: 52,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 15, marginTop: 8,
  },
  saveBtnText: { fontFamily: CoachFonts.headingBold, fontSize: 18, color: CoachColors.onAccent },

  secondaryBtn: {
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
  },
  secondaryBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textPrimary },
});
