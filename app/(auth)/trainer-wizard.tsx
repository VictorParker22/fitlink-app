import { useState, useCallback } from 'react';
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
// Platform-aware wrapper: expo-secure-store has NO web implementation and
// throws on first call. See ../../lib/secureStore.ts.
import * as SecureStore from '../../lib/secureStore';
import { onboardedKey } from '../../lib/onboardingFlags';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useAndroidBack } from '../../hooks/useAndroidBack';

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

// Same derivation the athlete-side match card uses (find-coach.tsx) — the
// preview below must show exactly what an athlete with no avatar would see.
function initials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
}

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
  const [certifications, setCertifications] = useState(trainer?.certifications || '');
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
          certifications: certifications.trim() || undefined,
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

  // Android hardware back walks the wizard, and is swallowed on step 0 — this
  // is post-signup onboarding, so popping the screen would strand a coach with
  // a half-built account.
  useAndroidBack(useCallback(() => {
    if (step > 0) animateToStep(step - 1);
    return true;
  }, [step]));

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
            <Ionicons name="checkmark" size={36} color={CoachColors.onAccent} />
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
            <Ionicons name="arrow-back" size={20} color={CoachColors.textPrimary} />
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
                        <Ionicons name="person-outline" size={31} color={CoachColors.textFaint} />
                      </View>
                    )}
                    <View style={styles.avatarBadge}>
                      <Ionicons name="camera-outline" size={15} color={CoachColors.onAccent} />
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
                    placeholder="Strength · fat loss · beginners"
                    placeholderTextColor={CoachColors.textFaint}
                    accessibilityLabel="What you coach"
                  />
                </View>
                <Text style={styles.fieldHint}>
                  Athletes searching for a coach are matched against these exact words — 'strength', 'fat loss', 'marathon' get found; slogans don't.
                </Text>

                <View style={[styles.fieldRow, bio.trim() && styles.fieldRowFilled, { minHeight: 76 }]}>
                  <Text style={styles.fieldLabel}>Short bio</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldTextArea]}
                    value={bio}
                    onChangeText={setBio}
                    placeholder="I keep busy people strong on three honest sessions a week."
                    placeholderTextColor={CoachColors.textFaint}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    accessibilityLabel="Short bio"
                  />
                </View>
                <Text style={styles.fieldHint}>
                  Write it to one athlete, not a resume. This text is searched too.
                </Text>

                <View style={[styles.fieldRow, certifications.trim() && styles.fieldRowFilled]}>
                  <Text style={styles.fieldLabel}>Certifications — optional</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={certifications}
                    onChangeText={setCertifications}
                    placeholder="NASM CPT, Precision Nutrition L1"
                    placeholderTextColor={CoachColors.textFaint}
                    accessibilityLabel="Certifications, optional"
                  />
                </View>
                <Text style={styles.fieldHint}>
                  Shown on your public profile exactly as written. Leave empty and the section simply doesn't appear.
                </Text>

                {/* Live preview — the same anatomy as the athlete-side match
                    card in find-coach.tsx, fed from this form's state, so a
                    coach sees what "HOMETOWN: New York" would actually look
                    like before it ships. */}
                <View style={styles.previewBlock}>
                  <Text style={styles.previewEyebrow}>How athletes will see you</Text>
                  <View style={styles.previewCard}>
                    <View style={styles.previewHeadRow}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.previewAvatar} />
                      ) : (
                        <View style={styles.previewAvatarFallback}>
                          <Text style={styles.previewAvatarText}>{initials(name)}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.previewName} numberOfLines={1}>
                          {name.trim() || 'Your name'}
                        </Text>
                        {!!specialization.trim() && (
                          <Text style={styles.previewSpec} numberOfLines={1}>
                            {specialization.trim()}
                          </Text>
                        )}
                      </View>
                    </View>
                    {bio.trim() || specialization.trim() ? (
                      !!bio.trim() && (
                        <Text style={styles.previewBio} numberOfLines={3}>
                          {bio.trim()}
                        </Text>
                      )
                    ) : (
                      <Text style={styles.previewEmpty}>
                        Your card is blank — athletes scrolling past see just a name
                      </Text>
                    )}
                  </View>
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
                        {isActive && <Ionicons name="checkmark" size={15} color={CoachColors.onAccent} />}
                      </View>
                      <Text style={[styles.dayName, !isActive && styles.dayNameInactive]}>{day}</Text>
                      <Text style={[styles.dayHours, !isActive && styles.dayHoursInactive]}>
                        {isActive ? '9:00 AM – 5:00 PM' : 'Off'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <Text style={styles.hoursHint}>
                  Athletes filter by when they can train — hours you set here are checked against their answer.
                </Text>
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
                      <Ionicons name="lock-closed-outline" size={16} color={CoachColors.accent} />
                    </View>
                    <Text style={styles.payInfoText}>Stripe holds your bank details, not FitLink</Text>
                  </View>
                  <View style={styles.payInfoRow}>
                    <View style={styles.payInfoIcon}>
                      <Ionicons name="time-outline" size={16} color={CoachColors.accent} />
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
    width: 36, height: 36, borderRadius: 18, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  stepLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textMuted },

  progressTrack: { height: 4, marginHorizontal: 20, marginTop: 14, borderRadius: 2, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 2, borderCurve: 'continuous' },

  stepContainer: { flex: 1, paddingHorizontal: 20 },
  titleBlock: { marginTop: 26 },
  stepTitle: { fontFamily: CoachFonts.headingBold, fontSize: 29, letterSpacing: -0.7, lineHeight: 33.5, color: CoachColors.textPrimary },
  stepSubtitle: { fontFamily: CoachFonts.body, fontSize: 15, marginTop: 9, lineHeight: 21.5, color: CoachColors.textSecondary },

  formContent: { paddingTop: 24, paddingBottom: 32, gap: 11 },

  // Avatar
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 13 },
  avatarPickerContainer: { width: 76, height: 76, position: 'relative' },
  avatarPreview: { width: 76, height: 76, borderRadius: 38, borderCurve: 'continuous' },
  avatarPlaceholder: {
    width: 76, height: 76, borderRadius: 38, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent, borderWidth: 2, borderColor: CoachColors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject, borderRadius: 38, borderCurve: 'continuous', backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarCopy: { flex: 1 },
  avatarCopyTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  avatarCopySub: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 3, lineHeight: 19 },

  // Fields
  fieldRow: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 15, paddingVertical: 16,
  },
  fieldRowFilled: { borderColor: CoachColors.border },
  fieldLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textFaint },
  fieldInput: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textPrimary,
    marginTop: 2, padding: 0,
  },
  fieldTextArea: { minHeight: 53 },
  // Sits directly under its field; the negative top pulls it inside the
  // ScrollView's `gap: 11` so hint and field read as one unit.
  fieldHint: { fontFamily: CoachFonts.body, fontSize: 12.5, lineHeight: 17.5, color: CoachColors.textFaint, marginTop: -5, paddingHorizontal: 4 },

  // Live "how athletes will see you" preview — mirrors the match-card anatomy
  // in app/(client-tabs)/find-coach.tsx (surface card, radius 16, avatar or
  // initials circle, name, specialization line, bio capped at 3 lines).
  previewBlock: { marginTop: 8 },
  previewEyebrow: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 9 },
  previewCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 16, borderCurve: 'continuous', padding: 16,
  },
  previewHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  previewAvatar: { width: 48, height: 48, borderRadius: 999, borderCurve: 'continuous' },
  previewAvatarFallback: {
    width: 48, height: 48, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
  previewAvatarText: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.accent },
  previewName: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.textPrimary },
  previewSpec: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textSecondary, marginTop: 2 },
  previewBio: { fontFamily: CoachFonts.body, fontSize: 14, lineHeight: 20, color: CoachColors.textSecondary, marginTop: 12 },
  previewEmpty: { fontFamily: CoachFonts.body, fontSize: 13.5, lineHeight: 19, color: CoachColors.textFaint, fontStyle: 'italic', marginTop: 12 },

  // Availability
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 15, paddingVertical: 13, borderWidth: 1,
  },
  dayRowActive: { backgroundColor: CoachColors.surface, borderColor: CoachColors.border },
  dayRowInactive: { backgroundColor: 'transparent', borderColor: CoachColors.borderMuted },
  dayCheck: {
    width: 22, height: 22, borderRadius: 6, borderCurve: 'continuous', borderWidth: 1.5, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dayCheckActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  dayName: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary },
  dayNameInactive: { color: CoachColors.textFaint },
  dayHours: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: '#C9CEC2' },
  dayHoursInactive: { color: CoachColors.textFaint },
  hoursHint: { fontFamily: CoachFonts.body, fontSize: 12.5, lineHeight: 17.5, color: CoachColors.textFaint, marginTop: 4, paddingHorizontal: 4 },

  // Payments
  payCard: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 16, borderCurve: 'continuous', padding: 18 },
  payEyebrow: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase' },
  payAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 10 },
  payAmount: { fontFamily: CoachFonts.headingBold, fontSize: 36, letterSpacing: -0.9, color: CoachColors.accent },
  payAmountLabel: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary },
  paySplitTrack: { flexDirection: 'row', height: 8, borderRadius: 999, borderCurve: 'continuous', backgroundColor: CoachColors.border, overflow: 'hidden', marginTop: 14 },
  paySplitFill: { width: '90%', height: '100%', backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous' },
  paySplitLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  paySplitYou: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textSecondary },
  paySplitFee: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted },
  payFootnote: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 12, lineHeight: 19 },

  payInfoList: { marginTop: 9, gap: 11 },
  payInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payInfoIcon: {
    width: 26, height: 26, borderRadius: 13, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  payInfoText: { flex: 1, fontFamily: CoachFonts.body, fontSize: 15, color: '#C9CEC2' },

  // Footer
  // edges={['bottom']} on the enclosing SafeAreaView supplies the home-indicator
  // inset; these paddings are breathing room only (were 24 / 30, which stacked).
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, alignItems: 'center', gap: 9 },
  nextBtn: {
    width: '100%', alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 15,
  },
  nextBtnText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.onAccent },
  footerCaption: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint },
  skipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textMuted },
  skipCaption: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint },

  // Done screen
  doneBody: { flex: 1, paddingHorizontal: 26, paddingTop: 56 },
  doneCheckCircle: {
    width: 64, height: 64, borderRadius: 32, borderCurve: 'continuous', backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  doneTitle: { fontFamily: CoachFonts.headingBold, fontSize: 33.5, letterSpacing: -0.9, lineHeight: 38, color: CoachColors.textPrimary, marginTop: 22 },
  doneSubtitle: { fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textSecondary, marginTop: 11, lineHeight: 22.5 },

  doneCard: { marginTop: 26, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border, borderRadius: 16, borderCurve: 'continuous', padding: 18 },
  doneCardEyebrow: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase' },
  doneCardTitle: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary, marginTop: 6 },
  doneCardSubtitle: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, marginTop: 6, lineHeight: 20 },
  doneCardBtn: { marginTop: 15, backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 13, alignItems: 'center' },
  doneCardBtnText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15.5, color: CoachColors.onAccent },

  doneFooter: { paddingHorizontal: 26, paddingBottom: 12, alignItems: 'center' },
  doneFooterLink: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textMuted },
});
