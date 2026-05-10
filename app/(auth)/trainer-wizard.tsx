import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Share,
  Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STEPS = [
  { title: 'Set Up Your Profile', subtitle: 'Let your clients know who you are' },
  { title: 'Set Your Availability', subtitle: 'Choose which days you train clients' },
  { title: 'Invite Your First Client', subtitle: 'Get started by adding someone to your roster' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TrainerWizardScreen() {
  const router = useRouter();
  const { trainer, updateTrainer, addClient } = useApp();
  const { colors, isDark } = useTheme();

  const [step, setStep] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Step 1 — Profile
  const [name, setName] = useState(trainer?.name || '');
  const [bio, setBio] = useState(trainer?.bio || '');
  const [specialization, setSpecialization] = useState(trainer?.specialization || '');

  // Step 2 — Availability
  const [activeDays, setActiveDays] = useState<Record<string, boolean>>(
    DAYS.reduce((acc, day) => ({
      ...acc,
      [day]: !['Saturday', 'Sunday'].includes(day),
    }), {} as Record<string, boolean>)
  );

  // Step 3 — Invite Client
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientAdded, setClientAdded] = useState(false);

  const [saving, setSaving] = useState(false);

  const animateToStep = (nextStep: number) => {
    const direction = nextStep > step ? 1 : -1;
    // Slide current out
    Animated.timing(slideAnim, {
      toValue: -direction * SCREEN_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      slideAnim.setValue(direction * SCREEN_WIDTH);
      // Slide new in
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNext = async () => {
    if (step === 0) {
      // Validate & save profile
      if (!name.trim()) return Alert.alert('Required', 'Please enter your name.');
      setSaving(true);
      try {
        await updateTrainer({
          name: name.trim(),
          bio: bio.trim() || undefined,
          specialization: specialization.trim() || undefined,
        });
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to save profile');
        setSaving(false);
        return;
      }
      setSaving(false);
      animateToStep(1);
    } else if (step === 1) {
      // Save availability
      const workingHours: Record<string, any> = {};
      DAYS.forEach(day => {
        workingHours[day] = {
          start: '9:00 AM',
          end: '5:00 PM',
          enabled: activeDays[day],
        };
      });
      setSaving(true);
      try {
        await updateTrainer({ working_hours: workingHours });
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Failed to save availability');
        setSaving(false);
        return;
      }
      setSaving(false);
      animateToStep(2);
    } else {
      // Complete wizard
      await completeWizard();
    }
  };

  const handleBack = () => {
    if (step > 0) animateToStep(step - 1);
  };

  const handleAddClient = async () => {
    if (!clientName.trim()) return Alert.alert('Required', 'Please enter a client name.');
    setSaving(true);
    try {
      await addClient({
        name: clientName.trim(),
        email: clientEmail.trim() || undefined,
        status: 'trial',
      });
      setClientAdded(true);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add client');
    } finally {
      setSaving(false);
    }
  };

  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: `Hey! Join me on FitLink to track your workouts and schedule sessions. Download here: https://fitlink.coach`,
        title: 'Join me on FitLink',
      });
    } catch {
      // User cancelled
    }
  };

  const completeWizard = async () => {
    await SecureStore.setItemAsync('fitlink_wizard_complete', 'true');
    router.replace('/(tabs)');
  };

  const progress = (step + 1) / STEPS.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        {step > 0 ? (
          <TouchableOpacity onPress={handleBack} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>Step {step + 1} of {STEPS.length}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.bgElevated }]}>
        <Animated.View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.stepContainer, { transform: [{ translateX: slideAnim }] }]}>
          {/* Step Title */}
          <View style={styles.titleBlock}>
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{STEPS[step].title}</Text>
            <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{STEPS[step].subtitle}</Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ============ STEP 1: Profile ============ */}
            {step === 0 && (
              <>
                <View style={[styles.inputGroup, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Your Name *</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Coach Mike"
                    placeholderTextColor={colors.textTertiary}
                    autoFocus
                  />
                </View>

                <View style={[styles.inputGroup, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Bio</Text>
                  <TextInput
                    style={[styles.textArea, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
                    value={bio}
                    onChangeText={setBio}
                    placeholder="Tell your clients a bit about yourself..."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                <View style={[styles.inputGroup, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                  <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Specialization</Text>
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
                    value={specialization}
                    onChangeText={setSpecialization}
                    placeholder="e.g. Strength & Conditioning, HIIT, Yoga"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </>
            )}

            {/* ============ STEP 2: Availability ============ */}
            {step === 1 && (
              <View style={[styles.daysCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[styles.daysHint, { color: colors.textTertiary }]}>
                  Tap to toggle your training days. You can fine-tune hours later in Settings.
                </Text>
                {DAYS.map((day, i) => {
                  const isActive = activeDays[day];
                  return (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayRow,
                        i < DAYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                      onPress={() => setActiveDays(prev => ({ ...prev, [day]: !prev[day] }))}
                      activeOpacity={0.7}
                    >
                      <View style={styles.dayLeft}>
                        <View style={[
                          styles.dayCheck,
                          { borderColor: isActive ? Colors.accent : colors.borderStrong },
                          isActive && { backgroundColor: Colors.accent, borderColor: Colors.accent },
                        ]}>
                          {isActive && <Ionicons name="checkmark" size={14} color={Colors.white} />}
                        </View>
                        <Text style={[styles.dayName, { color: isActive ? colors.textPrimary : colors.textTertiary }]}>
                          {day}
                        </Text>
                      </View>
                      <Text style={[styles.dayHours, { color: colors.textTertiary }]}>
                        {isActive ? '9:00 AM – 5:00 PM' : 'Off'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ============ STEP 3: Invite Client ============ */}
            {step === 2 && (
              <>
                {!clientAdded ? (
                  <>
                    {/* Manual Add */}
                    <View style={[styles.inputGroup, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                      <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Client Name</Text>
                      <TextInput
                        style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
                        value={clientName}
                        onChangeText={setClientName}
                        placeholder="e.g. Sarah Johnson"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                    <View style={[styles.inputGroup, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                      <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Client Email (optional)</Text>
                      <TextInput
                        style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.bgInput }]}
                        value={clientEmail}
                        onChangeText={setClientEmail}
                        placeholder="sarah@email.com"
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.addClientBtn, { backgroundColor: Colors.accent }]}
                      onPress={handleAddClient}
                      activeOpacity={0.85}
                      disabled={saving}
                    >
                      <Ionicons name="person-add" size={18} color={Colors.white} />
                      <Text style={styles.addClientBtnText}>{saving ? 'Adding...' : 'Add Client'}</Text>
                    </TouchableOpacity>

                    {/* Divider */}
                    <View style={styles.dividerRow}>
                      <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                      <Text style={[styles.dividerText, { color: colors.textTertiary }]}>or</Text>
                      <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    </View>

                    {/* Share Link */}
                    <TouchableOpacity
                      style={[styles.shareBtn, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
                      onPress={handleShareInvite}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="share-outline" size={20} color={Colors.purple} />
                      <Text style={[styles.shareBtnText, { color: colors.textPrimary }]}>Share Invite Link</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={[styles.successCard, { backgroundColor: `${Colors.green}12` }]}>
                    <View style={[styles.successIcon, { backgroundColor: Colors.greenSoft }]}>
                      <Ionicons name="checkmark-circle" size={32} color={Colors.green} />
                    </View>
                    <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Client Added!</Text>
                    <Text style={[styles.successSub, { color: colors.textSecondary }]}>
                      {clientName} has been added to your roster. You can add more clients from the dashboard anytime.
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {step === 2 && !clientAdded && (
            <TouchableOpacity onPress={completeWizard} style={styles.skipBtn}>
              <Text style={[styles.skipText, { color: colors.textTertiary }]}>Skip for now</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, saving && { opacity: 0.6 }]}
            onPress={handleNext}
            activeOpacity={0.85}
            disabled={saving}
          >
            <Text style={styles.nextBtnText}>
              {step === 2 ? (clientAdded ? "Let's Go!" : 'Finish Setup') : 'Continue'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, textTransform: 'uppercase', letterSpacing: 1 },

  progressTrack: { height: 4, marginHorizontal: Spacing.lg, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.accent, borderRadius: 2 },

  stepContainer: { flex: 1, paddingHorizontal: Spacing.lg },
  titleBlock: { marginTop: Spacing.xl, marginBottom: Spacing.xl },
  stepTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 26, letterSpacing: -0.5 },
  stepSubtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: 6, lineHeight: 20 },

  formContent: { paddingBottom: Spacing['3xl'] },

  // Input groups
  inputGroup: { padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, marginBottom: Spacing.md },
  inputLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, marginBottom: Spacing.sm },
  input: { height: 48, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, fontFamily: FontFamily.body, fontSize: FontSize.base },
  textArea: { minHeight: 88, borderRadius: Radius.sm, padding: Spacing.md, fontFamily: FontFamily.body, fontSize: FontSize.base },

  // Day toggles
  daysCard: { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  daysHint: { fontFamily: FontFamily.body, fontSize: FontSize.xs, padding: Spacing.md, paddingBottom: Spacing.sm },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: Spacing.md },
  dayLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dayCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dayName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base },
  dayHours: { fontFamily: FontFamily.body, fontSize: FontSize.xs },

  // Client add
  addClientBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: 14, borderRadius: Radius.md, marginTop: Spacing.sm,
  },
  addClientBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: Colors.white },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.lg },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: 14, borderRadius: Radius.md, borderWidth: 1,
  },
  shareBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base },

  // Success state
  successCard: { alignItems: 'center', padding: Spacing['2xl'], borderRadius: Radius.lg },
  successIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  successTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },
  successSub: { fontFamily: FontFamily.body, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },

  // Footer
  footer: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg, paddingBottom: Spacing.xl,
    borderTopWidth: 1, alignItems: 'center', gap: Spacing.md,
  },
  skipBtn: { paddingVertical: Spacing.xs },
  skipText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 15,
    width: '100%',
    shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  nextBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.white },
});
