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
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import { OB, OBFonts, OBSpace, OBMotion, OBRadius } from '../../constants/onboardingDesign';
import {
  Screen, TopNav, Headline, Sub, Wordmark, Monogram, AccentDot,
  PrimaryButton, TextButton, Pill, RadioRow, Segment, Glass, Hairline,
} from '../../components/onboarding/Editorial';
import { loadDraft, saveDraft, type CoachingMode } from '../../lib/onboardingDraft';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { PACKAGE_TYPE } from '../../lib/revenuecat-sdk';
import { DEFAULT_CHARACTER } from '../../lib/soloCharacters';

type OnboardingPath = 'coach' | 'solo';

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

type Step = 'goals' | 'preferences' | 'path' | 'arrival';
const STEP_ORDER: Step[] = ['goals', 'preferences', 'path', 'arrival'];
const STEP_NUM: Record<Step, number> = { goals: 2, preferences: 3, path: 4, arrival: 5 };
const STEP_TOTAL = 5;

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

/** Days in an intro-offer period, from the store's unit fields — same
 *  inputs SoloPaywall reads, converted to a single number for copy like
 *  "a 7-day free trial". */
function introDays(intro: { periodNumberOfUnits: number; periodUnit: string } | null | undefined): number | null {
  if (!intro) return null;
  const n = intro.periodNumberOfUnits;
  switch (intro.periodUnit) {
    case 'DAY': return n;
    case 'WEEK': return n * 7;
    case 'MONTH': return n * 30;
    case 'YEAR': return n * 365;
    default: return null;
  }
}

/* ── Screen ─────────────────────────────────────────────────────────── */

export default function IntakeScreen() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('goals');
  const dirRef = useRef<1 | -1>(1);

  const [goals, setGoals] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationKey | null>(null);
  const [mode, setMode] = useState<CoachingMode | null>(null);
  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDraft().then((d) => {
      if (d.goals?.length) setGoals(d.goals);
      const loc = d.locations?.[0] as LocationKey | undefined;
      if (loc) setLocation(loc);
      if (d.mode) setMode(d.mode);
      if (d.path) setPath(d.path as OnboardingPath);
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
    goToStep('path', 1);
  };

  const onDecideLater = () => {
    // Deliberately not saved — the athlete deferred this question.
    setLocation(null);
    setMode(null);
    goToStep('path', 1);
  };

  const onContinuePath = async () => {
    if (!path) return;
    await saveDraft({ path });
    goToStep('arrival', 1);
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await saveDraft({ goals, locations: location ? [location] : [], mode: mode ?? undefined, path: path ?? undefined });
      router.push('/(auth)/account?role=client' as any);
    } finally {
      // This screen stays mounted under the account screen; without the
      // reset, coming back showed "Save my FitLink" stuck in its spinner.
      setSaving(false);
    }
  };

  return (
    <Screen footer={<Footer step={step} onContinueGoals={onContinueGoals} onContinuePreferences={onContinuePreferences} onDecideLater={onDecideLater} onContinuePath={onContinuePath} onSave={onSave} goals={goals} location={location} path={path} saving={saving} />}>
      {step !== 'arrival' && <TopNav step={STEP_NUM[step]} total={STEP_TOTAL} onBack={onBack} />}
      <StepTransition step={step} dir={dirRef.current}>
        {step === 'goals' && <GoalsStep goals={goals} setGoals={setGoals} />}
        {step === 'preferences' && (
          <PreferencesStep location={location} setLocation={setLocation} mode={mode} setMode={setMode} />
        )}
        {step === 'path' && <PathStep path={path} setPath={setPath} />}
        {step === 'arrival' && <ArrivalStep goals={goals} location={location} mode={mode} path={path} onBack={onBack} />}
      </StepTransition>
    </Screen>
  );
}

/* ── Footer (varies per step) ───────────────────────────────────────── */

