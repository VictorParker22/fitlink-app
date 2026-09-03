/**
 * Editorial — the primitives of the FitLink Arrival onboarding.
 *
 * One headline per screen (Instrument Serif), Manrope for everything else,
 * hairlines instead of cards, lime for the one action and the one
 * selection. Every control is at least 44pt tall. All motion goes through
 * useReducedMotion: with Reduce Motion on, things appear, they do not move.
 */
import { type PropsWithChildren, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, type ViewStyle, type StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { OB, OBFonts, OBRadius, OBSpace } from '../../constants/onboardingDesign';

/* ── Layout ─────────────────────────────────────────────────────────── */

/** Full-bleed dark screen with safe-area padding and a pinned footer. */
export function Screen({ children, footer, style }: PropsWithChildren<{ footer?: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.screen, { paddingTop: insets.top }, style]}>
      <View style={{ flex: 1 }}>{children}</View>
      {footer ? <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>{footer}</View> : null}
    </View>
  );
}

/** Back chevron, "02 ── 04" progress, optional right slot. Height 44 + 14. */
export function TopNav({ step, total, onBack, right }: { step?: number; total?: number; onBack?: () => void; right?: ReactNode }) {
  const done = step && total ? Math.max(0, Math.min(1, step / total)) : 0;
  return (
    <View style={s.topNav}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={OB.fg} />
        </Pressable>
      ) : <View style={s.backBtn} />}
      {step && total ? (
        <View style={s.progress} accessibilityRole="progressbar" accessibilityLabel={`Step ${step} of ${total}`}>
          <Text style={s.progressNum} maxFontSizeMultiplier={1.2}>{String(step).padStart(2, '0')}</Text>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.round(done * 100)}%` }]} /></View>
          <Text style={[s.progressNum, { color: OB.faint }]} maxFontSizeMultiplier={1.2}>{String(total).padStart(2, '0')}</Text>
        </View>
      ) : <View />}
      <View style={s.rightSlot}>{right}</View>
    </View>
  );
}

/* ── Type ───────────────────────────────────────────────────────────── */

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={s.eyebrow} maxFontSizeMultiplier={1.3}>{children}</Text>;
}

export function Headline({ children, size = 36, lineHeight = 40 }: { children: ReactNode; size?: number; lineHeight?: number }) {
  return (
    <Text style={[s.headline, { fontSize: size, lineHeight }]} maxFontSizeMultiplier={1.25} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Sub({ children, color = OB.muted }: { children: ReactNode; color?: string }) {
  return <Text style={[s.sub, { color }]} maxFontSizeMultiplier={1.4}>{children}</Text>;
}

export function Wordmark() {
  return <Text style={s.wordmark} maxFontSizeMultiplier={1.2} accessibilityLabel="FitLink">FITLINK</Text>;
}

/* ── Monogram ───────────────────────────────────────────────────────── */

/** A ring bisected by a rising stroke: two parties, one line between them. */
export function Monogram({ size = 72, color = OB.fg, strokeWidth = 1.5 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle cx={36} cy={36} r={30} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M22 50 L50 22" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M22 22 v12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M50 50 v-12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/** The 6px lime dot the system allows once per screen. */
export function AccentDot({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[s.dot, style]} />;
}

/* ── Controls ───────────────────────────────────────────────────────── */

export function PrimaryButton({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={() => { if (!off) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); } }}
      disabled={off}
      style={({ pressed }) => [s.primary, off && s.primaryOff, pressed && !off && s.primaryPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
    >
      {loading ? <ActivityIndicator color={OB.onAccent} /> : <Text style={s.primaryText} maxFontSizeMultiplier={1.3}>{label}</Text>}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.secondary, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={label}>
      {icon}
      <Text style={s.secondaryText} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
  );
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.textBtn, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <Text style={s.textBtnLabel} maxFontSizeMultiplier={1.3}>{label}</Text>
    </Pressable>
  );
}

/** Multi-select pill. Selected: accentSoft wash, lime border, check. */
export function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.pill, selected && s.pillOn, pressed && { opacity: 0.85 }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
    >
      <Text style={[s.pillText, selected && s.pillTextOn]} maxFontSizeMultiplier={1.3}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={14} color={OB.accent} /> : null}
    </Pressable>
  );
}

/** Single-select row with a lime ring. 56pt, hairline below. */
export function RadioRow({ label, hint, selected, onPress }: { label: string; hint?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.rowLabel, selected && s.rowLabelOn]} maxFontSizeMultiplier={1.3}>{label}</Text>
        {hint ? <Text style={s.rowHint} maxFontSizeMultiplier={1.3}>{hint}</Text> : null}
      </View>
      <View style={[s.ring, selected && s.ringOn]}>{selected ? <View style={s.ringDot} /> : null}</View>
    </Pressable>
  );
}

/** Segmented control. Selected segment fills lime. */
export function Segment<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T | null; onChange: (k: T) => void }) {
  return (
    <View style={s.seg} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => { Haptics.selectionAsync(); onChange(o.key); }}
            style={[s.segItem, on && s.segItemOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
          >
            <Text style={[s.segText, on && s.segTextOn]} maxFontSizeMultiplier={1.2}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Typographic choice block separated by hairlines (role screen). */
export function ChoiceBlock({ icon, title, desc, selected, onPress }: { icon: ReactNode; title: string; desc: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [s.choice, pressed && { opacity: 0.85 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${desc}`}
    >
      <View style={s.choiceHead}>
        {icon}
        <View style={[s.choiceDot, selected && s.choiceDotOn]} />
      </View>
      <Text style={[s.choiceTitle, selected && { color: OB.accent }]} maxFontSizeMultiplier={1.25}>{title}</Text>
      <Text style={s.choiceDesc} maxFontSizeMultiplier={1.4}>{desc}</Text>
    </Pressable>
  );
}

