/**
 * FitLink welcome — editorial onboarding entry (canvas "FitLink Arrival",
 * screen 01). No photography: the monogram (a ring bisected by a rising
 * stroke — two parties, one line between them) inside two concentric
 * hairline rings is the entire visual, with three faint vertical hairlines
 * as the grid motif every later screen aligns to.
 *
 * On mount the outer ring + monogram fade/scale in (1100ms), the lime dot
 * lands last, and the copy rises 16px. Reduce Motion: everything appears in
 * place, no movement (useReducedMotion is law — see .agents/DESIGN.md).
 */
import { useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { OB, OBFonts, OBMotion } from '../../constants/onboardingDesign';
import { Wordmark, Monogram, AccentDot, PrimaryButton, TextButton } from '../../components/onboarding/Editorial';
import { useReducedMotion } from '../../lib/useReducedMotion';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const ringIn = useSharedValue(reduceMotion ? 1 : 0);
  const dotIn = useSharedValue(reduceMotion ? 1 : 0);
  const contentIn = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      ringIn.value = 1;
      dotIn.value = 1;
      contentIn.value = 1;
      return;
    }
    ringIn.value = withTiming(1, { duration: OBMotion.monogram, easing: Easing.out(Easing.cubic) });
    dotIn.value = withDelay(900, withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }));
    contentIn.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [reduceMotion, ringIn, dotIn, contentIn]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringIn.value,
    transform: [{ scale: 0.85 + ringIn.value * 0.15 }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: dotIn.value }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentIn.value,
    transform: [{ translateY: (1 - contentIn.value) * 16 }],
  }));

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Grid motif */}
      <View style={[s.vLine, { left: 97 }]} />
      <View style={[s.vLine, { left: 195 }]} />
      <View style={[s.vLine, { left: 292 }]} />
      <View style={s.hLine} />

      <View style={[s.top, { paddingTop: insets.top + 34 }]}>
        <Wordmark />
      </View>

      <View style={s.monogramWrap}>
        <Animated.View style={[s.ringOuter, ringStyle]}>
          <View style={s.ringOuterLine} />
          <View style={s.ringInnerLine} />
          <Monogram size={72} />
          <Animated.View style={[s.dotWrap, dotStyle]}>
            <AccentDot />
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.View style={[s.content, contentStyle]}>
        <Text style={s.headline} maxFontSizeMultiplier={1.25} accessibilityRole="header">
          Your training.{'\n'}
          <Text style={s.headlineItalic}>Connected.</Text>
        </Text>
        <Text style={s.sub} maxFontSizeMultiplier={1.4}>
          Coaching, sessions, programs and progress, in one place, between you and the person who trains you.
        </Text>
      </Animated.View>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        <View style={s.credRow}>
          <Ionicons name="checkmark" size={14} color={OB.accent} />
          <Text style={s.credText} maxFontSizeMultiplier={1.4}>
            Every coach is identity-verified before they can be paid.
          </Text>
        </View>
        <PrimaryButton label="Get started" onPress={() => router.push('/(auth)/role' as any)} />
        <TextButton label="I already have an account" onPress={() => router.push('/(auth)/login' as any)} />
      </View>
    </View>
  );
}

const RING_OUTER = 168;
const RING_INNER = 120;

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OB.bg },
  vLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: OB.line, opacity: 0.6 },
  hLine: { position: 'absolute', left: 24, right: 24, top: 300, height: 1, backgroundColor: OB.line },

  top: { paddingHorizontal: 24 },

  monogramWrap: { position: 'absolute', left: 0, right: 0, top: 178, alignItems: 'center', justifyContent: 'center' },
  ringOuter: {
    width: RING_OUTER,
    height: RING_OUTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuterLine: {
    position: 'absolute',
    width: RING_OUTER,
    height: RING_OUTER,
    borderRadius: RING_OUTER / 2,
    borderWidth: 1,
    borderColor: OB.line,
  },
  ringInnerLine: {
    position: 'absolute',
    width: RING_INNER,
    height: RING_INNER,
    borderRadius: RING_INNER / 2,
    borderWidth: 1,
    borderColor: OB.line,
  },
  dotWrap: { position: 'absolute', top: -3, alignSelf: 'center' },

  content: { position: 'absolute', left: 24, right: 24, top: 440, gap: 16 },
  headline: {
    fontFamily: OBFonts.display,
    fontSize: 46,
    lineHeight: 48,
    color: OB.fg,
    letterSpacing: -0.5,
  },
  headlineItalic: { fontFamily: OBFonts.displayItalic, color: OB.muted },
  sub: { fontFamily: OBFonts.sans, fontSize: 15, lineHeight: 23, color: OB.muted },

  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 24, gap: 8 },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingBottom: 10 },
  credText: { fontFamily: OBFonts.sans, fontSize: 13, lineHeight: 18, color: OB.muted, flex: 1 },
});
