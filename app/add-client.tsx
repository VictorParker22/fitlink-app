import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';

export default function AddClientScreen() {
  const router = useRouter();
  const { addClient, plans } = useApp();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [goals, setGoals] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return Alert.alert('Error', 'Please enter a client name.');

    setSaving(true);
    try {
      await addClient({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        goals: goals.trim() || undefined,
        notes: notes.trim() || undefined,
        plan_id: selectedPlan || undefined,
        status: 'trial',
      });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add client');
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    try {
      await Share.share({
        message: `Hey! Join me on FitLink to track your workouts and schedule sessions. Download here: https://fitlink.coach`,
        title: 'Join me on FitLink',
      });
    } catch (err) {
      // User cancelled share
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header matching create-diet/create-workout */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Client</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          <View style={styles.section}>
            {/* Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John Smith"
                placeholderTextColor={Colors.textTertiary}
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </View>

            {/* Contact Row */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="john@example.com"
                placeholderTextColor={Colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="(555) 123-4567"
                placeholderTextColor={Colors.textTertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            {/* Plan Selection */}
            {plans.length > 0 && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Assign Plan</Text>
                <View style={styles.planGrid}>
                  <TouchableOpacity
                    style={[styles.planChip, !selectedPlan && styles.planChipActive]}
                    onPress={() => setSelectedPlan(null)}
                  >
                    <Text style={[styles.planChipText, !selectedPlan && styles.planChipTextActive]}>None</Text>
                  </TouchableOpacity>
                  {plans.map((plan) => (
                    <TouchableOpacity
                      key={plan.id}
                      style={[styles.planChip, selectedPlan === plan.id && styles.planChipActive]}
                      onPress={() => setSelectedPlan(plan.id)}
                    >
                      <Text style={[styles.planChipText, selectedPlan === plan.id && styles.planChipTextActive]}>
                        {plan.name} · ${plan.price}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Goals */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Fitness Goals</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Lose 20 lbs, run a 5K..."
                placeholderTextColor={Colors.textTertiary}
                value={goals}
                onChangeText={setGoals}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Notes */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Private Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Any additional notes (client cannot see this)..."
                placeholderTextColor={Colors.textTertiary}
                value={notes}
                onChangeText={setNotes}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Invite Section */}
          <View style={styles.inviteCard}>
            <View style={styles.inviteIconWrap}>
              <Ionicons name="share-social" size={24} color={Colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteTitle}>Invite to App</Text>
              <Text style={styles.inviteDesc}>Send them a link to download FitLink and connect to your profile.</Text>
            </View>
            <TouchableOpacity onPress={handleInvite} style={styles.inviteBtn}>
              <Text style={styles.inviteBtnText}>Share</Text>
            </TouchableOpacity>
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
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  saveBtn: { backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full },
  saveBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.white },

  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'], paddingTop: Spacing.md },
  
  section: {
    marginBottom: Spacing.xl,
  },

  inputGroup: { marginBottom: Spacing.xl },
  label: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  input: {
    backgroundColor: Colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md,
    fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textPrimary,
    borderWidth: 1, borderColor: Colors.border,
  },
  textArea: { height: 100 },

  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  planChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
  },
  planChipActive: { backgroundColor: Colors.accentSoft, borderColor: 'rgba(255,95,59,0.3)' },
  planChipText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textSecondary },
  planChipTextActive: { fontFamily: FontFamily.bodySemiBold, color: Colors.accent },

  inviteCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  inviteIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  inviteTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: Colors.textPrimary, marginBottom: 2 },
  inviteDesc: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, color: Colors.textTertiary, lineHeight: 18 },
  inviteBtn: {
    backgroundColor: Colors.textPrimary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full,
  },
  inviteBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.bgPrimary },
});
