import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import Button from '../../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function EditClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getClientById, updateClient, plans } = useApp();
  const { showAlert } = useAlert();

  const client = getClientById(id || '');

  const [name, setName] = useState(client?.name || '');
  const [email, setEmail] = useState(client?.email || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [goals, setGoals] = useState(client?.goals || '');
  const [notes, setNotes] = useState(client?.notes || '');
  const [status, setStatus] = useState(client?.status || 'active');
  const [selectedPlan, setSelectedPlan] = useState(client?.plan_id || null);
  const [saving, setSaving] = useState(false);

  if (!client) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.notFound}>Client not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="secondary" />
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
    { value: 'active', label: 'Active', color: Colors.green },
    { value: 'trial', label: 'Trial', color: Colors.yellow },
    { value: 'inactive', label: 'Inactive', color: Colors.textTertiary },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Client</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.inputGroup}>
            <Text style={styles.label}>NAME *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Client name" placeholderTextColor={Colors.textTertiary} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="email@example.com" placeholderTextColor={Colors.textTertiary} keyboardType="email-address" autoCapitalize="none" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>PHONE</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" placeholderTextColor={Colors.textTertiary} keyboardType="phone-pad" />
          </View>

          {/* Status */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>STATUS</Text>
            <View style={styles.statusRow}>
              {statuses.map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.statusChip, status === s.value && { backgroundColor: `${s.color}18`, borderColor: `${s.color}40` }]}
                  onPress={() => setStatus(s.value)}
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
              <Text style={styles.label}>PLAN</Text>
              <View style={styles.planGrid}>
                <TouchableOpacity style={[styles.planChip, !selectedPlan && styles.planChipActive]} onPress={() => setSelectedPlan(null)}>
                  <Text style={[styles.planChipText, !selectedPlan && styles.planChipTextActive]}>None</Text>
                </TouchableOpacity>
                {plans.map((plan) => (
                  <TouchableOpacity key={plan.id} style={[styles.planChip, selectedPlan === plan.id && styles.planChipActive]} onPress={() => setSelectedPlan(plan.id)}>
                    <Text style={[styles.planChipText, selectedPlan === plan.id && styles.planChipTextActive]}>{plan.name} · ${plan.price}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>GOALS</Text>
            <TextInput style={[styles.input, styles.textArea]} value={goals} onChangeText={setGoals} placeholder="Client goals..." placeholderTextColor={Colors.textTertiary} multiline numberOfLines={3} textAlignVertical="top" />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>NOTES</Text>
            <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} placeholder="Notes about this client..." placeholderTextColor={Colors.textTertiary} multiline numberOfLines={3} textAlignVertical="top" />
          </View>

          <Button title="Save Changes" onPress={handleSave} loading={saving} full size="lg" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  notFound: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: Colors.textSecondary, marginBottom: Spacing.lg },

  inputGroup: { marginBottom: Spacing.lg },
  label: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.8, marginBottom: 6 },
  input: {
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.md, paddingVertical: 12, paddingHorizontal: 14,
    fontFamily: FontFamily.body, fontSize: FontSize.md, color: Colors.textPrimary,
  },
  textArea: { minHeight: 80, paddingTop: 12 },

  statusRow: { flexDirection: 'row', gap: Spacing.sm },
  statusChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: Radius.md,
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textSecondary },

  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  planChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border },
  planChipActive: { backgroundColor: Colors.accentSoft, borderColor: 'rgba(255,95,59,0.3)' },
  planChipText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textSecondary },
  planChipTextActive: { color: Colors.accent },
});
