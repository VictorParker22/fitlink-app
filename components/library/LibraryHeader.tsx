/**
 * LibraryHeader — editorial header for the coach library screen.
 *
 * Kicker ("EVERYTHING YOU SELL") over the Space Grotesk title, with the
 * tab-aware + button restyled as a 42pt lime circle on the right.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

interface LibraryHeaderProps {
  onAdd: () => void;
  addLabel: string;
}

export default function LibraryHeader({ onAdd, addLabel }: LibraryHeaderProps) {
  return (
    <View style={s.row}>
      <View>
        <Text style={s.kicker} maxFontSizeMultiplier={1.2}>EVERYTHING YOU SELL</Text>
        <Text style={s.title}>Library</Text>
      </View>
      <TouchableOpacity
        style={s.addBtn}
        onPress={onAdd}
        hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={addLabel}
      >
        <Ionicons name="add" size={24} color={CoachColors.onAccent} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  kicker: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: CoachColors.textFaint,
    marginBottom: 4,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 30,
    color: CoachColors.textPrimary,
    letterSpacing: -0.4,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