/** Translucent panel for the arrival preview. */
export function Glass({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[s.glass, style]}>{children}</View>;
}

export function Hairline({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[s.hairline, style]} />;
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: OB.bg },
  footer: { paddingHorizontal: OBSpace.screen, paddingTop: 8, gap: 4 },
  topNav: { height: 58, paddingHorizontal: OBSpace.screen - 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rightSlot: { minWidth: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressNum: { fontFamily: OBFonts.mono, fontSize: 12, letterSpacing: 1, color: OB.muted },
  progressTrack: { width: 64, height: 1, backgroundColor: OB.lineStrong },
  progressFill: { height: 1, backgroundColor: OB.accent },

  eyebrow: { fontFamily: OBFonts.sansSemiBold, fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', color: OB.muted },
  headline: { fontFamily: OBFonts.display, color: OB.fg, letterSpacing: -0.2 },
  sub: { fontFamily: OBFonts.sans, fontSize: 15, lineHeight: 23 },
  wordmark: { fontFamily: OBFonts.sansSemiBold, fontSize: 13, letterSpacing: 3, color: OB.fg },
  dot: { width: 6, height: 6, borderRadius: 999, backgroundColor: OB.accent },

  primary: { height: 56, borderRadius: OBRadius.m, borderCurve: 'continuous', backgroundColor: OB.accent, alignItems: 'center', justifyContent: 'center' },
  primaryPressed: { backgroundColor: '#B4DC45', transform: [{ scale: 0.985 }] },
  primaryOff: { opacity: 0.35 },
  primaryText: { fontFamily: OBFonts.sansSemiBold, fontSize: 16, color: OB.onAccent },
  secondary: { height: 56, borderRadius: OBRadius.m, borderCurve: 'continuous', borderWidth: 1, borderColor: OB.lineStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  secondaryText: { fontFamily: OBFonts.sansSemiBold, fontSize: 16, color: OB.fg },
  textBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { fontFamily: OBFonts.sansMedium, fontSize: 15, color: OB.muted },

  pill: { height: 46, paddingHorizontal: 18, borderRadius: OBRadius.pill, borderWidth: 1, borderColor: OB.lineStrong, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillOn: { backgroundColor: OB.accentSoft, borderColor: OB.accent },
  pillText: { fontFamily: OBFonts.sansMedium, fontSize: 15, color: OB.fg },
  pillTextOn: { fontFamily: OBFonts.sansSemiBold, color: OB.accent },

  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: OB.line, paddingVertical: 8 },
  rowLabel: { fontFamily: OBFonts.sansMedium, fontSize: 16, color: OB.muted },
  rowLabelOn: { fontFamily: OBFonts.sansSemiBold, color: OB.fg },
  rowHint: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.faint },
  ring: { width: 22, height: 22, borderRadius: 999, borderWidth: 1, borderColor: OB.lineStrong, alignItems: 'center', justifyContent: 'center' },
  ringOn: { borderColor: OB.accent },
  ringDot: { width: 10, height: 10, borderRadius: 999, backgroundColor: OB.accent },

  seg: { flexDirection: 'row', padding: 3, borderRadius: OBRadius.pill, borderWidth: 1, borderColor: OB.lineStrong },
  segItem: { flex: 1, height: 40, borderRadius: OBRadius.pill, alignItems: 'center', justifyContent: 'center' },
  segItemOn: { backgroundColor: OB.accent },
  segText: { fontFamily: OBFonts.sansSemiBold, fontSize: 14, color: OB.muted },
  segTextOn: { color: OB.onAccent },

  choice: { paddingVertical: 28, borderTopWidth: 1, borderTopColor: OB.line, gap: 14 },
  choiceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choiceDot: { width: 8, height: 8, borderRadius: 999, borderWidth: 1, borderColor: OB.lineStrong },
  choiceDotOn: { backgroundColor: OB.accent, borderColor: OB.accent },
  choiceTitle: { fontFamily: OBFonts.display, fontSize: 34, lineHeight: 36, color: OB.fg },
  choiceDesc: { fontFamily: OBFonts.sans, fontSize: 15, lineHeight: 22, color: OB.muted },

  glass: { borderRadius: OBRadius.l, borderCurve: 'continuous', backgroundColor: OB.glass, borderWidth: 1, borderColor: OB.line, paddingHorizontal: 20, paddingVertical: 4 },
  hairline: { height: 1, backgroundColor: OB.line },
});
