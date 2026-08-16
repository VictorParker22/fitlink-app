import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  Dimensions, Linking, ActivityIndicator, Image,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useReducedMotion } from '../../lib/useReducedMotion';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { onboardedKey } from '../../lib/onboardingFlags';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Three steps. A first-athlete invite used to live here as step 3, duplicating
// the dedicated add-client flow (app/add-client.tsx) in a weaker form — that
// same task is also step 4 of the home checklist. It's been cut from the
// wizard; the done screen below hands off to add-client instead of copying it.
const STEPS = [
  { title: 'Who are your\nathletes training with?', subtitle: 'This is what they see when they open your profile.' },
  { title: 'When do athletes\nbook you?', subtitle: 'Rough hours are fine — you can change any day later.' },
  { title: 'Where should the\nmoney go?', subtitle: 'Athletes pay in the app. Stripe pays out to your bank.' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TrainerWizardScreen() {
  const router = useRouter();
  const { trainer, updateTrainer } = useApp();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const slideAnim = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  const [completionVisible, setCompletionVisible] = useState(false);
  const progressAnim = useSharedValue(1 / STEPS.length);

  const setProgress = (nextStep: number) => {
    progressAnim.value = withTiming((nextStep + 1) / STEPS.length, { duration: reduceMotion ? 0 : 350 });
  };

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value * 100}%`,
  }));

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideAnim.value }],
  }));

  // Step 1 — Profile
  const [name, setName] = useState(trainer?.name || '');
  const [bio, setBio] = useState(trainer?.bio || '');
  const [specialization, setSpecialization] = useState(trainer?.specialization || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handlePickAvatar = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  // Step 2 — Availability
  const [activeDays, setActiveDays] = useState<Record<string, boolean>>(
    DAYS.reduce((acc, day) => ({
      ...acc,
      [day]: !['Saturday', 'Sunday'].includes(day),
    }), {} as Record<string, boolean>)
  );

  // Step 3 — Payments
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeComplete, setStripeComplete] = useState(false);

  const [saving, setSaving] = useState(false);

  const animateToStep = (nextStep: number) => {
    // Reduce Motion: swap steps in place rather than sliding the whole screen
    // sideways, which is the most nausea-inducing motion in the wizard.
    if (reduceMotion) {
      slideAnim.value = 0;
      setStep(nextStep);
      setProgress(nextStep);
      return;
    }
    const direction = nextStep > step ? 1 : -1;
    // Slide current step out, swap step, then slide new step in
    slideAnim.value = withTiming(-direction * SCREEN_WIDTH, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setStep)(nextStep);
        runOnJS(setProgress)(nextStep);
        slideAnim.value = direction * SCREEN_WIDTH;
        slideAnim.value = withTiming(0, { duration: 250 });
      }
    });
  };

  const handleNext = async () => {
    if (step === 0) {
      // Validate & save profile
      if (!name.trim()) return Alert.alert('Required', 'Please enter your name.');
      setSaving(true);

      // Upload avatar if selected
      let avatarUrl: string | undefined;
      if (avatarUri) {
        try {
          setAvatarUploading(true);
          const ext = avatarUri.split('.').pop() || 'jpg';
          const fileName = `${user!.id}/avatar.${ext}`;
          const response = await fetch(avatarUri);
          const blob = await response.blob();
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, blob, { upsert: true, contentType: `image/${ext}` });
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
            avatarUrl = urlData.publicUrl;
          }
        } catch (e) {
          // Avatar upload failure is non-critical — proceed without
        } finally {
          setAvatarUploading(false);
        }
      }

      try {
        await updateTrainer({
          name: name.trim(),
          bio: bio.trim() || undefined,
          specialization: specialization.trim() || undefined,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
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
      // Step 3 (payments) — connect bank, then finish
      await handleConnectBank();
    }
  };

  const handleBack = () => {
    if (step > 0) animateToStep(step - 1);
  };

  const handleStripeSetup = async () => {
    if (!user) return false;
    setStripeLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        'https://qcmtaskhyhwzyoegtfpw.supabase.co/functions/v1/create-connect-account',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            trainerId: user.id,
            email: user.email,
            name: name,
          }),
        }
      );
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      await Linking.openURL(data.url);
      setStripeComplete(true);
      return true;
    } catch (err: any) {
      Alert.alert('Setup Error', err.message || 'Failed to start payment setup');
      return false;
    } finally {
      setStripeLoading(false);
    }
  };

  const handleConnectBank = async () => {
    // Reaching this step IS finishing setup. Stripe can be connected, skipped,
    // or fail — none of that should leave the coach permanently un-onboarded,
    // which is what happened while completion hung off a truthy return here.
    await handleStripeSetup();
    await completeWizard();
  };

  const handleSkipPayments = async () => {
    await completeWizard();
  };

  const completeWizard = async () => {
    const userId = user?.id;
    // Per-account key, so a different coach on this device still sees the
    // wizard and this coach never repeats it (see lib/onboardingFlags.ts).
    if (userId) {
      await SecureStore.setItemAsync(onboardedKey(userId), 'true').catch(() => {});
    }
    // Persist to user_metadata so a fresh device knows too. updateUser RESOLVES
    // with { error } rather than throwing, so the old try/catch never fired and
    // failures were invisible — coaches ended up with no metadata at all.
    try {
      const { error } = await supabase.auth.updateUser({
        data: { wizard_complete: true, onboarded: true },
      });
      if (error) {
        // One retry, then give up quietly — the device flag above still holds
        // for this account on this device.
        const retry = await supabase.auth.updateUser({
          data: { wizard_complete: true, onboarded: true },
        });
        if (retry.error && __DEV__) {
          console.warn('[TrainerWizard] could not persist onboarding metadata:', retry.error.message);
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[TrainerWizard] metadata write threw:', e);
    }
    setCompletionVisible(true);
  };

  const activeDayCount = DAYS.filter(d => activeDays[d]).length;
  const bookableHours = activeDayCount * 8;

  if (completionVisible) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.doneBody}>
          <View style={styles.doneCheckCircle}>
            <Ionicons name="checkmark" size={32} color={CoachColors.onAccent} />
          </View>
          <Text style={styles.doneTitle}>{`You're set up${name.trim() ? `,\n${name.trim().split(' ')[0]}` : ''}`}</Text>
          <Text style={styles.doneSubtitle}>
            {stripeComplete
              ? "Payments are connected and your week is bookable. One thing left before the app has anything to show you."
              : "Your week is bookable — you can connect payments anytime from settings. One thing left before the app has anything to show you."}
          </Text>

          <View style={styles.doneCard}>
            <Text style={styles.doneCardEyebrow}>Last step</Text>
            <Text style={styles.doneCardTitle}>Bring in your first athlete</Text>
            <Text style={styles.doneCardSubtitle}>Someone you already train is the easiest place to start.</Text>
            <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
              style={styles.doneCardBtn}
              onPress={() => router.push('/add-client' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Add an athlete"
            >
              <Text style={styles.doneCardBtnText}>Add an athlete</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.doneFooter}>
          <TouchableOpacity
            onPress={() => router.replace('/(tabs)')}
            accessibilityRole="button"
            accessibilityLabel="Go to my dashboard"
          >
            <Text style={styles.doneFooterLink}>Take me to my dashboard</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        {step > 0 ? (
          <TouchableOpacity hitSlop={4} onPress={handleBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back to previous step">
            <Ionicons name="arrow-back" size={18} color={CoachColors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
        <Text style={styles.stepLabel}>Step {step + 1} of {STEPS.length}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.stepContainer, slideStyle]}>
          {/* Step Title */}
          <View style={styles.titleBlock}>
            <Text style={styles.stepTitle}>{STEPS[step].title}</Text>
            <Text style={styles.stepSubtitle}>{STEPS[step].subtitle}</Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ============ STEP 1: Profile ============ */}
            {step === 0 && (
              <>
                <View style={styles.avatarRow}>
                  <TouchableOpacity
                    onPress={handlePickAvatar}
                    activeOpacity={0.8}
                    style={styles.avatarPickerContainer}
                    accessibilityRole="button"
                    accessibilityLabel="Upload profile photo"
                  >
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.avatarPreview} />
                    ) : (
                      <View style={styles.avatarPlaceholder}>
                        <Ionicons name="person-outline" size={28} color={CoachColors.textFaint} />
                      </View>
                    )}
                    <View style={styles.avatarBadge}>
                      <Ionicons name="camera-outline" size={13} color={CoachColors.onAccent} />
                    </View>
                    {avatarUploading && (
                      <View style={styles.avatarOverlay}>
                        <ActivityIndicator color={CoachColors.textPrimary} />
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.avatarCopy}>
                    <Text style={styles.avatarCopyTitle}>Add a photo</Text>
                    <Text style={styles.avatarCopySub}>Coaches with a photo get roughly twice the replies to an invite.</Text>
                  </View>
                </View>

                <View style={[styles.fieldRow, name.trim() && styles.fieldRowFilled]}>
                  <Text style={styles.fieldLabel}>Your name</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Coach Mike"
                    placeholderTextColor={CoachColors.textFaint}
                    autoFocus
                    accessibilityLabel="Your name"
                  />
                </View>

                <View style={[styles.fieldRow, specialization.trim() && styles.fieldRowFilled]}>
                  <Text style={styles.fieldLabel}>What you coach</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={specialization}
                    onChangeText={setSpecialization}
                    placeholder="Strength & conditioning, HIIT…"
                    placeholderTextColor={CoachColors.textFaint}
                    accessibilityLabel="What you coach"
                  />
                </View>

                <View style={[styles.fieldRow, bio.trim() && styles.fieldRowFilled, { minHeight: 76 }]}>
                  <Text style={styles.fieldLabel}>Short bio</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldTextArea]}
                    value={bio}
                    onChangeText={setBio}
                    placeholder="A sentence or two about how you work…"
                    placeholderTextColor={CoachColors.textFaint}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    accessibilityLabel="Short bio"
                  />
                </View>
              </>
            )}

            {/* ============ STEP 2: Availability ============ */}
            {step === 1 && (
              <View style={{ gap: 8 }}>
                {DAYS.map((day) => {
                  const isActive = activeDays[day];
                  return (
                    <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
                      key={day}
                      style={[styles.dayRow, isActive ? styles.dayRowActive : styles.dayRowInactive]}
                      onPress={() => setActiveDays(prev => ({ ...prev, [day]: !prev[day] }))}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Toggle ${day} ${isActive ? 'off' : 'on'}`}
                    >
                      <View style={[styles.dayCheck, isActive && styles.dayCheckActive]}>
                        {isActive && <Ionicons name="checkmark" size={13} color={CoachColors.onAccent} />}
                      </View>
                      <Text style={[styles.dayName, !isActive && styles.dayNameInactive]}>{day}</Text>
                      <Text style={[styles.dayHours, !isActive && styles.dayHoursInactive]}>
                        {isActive ? '9:00 AM – 5:00 PM' : 'Off'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ============ STEP 3: Payments ============ */}
            {step === 2 && (
              <>
                <View style={styles.payCard}>
                  <Text style={styles.payEyebrow}>On a $180 pass</Text>
                  <View style={styles.payAmountRow}>
                    <Text style={styles.payAmount}>$162</Text>
                    <Text style={styles.payAmountLabel}>reaches you</Text>
                  </View>
                  <View style={styles.paySplitTrack}>
                    <View style={styles.paySplitFill} />
                  </View>
                  <View style={styles.paySplitLabels}>
                    <Text style={styles.paySplitYou}>Your 90%</Text>
                    <Text style={styles.paySplitFee}>FitLink fee 10% · $18</Text>
                  </View>
                  <Text style={styles.payFootnote}>Payouts land 2 business days after an athlete is charged.</Text>
                </View>

                <View style={styles.payInfoList}>
                  <View style={styles.payInfoRow}>
                    <View style={styles.payInfoIcon}>
                      <Ionicons name="lock-closed-outline" size={14} color={CoachColors.accent} />
                    </View>
                    <Text style={styles.payInfoText}>Stripe holds your bank details, not FitLink</Text>
                  </View>
                  <View style={styles.payInfoRow}>
                    <View style={styles.payInfoIcon}>
                      <Ionicons name="time-outline" size={14} color={CoachColors.accent} />
                    </View>
                    <Text style={styles.payInfoText}>Takes about 4 minutes, needs your ID</Text>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </Animated.View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.nextBtn, (saving || stripeLoading) && { opacity: 0.6 }]}
            onPress={handleNext}
            activeOpacity={0.85}
            disabled={saving || stripeLoading}
            accessibilityRole="button"
            accessibilityLabel={step === 2 ? 'Connect my bank' : 'Continue to next step'}
          >
            {(saving || stripeLoading) ? (
              <ActivityIndicator color={CoachColors.onAccent} />
            ) : (
              <Text style={styles.nextBtnText}>{step === 2 ? 'Connect my bank' : 'Continue'}</Text>
            )}
          </TouchableOpacity>

          {step === 1 && (
            <Text style={styles.footerCaption}>{activeDayCount} days a week, {bookableHours} bookable hours</Text>
          )}

          {step === 2 && (
            <TouchableOpacity onPress={handleSkipPayments} disabled={saving || stripeLoading} accessibilityRole="button" accessibilityLabel="Skip payment setup for now">
              <Text style={styles.skipText}>I'll do this later</Text>
            </TouchableOpacity>
          )}
          {step === 2 && (
            <Text style={styles.skipCaption}>You can add athletes now, but not charge them</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 0,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  stepLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textMuted },

  progressTrack: { height: 4, marginHorizontal: 20, marginTop: 14, borderRadius: 2, backgroundColor: CoachColors.borderMuted, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 2 },

  stepContainer: { flex: 1, paddingHorizontal: 20 },
  titleBlock: { marginTop: 26 },
  stepTitle: { fontFamily: CoachFonts.headingBold, fontSize: 26, letterSpacing: -0.7, lineHeight: 30, color: CoachColors.textPrimary },
  stepSubtitle: { fontFamily: CoachFonts.body, fontSize: 13.5, marginTop: 9, lineHeight: 19, color: CoachColors.textSecondary },

  formContent: { paddingTop: 24, paddingBottom: 32, gap: 11 },

  // Avatar
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 13 },
  avatarPickerContainer: { width: 76, height: 76, position: 'relative' },
  avatarPreview: { width: 76, height: 76, borderRadius: 38 },
  avatarPlaceholder: {
    width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13,
    backgroundColor: CoachColors.accent, borderWidth: 2, borderColor: CoachColors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject, borderRadius: 38, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarCopy: { flex: 1 },
  avatarCopyTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  avatarCopySub: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginTop: 3, lineHeight: 17 },

  // Fields
  fieldRow: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13,
  },
  fieldRowFilled: { borderColor: CoachColors.border },
  fieldLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 10.5, color: CoachColors.textFaint },
  fieldInput: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary,
    marginTop: 2, padding: 0,
  },
  fieldTextArea: { minHeight: 44 },

  // Availability
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    borderRadius: 14, paddingHorizontal: 15, paddingVertical: 13, borderWidth: 1,
  },
  dayRowActive: { backgroundColor: CoachColors.surface, borderColor: CoachColors.border },
  dayRowInactive: { backgroundColor: 'transparent', borderColor: CoachColors.borderMuted },
  dayCheck: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dayCheckActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  dayName: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  dayNameInactive: { color: CoachColors.textFaint },
  dayHours: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: '#C9CEC2' },
  dayHoursInactive: { color: CoachColors.textFaint },

  // Payments
  payCard: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 16, padding: 18 },
  payEyebrow: { fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase' },
  payAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 },
  payAmount: { fontFamily: CoachFonts.headingBold, fontSize: 32, letterSpacing: -0.9, color: CoachColors.accent },
  payAmountLabel: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary },
  paySplitTrack: { flexDirection: 'row', height: 8, borderRadius: 999, backgroundColor: CoachColors.border, overflow: 'hidden', marginTop: 14 },
  paySplitFill: { width: '90%', height: '100%', backgroundColor: CoachColors.accent, borderRadius: 999 },
  paySplitLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  paySplitYou: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textSecondary },
  paySplitFee: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted },
  payFootnote: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 12, lineHeight: 17 },

  payInfoList: { marginTop: 9, gap: 11 },
  payInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payInfoIcon: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  payInfoText: { flex: 1, fontFamily: CoachFonts.body, fontSize: 13.5, color: '#C9CEC2' },

  // Footer
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, alignItems: 'center', gap: 9 },
  nextBtn: {
    width: '100%', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.accent, borderRadius: 999, paddingVertical: 15,
  },
  nextBtnText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.onAccent },
  footerCaption: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textFaint },
  skipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textMuted },
  skipCaption: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textFaint },

  // Done screen
  doneBody: { flex: 1, paddingHorizontal: 26, paddingTop: 56 },
  doneCheckCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  doneTitle: { fontFamily: CoachFonts.headingBold, fontSize: 30, letterSpacing: -0.9, lineHeight: 34, color: CoachColors.textPrimary, marginTop: 22 },
  doneSubtitle: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary, marginTop: 11, lineHeight: 20 },

  doneCard: { marginTop: 26, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 16, padding: 18 },
  doneCardEyebrow: { fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase' },
  doneCardTitle: { fontFamily: CoachFonts.headingBold, fontSize: 18, color: CoachColors.textPrimary, marginTop: 6 },
  doneCardSubtitle: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary, marginTop: 6, lineHeight: 18 },
  doneCardBtn: { marginTop: 15, backgroundColor: CoachColors.accent, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  doneCardBtnText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 14, color: CoachColors.onAccent },

  doneFooter: { paddingHorizontal: 26, paddingBottom: 30, alignItems: 'center' },
  doneFooterLink: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textMuted },
});
