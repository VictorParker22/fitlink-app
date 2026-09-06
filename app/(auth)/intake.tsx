/**
 * FitLink athlete intake — "FitLink First Week" (canvas 2026-09-06).
 *
 * Three answers, then the week: Goal (one tile) → Rhythm (days + where) →
 * Writing (2.4 s, the answers quoted back) → Reveal (the drafted week, and
 * the coach-or-corner fork under it). The account comes after the reveal.
 * One file, four internal steps so the step transition (320 ms fade + 16 px
 * slide; Reduce Motion: 200 ms crossfade) is driven locally.
 *
 * Answers persist to the on-device draft (lib/onboardingDraft.ts) and are
 * applied to the real profile once an account exists (applyOnboardingDraft,
 * from AuthContext on SIGNED_IN). The week shown on the reveal is a draft
 * from a template table below — the coach or the corner writes the real one,
 * and the card says so.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, BackHandler, Platform, AccessibilityInfo,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';

import { OB, OBFonts, OBSpace, OBRadius } from '../../constants/onboardingDesign';
import { Motion, Ease } from '../../constants/motion';
import { Screen, Headline, Sub, PrimaryButton } from '../../components/onboarding/Editorial';
import {
  SegmentBar, Tile, DayStrip, OptionPills, PlanCard,
  DAY_NAME, sortDays, type DayKey,
} from '../../components/onboarding/Plan';
import { loadDraft, saveDraft, GOAL_LABEL, type GoalKey } from '../../lib/onboardingDraft';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { supabase } from '../../lib/supabase';

type OnboardingPath = 'coach' | 'solo';
type Setting = 'gym' | 'home' | 'outdoors';
type Step = 'goal' | 'rhythm' | 'writing' | 'reveal';

const STEP_ORDER: Step[] = ['goal', 'rhythm', 'writing', 'reveal'];
const SESSION_MINUTES = 45;

/* ── Copy tables ────────────────────────────────────────────────────── */

const GOAL_TILES: { key: GoalKey; title: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'strength', title: 'Get stronger', desc: 'Weight on the bar is the score.', icon: 'barbell-outline' },
  { key: 'fat_loss', title: 'Lose fat', desc: 'Keep the strength you have.', icon: 'flame-outline' },
  { key: 'return', title: 'Get back into it', desc: 'Slower start, room to miss a day.', icon: 'refresh-outline' },
  { key: 'pain', title: 'Train around pain', desc: 'Tell your coach what hurts, later.', icon: 'bandage-outline' },
];

const WEEK_NAME: Record<GoalKey, string> = {
  strength: 'Strength week',
  fat_loss: 'Lean week',
  return: 'Restart week',
  pain: 'Careful week',
};

/** Plan-card footer on the Goal step, before any day is tapped. */
const GOAL_FOOT: Record<GoalKey, string> = {
  strength: 'Compound lifts first. Days come next.',
  fat_loss: 'Lifting stays, conditioning joins. Days come next.',
  return: 'An easy first week. Days come next.',
  pain: 'Pain-free ranges first. Days come next.',
};

/** The Writing screen quotes the goal back. */
const GOAL_QUOTE: Record<GoalKey, string> = {
  strength: 'Strength, compound lifts first',
  fat_loss: 'Fat loss, strength kept',
  return: 'A restart, slower first week',
  pain: 'Trained around what hurts',
};

const SETTING_OPTIONS: { key: Setting; label: string }[] = [
  { key: 'gym', label: 'Gym' },
  { key: 'home', label: 'Home' },
  { key: 'outdoors', label: 'Outdoors' },
];

// Wording follows the equipment each setting unlocks in solo-program
// (supabase/functions/solo-program/sample.ts EQUIPMENT_BY_LOCATION).
const SETTING_ASSUMED: Record<Setting, string> = {
  gym: 'Gym equipment assumed.',
  home: 'Dumbbells and bands assumed.',
  outdoors: 'Bodyweight and bands assumed.',
};

const SETTING_QUOTE: Record<Setting, string> = {
  gym: `Full gym, ${SESSION_MINUTES} minutes a session`,
  home: `Dumbbells and bands, ${SESSION_MINUTES} minutes a session`,
  outdoors: `Bodyweight and bands, ${SESSION_MINUTES} minutes a session`,
};

