/**
 * WizardChrome — the shared shell every library-child creation flow wears
 * (design canvas "Coach Library Redesign" · Creation flows page).
 *
 * One anatomy, five wizards (pass, workout, diet, class, exercise):
 *   <WizardTopBar/>   close/back circle · thin segmented lime progress · mono counter
 *   <WizardHeading/>  lime kicker (NEW PASS · THE PROMISE) · Space Grotesk title
 *   <GhostSlot/>      dashed add-another slot
 *   <TakingShape/>    the divider that introduces the live preview card
 *
 * Consistency is the point: these are deliberately dumb presentational
 * pieces so no wizard can drift. Buttons/CTAs stay per-screen (they carry
 * screen logic); the chrome is what makes them feel like one material.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

// ── Top bar ──────────────────────────────────────────────────────────────────
interface WizardTopBarProps {
  step: number;        // 1-based
  totalSteps: number;
  /** Step 1 closes the wizard; later steps go back (create-plan precedent). */
  onBack: () => void;
}

export function WizardTopBar({ step, totalSteps, onBack }: WizardTopBarProps) {
  return (
    <View style={s.topBar}>
      <TouchableOpacity
        style={s.topBarBtn}
        onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={step === 1 ? 'Close' : 'Go back'}
      >
        <Ionicons name={step === 1 ? 'close' : 'chevron-back'} size={19} color={CoachColors.textPrimary} />
      </TouchableOpacity>
      <View style={s.segments}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <View key={i} style={[s.segment, i < step && s.segmentDone]} />
        ))}
      </View>
      <Text style={s.counter} maxFontSizeMultiplier={1.2}>{step}/{totalSteps}</Text>
    </View>
  );
}

// ── Heading ──────────────────────────────────────────────────────────────────
interface WizardHeadingProps {
  /** e.g. "New pass · The promise" — rendered uppercase in lime. */
  kicker: string;
  /** The one question this screen asks. \n allowed for the editorial break. */
  title: string;
}

export function WizardHeading({ kicker, title }: WizardHeadingProps) {
  return (
    <View style={s.heading}>
      <Text style={s.kicker} maxFontSizeMultiplier={1.4}>{kicker}</Text>
      <Text style={s.title} maxFontSizeMultiplier={1.4}>{title}</Text>
    </View>
  );
}

// ── Ghost slot ───────────────────────────────────────────────────────────────
interface GhostSlotProps {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  height?: number;
}

export function GhostSlot({ label, onPress, icon = 'add', height = 52 }: GhostSlotProps) {
  return (
    <TouchableOpacity
      style={[s.ghost, { height }]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={15} color={CoachColors.textFaint} />
      <Text style={s.ghostText} maxFontSizeMultiplier={1.3}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── "Taking shape" divider ───────────────────────────────────────────────────
export function TakingShape({ label = 'Taking shape' }: { label?: string }) {
  return (
    <View style={s.shapeRow}>
      <View style={s.shapeLine} />
      <Text style={s.shapeText} maxFontSizeMultiplier={1.3}>{label.toUpperCase()}</Text>
      <View style={s.shapeLine} />
    </View>
  );
}

const s = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  topBarBtn: {
    width: 40, height: 40, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  segments: { flex: 1, flexDirection: 'row', gap: 5 },
  segment: { flex: 1, height: 3, borderRadius: 2, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted },
  segmentDone: { backgroundColor: CoachColors.accent },
  counter: { fontFamily: CoachFonts.mono, fontSize: 11.5, color: CoachColors.textFaint },

  heading: { gap: 6, marginTop: 28 },
  kicker: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11, letterSpacing: 1.4,
    textTransform: 'uppercase', color: CoachColors.accent,
  },
  title: {
    fontFamily: CoachFonts.headingBold, fontSize: 27, lineHeight: 31,
    color: CoachColors.textPrimary,
  },

  ghost: {
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: CoachColors.border,
    borderRadius: 16, borderCurve: 'continuous',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
  },
  ghostText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textFaint },

  shapeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 },
  shapeLine: { flex: 1, height: 1, backgroundColor: CoachColors.borderMuted },
  shapeText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 10.5, letterSpacing: 1.2,
    color: CoachColors.textFaint,
  },
});
