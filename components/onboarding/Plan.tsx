/**
 * Plan — the primitives of the FitLink First Week intake (canvas "FitLink
 * First Week", 2026-09-06): the three-segment progress bar, the goal and
 * fork tiles, the seven-day strip, the equal-width option pills and the
 * plan card whose bars fill as the athlete answers.
 *
 * Motion comes from constants/motion.ts only: tile select = the gesture
 * spring + one selection haptic; day tap = a 240 ms pop; bar growth = 320 ms
 * ease-out; the progress segment fills over 600 ms. Every animation checks
 * useReducedMotion — with it on, everything becomes a 200 ms crossfade.
 */
import { useEffect, type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { OB, OBFonts, OBRadius, OBSpace } from '../../constants/onboardingDesign';
import { Motion, Ease, SpringGesture } from '../../constants/motion';
import { useReducedMotion } from '../../lib/useReducedMotion';

/* ── Days ───────────────────────────────────────────────────────────── */

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LETTER: Record<DayKey, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' };
export const DAY_NAME: Record<DayKey, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

/** Week order, whatever order the athlete tapped in. */
export function sortDays(days: string[]): DayKey[] {
  return DAY_KEYS.filter((k) => days.includes(k));
}

/* ── Progress ───────────────────────────────────────────────────────── */

/**
 * Back chevron, one lime bar in `total` segments, a mono "n / total"
 * counter. `step` is how many segments are filled (0 on the role screen,
 * where the questions have not started). Replaces TopNav for this flow so
 * the denominator never changes between screens.
 */
export function SegmentBar({ step, total = 3, onBack }: { step: number; total?: number; onBack?: () => void }) {
  const complete = step >= total;
  return (
    <View style={s.nav}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={OB.fg} />
        </Pressable>
      ) : <View style={s.backBtn} />}
      <View
        style={s.segments}
        accessibilityRole="progressbar"
        accessibilityLabel={step > 0 ? `Question ${Math.min(step, total)} of ${total}` : `${total} questions ahead`}
        accessibilityValue={{ min: 0, max: total, now: Math.min(step, total) }}
      >
        {Array.from({ length: total }, (_, i) => (
          <Segment key={i} filled={i < step} />
        ))}
      </View>
      <View style={s.counterSlot}>
        {step > 0 ? (
          <Text style={[s.counter, complete && { color: OB.accent }]} maxFontSizeMultiplier={1.2}>
            {`${Math.min(step, total)} / ${total}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Segment({ filled }: { filled: boolean }) {
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    fill.value = reduceMotion
      ? withTiming(filled ? 1 : 0, { duration: Motion.reduced })
      : withTiming(filled ? 1 : 0, { duration: Motion.moment, easing: Ease.out });
  }, [filled, reduceMotion, fill]);

  const style = useAnimatedStyle(() => (
    reduceMotion
      ? { width: '100%', opacity: fill.value }
      : { width: `${fill.value * 100}%`, opacity: 1 }
  ));

  return (
    <View style={s.segTrack}>
      <Animated.View style={[s.segFill, style]} />
    </View>
  );
}

/* ── Tile ───────────────────────────────────────────────────────────── */

/**
 * A large single-select tile: icon, title, one-line description. Fires ONE
 * selection haptic and pops on the gesture spring. Callers must not add a
 * second haptic in onPress.
 */
export function Tile({
  icon, title, desc, meta, selected, onPress, minHeight = 132, style,
}: {
  icon?: ReactNode;
  title: string;
  desc: string;
  /** Optional third line (price, trial) — read into the a11y label too. */
  meta?: string;
  selected: boolean;
  onPress: () => void;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const wash = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    wash.value = withTiming(selected ? 1 : 0, { duration: reduceMotion ? Motion.reduced : Motion.instant });
  }, [selected, reduceMotion, wash]);

  const press = () => {
    Haptics.selectionAsync();
    if (!reduceMotion) {
      scale.value = withSequence(
        withTiming(0.97, { duration: 60 }),
        withSpring(1, SpringGesture),
      );
    }
    onPress();
  };

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.value }));

  return (
    <Animated.View style={[{ flex: 1 }, popStyle, style]}>
      <Pressable
        onPress={press}
        style={({ pressed }) => [s.tile, { minHeight }, selected && s.tileOn, pressed && { opacity: 0.9 }]}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={[title, desc, meta].filter(Boolean).join('. ')}
      >
        <Animated.View style={[StyleSheet.absoluteFill, s.tileWash, washStyle]} pointerEvents="none" />
        {icon ? <View style={s.tileIcon}>{icon}</View> : null}
        <View style={s.tileText}>
          <Text style={[s.tileTitle, selected && { color: OB.accent }]} maxFontSizeMultiplier={1.25}>{title}</Text>
          <Text style={s.tileDesc} maxFontSizeMultiplier={1.4}>{desc}</Text>
          {meta ? <Text style={s.tileMeta} maxFontSizeMultiplier={1.4}>{meta}</Text> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ── Day strip ──────────────────────────────────────────────────────── */

/** Seven 64pt tiles, M T W T F S S. One selection haptic per tap; the tile pops 240 ms. */
export function DayStrip({ value, onChange }: { value: string[]; onChange: (days: DayKey[]) => void }) {
  const toggle = (k: DayKey) => {
    const next = value.includes(k) ? value.filter((d) => d !== k) : [...value, k];
    onChange(sortDays(next));
  };
  return (
    <View style={s.strip} accessibilityRole="none">
      {DAY_KEYS.map((k) => (
        <DayTile key={k} day={k} selected={value.includes(k)} onPress={() => toggle(k)} />
      ))}
    </View>
  );
}

function DayTile({ day, selected, onPress }: { day: DayKey; selected: boolean; onPress: () => void }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const wash = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    wash.value = withTiming(selected ? 1 : 0, { duration: reduceMotion ? Motion.reduced : Motion.instant });
  }, [selected, reduceMotion, wash]);

  const press = () => {
    Haptics.selectionAsync();
    if (!reduceMotion) {
      // 240 ms pop: 0.9 → 1.06 → 1.
      scale.value = withSequence(
        withTiming(0.9, { duration: 40 }),
        withTiming(1.06, { duration: 100, easing: Ease.out }),
        withTiming(1, { duration: 100, easing: Ease.out }),
      );
    }
    onPress();
  };

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.value }));

  return (
    <Animated.View style={[{ flex: 1 }, popStyle]}>
      <Pressable
        onPress={press}
        style={({ pressed }) => [s.day, selected && s.dayOn, pressed && { opacity: 0.9 }]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={DAY_NAME[day]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, s.tileWash, washStyle]} pointerEvents="none" />
        <Text style={[s.dayLetter, selected && { color: OB.accent }]} maxFontSizeMultiplier={1.2}>{DAY_LETTER[day]}</Text>
        <View style={[s.dayDot, selected && s.dayDotOn]} />
      </Pressable>
    </Animated.View>
  );
}

/* ── Option pills ───────────────────────────────────────────────────── */

/** Equal-width single-select pills (the WHERE row). */
export function OptionPills<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (k: T) => void;
}) {
  return (
    <View style={s.pills} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => { Haptics.selectionAsync(); onChange(o.key); }}
            style={({ pressed }) => [s.pill, on && s.pillOn, pressed && { opacity: 0.85 }]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
          >
            <Text style={[s.pillText, on && s.pillTextOn]} maxFontSizeMultiplier={1.3}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Plan card ──────────────────────────────────────────────────────── */

const BAR_OFF = 14;
const BAR_ON = 40;

/**
 * The week forming at the bottom of Goal and Rhythm: a serif title that
 * changes with the goal, a mono tag, seven bars that grow on the days
 * tapped, and one footer line.
 */
export function PlanCard({ title, tag, tagAccent, bars, footer, style }: {
  title: string;
  tag: string;
  tagAccent?: boolean;
  /** Seven booleans, Monday first. */
  bars: boolean[];
  footer: string;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const titleIn = useSharedValue(1);

  useEffect(() => {
    // The name lands: 6px rise + fade, or a plain 200 ms fade under Reduce Motion.
    titleIn.value = 0;
    titleIn.value = withTiming(1, { duration: reduceMotion ? Motion.reduced : Motion.screen, easing: Ease.out });
  }, [title, reduceMotion, titleIn]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleIn.value,
    transform: [{ translateY: reduceMotion ? 0 : (1 - titleIn.value) * 6 }],
  }));

  const onCount = bars.filter(Boolean).length;
  return (
    <View
      style={[s.card, style]}
      accessibilityLabel={`${title}. ${onCount} of 7 days set. ${footer}`}
    >
      <View style={s.cardHead}>
        <Animated.Text style={[s.cardTitle, titleStyle]} maxFontSizeMultiplier={1.2}>{title}</Animated.Text>
        <Text style={[s.cardTag, tagAccent && { color: OB.accent }]} maxFontSizeMultiplier={1.2}>{tag}</Text>
      </View>
      <View style={s.bars} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {DAY_KEYS.map((k, i) => <Bar key={k} on={!!bars[i]} />)}
      </View>
      <Text style={s.cardFoot} maxFontSizeMultiplier={1.3}>{footer}</Text>
    </View>
  );
}

function Bar({ on }: { on: boolean }) {
  const reduceMotion = useReducedMotion();
  const grow = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    grow.value = withTiming(on ? 1 : 0, {
      duration: reduceMotion ? Motion.reduced : Motion.screen,
      easing: Ease.out,
    });
  }, [on, reduceMotion, grow]);

  const heightStyle = useAnimatedStyle(() => ({
    // Reduce Motion: the height is set, only the colour crossfades.
    height: reduceMotion ? (on ? BAR_ON : BAR_OFF) : BAR_OFF + grow.value * (BAR_ON - BAR_OFF),
  }));
  const limeStyle = useAnimatedStyle(() => ({ opacity: grow.value }));

  return (
    <Animated.View style={[s.bar, heightStyle]}>
      <Animated.View style={[StyleSheet.absoluteFill, s.barLime, limeStyle]} />
    </Animated.View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  nav: { height: 58, paddingHorizontal: OBSpace.screen - 12, flexDirection: 'row', alignItems: 'center' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  segments: { flex: 1, flexDirection: 'row', gap: 4, marginHorizontal: 12 },
  segTrack: { flex: 1, height: 3, borderRadius: OBRadius.pill, backgroundColor: OB.line, overflow: 'hidden' },
  segFill: { height: 3, borderRadius: OBRadius.pill, backgroundColor: OB.accent },
  counterSlot: { minWidth: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  counter: { fontFamily: OBFonts.mono, fontSize: 11, color: OB.faint, fontVariant: ['tabular-nums'] },

  tile: {
    flex: 1, borderRadius: OBRadius.l, borderCurve: 'continuous', borderWidth: 1, borderColor: OB.lineStrong,
    backgroundColor: OB.surface, overflow: 'hidden', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 16,
    justifyContent: 'space-between', gap: 12,
  },
  tileOn: { borderColor: OB.accent },
  tileWash: { backgroundColor: OB.accentSoft },
  tileIcon: { height: 28, justifyContent: 'center' },
  tileText: { gap: 4 },
  tileTitle: { fontFamily: OBFonts.sansSemiBold, fontSize: 16, lineHeight: 20, color: OB.fg },
  tileDesc: { fontFamily: OBFonts.sans, fontSize: 12.5, lineHeight: 17, color: OB.muted },
  tileMeta: { fontFamily: OBFonts.sansMedium, fontSize: 12.5, lineHeight: 17, color: OB.fg, marginTop: 4 },

  strip: { flexDirection: 'row', gap: 8 },
  day: {
    height: 64, borderRadius: OBRadius.m, borderCurve: 'continuous', borderWidth: 1, borderColor: OB.lineStrong,
    backgroundColor: OB.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  dayOn: { borderColor: OB.accent },
  dayLetter: { fontFamily: OBFonts.sansSemiBold, fontSize: 16, color: OB.faint },
  dayDot: { width: 5, height: 5, borderRadius: 999, backgroundColor: OB.lineStrong },
  dayDotOn: { backgroundColor: OB.accent },

  pills: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1, height: 46, borderRadius: OBRadius.pill, borderWidth: 1, borderColor: OB.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  pillOn: { backgroundColor: OB.accentSoft, borderColor: OB.accent },
  pillText: { fontFamily: OBFonts.sansMedium, fontSize: 14, color: OB.fg },
  pillTextOn: { fontFamily: OBFonts.sansSemiBold, color: OB.accent },

  card: {
    borderRadius: OBRadius.l, borderCurve: 'continuous', backgroundColor: OB.glass, borderWidth: 1, borderColor: OB.line,
    paddingHorizontal: 20, paddingVertical: 16, gap: 12,
  },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontFamily: OBFonts.display, fontSize: 22, lineHeight: 26, color: OB.fg, flexShrink: 1 },
  cardTag: { fontFamily: OBFonts.mono, fontSize: 11, letterSpacing: 1, color: OB.faint, fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: BAR_ON },
  bar: { flex: 1, borderRadius: OBRadius.s, borderCurve: 'continuous', backgroundColor: OB.line, overflow: 'hidden' },
  barLime: { backgroundColor: OB.accent },
  cardFoot: { fontFamily: OBFonts.sans, fontSize: 13, lineHeight: 18, color: OB.muted },
});