function Footer({
  step, onContinueGoals, onContinuePreferences, onDecideLater, onContinuePath, onSave, goals, location, path, saving,
}: {
  step: Step;
  onContinueGoals: () => void;
  onContinuePreferences: () => void;
  onDecideLater: () => void;
  onContinuePath: () => void;
  onSave: () => void;
  goals: string[];
  location: LocationKey | null;
  path: OnboardingPath | null;
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
  if (step === 'path') {
    return <PrimaryButton label="Continue" onPress={onContinuePath} disabled={!path} />;
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

/* ── Path step ──────────────────────────────────────────────────────── */

function PathStep({ path, setPath }: { path: OnboardingPath | null; setPath: (p: OnboardingPath) => void }) {
  const { offerings } = useRevenueCat();

  const monthlyPkg =
    offerings?.availablePackages.find((p) => p.packageType === PACKAGE_TYPE.MONTHLY) ??
    offerings?.availablePackages?.[0] ??
    null;
  const annualPkg = offerings?.availablePackages.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ?? null;

  const priceString = monthlyPkg?.product.priceString ?? null;
  const annualPriceString = annualPkg?.product.priceString ?? null;
  const intro = monthlyPkg?.product.introPrice;
  const hasTrial = !!intro && intro.price === 0;
  const trialDays = hasTrial ? introDays(intro) : null;

  let soloPriceLine: string;
  if (!priceString) {
    soloPriceLine = 'Price shown in the store';
  } else {
    soloPriceLine = `${priceString} a month`;
    if (hasTrial && trialDays) soloPriceLine += ` after a ${trialDays}-day free trial`;
    if (annualPriceString) soloPriceLine += ` · or ${annualPriceString} a year`;
  }

  const choose = (p: OnboardingPath) => {
    Haptics.selectionAsync();
    setPath(p);
  };

  return (
    <View style={s.body}>
      <View style={s.intro}>
        <Headline>How do you want to train?</Headline>
        <Sub>Both start from what you just told us. You can switch later.</Sub>
      </View>
      <View style={s.doors}>
        <DoorCard
          icon="search-outline"
          title="Find a coach"
          label="Human coaching"
          description="Browse verified coaches by goal, days and time of day. They set the price. You pay in the app."
          selected={path === 'coach'}
          onPress={() => choose('coach')}
        />
        <DoorCard
          icon="mic-outline"
          title="Go solo with Reyes"
          label="AI corner · premium"
          description="An AI corner that reads what you log, says one true thing and gives one instruction, in a voice you choose."
          priceLine={soloPriceLine}
          footNote="Cancel any time. Nothing is charged until you start."
          selected={path === 'solo'}
          onPress={() => choose('solo')}
        />
      </View>
      <View style={s.pathNoteRow}>
        <AccentDot />
        <Text style={s.pathNoteText} maxFontSizeMultiplier={1.4}>
          Switch between them whenever you like. Nothing you logged is lost.
        </Text>
      </View>
    </View>
  );
}

function DoorCard({
  icon, title, label, description, priceLine, footNote, selected, onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  label: string;
  description: string;
  priceLine?: string;
  footNote?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.door, selected && s.doorOn, pressed && { opacity: 0.9 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${description}`}
    >
      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={s.doorContent}>
        <Ionicons name={icon} size={24} color={OB.fg} />
        <Text style={[s.doorTitle, selected && s.doorTitleOn]} maxFontSizeMultiplier={1.25}>{title}</Text>
        <Text style={s.doorDesc} maxFontSizeMultiplier={1.4}>{description}</Text>
        {priceLine ? <Text style={s.doorPrice} maxFontSizeMultiplier={1.4}>{priceLine}</Text> : null}
        {footNote ? <Text style={s.doorFoot} maxFontSizeMultiplier={1.4}>{footNote}</Text> : null}
        <Text style={s.doorLabel} maxFontSizeMultiplier={1.3}>{label}</Text>
      </View>
    </Pressable>
  );
}

/* ── Arrival step ───────────────────────────────────────────────────── */

function ArrivalStep({
  goals, location, mode, path,
}: {
  goals: string[];
  location: LocationKey | null;
  mode: CoachingMode | null;
  path: OnboardingPath | null;
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

  const isSolo = path === 'solo';
  const g = goalsSentence(goals);
  const m = isSolo ? `${DEFAULT_CHARACTER.name} will read every session you log.` : secondSentence(mode, location);
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
        {isSolo ? (
          <Headline size={40} lineHeight={44}>Your corner{'\n'}is ready.</Headline>
        ) : (
          <Headline size={40} lineHeight={44}>Your FitLink{'\n'}is ready.</Headline>
        )}
        <Sub>{sub}</Sub>
      </View>
      <Animated.View style={[s.arrivalGlassWrap, panelStyle]}>
        <Glass>
          {isSolo ? (
            <>
              <Animated.View style={[s.glassRow, row0Style]}>
                <Ionicons name="mic-outline" size={20} color={OB.fg} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.kicker} maxFontSizeMultiplier={1.4}>Your voice</Text>
                  <Text style={s.rowTitle} maxFontSizeMultiplier={1.4}>Choose who is in your corner</Text>
                </View>
              </Animated.View>
              <Hairline />
              <Animated.View style={[s.glassRow, row1Style]}>
                <Ionicons name="sunny-outline" size={20} color={OB.fg} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.kicker} maxFontSizeMultiplier={1.4}>Daily brief</Text>
                  <Text style={s.rowTitle} maxFontSizeMultiplier={1.4}>A spoken line every morning, from your data</Text>
                </View>
              </Animated.View>
              <Hairline />
              <Animated.View style={[s.glassRow, row2Style]}>
                <Ionicons name="people-outline" size={20} color={OB.fg} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.kicker} maxFontSizeMultiplier={1.4}>A human, any time</Text>
                  <Text style={s.rowTitle} maxFontSizeMultiplier={1.4}>Add a coach later without losing a thing</Text>
                </View>
              </Animated.View>
            </>
          ) : (
            <>
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
                  <Text style={s.kicker} maxFontSizeMultiplier={1.4}>Train solo</Text>
                  <Text style={s.rowTitle} maxFontSizeMultiplier={1.4}>An AI corner in your ear, from day one</Text>
                </View>
              </Animated.View>
            </>
          )}
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

  doors: { paddingHorizontal: OBSpace.screen, paddingTop: 32, gap: 14 },
  door: {
    minHeight: 44, borderRadius: OBRadius.l, borderCurve: 'continuous',
    borderWidth: 1, borderColor: OB.line, backgroundColor: OB.glass, overflow: 'hidden',
  },
  doorOn: { borderColor: OB.accent },
  doorContent: { padding: 20, gap: 8 },
  doorTitle: { fontFamily: OBFonts.display, fontSize: 26, lineHeight: 30, color: OB.fg },
  doorTitleOn: { color: OB.accent },
  doorDesc: { fontFamily: OBFonts.sans, fontSize: 14, lineHeight: 20, color: OB.muted },
  doorPrice: { fontFamily: OBFonts.sansMedium, fontSize: 14, color: OB.fg, marginTop: 2 },
  doorFoot: { fontFamily: OBFonts.sans, fontSize: 12, color: OB.faint },
  doorLabel: { fontFamily: OBFonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: OB.faint, marginTop: 4 },
  pathNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: OBSpace.screen, paddingTop: 24 },
  pathNoteText: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.muted, flex: 1 },

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
