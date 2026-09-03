/**
 * FitLink athlete intake — editorial onboarding screens 03-05 (canvas
 * "FitLink Arrival"): Goals, Preferences, Arrival. One file, three internal
 * steps so the step transition (320ms fade + 16px directional slide; Reduce
 * Motion: 200ms crossfade only) can be driven locally without a router
 * round-trip for every question.
 *
 * Answers are persisted to the on-device draft (lib/onboardingDraft.ts) as
 * the athlete progresses, so back/forward within the app never loses them.
 * The draft is applied to the real profile once an account exists
 * (applyOnboardingDraft, called from AuthContext on SIGNED_IN).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import { BackHandler, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { OB, OBFonts, OBSpace, OBMotion } from '../../constants/onboardingDesign';
import {
  Screen, TopNav, Headline, Sub, Wordmark, Monogram, AccentDot,
  PrimaryButton, TextButton, Pill, RadioRow, Segment, Glass, Hairline,
} from '../../components/onboarding/Editorial';
import { loadDraft, saveDraft, type CoachingMode } from '../../lib/onboardingDraft';
import { useReducedMotion } from '../../lib/useReducedMotion';

/* ── Data ───────────────────────────────────────────────────────────── */

const GOAL_OPTIONS = [
  'Strength', 'Performance', 'Muscle', 'Mobility', 'Conditioning',
  'Weight management', 'Accountability', 'Sport-specific training',
];

type LocationKey = 'gym' | 'home' | 'outdoors' | 'coach_location' | 'flexible';

const LOCATION_OPTIONS: { key: LocationKey; label: string; hint?: string }[] = [
  { key: 'gym', label: 'Gym' },
  { key: 'home', label: 'Home' },
  { key: 'outdoors', label: 'Outdoors' },
  { key: 'coach_location', label: "Coach's location" },
  { key: 'flexible', label: 'Flexible', hint: 'Anywhere the plan says' },
];

const MODE_OPTIONS: { key: CoachingMode; label: string }[] = [
  { key: 'in_person', label: 'In person' },
  { key: 'remote', label: 'Remote' },
  { key: 'hybrid', label: 'Hybrid' },
];

const MODE_LABEL: Record<CoachingMode, string> = {
  in_person: 'In-person',
  remote: 'Remote',
  hybrid: 'Hybrid',
};

const LOCATION_WORD: Record<LocationKey, string> = {
  gym: 'gym',
  home: 'home',
  outdoors: 'outdoor sessions',
  coach_location: "coach's place",
  flexible: 'wherever the plan says',
};

type Step = 'goals' | 'preferences' | 'arrival';
const STEP_ORDER: Step[] = ['goals', 'preferences', 'arrival'];
const STEP_NUM: Record<Step, number> = { goals: 2, preferences: 3, arrival: 4 };

/* ── Copy assembly ──────────────────────────────────────────────────── */

