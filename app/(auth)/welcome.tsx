/**
 * FitLink welcome — "FitLink First Week" entry (canvas 2026-09-06, Main).
 *
 * The promise is the product: a week card whose lime bars rise on a 2.6 s
 * loop under the headline. The monogram reveal was dropped here on purpose —
 * with it, the screen no longer fits a 667pt phone without scrolling. The
 * copy rises in three 320 ms beats; the loop is the only thing that animates
 * after that. Reduce Motion: the bars stand at their final heights, nothing
 * loops, the copy fades in (useReducedMotion is law — .agents/DESIGN.md).
 */
import { useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  type SharedValue,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OB, OBFonts, OBRadius } from '../../constants/onboardingDesign';
import { Motion, Ease } from '../../constants/motion';
import { Wordmark, AccentDot, PrimaryButton, TextButton } from '../../components/onboarding/Editorial';
import { useReducedMotion } from '../../lib/useReducedMotion';

/** The sample week on the card: Tuesday / Thursday / Saturday, lime. */
const SAMPLE_BARS: { letter: string; height: number; on: boolean; delay: number }[] = [
  { letter: 'M', height: 30, on: false, delay: 0 },
  { letter: 'T', height: 72, on: true, delay: 300 },
  { letter: 'W', height: 30, on: false, delay: 120 },
  { letter: 'T', height: 60, on: true, delay: 700 },
  { letter: 'F', height: 30, on: false, delay: 240 },
  { letter: 'S', height: 84, on: true, delay: 1100 },
  { letter: 'S', height: 30, on: false, delay: 360 },
];
const LOOP_MS = 2600;
const RISE_MS = 600;
const RESET_MS = 200;

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const beat1 = useSharedValue(0);
  const beat2 = useSharedValue(0);
  const beat3 = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      beat1.value = withTiming(1, { duration: Motion.reduced });
      beat2.value = withTiming(1, { duration: Motion.reduced });
      beat3.value = withTiming(1, { duration: Motion.reduced });
      return;
    }
    beat1.value = withDelay(80, withTiming(1, { duration: Motion.screen, easing: Ease.out }));
    beat2.value = withDelay(160, withTiming(1, { duration: Motion.screen, easing: Ease.out }));
    beat3.value = withDelay(240, withTiming(1, { duration: Motion.screen, easing: Ease.out }));
  }, [reduceMotion, beat1, beat2, beat3]);

  const beat1Style = useRise(beat1, reduceMotion);
  const beat2Style = useRise(beat2, reduceMotion);
  const beat3Style = useRise(beat3, reduceMotion);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={s.top}>
        <Wordmark />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View style={[s.copy, beat1Style]}>
          <Text style={s.kicker} maxFontSizeMultiplier={1.3}>Your first week</Text>
          <Text style={s.headline} maxFontSizeMultiplier={1.25} accessibilityRole="header">
            Written from{'\n'}three answers.{'\n'}
            <Text style={s.headlineItalic}>Not thirty.</Text>
          </Text>
        </Animated.View>

        <Animated.View
          style={[s.card, beat2Style]}
          accessibilityLabel="A sample week: Strength week, three sessions on Tuesday, Thursday and Saturday. Tuesday first, Lower body A, 45 minutes."
        >
          <View style={s.cardHead}>
            <Text style={s.cardTitle} maxFontSizeMultiplier={1.2}>Strength week</Text>
            <Text style={s.cardTag} maxFontSizeMultiplier={1.2}>3 SESSIONS</Text>
          </View>
          <View style={s.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {SAMPLE_BARS.map((b, i) => <LoopBar key={i} {...b} />)}
          </View>
          <View style={s.cardFoot}>
            <AccentDot />
            <Text style={s.cardFootText} maxFontSizeMultiplier={1.3}>Tuesday first · Lower body A · 45 min</Text>
          </View>
        </Animated.View>

        <Animated.Text style={[s.demoLine, beat3Style]} maxFontSizeMultiplier={1.4}>
          Every session in it has a demo you can watch and a coach, human or AI, who reads what you log.
        </Animated.Text>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        <PrimaryButton label="Build my week" onPress={() => router.push('/(auth)/role' as any)} />
        <TextButton label="I already have a coach" onPress={() => router.push('/(auth)/login' as any)} />
      </View>
    </View>
  );
}

/** 14px rise + fade for one copy beat; a plain fade under Reduce Motion. */
function useRise(v: SharedValue<number>, reduceMotion: boolean) {
  return useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - v.value) * 14 }],
  }));
}

/** One bar of the sample week. Lime bars rise from the base on the loop; grey ones sit still. */
function LoopBar({ letter, height, on, delay }: { letter: string; height: number; on: boolean; delay: number }) {
  const reduceMotion = useReducedMotion();
  const grow = useSharedValue(reduceMotion || !on ? 1 : 0.12);

  useEffect(() => {
    if (reduceMotion || !on) { grow.value = 1; return; }
    // rise (delay + 600) → hold → 200 ms reset; the cycle is always 2.6 s so
    // the three bars stay in step with each other.
    const hold = Math.max(0, LOOP_MS - delay - RISE_MS - RESET_MS);
    grow.value = 0.12;
    grow.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(1, { duration: RISE_MS, easing: Ease.out })),
        withDelay(hold, withTiming(0.12, { duration: RESET_MS, easing: Ease.inOut })),
      ),
      -1,
      false,
    );
  }, [reduceMotion, on, delay, grow]);

  const style = useAnimatedStyle(() => ({
    height: height * grow.value,
    opacity: 0.4 + grow.value * 0.6,
  }));

  return (
    <View style={s.barCol}>
      <View style={[s.barSlot, { height }]}>
        <Animated.View style={[s.bar, on ? s.barOn : s.barOff, style]} />
      </View>
      <Text style={[s.barLetter, on && { color: OB.fg }]} maxFontSizeMultiplier={1.2}>{letter}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OB.bg },
  top: { paddingHorizontal: 24, paddingTop: 34, paddingBottom: 8 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 16 },

  copy: { gap: 12 },
  kicker: { fontFamily: OBFonts.mono, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: OB.accent },
  headline: { fontFamily: OBFonts.display, fontSize: 44, lineHeight: 46, color: OB.fg, letterSpacing: -0.2 },
  headlineItalic: { fontFamily: OBFonts.displayItalic, color: OB.muted },

  card: {
    marginTop: 34, borderRadius: OBRadius.l, borderCurve: 'continuous', backgroundColor: OB.glass,
    borderWidth: 1, borderColor: OB.line, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, gap: 14,
  },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardTitle: { fontFamily: OBFonts.display, fontSize: 22, lineHeight: 26, color: OB.fg },
  cardTag: { fontFamily: OBFonts.mono, fontSize: 11, letterSpacing: 1, color: OB.faint, fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 108 },
  barCol: { flex: 1, alignItems: 'center', gap: 8 },
  barSlot: { width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: OBRadius.s, borderCurve: 'continuous' },
  barOn: { backgroundColor: OB.accent },
  barOff: { backgroundColor: OB.line },
  barLetter: { fontFamily: OBFonts.sans, fontSize: 11, color: OB.faint },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: OB.line, paddingTop: 12 },
  cardFootText: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.muted, flex: 1 },

  demoLine: { marginTop: 18, fontFamily: OBFonts.sans, fontSize: 14, lineHeight: 21, color: OB.muted },

  footer: { paddingHorizontal: 24, paddingTop: 8, gap: 4 },
});