/* ── Week template ──────────────────────────────────────────────────── */

type Session = { title: string; detail: string; exercises: number };

/**
 * Drafted sessions per goal. `short` covers 1-2 days (full-body), `long`
 * is taken in order for 3-7 days. Only a draft: the coach or the corner
 * (solo-program) writes the real week, so the reveal card says so.
 */
const SESSIONS: Record<GoalKey, { short: Session[]; long: Session[] }> = {
  strength: {
    short: [
      { title: 'Full body A', detail: 'Squat, press, row', exercises: 6 },
      { title: 'Full body B', detail: 'Hinge, pull, lunge', exercises: 6 },
    ],
    long: [
      { title: 'Lower body A', detail: 'Squat, hinge, lunge', exercises: 6 },
      { title: 'Upper body push', detail: 'Press, dips, lateral raise', exercises: 5 },
      { title: 'Upper body pull', detail: 'Row, pull-up, curl', exercises: 5 },
      { title: 'Lower body B', detail: 'Deadlift, split squat, calf', exercises: 6 },
      { title: 'Full body', detail: 'Squat, press, row', exercises: 6 },
      { title: 'Arms and core', detail: 'Curl, extension, carries', exercises: 5 },
      { title: 'Recovery', detail: 'Walk, mobility, light rows', exercises: 4 },
    ],
  },
  fat_loss: {
    short: [
      { title: 'Full body strength', detail: 'Squat, press, row', exercises: 6 },
      { title: 'Strength and intervals', detail: 'Hinge, pull, bike', exercises: 5 },
    ],
    long: [
      { title: 'Full body strength A', detail: 'Squat, press, row', exercises: 6 },
      { title: 'Conditioning', detail: 'Bike, sled, carries', exercises: 4 },
      { title: 'Full body strength B', detail: 'Hinge, pull, lunge', exercises: 6 },
      { title: 'Steady cardio', detail: 'Incline walk or run', exercises: 3 },
      { title: 'Upper body', detail: 'Press, row, arms', exercises: 5 },
      { title: 'Lower body', detail: 'Squat, hinge, calf', exercises: 5 },
      { title: 'Recovery walk', detail: 'Easy pace, mobility', exercises: 3 },
    ],
  },
  return: {
    short: [
      { title: 'Full body, easy', detail: 'Squat, push, pull', exercises: 5 },
      { title: 'Move and mobilise', detail: 'Hips, shoulders, core', exercises: 5 },
    ],
    long: [
      { title: 'Full body, easy', detail: 'Squat, push, pull', exercises: 5 },
      { title: 'Mobility', detail: 'Hips, shoulders, core', exercises: 5 },
      { title: 'Full body, easy B', detail: 'Hinge, press, row', exercises: 5 },
      { title: 'Zone 2 cardio', detail: 'Walk, bike or row', exercises: 3 },
      { title: 'Full body C', detail: 'Lunge, pull, carry', exercises: 5 },
      { title: 'Mobility B', detail: 'Ankles, thoracic, core', exercises: 5 },
      { title: 'Recovery walk', detail: 'Easy pace', exercises: 2 },
    ],
  },
  pain: {
    short: [
      { title: 'Pain-free full body', detail: 'Leg press, row, press', exercises: 5 },
      { title: 'Mobility and core', detail: 'Hips, thoracic, core', exercises: 6 },
    ],
    long: [
      { title: 'Pain-free lower', detail: 'Leg press, hinge, calf', exercises: 5 },
      { title: 'Pain-free upper', detail: 'Landmine press, row', exercises: 5 },
      { title: 'Mobility and core', detail: 'Hips, thoracic, core', exercises: 6 },
      { title: 'Zone 2 cardio', detail: 'Bike or walk', exercises: 3 },
      { title: 'Pain-free full body', detail: 'Leg press, row, press', exercises: 5 },
      { title: 'Mobility B', detail: 'Ankles, shoulders, core', exercises: 5 },
      { title: 'Recovery walk', detail: 'Easy pace', exercises: 2 },
    ],
  },
};

function draftWeek(goal: GoalKey, days: DayKey[]): { day: DayKey; session: Session }[] {
  const t = SESSIONS[goal];
  const list = days.length <= 2 ? t.short : t.long;
  return days.map((day, i) => ({ day, session: list[i % list.length] }));
}

