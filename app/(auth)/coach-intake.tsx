/**
 * (auth)/coach-intake.tsx — the coach branch of the editorial onboarding.
 *
 * Three internal steps, one screen component (design canvas "FitLink
 * Arrival"): specialties → where you coach → arrival. Global step counter
 * reads 02–04 of 04 (role=01, this screen carries the rest); the arrival
 * step drops the counter for the plain Wordmark the mockup uses instead.
 *
 * Answers are staged in lib/onboardingDraft.ts (no account exists yet) and
 * written to trainers.* by applyOnboardingDraft once a session appears.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS, FadeInDown, FadeIn,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { loadDraft, saveDraft, type CoachingMode } from '../../lib/onboardingDraft';
import { OB, OBFonts, OBSpace, OBMotion } from '../../constants/onboardingDesign';
import {
  Screen, TopNav, Headline, Sub, Wordmark, Monogram, AccentDot,
  PrimaryButton, TextButton, Pill, RadioRow, Segment, Glass, Hairline,
} from '../../components/onboarding/Editorial';

const SPECIALTIES = [
  'Strength', 'Hypertrophy', 'Conditioning', 'Mobility', 'Fat loss',
  'Powerlifting', 'Running', 'Combat sports', 'Pre and postnatal', 'Rehab and return to play',
];
const MAX_SPECIALTIES = 4;

const LOCATION_OPTIONS: { key: string; label: string; hint?: string }[] = [
  { key: 'own_gym', label: 'My own gym or studio' },
  { key: 'member_gym', label: "A gym I'm a member of" },
  { key: 'athlete_location', label: 'Their place' },
  { key: 'outdoors', label: 'Outdoors' },
  { key: 'anywhere', label: 'Anywhere', hint: 'Remote-first' },
];

const MODE_OPTIONS: { key: CoachingMode; label: string }[] = [
  { key: 'in_person', label: 'In person' },
  { key: 'remote', label: 'Remote' },
  { key: 'hybrid', label: 'Hybrid' },
];

type Step = 0 | 1 | 2;
const TOTAL_STEPS = 4; // role (01) + this screen's three (02–04)

export default function CoachIntakeScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [step, setStep] = useState<Step>(0);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [mode, setMode] = useState<CoachingMode | null>(null);
  const [saving, setSaving] = useState(false);

  // Hydrate from anything already staged (e.g. the athlete walked back from
  // account.tsx, or resumed a killed session).
  useEffect(() => {
    loadDraft().then((d) => {
      if (d.goals?.length) setSpecialties(d.goals);
      if (d.locations?.length) setLocations(d.locations);
      if (d.mode) setMode(d.mode);
    });
  }, []);

  // ── Step transition: 320ms fade + 16px slide (200ms plain crossfade under
  // Reduce Motion). Manual shared values rather than reanimated's built-in
  // enter/exit presets — those default to full-screen-width slides, and the
  // design calls for a much subtler 16px nudge. ─────────────────────────────
  const opacity = useSharedValue(1);
  const translateX = useSharedValue(0);

  const stepStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  const goToStep = useCallback((next: Step, dir: 1 | -1) => {
    if (reduceMotion) {
      opacity.value = withTiming(0, { duration: OBMotion.reduced / 2 }, (done) => {
        if (done) {
          runOnJS(setStep)(next);
          opacity.value = withTiming(1, { duration: OBMotion.reduced / 2 });
        }
      });
      return;
    }
    const half = OBMotion.screen / 2;
    opacity.value = withTiming(0, { duration: half });
    translateX.value = withTiming(-dir * 16, { duration: half }, (done) => {
      if (done) {
        runOnJS(setStep)(next);
        translateX.value = dir * 16;
        translateX.value = withTiming(0, { duration: half });
        opacity.value = withTiming(1, { duration: half });
      }
    });
  }, [reduceMotion]);

  const handleBack = useCallback(() => {
    if (step > 0) { goToStep((step - 1) as Step, -1); return; }
    router.back();
  }, [step, goToStep, router]);

  // Android hardware back walks the wizard just like the forward chevron —
  // swallowed on step 0 so it falls through to the default pop (back to role).
  useAndroidBack(useCallback(() => {
    if (step > 0) { goToStep((step - 1) as Step, -1); return true; }
    return false;
  }, [step, goToStep]));

  const toggleSpecialty = (label: string) => {
    setSpecialties((prev) => {
      if (prev.includes(label)) return prev.filter((l) => l !== label);
      if (prev.length >= MAX_SPECIALTIES) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return prev;
      }
      return [...prev, label];
    });
  };

  const toggleLocation = (key: string) => {
    setLocations((prev) => (prev.includes(key) ? prev.filter((l) => l !== key) : [...prev, key]));
  };

  const continueFromSpecialties = async () => {
    await saveDraft({ goals: specialties });
    goToStep(1, 1);
  };

  const continueFromWhere = async () => {
    await saveDraft({ locations, mode: mode ?? undefined });
    goToStep(2, 1);
  };

  const decideLater = () => {
    // Advance without persisting this step's answers.
    goToStep(2, 1);
  };

  const saveAndArrive = async () => {
    setSaving(true);
    await saveDraft({ goals: specialties, locations, mode: mode ?? undefined });
    setSaving(false);
    router.push('/(auth)/account?role=trainer' as any);
  };

  return (
    <Screen
      footer={step === 0 ? (
        <PrimaryButton label="Continue" onPress={continueFromSpecialties} disabled={specialties.length === 0} />
      ) : step === 1 ? (
        <>
          <PrimaryButton label="Continue" onPress={continueFromWhere} disabled={locations.length === 0} />
          <TextButton label="Decide later" onPress={decideLater} />
        </>
      ) : (
        <PrimaryButton label="Save my FitLink" onPress={saveAndArrive} loading={saving} />
      )}
    >
      {step < 2 ? (
        <TopNav step={step + 2} total={TOTAL_STEPS} onBack={handleBack} />
      ) : (
        <View style={s.arrivalHeader}><Wordmark /></View>
      )}

      <Animated.View style={[{ flex: 1 }, stepStyle]}>
        {step === 0 && (
          <View style={s.body}>
            <View style={{ gap: 10 }}>
              <Headline>What do you coach?</Headline>
              <Sub>Choose what you would put on the door. Up to four.</Sub>
            </View>

            <View style={s.pillWrap}>
              {SPECIALTIES.map((label) => (
                <Pill key={label} label={label} selected={specialties.includes(label)} onPress={() => toggleSpecialty(label)} />
              ))}
            </View>

            <View style={s.hintRow}>
              {specialties.length > 0 ? <AccentDot /> : <View style={s.ringDot} />}
              <Text style={s.hintText}>
                {specialties.length > 0 ? `${specialties.length} selected · up to 4` : 'Choose at least one'}
              </Text>
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={s.body}>
            <View style={{ gap: 10 }}>
              <Headline>Where do you coach?</Headline>
              <Sub>Athletes filter on this before they see your rate.</Sub>
            </View>

            <View style={s.rowsWrap}>
              {LOCATION_OPTIONS.map((opt) => (
                <RadioRow
                  key={opt.key}
                  label={opt.label}
                  hint={opt.hint}
                  selected={locations.includes(opt.key)}
                  onPress={() => toggleLocation(opt.key)}
                />
              ))}
            </View>

            {locations.length > 0 && (
              <Animated.View
                style={s.modeWrap}
                entering={reduceMotion ? FadeIn.duration(OBMotion.reduced) : FadeInDown.duration(OBMotion.screen)}
              >
                <View style={s.modeLabelRow}>
                  <AccentDot />
                  <Text style={s.modeLabel}>How you work</Text>
                </View>
                <Segment options={MODE_OPTIONS} value={mode} onChange={setMode} />
              </Animated.View>
            )}
          </View>
        )}

        {step === 2 && (
          <View style={s.arrivalBody}>
            <View style={s.glow} />

            <View style={s.monogramWrap}>
              <View style={s.monogramRing}>
                <Monogram size={56} />
                <View style={s.monogramDot} />
              </View>
            </View>

            <View style={s.arrivalCopy}>
              <Headline size={40} lineHeight={44}>{'Your FitLink\nis ready.'}</Headline>
              <Sub>Your roster, programs and payouts live here. Start with the person you already train.</Sub>
            </View>

            <Animated.View
              entering={reduceMotion ? FadeIn.duration(OBMotion.reduced) : FadeInDown.duration(OBMotion.reveal)}
            >
              <Glass style={s.glass}>
                {ARRIVAL_ROWS.map((row, i) => (
                  <View key={row.title}>
                    <Animated.View
                      style={s.arrivalRow}
                      entering={reduceMotion ? FadeIn.duration(OBMotion.reduced) : FadeInDown.duration(400).delay(i * OBMotion.stagger)}
                    >
                      <Ionicons name={row.icon} size={20} color={OB.fg} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={s.arrivalKicker}>{row.kicker}</Text>
                        <Text style={s.arrivalTitle}>{row.title}</Text>
                      </View>
                    </Animated.View>
                    {i < ARRIVAL_ROWS.length - 1 ? <Hairline /> : null}
                  </View>
                ))}
              </Glass>
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </Screen>
  );
}

const ARRIVAL_ROWS: { icon: keyof typeof Ionicons.glyphMap; kicker: string; title: string }[] = [
  { icon: 'people-outline', kicker: 'Clients', title: 'Add your first athlete' },
  { icon: 'calendar-outline', kicker: 'Sessions', title: 'Set the hours you take bookings' },
  { icon: 'trending-up-outline', kicker: 'Business', title: 'Connect payouts when you are ready' },
];

const s = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: OBSpace.screen, paddingTop: 24, gap: 28 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ringDot: { width: 6, height: 6, borderRadius: 999, borderWidth: 1, borderColor: OB.lineStrong },
  hintText: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.muted },

  rowsWrap: { flexDirection: 'column' },
  modeWrap: { gap: 14 },
  modeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeLabel: { fontFamily: OBFonts.sansSemiBold, fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: OB.muted },

  arrivalHeader: { paddingHorizontal: OBSpace.screen, paddingTop: 16, height: 44 },
  arrivalBody: { flex: 1, paddingHorizontal: OBSpace.screen, paddingTop: 32 },
  glow: {
    position: 'absolute', top: -220, left: -140, width: 670, height: 670,
    borderRadius: 999, backgroundColor: 'rgba(198,242,78,0.10)',
  },
  monogramWrap: { alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  monogramRing: {
    width: 120, height: 120, borderRadius: 999, borderWidth: 1, borderColor: OB.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  monogramDot: { position: 'absolute', top: -3, width: 6, height: 6, borderRadius: 999, backgroundColor: OB.accent },
  arrivalCopy: { gap: 12, marginTop: 40 },
  glass: { marginTop: 32 },
  arrivalRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  arrivalKicker: { fontFamily: OBFonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: OB.faint },
  arrivalTitle: { fontFamily: OBFonts.sansMedium, fontSize: 15, color: OB.fg },
});
