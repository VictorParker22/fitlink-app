/**
 * Ring — one progress ring, one accent. The arc animates in from empty on
 * mount and eases to every new value (Reduce Motion: paints the final state).
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { CoachColors as C, CoachFonts as F } from '../../../constants/coachDesign';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function Ring({ value, max, size = 84, stroke = 9, color = C.accent, big, small, label, sub }: {
  value: number; max: number; size?: number; stroke?: number; color?: string;
  big: string; small: string; label?: string; sub?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const target = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    progress.value = reduced ? target : withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [target, reduced, progress]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - progress.value) }));
  return (
    <View style={st.wrap} accessible accessibilityLabel={`${label ?? ''} ${big} ${small}${sub ? `, ${sub}` : ''}`}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.borderMuted} strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
            strokeLinecap="round" strokeDasharray={`${circ}`} animatedProps={animatedProps}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={st.center}>
            <Text style={st.big} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{big}</Text>
            <Text style={st.small}>{small}</Text>
          </View>
        </View>
      </View>
      {label ? <Text style={st.label}>{label}</Text> : null}
      {sub ? <Text style={st.sub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  big: { fontFamily: F.headingBold, fontSize: 17, color: C.textPrimary },
  small: { fontFamily: F.body, fontSize: 10, color: C.textSecondary, marginTop: -1 },
  label: { fontFamily: F.bodySemiBold, fontSize: 12, color: C.textPrimary },
  sub: { fontFamily: F.body, fontSize: 11, color: C.textFaint, marginTop: -4 },
});
