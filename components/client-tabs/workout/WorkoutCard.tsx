/**
 * WorkoutCard — the one session card. Train's answer to the Food tab's
 * MealCard, so the two halves of the app read as one product.
 *
 * SAME ANATOMY AS components/client-tabs/food/MealCard.tsx:
 *   · a large rounded card (30 radius, 20 padding), one fill colour
 *   · a round "portrait" of the thing, top-left
 *   · an oversized bold title with tight leading, max 2 lines
 *   · a lower-emphasis meta line beneath it
 *   · a large circular primary action, bottom-right
 *   · a small circular secondary action, top-right — a SIBLING of the card
 *     press target, never a child, because a Pressable groups its children
 *     into one accessibility element and would swallow the corner button's
 *     own label.
 *
 * DELIBERATELY NOT THE SAME: the tint. MealCard samples a hue from the dish
 * photo. The `workouts` table has no image column — there is no photograph to
 * sample, and colouring a whole session from one exercise's picture would be
 * arbitrary. So workout cards stay on the app's normal dark system: `surface`
 * card, `textPrimary` title, `textSecondary`/`textMuted` support, one lime
 * `accent` action. No per-category and no per-muscle colour — this app has
 * deleted multi-hue palettes twice on purpose.
 *
 * THE PORTRAIT IS THE MUSCLE MAP. Where the meal card shows a plated dish,
 * this shows the athlete's own body with this session's real primary and
 * secondary regions lit. It is the workout's face: it says what the session
 * does to you. When no exercise carries recognisable muscle data the portrait
 * is omitted entirely — a blank silhouette would be a placeholder pretending
 * to be information.
 *
 * REAL DATA OR OMITTED, everywhere:
 *   · meta  — "6 exercises · 24 sets · 45 min"; each part dropped when the
 *     number is missing, the whole line dropped when nothing is known. A
 *     duration is never invented from the exercise count.
 *   · focus — the coach's own `description` when they wrote one, else
 *     "Targets chest, shoulders and triceps" from the aggregated regions.
 *     Both come from season/workoutMuscles.ts; nothing is re-derived here.
 *
 * TWO PRESS SHAPES:
 *   · default — the whole card is one labelled button with the circular arrow
 *     inside it.
 *   · `primaryLabel` set — the card body is inert and a full-width labelled
 *     pill is the single button. The season's "Up next" hero uses this so the
 *     preview-first contract keeps a button that says so out loud.
 */

import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import MuscleMap from '../../anatomy/MuscleMap';
import { getWorkoutEmblem } from '../../../utils/workoutEmblems';
import {
  aggregateWorkoutMuscles,
  focusLineForWorkout,
  type WorkoutMuscleInfo,
} from '../season/workoutMuscles';

const C = CoachColors;
const F = CoachFonts;

export type WorkoutCardStatus = 'done' | 'up-next' | 'missed' | null;

/** How the eyebrow reads: neutral, today's emphasis, or a day that passed. */
export type WorkoutCardEyebrowTone = 'default' | 'today' | 'late';

export interface WorkoutCardProps {
  /**
   * The resolved `workouts` row with its joined
   * workout_exercises(*, exercises(*)). Null while the trainer's library is
   * still loading — the card then shows the name it was given and no meta,
   * focus, portrait or action.
   */
  workout: any | null;
  /** Fallback title when the row has not resolved (a track node's own label). */
  name?: string | null;

  /** "WEEK 3 · SESSION 2 · TUE 16 SEP", "TODAY · ONE-OFF FROM SAM". */
  eyebrow?: string | null;
  /** Same eyebrow written for a screen reader, when the display form shouts. */
  eyebrowSpoken?: string | null;
  eyebrowTone?: WorkoutCardEyebrowTone;

  statusChip?: WorkoutCardStatus;
  /** Status as spoken ("ahead on your plan") when it has no visible chip. */
  statusSpoken?: string | null;

