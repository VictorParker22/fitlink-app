import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
  Linking, ActivityIndicator, Image,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { Motion, Ease } from '../../constants/motion';
import CelebrationOverlay from '../../components/CelebrationOverlay';
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
import { useAlert } from '../../context/AlertContext';
import { supabase, SUPABASE_URL } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import PermissionCards from '../../components/onboarding/PermissionCards';
import { getNotificationState, requestNotifications, getCameraMicState, requestCameraMic } from '../../lib/permissions';
import { usePaymentSplit, coachKeeps, totalDeduction, bpsToPercentLabel } from '../../lib/platformFee';

// Four stops. A first-athlete invite used to live here as a step, duplicating
// the dedicated add-client flow (app/add-client.tsx) in a weaker form — that
// same task is also step 4 of the home checklist. It's been cut from the
// wizard; the celebration at the end hands off to add-client instead of
// copying it. `stop` is the label on the step strip under the header.
const STEPS = [
  { stop: 'Profile', title: 'Who are your\nathletes training with?', subtitle: 'This is what they see when they open your profile.' },
  { stop: 'Hours', title: 'When do athletes\nbook you?', subtitle: 'Rough hours are fine — you can change any day later.' },
  { stop: 'Tools', title: 'Turn on the tools\nyou’ll coach with', subtitle: 'Each ask has one job. Say yes here and the app never has to interrupt a session to ask.' },
  { stop: 'Payouts', title: 'Where should the\nmoney go?', subtitle: 'Athletes pay in the app. Stripe pays out to your bank.' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// "What you coach" is one free-text field on screen and two columns in the
// database: trainers.specializations (text[], written by the onboarding
// draft and read by matching) and trainers.specialization (the display
// string). The field shows the array joined with " · " and saves both, so
// the two stop diverging after the coach edits here.
const SPEC_JOIN = ' · ';

function specialtiesFromTrainer(t: any): string {
  const list = Array.isArray(t?.specializations)
    ? t.specializations.map((s: unknown) => String(s).trim()).filter(Boolean)
    : [];
  if (list.length) return list.join(SPEC_JOIN);
  return String(t?.specialization || '').trim();
}

function splitSpecialties(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[·,]/)) {
    const s = raw.trim();
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || '';
}

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
  const { showAlert } = useAlert();
  // The worked example on the payments step uses the coach's REAL split
  // (lib/platformFee.ts). Figures are omitted while it is unknown — never a
  // guessed 90/10.
  const { split } = usePaymentSplit(user?.id ?? trainer?.id);
  const EXAMPLE_PRICE = 180;
  const exampleKeeps = split ? coachKeeps(EXAMPLE_PRICE, split) : null;
  const exampleFee = split ? totalDeduction(EXAMPLE_PRICE, split) : null;
  const keepPct = split ? split.coachKeepsBps / 100 : null;

  const [step, setStep] = useState(0);
  const reduceMotion = useReducedMotion();

  const [completionVisible, setCompletionVisible] = useState(false);

  // Stops the coach has finished (saved, or walked past on the permissions
  // step). Drives the lime fill on the strip; going back never un-fills one,
  // because what was saved stays saved.
  const [completed, setCompleted] = useState<boolean[]>(() => STEPS.map(() => false));
  const markCompleted = (i: number) => setCompleted((prev) => prev.map((v, idx) => (idx === i ? true : v)));

  // Step enter: the new step fades in from a 24pt offset on Motion.screen /
  // Ease.out. Reduce Motion: a plain Motion.reduced crossfade, no offset.
  const enterProgress = useSharedValue(1);
  const enterDir = useSharedValue(1);
  const slideStyle = useAnimatedStyle(() => ({
    opacity: enterProgress.value,
    transform: [{ translateX: reduceMotion ? 0 : (1 - enterProgress.value) * 24 * enterDir.value }],
  }));

  // Step 1 — Profile
  const [name, setName] = useState(trainer?.name || '');
  const [bio, setBio] = useState(trainer?.bio || '');
  const [specialization, setSpecialization] = useState(() => specialtiesFromTrainer(trainer));
  const [certifications, setCertifications] = useState(trainer?.certifications || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  // The sign-up already asked for the name (account step → coach-signup →
  // trainers.name). When it is on file the field is folded into a quiet row
  // with an Edit button instead of being asked a third time.
  const nameOnFile = !!(trainer?.name || '').trim();
  const [editingName, setEditingName] = useState(false);
  const showNameField = !nameOnFile || editingName;
  const nameInputRef = useRef<TextInput>(null);

  // The trainer row can arrive after this screen mounts (AppContext hydrates
  // from cache, then from the network). Fill any field the coach has not
  // typed into yet, once.
  const hydratedFromTrainer = useRef(false);
  useEffect(() => {
    if (!trainer || hydratedFromTrainer.current) return;
    hydratedFromTrainer.current = true;
    setName((v) => v || trainer.name || '');
    setBio((v) => v || trainer.bio || '');
    setSpecialization((v) => v || specialtiesFromTrainer(trainer));
    setCertifications((v) => v || trainer.certifications || '');
  }, [trainer]);

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
    enterDir.value = nextStep > step ? 1 : -1;
    // Opacity drops before the swap so the outgoing step never shows at full
    // strength for a frame; the incoming one then rises on the screen curve.
    enterProgress.value = 0;
    setStep(nextStep);
    enterProgress.value = withTiming(
      1,
      reduceMotion ? { duration: Motion.reduced } : { duration: Motion.screen, easing: Ease.out },
    );
  };

  // A stop is done: the strip dot fills, one success haptic (only when
  // something was actually written — see the permissions step).
  const finishStep = (i: number, saved: boolean) => {
    markCompleted(i);
    if (saved) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    animateToStep(i + 1);
  };

  const handleNext = async () => {
    if (step === 0) {
      // Validate & save profile
      if (!name.trim()) return showAlert({ type: 'warning', title: 'Required', message: 'Please enter your name.' });
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
        // `specializations` is not on the Trainer type yet (AppContext owns
        // that); the column exists and the onboarding draft writes it.
        const profileUpdate: Parameters<typeof updateTrainer>[0] & { specializations?: string[] } = {
          name: name.trim(),
          bio: bio.trim() || undefined,
          specialization: specialization.trim() || undefined,
          specializations: splitSpecialties(specialization),
          certifications: certifications.trim() || undefined,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        };
        await updateTrainer(profileUpdate);
      } catch (err: any) {
        showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to save profile' });
        setSaving(false);
        return;
      }
      setSaving(false);
      setEditingName(false);
      finishStep(0, true);
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
        showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to save availability' });
        setSaving(false);
        return;
      }
      setSaving(false);
      finishStep(1, true);
    } else if (step === 2) {
      // Permissions are primed via the cards themselves — Continue moves on
      // whether the coach allowed everything, something, or nothing. Nothing
      // is written here, so the dot fills without a haptic.
      finishStep(2, false);
    } else {
      // Step 4 (payments) — connect bank, then finish
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
        `${SUPABASE_URL}/functions/v1/create-connect-account`,
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
      showAlert({ type: 'error', title: 'Setup error', message: err.message || 'Failed to start payment setup' });
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
    // Every stop is done — the strip fills before the card rises over it.
    setCompleted(STEPS.map(() => true));
    setCompletionVisible(true);
  };

  const activeDayCount = DAYS.filter(d => activeDays[d]).length;
  const bookableHours = activeDayCount * 8;

  const specialtyCount = splitSpecialties(specialization).length;
  const coachFirstName = firstName(name);

  return (
    <View style={styles.container}>
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

      {/* Step strip: the four stops as labelled dots. Done ones fill lime with
          a check, the current one is ringed, the rest wait. */}
      <View
        style={styles.strip}
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step].stop}. ${completed.filter(Boolean).length} of ${STEPS.length} done.`}
      >
        {STEPS.map((s, i) => (
          <View key={s.stop} style={styles.stripStop}>
            {i < STEPS.length - 1 ? <View style={[styles.stripLine, completed[i] && styles.stripLineDone]} /> : null}
            <StepDot done={completed[i]} current={i === step} reduceMotion={reduceMotion} />
            <Text
              style={[styles.stripLabel, i === step && styles.stripLabelCurrent, completed[i] && styles.stripLabelDone]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
            >
              {s.stop}
            </Text>
          </View>
        ))}
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

                {/* The field only mounts when nothing is on file, or the coach
                    just tapped Edit — so its autoFocus is never a cold focus
                    over a saved name. */}
                {showNameField ? (
                  <View style={[styles.fieldRow, name.trim() && styles.fieldRowFilled]}>
                    <Text style={styles.fieldLabel}>Your name</Text>
                    <TextInput
                      ref={nameInputRef}
                      style={styles.fieldInput}
                      value={name}
                      onChangeText={setName}
                      placeholder="e.g. Coach Mike"
                      placeholderTextColor={CoachColors.textFaint}
                      autoFocus
                      accessibilityLabel="Your name"
                    />
                  </View>
                ) : (
                  <View style={styles.nameRow}>
                    <Text style={styles.nameRowText} numberOfLines={1} accessibilityLabel={`Name: ${name.trim()}`}>
                      Name: <Text style={styles.nameRowValue}>{name.trim()}</Text>
                    </Text>
                    <TouchableOpacity
                      onPress={() => setEditingName(true)}
                      style={styles.nameEditBtn}
                      hitSlop={8}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Edit name"
                    >
                      <Text style={styles.nameEditText}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                )}

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

            {/* ============ STEP 3: Permissions ============ */}
            {step === 2 && (
              <PermissionCards
                items={[
                  {
                    key: 'notifications',
                    icon: 'notifications-outline',
                    title: 'Notifications',
                    why: 'A check-in arrives, an athlete messages, a session is about to start. The things you’d want a nudge for — nothing else.',
                    getState: getNotificationState,
                    request: requestNotifications,
                  },
                  {
                    key: 'camera-mic',
                    icon: 'videocam-outline',
                    title: 'Camera & microphone',
                    why: 'Film exercise demos and go live from Studio without the OS stopping you mid-recording to ask.',
                    getState: getCameraMicState,
                    request: requestCameraMic,
                  },
                ]}
              />
            )}

            {/* ============ STEP 4: Payments ============ */}
            {step === 3 && (
              <>
                <View style={styles.payCard}>
                  <Text style={styles.payEyebrow}>On a ${EXAMPLE_PRICE} pass</Text>
                  {split && exampleKeeps != null && exampleFee != null && keepPct != null ? (
                    <>
                      <View style={styles.payAmountRow}>
                        <Text style={styles.payAmount}>${Math.round(exampleKeeps)}</Text>
                        <Text style={styles.payAmountLabel}>reaches you</Text>
                      </View>
                      <View style={styles.paySplitTrack}>
                        <View style={[styles.paySplitFill, { width: `${keepPct}%` }]} />
                      </View>
                      <View style={styles.paySplitLabels}>
                        <Text style={styles.paySplitYou}>Your {bpsToPercentLabel(split.coachKeepsBps)}</Text>
                        <Text style={styles.paySplitFee}>
                          {split.orgShareBps > 0 ? 'Fees' : 'FitLink fee'} {bpsToPercentLabel(split.platformFeeBps + split.orgShareBps)} · ${Math.round(exampleFee)}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.payAmountRow}>
                        <View style={styles.paySkeletonAmount} />
                        <Text style={styles.payAmountLabel}>reaches you</Text>
                      </View>
                      <View style={styles.paySplitTrack} />
                      <View style={styles.paySplitLabels}>
                        <Text style={styles.paySplitYou}>Your share</Text>
                        <Text style={styles.paySplitFee}>Loading your rate…</Text>
                      </View>
                    </>
                  )}
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
            accessibilityLabel={step === 3 ? 'Connect my bank' : 'Continue to next step'}
          >
            {(saving || stripeLoading) ? (
              <ActivityIndicator color={CoachColors.onAccent} />
            ) : (
              <Text style={styles.nextBtnText}>{step === 3 ? 'Connect my bank' : 'Continue'}</Text>
            )}
          </TouchableOpacity>

          {step === 1 && (
            <Text style={styles.footerCaption}>{activeDayCount} days a week, {bookableHours} bookable hours</Text>
          )}

          {step === 3 && (
            <TouchableOpacity onPress={handleSkipPayments} disabled={saving || stripeLoading} accessibilityRole="button" accessibilityLabel="Skip payment setup for now">
              <Text style={styles.skipText}>I'll do this later</Text>
            </TouchableOpacity>
          )}
          {step === 3 && (
            <Text style={styles.skipCaption}>You can add athletes now, but not charge them</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>

    {/* Outside the SafeAreaView so the scrim reaches the screen edges
        (INVARIANTS §5). The overlay fires its own haptic and confetti. */}
    <CelebrationOverlay
      visible={completionVisible}
      kind="coach-live"
      title={coachFirstName ? `You're set up, ${coachFirstName}` : "You're set up"}
      subtitle={stripeComplete
        ? 'Athletes can find you now, and Stripe pays you out.'
        : 'Athletes can find you now. Connect payouts any time from settings.'}
      stat={specialtyCount > 0
        ? { value: String(specialtyCount), label: specialtyCount === 1 ? 'specialty listed' : 'specialties listed' }
        : undefined}
      primary={{ label: 'Bring in your first athlete', onPress: () => router.push('/add-client' as any) }}
      secondary={{ label: 'Go to my dashboard', onPress: () => router.replace('/(tabs)') }}
      onDismiss={() => router.replace('/(tabs)')}
    />
    </View>
  );
}