function daysQuote(days: DayKey[]): string {
  if (days.length === 7) return 'Every day';
  return days.map((d) => DAY_NAME[d]).join(', ');
}

function rhythmFooter(days: DayKey[], setting: Setting | null): string {
  const first = days[0] ? `${DAY_NAME[days[0]]} first.` : 'Pick the days.';
  const where = setting ? SETTING_ASSUMED[setting] : 'Then where.';
  return `${first} ${where}`;
}

/** Days in an intro-offer period, from the store's unit fields — same
 *  inputs SoloPaywall reads, converted to a single number for copy like
 *  "7 days free". */
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

  const [step, setStep] = useState<Step>('goal');
  const dirRef = useRef<1 | -1>(1);

  const [goal, setGoal] = useState<GoalKey | null>(null);
  const [days, setDays] = useState<DayKey[]>([]);
  const [setting, setSetting] = useState<Setting | null>(null);
  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [saving, setSaving] = useState(false);
  const [demoCount, setDemoCount] = useState<number | null>(null);

  useEffect(() => {
    loadDraft().then((d) => {
      if (d.goal && d.goal in GOAL_LABEL) setGoal(d.goal);
      if (d.trainingDays?.length) setDays(sortDays(d.trainingDays));
      const loc = d.locations?.[0];
      if (loc && SETTING_OPTIONS.some((o) => o.key === loc)) setSetting(loc as Setting);
      if (d.path) setPath(d.path);
    });
  }, []);

  // The Writing screen quotes the library size. Real or omitted: the count
  // is the same pool solo-program draws from (global rows with a demo and
  // instructions; exercises is readable before sign-in), fetched here so it
  // has landed by the time the screen shows. No number until it does.
  useEffect(() => {
    let alive = true;
    supabase
      .from('exercises')
      .select('id', { count: 'exact', head: true })
      .eq('is_custom', false)
      .not('image_url', 'is', null)
      .neq('instructions', '')
      .then(({ count, error }) => {
        if (alive && !error && typeof count === 'number' && count > 0) setDemoCount(count);
      });
    return () => { alive = false; };
  }, []);

  const goToStep = (next: Step, dir: 1 | -1) => {
    dirRef.current = dir;
    setStep(next);
  };

  const stepBack = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) {
      // Back from the reveal (or a cancelled Writing) lands on Rhythm.
      goToStep(step === 'reveal' ? 'rhythm' : STEP_ORDER[idx - 1], -1);
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

  const onNextGoal = async () => {
    if (!goal) return;
    await saveDraft({ goal, goals: [GOAL_LABEL[goal]] });
    goToStep('rhythm', 1);
  };

  const onWriteWeek = async () => {
    if (!setting || days.length === 0) return;
    await saveDraft({ days: days.length, trainingDays: days, locations: [setting] });
    goToStep('writing', 1);
  };

  const onWritten = useCallback(() => goToStep('reveal', 1), []);

  const onKeep = async () => {
    if (saving || !goal || !path) return;
    setSaving(true);
    try {
      await saveDraft({
        goal,
        goals: [GOAL_LABEL[goal]],
        days: days.length,
        trainingDays: days,
        locations: setting ? [setting] : [],
        path,
      });
      router.push('/(auth)/account?role=client' as any);
    } finally {
      // This screen stays mounted under the account screen; without the
      // reset, coming back showed the button stuck in its spinner.
      setSaving(false);
    }
  };

  const footer =
    step === 'goal' ? <PrimaryButton label="Next" onPress={onNextGoal} disabled={!goal} />
    : step === 'rhythm' ? <PrimaryButton label="Write my week" onPress={onWriteWeek} disabled={!setting || days.length === 0} />
    : step === 'reveal' ? (
      <View style={{ gap: 10 }}>
        <PrimaryButton label="Keep this week" onPress={onKeep} disabled={!path} loading={saving} />
        <Text style={s.footnote} maxFontSizeMultiplier={1.4}>Email or phone. Your week is saved either way.</Text>
      </View>
    )
    : null;

  const segments = step === 'goal' ? 1 : step === 'rhythm' ? 2 : step === 'reveal' ? 3 : 0;

  return (
    <Screen footer={footer}>
      {step === 'writing' ? <View style={s.navSpacer} /> : <SegmentBar step={segments} total={3} onBack={onBack} />}
      <StepTransition step={step} dir={dirRef.current}>
        {step === 'goal' && <GoalStep goal={goal} setGoal={setGoal} />}
        {step === 'rhythm' && goal && (
          <RhythmStep goal={goal} days={days} setDays={setDays} setting={setting} setSetting={setSetting} />
        )}
        {step === 'writing' && goal && setting && (
          <WritingStep goal={goal} days={days} setting={setting} demoCount={demoCount} onDone={onWritten} />
        )}
        {step === 'reveal' && goal && (
          <RevealStep goal={goal} days={days} path={path} setPath={setPath} />
        )}
      </StepTransition>
    </Screen>
  );
}