function goalsSentence(goals: string[]): string | null {
  if (goals.length === 0) return null;
  const lower = goals.map((g) => g.toLowerCase());
  let joined: string;
  if (lower.length === 1) joined = lower[0];
  else if (lower.length === 2) joined = `${lower[0]} and ${lower[1]}`;
  else joined = `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1) + '.';
}

function secondSentence(mode: CoachingMode | null, location: LocationKey | null): string | null {
  const modeWord = mode ? MODE_LABEL[mode] : null;
  if (location === 'flexible') {
    return modeWord ? `${modeWord} coaching, wherever the plan says.` : 'Training happens wherever the plan says.';
  }
  const locWord = location ? LOCATION_WORD[location] : null;
  if (modeWord && locWord) return `${modeWord} coaching near your ${locWord}.`;
  if (modeWord) return `${modeWord} coaching.`;
  if (locWord) return `Training near your ${locWord}.`;
  return null;
}

/* ── Screen ─────────────────────────────────────────────────────────── */

export default function IntakeScreen() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('goals');
  const dirRef = useRef<1 | -1>(1);

  const [goals, setGoals] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationKey | null>(null);
  const [mode, setMode] = useState<CoachingMode | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDraft().then((d) => {
      if (d.goals?.length) setGoals(d.goals);
      const loc = d.locations?.[0] as LocationKey | undefined;
      if (loc) setLocation(loc);
      if (d.mode) setMode(d.mode);
    });
  }, []);

  const goToStep = (next: Step, dir: 1 | -1) => {
    dirRef.current = dir;
    setStep(next);
  };

  const stepBack = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) {
      goToStep(STEP_ORDER[idx - 1], -1);
      return true;
    }
    return false;
  }, [step]);

  const onBack = () => {
    if (!stepBack()) router.back();
  };

  // Android hardware back walks the wizard's internal steps; the first step
  // falls through to the default pop (back to /(auth)/role).
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', stepBack);
      return () => sub.remove();
    }, [stepBack])
  );

  const onContinueGoals = async () => {
    await saveDraft({ goals });
    goToStep('preferences', 1);
  };

  const onContinuePreferences = async () => {
    await saveDraft({ locations: location ? [location] : [], mode: mode ?? undefined });
    goToStep('arrival', 1);
  };

  const onDecideLater = () => {
    // Deliberately not saved — the athlete deferred this question.
    setLocation(null);
    setMode(null);
    goToStep('arrival', 1);
  };

  const onSave = async () => {
    setSaving(true);
    await saveDraft({ goals, locations: location ? [location] : [], mode: mode ?? undefined });
    router.push('/(auth)/account?role=client' as any);
  };

  return (
    <Screen footer={<Footer step={step} onContinueGoals={onContinueGoals} onContinuePreferences={onContinuePreferences} onDecideLater={onDecideLater} onSave={onSave} goals={goals} location={location} saving={saving} />}>
      {step !== 'arrival' && <TopNav step={STEP_NUM[step]} total={4} onBack={onBack} />}
      <StepTransition step={step} dir={dirRef.current}>
        {step === 'goals' && <GoalsStep goals={goals} setGoals={setGoals} />}
        {step === 'preferences' && (
          <PreferencesStep location={location} setLocation={setLocation} mode={mode} setMode={setMode} />
        )}
        {step === 'arrival' && <ArrivalStep goals={goals} location={location} mode={mode} onBack={onBack} />}
      </StepTransition>
    </Screen>
  );
}

/* ── Footer (varies per step) ───────────────────────────────────────── */

function Footer({
  step, onContinueGoals, onContinuePreferences, onDecideLater, onSave, goals, location, saving,
}: {
  step: Step;
  onContinueGoals: () => void;
  onContinuePreferences: () => void;
  onDecideLater: () => void;
  onSave: () => void;
  goals: string[];
  location: LocationKey | null;
  saving: boolean;
}) {
  if (step === 'goals') {
    return <PrimaryButton label="Continue" onPress={onContinueGoals} disabled={goals.length === 0} />;
  }
  if (step === 'preferences') {
    return (
      <View style={{ gap: 4 }}>
        <PrimaryButton label="Continue" onPress={onContinuePreferences} disabled={!location} />
        <TextButton label="Decide later" onPress={onDecideLater} />
      </View>
    );
  }
  return <PrimaryButton label="Save my FitLink" onPress={onSave} loading={saving} />;
}

/* ── Step transition wrapper ────────────────────────────────────────── */

function StepTransition({ step, dir, children }: { step: Step; dir: 1 | -1; children: React.ReactNode }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduceMotion ? OBMotion.reduced : OBMotion.screen,
      easing: Easing.out(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: reduceMotion ? 0 : (1 - progress.value) * 16 * dir }],
  }));

  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

/* ── Goals step ─────────────────────────────────────────────────────── */

function GoalsStep({ goals, setGoals }: { goals: string[]; setGoals: (g: string[]) => void }) {
  const toggle = (label: string) => {
    setGoals(goals.includes(label) ? goals.filter((g) => g !== label) : [...goals, label]);
  };
  const count = goals.length;

  return (
    <View style={s.body}>
      <View style={s.intro}>
        <Headline>What are you here to build?</Headline>
        <Sub>Choose as many as are true. We match you on these.</Sub>
      </View>
      <View style={s.pillRow}>
        {GOAL_OPTIONS.map((label) => (
          <Pill key={label} label={label} selected={goals.includes(label)} onPress={() => toggle(label)} />
        ))}
      </View>
      <View style={s.countRow}>
        {count > 0 ? <AccentDot /> : <View style={s.countRing} />}
        <Text style={s.countText} maxFontSizeMultiplier={1.4}>
          {count > 0 ? `${count} selected` : 'Choose at least one'}
        </Text>
      </View>
    </View>
  );
}

/* ── Preferences step ───────────────────────────────────────────────── */

function PreferencesStep({
  location, setLocation, mode, setMode,
}: {
  location: LocationKey | null;
  setLocation: (l: LocationKey) => void;
  mode: CoachingMode | null;
  setMode: (m: CoachingMode) => void;
}) {
  const hasLocation = !!location;
  const revealIn = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!hasLocation) { revealIn.value = 0; return; }
    revealIn.value = reduceMotion
      ? withTiming(1, { duration: OBMotion.reduced })
      : withTiming(1, { duration: OBMotion.screen, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, reduceMotion]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: revealIn.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - revealIn.value) * 16 }],
  }));

  return (
    <View style={s.body}>
      <View style={s.intro}>
        <Headline>Where does training happen for you?</Headline>
        <Sub>Pick the usual. Coaches near it will surface first.</Sub>
      </View>
      <View style={s.rows}>
        {LOCATION_OPTIONS.map((opt) => (
          <RadioRow
            key={opt.key}
            label={opt.label}
            hint={opt.hint}
            selected={location === opt.key}
            onPress={() => setLocation(opt.key)}
          />
        ))}
      </View>
      {hasLocation && (
        <Animated.View style={[s.modeSection, revealStyle]}>
          <View style={s.modeLabelRow}>
            <AccentDot />
            <Text style={s.modeLabel} maxFontSizeMultiplier={1.3}>And your coach</Text>
          </View>
          <Segment options={MODE_OPTIONS} value={mode} onChange={setMode} />
        </Animated.View>
      )}
    </View>
  );
}

/* ── Arrival step ───────────────────────────────────────────────────── */

function ArrivalStep({
  goals, location, mode,
}: {
  goals: string[];
  location: LocationKey | null;
  mode: CoachingMode | null;
  onBack: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const panelIn = useSharedValue(reduceMotion ? 1 : 0);
  const row0 = useSharedValue(reduceMotion ? 1 : 0);
  const row1 = useSharedValue(reduceMotion ? 1 : 0);
  const row2 = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      panelIn.value = 1; row0.value = 1; row1.value = 1; row2.value = 1;
      return;
    }
    panelIn.value = withTiming(1, { duration: OBMotion.reveal, easing: Easing.out(Easing.cubic) });
    row0.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    row1.value = withDelay(OBMotion.stagger, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
    row2.value = withDelay(OBMotion.stagger * 2, withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelIn.value,
    transform: [{ translateY: (1 - panelIn.value) * 16 }],
  }));
  const row0Style = useAnimatedStyle(() => ({ opacity: row0.value }));
  const row1Style = useAnimatedStyle(() => ({ opacity: row1.value }));
  const row2Style = useAnimatedStyle(() => ({ opacity: row2.value }));

  const g = goalsSentence(goals);
  const m = secondSentence(mode, location);
  const sub = [g, m, 'Here is what opens next.'].filter(Boolean).join(' ');

  return (
    <View style={s.arrival}>
      <View style={s.glow} pointerEvents="none" />
      <View style={s.arrivalTop}>
        <Wordmark />
      </View>
      <View style={s.arrivalMonogramWrap}>
        <View style={s.arrivalRing}>
          <View style={s.arrivalRingLine} />
          <Monogram size={56} />
          <View style={s.arrivalDotWrap}><AccentDot /></View>
        </View>
      </View>
      <View style={s.arrivalCopy}>
        <Headline size={40} lineHeight={44}>Your FitLink{'\n'}is ready.</Headline>
        <Sub>{sub}</Sub>
      </View>
      <Animated.View style={[s.arrivalGlassWrap, panelStyle]}>
        <Glass>
          <Animated.View style={[s.glassRow, row0Style]}>
            <Ionicons name="search-outline" size={20} color={OB.fg} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.kicker} maxFontSizeMultiplier={1.4}>Coach discovery</Text>
              <Text style={s.rowTitle} maxFontSizeMultiplier={1.4}>Coaches that match your goals</Text>
            </View>
          </Animated.View>
          <Hairline />
          <Animated.View style={[s.glassRow, row1Style]}>
            <Ionicons name="calendar-outline" size={20} color={OB.fg} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.kicker} maxFontSizeMultiplier={1.4}>First session</Text>
              <Text style={s.rowTitle} maxFontSizeMultiplier={1.4}>Book once a coach accepts you</Text>
            </View>
          </Animated.View>
          <Hairline />
          <Animated.View style={[s.glassRow, row2Style]}>
            <Ionicons name="trending-up-outline" size={20} color={OB.fg} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.kicker} maxFontSizeMultiplier={1.4}>Progress</Text>
              <Text style={s.rowTitle} maxFontSizeMultiplier={1.4}>Your baseline, then the trend</Text>
            </View>
          </Animated.View>
        </Glass>
      </Animated.View>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  body: { flex: 1 },
  intro: { paddingHorizontal: OBSpace.screen, paddingTop: OBSpace.screen, gap: 10 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: OBSpace.gap, paddingHorizontal: OBSpace.screen, paddingTop: 36 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: OBSpace.screen, paddingTop: 28 },
  countRing: { width: 6, height: 6, borderRadius: 999, borderWidth: 1, borderColor: OB.lineStrong },
  countText: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.muted },

  rows: { paddingHorizontal: OBSpace.screen, paddingTop: 20 },
  modeSection: { paddingHorizontal: OBSpace.screen, paddingTop: 28, gap: 14 },
  modeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modeLabel: { fontFamily: OBFonts.sansSemiBold, fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: OB.muted },

  arrival: { flex: 1 },
  glow: {
    position: 'absolute', top: -220, left: -140, width: 670, height: 670,
    borderRadius: 335, backgroundColor: 'rgba(198,242,78,0.10)',
  },
  arrivalTop: { paddingHorizontal: OBSpace.screen, paddingTop: 34 },
  arrivalMonogramWrap: { alignItems: 'center', paddingTop: 60 },
  arrivalRing: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  arrivalRingLine: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: OB.lineStrong },
  arrivalDotWrap: { position: 'absolute', top: -3, alignSelf: 'center' },
  arrivalCopy: { paddingHorizontal: OBSpace.screen, paddingTop: 40, gap: 12 },
  arrivalGlassWrap: { paddingHorizontal: OBSpace.screen, paddingTop: 32 },
  glassRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  kicker: { fontFamily: OBFonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: OB.faint },
  rowTitle: { fontFamily: OBFonts.sansMedium, fontSize: 15, color: OB.fg },
});