/**
 * One stop on the step strip. The lime fill scales in on Motion.instant
 * (a chip fill, per constants/motion.ts); Reduce Motion jumps to the end.
 */
function StepDot({ done, current, reduceMotion }: { done: boolean; current: boolean; reduceMotion: boolean }) {
  const fill = useSharedValue(done ? 1 : 0);
  useEffect(() => {
    const to = done ? 1 : 0;
    fill.value = reduceMotion ? to : withTiming(to, { duration: Motion.instant, easing: Ease.out });
  }, [done, reduceMotion, fill]);
  const fillStyle = useAnimatedStyle(() => ({
    opacity: fill.value,
    transform: [{ scale: fill.value }],
  }));
  return (
    <View style={[styles.dot, current && styles.dotCurrent]}>
      {current && !done ? <View style={styles.dotCore} /> : null}
      <Animated.View style={[styles.dotFill, fillStyle]}>
        <Ionicons name="checkmark" size={12} color={CoachColors.onAccent} />
      </Animated.View>
    </View>
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

  // Step strip
  strip: { flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 20, marginTop: 14 },
  stripStop: { flex: 1, alignItems: 'center', gap: 6 },
  // The connector sits at dot mid-height and runs from this stop's centre to
  // the next one's. It is painted before both dots (its own sibling and the
  // later stop), so the dots always sit on top of it.
  stripLine: {
    position: 'absolute', top: 9, left: '50%', right: '-50%', height: 2,
    backgroundColor: CoachColors.borderMuted,
  },
  stripLineDone: { backgroundColor: CoachColors.accent },
  dot: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  dotCurrent: { borderColor: CoachColors.accent },
  dotCore: { width: 6, height: 6, borderRadius: 3, backgroundColor: CoachColors.accent },
  dotFill: {
    ...StyleSheet.absoluteFillObject, borderRadius: 10, backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  stripLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textFaint },
  stripLabelCurrent: { color: CoachColors.textPrimary },
  stripLabelDone: { color: CoachColors.textSecondary },

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
  // Quiet "Name: … · Edit" row shown when trainers.name is already on file.
  nameRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 4, gap: 8 },
  nameRowText: { flex: 1, fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted },
  nameRowValue: { fontFamily: CoachFonts.bodySemiBold, color: CoachColors.textPrimary },
  nameEditBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  nameEditText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.accent },
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
  paySplitFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous' },
  paySkeletonAmount: { width: 96, height: 36, borderRadius: 12, borderCurve: 'continuous', backgroundColor: CoachColors.border },
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
});
