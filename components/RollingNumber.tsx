import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, PixelRatio, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useReducedMotion } from '../lib/useReducedMotion';

/**
 * RollingNumber — slot-machine digits for values that change live.
 *
 * Pass the fully formatted string (e.g. "$1,240"). When it changes, each
 * character that differs rolls out upward while the new one rolls in from
 * below (~350ms, staggered ~30ms per character from the left).
 *
 * Characters are keyed by their distance from the RIGHT edge, so when
 * "$99" becomes "$100" the ones/tens columns stay put and roll in place.
 *
 * Reduce Motion: plain text swap, no animation.
 */

const ROLL_MS = 350;
const STAGGER_MS = 30;

interface RollingNumberProps {
  text: string;
  /** Text style — fontSize is required to size the clipping window. */
  style?: StyleProp<TextStyle>;
  /** Overrides the clip height (defaults to fontSize * 1.3). */
  digitHeight?: number;
  accessibilityLabel?: string;
}

export default function RollingNumber({ text, style, digitHeight, accessibilityLabel }: RollingNumberProps) {
  const reduced = useReducedMotion();
  const flat = StyleSheet.flatten(style) || {};
  const fontSize = flat.fontSize ?? 16;
  // Dynamic Type: the digits DO scale (allowFontScaling stays on), so the clip
  // window has to grow with the user's text-size setting or the glyphs get
  // sliced. getFontScale() is the same multiplier RN applies to fontSize.
  const height = digitHeight ?? Math.ceil(fontSize * 1.3 * PixelRatio.getFontScale());

  if (reduced) {
    return (
      <Text
        style={style}
        accessibilityLabel={accessibilityLabel ?? text}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {text}
      </Text>
    );
  }

  const chars = text.split('');

  return (
    <View
      style={rnStyles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? text}
    >
      {chars.map((char, i) => (
        <RollingChar
          // Key by distance from the right so trailing digits keep identity
          // when the string grows or shrinks on the left.
          key={chars.length - i}
          char={char}
          delay={i * STAGGER_MS}
          height={height}
          style={style}
        />
      ))}
    </View>
  );
}

function RollingChar({
  char,
  delay,
  height,
  style,
}: {
  char: string;
  delay: number;
  height: number;
  style?: StyleProp<TextStyle>;
}) {
  // outgoing = the char rolling out; current = the char rolling in / settled.
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [current, setCurrent] = useState(char);
  // 1 = settled on `current`; 0 = start of a roll.
  const progress = useSharedValue(1);

  useEffect(() => {
    if (char === current) return;
    setOutgoing(current);
    setCurrent(char);
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: ROLL_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [char]);

  const incomingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [height, 0]) }],
  }));
  const outgoingStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, -height]) }],
    opacity: interpolate(progress.value, [0, 0.85, 1], [1, 0.4, 0]),
  }));

  return (
    <View style={{ height, overflow: 'hidden', justifyContent: 'center' }}>
      <Animated.Text
        style={[style, { lineHeight: height }, incomingStyle]}
        numberOfLines={1}
      >
        {current}
      </Animated.Text>
      {outgoing !== null && (
        <Animated.Text
          style={[style, rnStyles.outgoing, { lineHeight: height }, outgoingStyle]}
          numberOfLines={1}
        >
          {outgoing}
        </Animated.Text>
      )}
    </View>
  );
}

const rnStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  outgoing: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});