/* ── Step transition wrapper ────────────────────────────────────────── */

function StepTransition({ step, dir, children }: { step: Step; dir: 1 | -1; children: React.ReactNode }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: reduceMotion ? Motion.reduced : Motion.screen,
      easing: Ease.out,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: reduceMotion ? 0 : (1 - progress.value) * 16 * dir }],
  }));

  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

/* ── Goal step ──────────────────────────────────────────────────────── */

function GoalStep({ goal, setGoal }: { goal: GoalKey | null; setGoal: (g: GoalKey) => void }) {
  const tile = (t: typeof GOAL_TILES[number]) => (
    <Tile
      key={t.key}
      icon={<Ionicons name={t.icon} size={28} color={goal === t.key ? OB.accent : OB.fg} />}
      title={t.title}
      desc={t.desc}
      selected={goal === t.key}
      onPress={() => setGoal(t.key)}
    />
  );
  return (
    <ScrollView style={s.body} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.intro}>
        <Headline>What is this week for?</Headline>
        <Sub>One tap. The week rewrites itself around it.</Sub>
      </View>
      <View style={s.grid} accessibilityRole="radiogroup">
        <View style={s.gridRow}>{GOAL_TILES.slice(0, 2).map(tile)}</View>
        <View style={s.gridRow}>{GOAL_TILES.slice(2, 4).map(tile)}</View>
      </View>
      <View style={s.spacer} />
      <PlanCard
        title={goal ? WEEK_NAME[goal] : 'Your week'}
        tag="FORMING"
        bars={[false, false, false, false, false, false, false]}
        footer={goal ? GOAL_FOOT[goal] : 'Pick a goal. The week takes its shape from it.'}
        style={s.plan}
      />
    </ScrollView>
  );
}

/* ── Rhythm step ────────────────────────────────────────────────────── */

function RhythmStep({
  goal, days, setDays, setting, setSetting,
}: {
  goal: GoalKey;
  days: DayKey[];
  setDays: (d: DayKey[]) => void;
  setting: Setting | null;
  setSetting: (s: Setting) => void;
}) {
  const n = days.length;
  const bars = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as DayKey[]).map((k) => days.includes(k));
  return (
    <ScrollView style={s.body} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={s.intro}>
        <Headline>Tap the days you'll show up.</Headline>
        <Sub>Not the days that sound impressive. Every tap lands in the week below.</Sub>
      </View>
      <View style={s.stripWrap}>
        <DayStrip value={days} onChange={setDays} />
        <View style={s.hintRow}>
          {/* Honest hint: the plan is built around 3 (solo-program's default). */}
          <View style={s.hintPill}><Text style={s.hintPillText} maxFontSizeMultiplier={1.3}>Built around 3 a week</Text></View>
          <Text style={s.hintText} maxFontSizeMultiplier={1.3}>
            {n === 0 ? 'Tap at least one.' : `You picked ${n}.`}
          </Text>
        </View>
      </View>
      <View style={s.whereWrap}>
        <Text style={s.kicker} maxFontSizeMultiplier={1.3}>Where</Text>
        <OptionPills options={SETTING_OPTIONS} value={setting} onChange={setSetting} />
      </View>
      <View style={s.spacer} />
      <PlanCard
        title={WEEK_NAME[goal]}
        tag={n > 0 ? `${n} ${n === 1 ? 'SESSION' : 'SESSIONS'}` : 'FORMING'}
        tagAccent={n > 0}
        bars={bars}
        footer={rhythmFooter(days, setting)}
        style={s.plan}
      />
    </ScrollView>
  );
}

/* ── Writing step ───────────────────────────────────────────────────── */

