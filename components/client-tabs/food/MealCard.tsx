/**
 * MealCard — the tinted recipe card on the Food tab.
 *
 * One soft colour fills the card, sampled from the dish photo and normalised
 * into a readable palette by lib/mealColor.ts. Everything on it — title, meta,
 * both buttons — is a shade of that one hue. When there is no photo, no sampled
 * colour, or no palette that clears WCAG AA, the card renders in the app's
 * normal dark surface instead, which is a deliberate look rather than a broken
 * one.
 *
 * The meta line is real data only: "420 kcal · 32g protein", with either half
 * dropped when the number is missing and the line dropped entirely when nothing
 * is known. The reference design's "12 mins · 5 ingredients" has no equivalent
 * in `meals` and is not invented.
 *
 * The swap button is rendered ONLY when an `onSwap` handler is passed — the
 * Food tab's swap sheet is a real feature on some meals and absent on others,
 * and a button that does nothing is worse than no button.
 */

import { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useFoodImage } from '../../../lib/foodImages';
import { useMealImageColor } from '../../../lib/mealImageColor';
import { mealPalette } from '../../../lib/mealColor';

const F = CoachFonts;

/** The parts of a `meals` row (or a rest-day variant entry) the card needs. */
export interface MealCardMeal {
  id?: string | null;
  name: string;
  calories?: number | null;
  protein?: number | null;
  image_url?: string | null;
  image_color?: string | null;
}

export interface MealCardProps {
  meal: MealCardMeal;
  /** Optional slot name ("Breakfast", "Next up · Lunch") prefixed to the meta line. */
  slot?: string | null;
  /** When defined, the card reads as a checkbox and shows a tick instead of the arrow. */
  logged?: boolean;
  /** What the card's single action does, spoken to screen readers ("log", "unlog"). */
  actionHint?: string;
  onPress?: () => void;
  /** Pass a handler to reveal the swap button. Omit it and no button is drawn. */
  onSwap?: () => void;
  swapLabel?: string;
  /** Honour the OS reduce-motion setting — no press scale when true. */
  reduceMotion?: boolean;
}

const num = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** "Breakfast · 420 kcal · 32g protein" — every part omitted when unknown. */
export function mealMetaLine(meal: MealCardMeal, slot?: string | null): string | null {
  const parts: string[] = [];
  if (slot && slot.trim()) parts.push(slot.trim());
  const kcal = num(meal.calories);
  if (kcal !== null) parts.push(`${Math.round(kcal)} kcal`);
  const protein = num(meal.protein);
  if (protein !== null) parts.push(`${Math.round(protein)}g protein`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export default function MealCard({
  meal, slot, logged, actionHint, onPress, onSwap, swapLabel, reduceMotion,
}: MealCardProps) {
  const imageUrl = useFoodImage(meal.name, meal.image_url, meal.id || undefined);
  const sampled = useMealImageColor(imageUrl, meal.image_color, meal.id);
  const palette = mealPalette(sampled);

  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };

  const meta = mealMetaLine(meal, slot);
  const label = [meal.name, meta].filter(Boolean).join(', ')
    + (logged === undefined ? '' : `, ${logged ? 'logged' : 'not logged'}`)
    + (actionHint ? `. Double tap to ${actionHint}` : '');

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      {/* The swap button is a SIBLING of the card press target, not a child:
          a Pressable groups its children into one accessibility element, which
          would swallow the swap button's own label. */}
      <Pressable
        style={[st.card, { backgroundColor: palette.bg }, logged && { opacity: 0.62 }]}
        onPress={onPress}
        disabled={!onPress}
        onPressIn={() => press(0.975)}
        onPressOut={() => press(1)}
        accessibilityRole={logged === undefined ? 'button' : 'checkbox'}
        accessibilityState={logged === undefined ? undefined : { checked: logged }}
        accessibilityLabel={label}
      >
        {/* Top: the plated overhead shot, top-left */}
        <View style={st.topRow}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={st.plate} contentFit="cover" transition={180} />
          ) : (
            <View style={[st.plate, st.plateEmpty, { borderColor: palette.inkSoft }]}>
              <Ionicons name="restaurant-outline" size={29} color={palette.inkSoft} />
            </View>
          )}
        </View>

        {/* Oversized title, tight leading */}
        <Text style={[st.title, { color: palette.ink }]} numberOfLines={2}>
          {meal.name}
        </Text>

        {/* Meta + the circular action button */}
        <View style={st.bottomRow}>
          <View style={{ flex: 1 }}>
            {meta && <Text style={[st.meta, { color: palette.inkSoft }]} numberOfLines={1}>{meta}</Text>}
          </View>
          <View style={[st.arrowBtn, { backgroundColor: palette.buttonBg }]}>
            <Ionicons
              name={logged ? 'checkmark' : 'arrow-forward'}
              size={22}
              color={palette.buttonInk}
            />
          </View>
        </View>
      </Pressable>

      {/* Swap — only ever drawn when there is a real handler behind it. */}
      {onSwap && (
        <Pressable
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[st.swapBtn, { backgroundColor: palette.swapBg }, logged && { opacity: 0.62 }]}
          onPress={onSwap}
          accessibilityRole="button"
          accessibilityLabel={swapLabel || `Swap ${meal.name}`}
        >
          <Ionicons name="swap-horizontal" size={21} color={palette.ink} />
        </Pressable>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 30, padding: 20, backgroundColor: CoachColors.surface },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  plate: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(0,0,0,0.06)' },
  plateEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, backgroundColor: 'transparent' },
  swapBtn: {
    position: 'absolute', top: 20, right: 20,
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: F.headingBold, fontSize: 30, lineHeight: 33.5,
    letterSpacing: -0.4, marginTop: 18,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 10 },
  meta: { fontFamily: F.bodyMedium, fontSize: 14.5, marginBottom: 6 },
  arrowBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
