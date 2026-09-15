/**
 * Segmented — the iOS segmented control in the app's tokens. One tap per
 * option, selection haptic, 44pt tall, a11y as radio buttons.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CoachColors as C, CoachFonts as F } from '../../../constants/coachDesign';

export function Segmented<T extends string | number>({ options, value, onChange, mono, accent }: {
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (k: T) => void;
  /** Digits (ratings) read better in the mono face. */
  mono?: boolean;
  /** Filled lime for the chosen segment (ratings) instead of the raised grey (ranges). */
  accent?: boolean;
}) {
  return (
    <View style={st.track} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={String(o.key)}
            style={[st.seg, on && (accent ? st.segAccent : st.segOn)]}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(o.key); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
          >
            <Text style={[st.text, mono && st.mono, on && (accent ? st.textAccent : st.textOn)]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  track: { flexDirection: 'row', gap: 2, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 10, borderCurve: 'continuous', padding: 3 },
  seg: { flex: 1, minHeight: 40, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.border },
  segAccent: { backgroundColor: C.accent },
  text: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textSecondary },
  mono: { fontFamily: F.mono, fontSize: 14 },
  textOn: { color: C.textPrimary },
  textAccent: { color: C.onAccent },
});