const RING = 148;
const RING_R = 66;
const RING_C = 2 * Math.PI * RING_R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const WRITE_MS = 2400;
const WRITE_MS_REDUCED = 900;
const LINE_AT = [500, 1100, 1700];
const LINE_AT_REDUCED = [100, 300, 500];

function WritingStep({
  goal, days, setting, demoCount, onDone,
}: {
  goal: GoalKey;
  days: DayKey[];
  setting: Setting;
  demoCount: number | null;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const draw = useSharedValue(0);
  const ringIn = useSharedValue(reduceMotion ? 0 : 1);
  const [landed, setLanded] = useState(0);
  const icon = GOAL_TILES.find((t) => t.key === goal)?.icon ?? 'barbell-outline';
  const lines = [GOAL_QUOTE[goal], daysQuote(days), SETTING_QUOTE[setting]];

  useEffect(() => {
    const total = reduceMotion ? WRITE_MS_REDUCED : WRITE_MS;
    const at = reduceMotion ? LINE_AT_REDUCED : LINE_AT;
    // Cross-platform announcement (accessibilityLiveRegion is Android-only).
    AccessibilityInfo.announceForAccessibility(`Writing your week. ${lines.join('. ')}.`);
    if (reduceMotion) {
      draw.value = 1;
      ringIn.value = withTiming(1, { duration: Motion.reduced });
    } else {
      draw.value = withTiming(1, { duration: total, easing: Ease.out });
    }
    const timers = at.map((ms, i) => setTimeout(() => {
      setLanded(i + 1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, ms));
    const done = setTimeout(onDone, total);
    return () => { timers.forEach(clearTimeout); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING_C * (1 - draw.value) }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ringIn.value }));

  return (
    <View style={s.writing}>
      <View style={s.ringWrap}>
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke={OB.line} strokeWidth={1.5} fill="none" />
            <AnimatedCircle
              cx={RING / 2} cy={RING / 2} r={RING_R}
              stroke={OB.accent} strokeWidth={1.5} strokeLinecap="round" fill="none"
              strokeDasharray={`${RING_C} ${RING_C}`}
              animatedProps={ringProps}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
        </Animated.View>
        <Ionicons name={icon} size={44} color={OB.fg} />
      </View>
      <Text style={s.writingTitle} maxFontSizeMultiplier={1.25} accessibilityRole="header">Writing your week.</Text>
      <View style={s.lines}>
        {lines.map((line, i) => (
          <QuotedLine key={line} text={line} shown={landed > i} />
        ))}
      </View>
      <View style={s.spacer} />
      <Text style={s.writingFoot} maxFontSizeMultiplier={1.4}>
        {demoCount ? `Every pick has a demo. ${demoCount.toLocaleString()} in the library.` : 'Every pick has a demo.'}
      </Text>
    </View>
  );
}

function QuotedLine({ text, shown }: { text: string; shown: boolean }) {
  const reduceMotion = useReducedMotion();
  const inV = useSharedValue(0);
  const check = useSharedValue(0);

  useEffect(() => {
    if (!shown) return;
    if (reduceMotion) {
      inV.value = withTiming(1, { duration: Motion.reduced });
      check.value = withTiming(1, { duration: Motion.reduced });
      return;
    }
    inV.value = withTiming(1, { duration: Motion.screen, easing: Ease.out });
    check.value = withDelay(300, withTiming(1, { duration: Motion.quick, easing: Ease.out }));
  }, [shown, reduceMotion, inV, check]);

  const lineStyle = useAnimatedStyle(() => ({
    opacity: inV.value,
    transform: [{ translateX: reduceMotion ? 0 : (1 - inV.value) * -6 }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: reduceMotion ? 1 : 0.6 + check.value * 0.4 }],
  }));

  return (
    <Animated.View style={[s.line, lineStyle]} accessibilityElementsHidden={!shown} importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}>
      <Animated.View style={[s.check, checkStyle]}>
        <Ionicons name="checkmark" size={12} color={OB.onAccent} />
      </Animated.View>
      <Text style={s.lineText} maxFontSizeMultiplier={1.3}>{text}</Text>
    </Animated.View>
  );
}

/* ── Reveal step ────────────────────────────────────────────────────── */

const ROW_STAGGER = 80;
const ROWS_AT = 500;
const FORK_AT = 900;