  /**
   * Pre-computed aggregate. Season surfaces memoize this per workout id
   * upstream because track nodes repeat; pass it in rather than paying for it
   * on every render. Omit it and the card computes its own.
   */
  muscleInfo?: WorkoutMuscleInfo | null;

  onPress?: () => void;
  /** Spoken after the label ("Opens the session preview…"). */
  accessibilityHint?: string;
  /**
   * When set, the card body is inert and this labelled full-width pill is the
   * card's single button. Used by the season's "Up next" hero.
   */
  primaryLabel?: string | null;

  /** Top-right circle. Rendered only when there is a real handler behind it. */
  onSecondaryAction?: () => void;
  secondaryIcon?: React.ComponentProps<typeof Ionicons>['name'];
  secondaryLabel?: string;

  /** Look, don't log — a done or ahead node. Quiets the primary action. */
  viewOnly?: boolean;
  /** Completed / past — the whole card steps back. */
  dimmed?: boolean;
  /** Future weeks: the fill drops away and only the outline remains. */
  transparent?: boolean;
  /** The season's current node — larger type, accent edge. */
  hero?: boolean;

  /** Honour the OS reduce-motion setting — no press scale when true. */
  reduceMotion?: boolean;

  /** Extra body between the focus line and the meta row (the hero's list). */
  children?: React.ReactNode;
}

const num = (v: any): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * ["6 exercises", "24 sets", "45 min"] — every part omitted when the number
 * is missing, and an empty array when nothing at all is known. The duration
 * is read from the real column only; it is never estimated from set counts.
 */
export function workoutMetaParts(workout: any): string[] {
  const rows: any[] = workout?.workout_exercises || [];
  const parts: string[] = [];
  if (rows.length > 0) parts.push(`${rows.length} exercise${rows.length === 1 ? '' : 's'}`);
  const sets = rows.reduce((sum: number, ex: any) => sum + (Number(ex?.sets) || 0), 0);
  if (sets > 0) parts.push(`${sets} set${sets === 1 ? '' : 's'}`);
  const mins =
    num(workout?.estimated_duration) ?? num(workout?.duration_minutes) ?? num(workout?.duration);
  if (mins !== null) parts.push(`${Math.round(mins)} min`);
  return parts;
}

/** "6 exercises · 24 sets · 45 min", or null when nothing is known. */
export function workoutMetaLine(workout: any): string | null {
  const parts = workoutMetaParts(workout);
  return parts.length > 0 ? parts.join(' · ') : null;
}

const CHIP: Record<Exclude<WorkoutCardStatus, null>, { text: string; bg: string; ink: string }> = {
  done: { text: 'Done', bg: C.accentSoft, ink: C.accent },
  'up-next': { text: 'Up next', bg: C.accent, ink: C.onAccent },
  missed: { text: 'Missed', bg: C.warningSoft, ink: C.warning },
};

