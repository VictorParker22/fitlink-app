import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
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
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return Alert.alert('Name required', 'Please enter a client name.');

    setLoading(true);
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
      Alert.alert('Client Added', `${name.trim()} has been added!`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add client');
    } finally {
      setLoading(false);
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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Client</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>FULL NAME *</Text>
            <TextInput
              style={styles.input}
              placeholder="John Smith"
              placeholderTextColor={Colors.textTertiary}
              value={name}
              onChangeText={setName}
              autoFocus
            />
          </View>

          {/* Contact Row */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL</Text>
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
            <Text style={styles.label}>PHONE</Text>
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
              <Text style={styles.label}>PLAN</Text>
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
            <Text style={styles.label}>GOALS</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. Lose 20 lbs, run a 5K..."
              placeholderTextColor={Colors.textTertiary}
              value={goals}
              onChangeText={setGoals}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>NOTES</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any additional notes..."
              placeholderTextColor={Colors.textTertiary}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <Button title="Add Client" onPress={handleSubmit} loading={loading} full size="lg" />

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Invite */}
          <Button
            title="Send Invite Link"
            onPress={handleInvite}
            variant="outline"
            full
            size="lg"
            icon={<Ionicons name="share-social" size={18} color={Colors.accentText} />}
          />
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

  inputGroup: { marginBottom: Spacing.lg },
  label: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.8, marginBottom: 6 },
  input: {
    backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong,
    borderRadius: Radius.md, paddingVertical: 12, paddingHorizontal: 14,
    fontSize: FontSize.md, fontFamily: FontFamily.body, color: Colors.textPrimary,
  },
  textArea: { minHeight: 80, paddingTop: 12 },

  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  planChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: Colors.bgElevated, borderWidth: 1, borderColor: Colors.border,
  },
  planChipActive: { backgroundColor: Colors.accentSoft, borderColor: 'rgba(255,95,59,0.3)' },
  planChipText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textSecondary },
  planChipTextActive: { color: Colors.accent },

  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.xl },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