function RevealStep({
  goal, days, path, setPath,
}: {
  goal: GoalKey;
  days: DayKey[];
  path: OnboardingPath | null;
  setPath: (p: OnboardingPath) => void;
}) {
  const reduceMotion = useReducedMotion();
  const cardIn = useSharedValue(0);
  const forkIn = useSharedValue(0);
  const week = draftWeek(goal, days);
  const first = days[0] ? DAY_NAME[days[0]] : 'Monday';

  const { athletePlan } = useRevenueCat();
  const monthlyPkg = athletePlan.monthly ?? athletePlan.annual;
  const annualPkg = athletePlan.annual;
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
    if (hasTrial && trialDays) soloPriceLine = `${trialDays} days free, then ${soloPriceLine}`;
    if (annualPriceString) soloPriceLine += ` · or ${annualPriceString} a year`;
  }

  useEffect(() => {
    // ONE success haptic for the reveal; the tiles carry their own selection tick.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility(`Your week is written. ${first} first.`);
    if (reduceMotion) {
      cardIn.value = withTiming(1, { duration: Motion.reduced });
      forkIn.value = withTiming(1, { duration: Motion.reduced });
      return;
    }
    cardIn.value = withTiming(1, { duration: Motion.moment, easing: Ease.out });
    forkIn.value = withDelay(FORK_AT, withTiming(1, { duration: Motion.screen, easing: Ease.out }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardIn.value,
    transform: reduceMotion
      ? []
      : [{ translateY: (1 - cardIn.value) * 18 }, { scale: 0.98 + cardIn.value * 0.02 }],
  }));
  const forkStyle = useAnimatedStyle(() => ({
    opacity: forkIn.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - forkIn.value) * 18 }],
  }));

  return (
    <ScrollView style={s.body} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.revealIntro}>
        <Text style={[s.kicker, { color: OB.accent }]} maxFontSizeMultiplier={1.3}>Your week is written</Text>
        <Headline>{first} first.</Headline>
      </View>

      <Animated.View style={[s.week, cardStyle]}>
        <View style={s.weekHead}>
          <Text style={s.weekTitle} maxFontSizeMultiplier={1.2}>{WEEK_NAME[goal]}</Text>
          <Text style={s.weekTag} maxFontSizeMultiplier={1.2}>{`${week.length} × ${SESSION_MINUTES} MIN`}</Text>
        </View>
        {week.map((w, i) => (
          <SessionRow key={w.day} index={i} day={w.day} session={w.session} first={i === 0} />
        ))}
        <Text style={s.weekNote} maxFontSizeMultiplier={1.4}>
          Drafted from your answers. Your coach or corner finalises it.
        </Text>
      </Animated.View>

      <Animated.View style={[s.fork, forkStyle]}>
        <Text style={s.kicker} maxFontSizeMultiplier={1.3}>Who runs it</Text>
        <View style={s.forkRow} accessibilityRole="radiogroup">
          <Tile
            title="A coach"
            desc="A human reads every log. Free to ask."
            selected={path === 'coach'}
            onPress={() => setPath('coach')}
            minHeight={112}
          />
          <Tile
            title="Solo, with the corner"
            desc="A voice that plans and listens."
            meta={soloPriceLine}
            selected={path === 'solo'}
            onPress={() => setPath('solo')}
            minHeight={112}
          />
        </View>
        <Text style={s.forkNote} maxFontSizeMultiplier={1.4}>
          Switch between them whenever you like. Nothing charged until you start.
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

