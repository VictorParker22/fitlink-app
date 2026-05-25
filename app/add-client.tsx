import { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { useAlert } from '../context/AlertContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';

export default function AddClientScreen() {
  const router = useRouter();
  const { addClient, plans } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { showAlert } = useAlert();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [goals, setGoals] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Name Required', message: 'Please enter a client name.' });

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
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to add client' });
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header matching create-diet/create-workout */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Add Client</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          <View style={styles.section}>
            {/* Avatar Picker Placeholder */}
            <View style={styles.avatarPickerContainer}>
              <TouchableOpacity style={styles.avatarPicker} activeOpacity={0.8}>
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={40} color={colors.textTertiary} />
                </View>
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="camera" size={14} color={colors.white} />
                </View>
              </TouchableOpacity>
              <Text style={styles.avatarPickerText}>Add Photo</Text>
            </View>

            {/* Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. John Smith"
                placeholderTextColor={colors.textTertiary}
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
                placeholderTextColor={colors.textTertiary}
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
                placeholderTextColor={colors.textTertiary}
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
                placeholderTextColor={colors.textTertiary}
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
                placeholderTextColor={colors.textTertiary}
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
              <Ionicons name="share-social" size={24} color={colors.accent} />
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

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary },
  saveBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full },
  saveBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.white },

  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'], paddingTop: Spacing.md },
  
  section: {
    marginBottom: Spacing.xl,
  },

  avatarPickerContainer: { alignItems: 'center', marginBottom: Spacing.xl },
  avatarPicker: { position: 'relative', marginBottom: Spacing.sm },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bgPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarPickerText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.accent },

  inputGroup: { marginBottom: Spacing.xl },
  label: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm },
  input: {
    backgroundColor: colors.bgElevated, borderRadius: Radius.lg, padding: Spacing.md,
    fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border,
  },
  textArea: { height: 100 },

  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  planChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.full,
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
  },
  planChipActive: { backgroundColor: colors.accentSoft, borderColor: `${colors.accent}4D` },
  planChipText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textSecondary },
  planChipTextActive: { fontFamily: FontFamily.bodySemiBold, color: colors.accent },

  inviteCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: colors.bgElevated, borderRadius: Radius.xl, padding: Spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  inviteIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  inviteTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: colors.textPrimary, marginBottom: 2 },
  inviteDesc: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, color: colors.textTertiary, lineHeight: 18 },
  inviteBtn: {
    backgroundColor: colors.textPrimary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.full,
  },
  inviteBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.bgPrimary },
});
