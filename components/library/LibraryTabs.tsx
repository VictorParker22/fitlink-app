/**
 * LibraryTabs — text tab rail with mono item counts and a sliding lime
 * underline. Active tab: textPrimary label + lime count; inactive: textFaint.
 * The underline springs between tabs (damping 26); under OS Reduce Motion it
 * jumps straight to its final position (DESIGN.md — Reduce Motion is law).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

export interface LibraryTab {
  key: string;
  label: string;
  count: number;
}

interface LibraryTabsProps {
  tabs: LibraryTab[];
  active: string;
  onSelect: (key: string) => void;
  reduceMotion: boolean;
}

export default function LibraryTabs({ tabs, active, onSelect, reduceMotion }: LibraryTabsProps) {
  const [layouts, setLayouts] = useState<Record<string, { x: number; w: number }>>({});
  const underlineX = useSharedValue(0);
  const underlineW = useSharedValue(0);

  useEffect(() => {
    const l = layouts[active];
    if (!l) return;
    // First measurement (or Reduce Motion): place, don't animate.
    if (reduceMotion || underlineW.value === 0) {
      underlineX.value = l.x;
      underlineW.value = l.w;
    } else {
      underlineX.value = withSpring(l.x, { damping: 26, stiffness: 240 });
      underlineW.value = withSpring(l.w, { damping: 26, stiffness: 240 });
    }
  }, [active, layouts, reduceMotion, underlineX, underlineW]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: underlineX.value }],
    width: underlineW.value,
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.railOuter}
    >
      {/* Inner wrapper so tab onLayout coords and the absolute underline share
          the same origin (Yoga treats padding differently for the two). */}
      <View style={s.rail}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={s.tab}
            onPress={() => onSelect(tab.key)}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              setLayouts((prev) =>
                prev[tab.key]?.x === x && prev[tab.key]?.w === width
                  ? prev
                  : { ...prev, [tab.key]: { x, w: width } }
              );
            }}
            activeOpacity={0.7}
            hitSlop={{ top: 7, bottom: 7 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label}, ${tab.count} items`}
          >
            <Text style={[s.label, isActive && s.labelActive]} maxFontSizeMultiplier={1.2}>
              {tab.label}
            </Text>
            <Text style={[s.count, isActive && s.countActive]} maxFontSizeMultiplier={1.2}>
              {tab.count}
            </Text>
          </TouchableOpacity>
        );
      })}
      <Animated.View style={[s.underline, underlineStyle]} pointerEvents="none" />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  railOuter: {
    paddingHorizontal: 20,
  },
  rail: {
    flexDirection: 'row',
    gap: 24,
    paddingBottom: 10,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  label: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 15,
    color: CoachColors.textFaint,
  },
  labelActive: {
    color: CoachColors.textPrimary,
  },
  count: {
    fontFamily: CoachFonts.mono,
    fontSize: 11,
    color: CoachColors.textFaint,
    fontVariant: ['tabular-nums'],
  },
  countActive: {
    color: CoachColors.accent,
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 2,
    borderRadius: 2,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
});