function SessionRow({ index, day, session, first }: { index: number; day: DayKey; session: Session; first: boolean }) {
  const reduceMotion = useReducedMotion();
  const inV = useSharedValue(0);

  useEffect(() => {
    inV.value = reduceMotion
      ? withTiming(1, { duration: Motion.reduced })
      : withDelay(ROWS_AT + index * ROW_STAGGER, withTiming(1, { duration: Motion.screen, easing: Ease.out }));
  }, [index, reduceMotion, inV]);

  const style = useAnimatedStyle(() => ({
    opacity: inV.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - inV.value) * 12 }],
  }));

  return (
    <Animated.View
      style={[s.session, style]}
      accessibilityLabel={`${DAY_NAME[day]}: ${session.title}. ${session.detail}, ${session.exercises} exercises, ${SESSION_MINUTES} minutes.`}
    >
      <Text style={[s.sessionDay, first && { color: OB.accent }]} maxFontSizeMultiplier={1.2}>{day.toUpperCase()}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.sessionTitle} maxFontSizeMultiplier={1.3}>{session.title}</Text>
        <Text style={s.sessionDetail} maxFontSizeMultiplier={1.3}>
          {`${session.detail} · ${session.exercises} exercises`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={OB.faint} />
    </Animated.View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  body: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 8 },
  spacer: { flex: 1, minHeight: 16 },
  navSpacer: { height: 58 },
  intro: { paddingHorizontal: OBSpace.screen, paddingTop: OBSpace.screen, gap: 10 },
  kicker: { fontFamily: OBFonts.mono, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: OB.faint },
  footnote: { fontFamily: OBFonts.sans, fontSize: 12.5, lineHeight: 17, color: OB.faint, textAlign: 'center' },

  grid: { paddingHorizontal: OBSpace.screen, paddingTop: 24, gap: OBSpace.gap },
  gridRow: { flexDirection: 'row', gap: OBSpace.gap },
  plan: { marginHorizontal: OBSpace.screen, marginTop: 16 },

  stripWrap: { paddingHorizontal: OBSpace.screen, paddingTop: 24, gap: 12 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  hintPill: { height: 30, paddingHorizontal: 12, borderRadius: OBRadius.pill, borderWidth: 1, borderColor: OB.lineStrong, justifyContent: 'center' },
  hintPillText: { fontFamily: OBFonts.sans, fontSize: 12.5, color: OB.muted },
  hintText: { fontFamily: OBFonts.sans, fontSize: 12.5, color: OB.faint },
  whereWrap: { paddingHorizontal: OBSpace.screen, paddingTop: 24, gap: 10 },

  writing: { flex: 1, alignItems: 'center', paddingHorizontal: OBSpace.screen, paddingTop: 48, paddingBottom: 16 },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  writingTitle: { fontFamily: OBFonts.display, fontSize: 34, lineHeight: 38, color: OB.fg, textAlign: 'center', marginTop: 36 },
  lines: { alignSelf: 'stretch', gap: 14, marginTop: 30 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 22, height: 22, borderRadius: 999, backgroundColor: OB.accent, alignItems: 'center', justifyContent: 'center' },
  lineText: { fontFamily: OBFonts.sans, fontSize: 15, lineHeight: 21, color: OB.fg, flex: 1 },
  writingFoot: { fontFamily: OBFonts.sans, fontSize: 13, lineHeight: 19, color: OB.faint, textAlign: 'center', fontVariant: ['tabular-nums'] },

  revealIntro: { paddingHorizontal: OBSpace.screen, paddingTop: 20, gap: 10 },
  week: {
    marginHorizontal: OBSpace.screen, marginTop: 22, borderRadius: OBRadius.l, borderCurve: 'continuous',
    backgroundColor: OB.surface, borderWidth: 1, borderColor: OB.lineStrong, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
  },
  weekHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  weekTitle: { fontFamily: OBFonts.display, fontSize: 24, lineHeight: 28, color: OB.fg, flexShrink: 1 },
  weekTag: { fontFamily: OBFonts.mono, fontSize: 11, letterSpacing: 1, color: OB.faint, fontVariant: ['tabular-nums'] },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, borderTopWidth: 1, borderTopColor: OB.line },
  sessionDay: { width: 34, fontFamily: OBFonts.mono, fontSize: 11, letterSpacing: 1, color: OB.muted },
  sessionTitle: { fontFamily: OBFonts.sansSemiBold, fontSize: 15, color: OB.fg },
  sessionDetail: { fontFamily: OBFonts.sans, fontSize: 12.5, lineHeight: 17, color: OB.muted },
  weekNote: { fontFamily: OBFonts.sans, fontSize: 12, lineHeight: 17, color: OB.faint, paddingTop: 12, borderTopWidth: 1, borderTopColor: OB.line },

  fork: { paddingHorizontal: OBSpace.screen, paddingTop: 22, gap: 10 },
  forkRow: { flexDirection: 'row', gap: OBSpace.gap },
  forkNote: { fontFamily: OBFonts.sans, fontSize: 12.5, lineHeight: 17, color: OB.faint, paddingTop: 2 },
});