export default function WorkoutCard({
  workout,
  name,
  eyebrow,
  eyebrowSpoken,
  eyebrowTone = 'default',
  statusChip = null,
  statusSpoken,
  muscleInfo,
  onPress,
  accessibilityHint,
  primaryLabel,
  onSecondaryAction,
  secondaryIcon = 'arrow-forward',
  secondaryLabel,
  viewOnly,
  dimmed,
  transparent,
  hero,
  reduceMotion,
  children,
}: WorkoutCardProps) {
  // Callers that render many cards pass a memoized aggregate; the fallback is
  // for one-off mounts.
  const info = useMemo(
    () => (muscleInfo !== undefined ? muscleInfo : workout ? aggregateWorkoutMuscles(workout) : null),
    [muscleInfo, workout]
  );

  const title = workout?.name || name || 'Session';

  // THE EMBLEM IS THE WORKOUT'S BADGE (DESIGN.md § Imagery). Deterministic per
  // workout id + real muscle groups, so the same session always wears the same
  // badge and "leg day" is recognisable before the title is read. It rides as
  // a soft oversized backdrop in the corner — the muscle-map portrait stays
  // the face; when there is no muscle data, the emblem steps into the well so
  // the card is never a bare block of text. Only a resolved row gets one: an
  // unresolved node has no stable id, and a badge that changes on load would
  // break the same-workout-same-badge promise.
  const emblem = useMemo(() => {
    if (!workout?.id) return null;
    const groups: string[] = (workout?.workout_exercises || [])
      .map((ex: any) => ex?.exercises?.muscle_group || ex?.exercises?.category)
      .filter(Boolean);
    return getWorkoutEmblem(String(workout.id), workout?.name || name || undefined, groups);
  }, [workout, name]);

  const metaParts = workout ? workoutMetaParts(workout) : [];
  const meta = metaParts.length > 0 ? metaParts.join(' · ') : null;
  const focus = workout ? focusLineForWorkout(workout, info) : null;

  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };

  const spokenStatus = statusSpoken || (statusChip ? CHIP[statusChip].text.toLowerCase() : null);
  const label =
    [eyebrowSpoken || eyebrow || null, title, spokenStatus, metaParts.join(', ') || null]
      .filter(Boolean)
      .join(', ') + (focus ? `. ${focus}` : '');

  const eyebrowColor =
    eyebrowTone === 'today' ? C.accent : eyebrowTone === 'late' ? C.warning : C.textFaint;

  // The well matches MealCard's 92px plate. The figure inside is sized so the
  // silhouette clears the circle even in the two-figure "both" view: each
  // figure's body fills ~34% of its own width and ~92% of its height, so at
  // 72px tall the furthest point of a side-by-side pair sits ~43px from the
  // centre — inside the 46px radius, head and heels included.
  const portraitSize = hero ? 100 : 92;
  const mapHeight = hero ? 80 : 72;

  const head = (
    <>
      {/* The badge as backdrop — oversized, soft, bleeding off the corner.
          Clipped by the card (overflow hidden, same 30-radius continuous
          curve), purely decorative, never under the text column. */}
      {emblem && info && (
        <Image
          source={emblem}
          style={st.emblemBackdrop}
          contentFit="contain"
          accessible={false}
          pointerEvents="none"
        />
      )}

      {/* The portrait — this session's real regions when it has them, its
          muscle-group emblem when it does not. Both are real identity; a
          blank silhouette placeholder remains banned. */}
      {(info || emblem) && (
        <View style={st.topRow}>
          <View
            style={[
              st.portrait,
              { width: portraitSize, height: portraitSize, borderRadius: portraitSize / 2 },
            ]}
          >
            {info ? (
              <MuscleMap
                primary={info.primary}
                secondary={info.secondary}
                view={info.view}
                height={mapHeight}
              />
            ) : (
              <Image
                source={emblem!}
                style={{ width: mapHeight, height: mapHeight }}
                contentFit="contain"
                accessible={false}
              />
            )}
          </View>
        </View>
      )}

      {(eyebrow || statusChip) && (
        <View style={[st.eyebrowRow, info || emblem ? { marginTop: 16 } : null]}>
          {statusChip && (
            <View style={[st.chip, { backgroundColor: CHIP[statusChip].bg }]}>
              <Text style={[st.chipText, { color: CHIP[statusChip].ink }]}>
                {CHIP[statusChip].text}
              </Text>
            </View>
          )}
          {eyebrow ? (
            <Text style={[st.eyebrow, { color: eyebrowColor }]} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
        </View>
      )}

      <Text
        style={[st.title, hero && st.titleHero, !info && !emblem && !eyebrow && !statusChip && { marginTop: 0 }]}
        numberOfLines={2}
      >
        {title}
      </Text>

      {focus ? (
        <Text style={st.focus} numberOfLines={2}>
          {focus}
        </Text>
      ) : null}

      {children}
    </>
  );

  const actionQuiet = !!viewOnly || statusChip === 'done';
  const bottom = (
    <View style={st.bottomRow}>
      <View style={{ flex: 1 }}>
        {meta ? (
          <Text style={st.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {/* No handler, no button — a control that does nothing is worse than
          none, and an unresolved workout has nothing to open. */}
      {onPress && !primaryLabel && (
        <View
          style={[
            st.actionBtn,
            hero && st.actionBtnHero,
            { backgroundColor: actionQuiet ? C.accentSoft : C.accent },
          ]}
        >
          <Ionicons
            name={statusChip === 'done' ? 'checkmark' : 'arrow-forward'}
            size={hero ? 25 : 22}
            color={actionQuiet ? C.accent : C.onAccent}
          />
        </View>
      )}
    </View>
  );

  const cardStyle = [
    st.card,
    hero && st.cardHero,
    transparent && st.cardTransparent,
    dimmed && st.cardDimmed,
  ];

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      {primaryLabel ? (
        // Labelled-CTA shape: the body is inert, the pill is the one button.
        <View style={cardStyle}>
          {head}
          {bottom}
          {onPress && (
            <Pressable
              style={st.cta}
              onPress={onPress}
              onPressIn={() => press(0.985)}
              onPressOut={() => press(1)}
              accessibilityRole="button"
              accessibilityLabel={`${label}. Double tap to ${primaryLabel.toLowerCase()}`}
              accessibilityHint={accessibilityHint}
            >
              <Text style={st.ctaText}>{primaryLabel}</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Pressable
          style={cardStyle}
          onPress={onPress}
          disabled={!onPress}
          onPressIn={() => press(0.975)}
          onPressOut={() => press(1)}
          accessibilityRole="button"
          accessibilityLabel={onPress ? `${label}. Double tap to preview` : label}
          accessibilityHint={onPress ? accessibilityHint : undefined}
        >
          {head}
          {bottom}
        </Pressable>
      )}

      {/* The corner action — a sibling, so it keeps its own label. */}
      {onSecondaryAction && (
        <Pressable
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[st.secondaryBtn, dimmed && { opacity: 0.62 }]}
          onPress={onSecondaryAction}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel || `More options for ${title}`}
        >
          <Ionicons name={secondaryIcon} size={20} color={C.accent} />
        </Pressable>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  card: {
    borderRadius: 30,
    borderCurve: 'continuous',
    // Clips the backdrop emblem to the card's own curve (DESIGN.md § Imagery:
    // card imagery obeys the shape system).
    overflow: 'hidden',
    padding: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
  },
  // The muscle-group badge, oversized and soft, bleeding off the top-right
  // corner behind the content. Identity, not decoration — same workout, same
  // badge, always.
  emblemBackdrop: {
    position: 'absolute',
    top: -26,
    right: -26,
    width: 128,
    height: 128,
    opacity: 0.12,
  },
  cardHero: { borderWidth: 1.5, borderColor: C.accent, backgroundColor: '#1E211D' },
  cardTransparent: { backgroundColor: 'transparent' },
  cardDimmed: { opacity: 0.65 },

  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  portrait: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  eyebrow: {
    flexShrink: 1,
    fontFamily: F.bodyBold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chip: { borderRadius: 999, borderCurve: 'continuous', paddingVertical: 3, paddingHorizontal: 9 },
  chipText: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },

  title: {
    fontFamily: F.headingBold,
    fontSize: 25,
    lineHeight: 28.5,
    letterSpacing: -0.4,
    color: C.textPrimary,
    marginTop: 12,
  },
  titleHero: { fontSize: 30, lineHeight: 33.5 },

  focus: {
    fontFamily: F.body,
    fontSize: 13.5,
    lineHeight: 19,
    color: C.textSecondary,
    marginTop: 6,
  },

  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 12 },
  meta: { fontFamily: F.bodyMedium, fontSize: 14.5, color: C.textMuted, marginBottom: 6 },
  actionBtn: { width: 52, height: 52, borderRadius: 26, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  actionBtnHero: { width: 58, height: 58, borderRadius: 29, borderCurve: 'continuous' },

  cta: {
    backgroundColor: C.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  ctaText: { fontFamily: F.bodyBold, fontSize: 16, color: C.onAccent },

  secondaryBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentSoft,
  },
});
