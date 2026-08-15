/**
 * SeasonPulseCard — the athlete's season standing on the Today dashboard.
 *
 * One compact card, rendered only when there is a real enrollment with a
 * real track: pass name, "Week N of M · X of Y sessions done" (week math
 * from lib/passWeeks.ts — never re-derived), a slim accent bar over the true
 * sessions fraction, and two ways in: Continue (deep-links the current track
 * node's workout via the startWorkoutId contract) and Review (the season
 * view on Train, where past weeks collapse into receipts).
 *
 * When the season is finished the card becomes the receipt: "Season
 * complete — Y sessions" with a single "Review your season" CTA.
 *
 * The hero above may be talking about the same session (its job is today's
 * instruction); this card's job is season standing, so it stays compact —
 * one bar, one line, two pills, no exercise lists.
 *
 * Fixed dark/lime system (constants/coachDesign.ts). Every number is real or
 * omitted. Bar animation gated behind lib/useReducedMotion.ts.
 */

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useClient } from '../../../context/ClientContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { weekOfPosition, totalWeeks } from '../../../lib/passWeeks';
import type { TrackNode } from '../../../context/AppContext';

const C = CoachColors;
const F = CoachFonts;

export default function SeasonPulseCard() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { enrollment, plans, todayWorkout } = useClient();

  // ── Season math — same sources as SeasonHero, via passWeeks only ─────────
  const season = useMemo(() => {
    if (!enrollment || (enrollment.status !== 'active' && enrollment.status !== 'completed')) {
      return null;
    }
    const track: TrackNode[] = Array.isArray(enrollment.track_snapshot)
      ? [...enrollment.track_snapshot].sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
      : [];
    if (track.length === 0) return null;

    const plan = (plans || []).find((p: any) => p.id === enrollment.plan_id) || null;
    const durationWeeks = plan?.duration_weeks ?? null;
    const completed = enrollment.status === 'completed';
    const position = completed
      ? track.length
      : Math.min(enrollment.track_position || 0, track.length);

    const weeks = totalWeeks(track, durationWeeks);
    const currentWeek = completed
      ? weeks
      : Math.min(weekOfPosition(Math.min(position, track.length - 1), track, durationWeeks), weeks);

    // Sessions = workout nodes only (diet/milestone steps aren't sessions).
    const sessionsTotal = track.filter((n) => n.type === 'workout').length;
    const sessionsDone = track.filter((n, i) => n.type === 'workout' && i < position).length;

    const currentNode = !completed && position < track.length ? track[position] : null;

    return {
      planName: plan?.name || 'Your season',
      track,
      position,
      weeks,
      currentWeek,
      sessionsTotal,
      sessionsDone,
      completed,
      currentNode,
    };
  }, [enrollment, plans]);

  // ── Up-next workout name — real or omitted ────────────────────────────────
  // Prefer the context's already-resolved track workout; otherwise a
  // name-only lookup for the current node's workout id.
  const currentWorkoutId =
    season?.currentNode?.type === 'workout' ? season.currentNode.id || null : null;
  const contextName =
    todayWorkout?.source === 'track' && currentWorkoutId && todayWorkout.id === currentWorkoutId
      ? todayWorkout.name || null
      : null;
  const [fetchedName, setFetchedName] = useState<string | null>(null);

  useEffect(() => {
    setFetchedName(null);
    if (!currentWorkoutId || contextName) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('workouts')
        .select('id, name')
        .eq('id', currentWorkoutId)
        .maybeSingle();
      if (alive && data?.name) setFetchedName(data.name);
    })();
    return () => { alive = false; };
  }, [currentWorkoutId, contextName]);

  const upNextName = contextName || fetchedName;

  // ── Progress bar — animated to value, reduce-motion gated ────────────────
  const fraction =
    season && season.sessionsTotal > 0
      ? Math.min(season.sessionsDone / season.sessionsTotal, 1)
      : season && season.track.length > 0
        ? Math.min(season.position / season.track.length, 1)
        : 0;
  const progress = useSharedValue(reduced ? fraction : 0);

  useEffect(() => {
    if (reduced) {
      progress.value = fraction;
    } else {
      progress.value = withTiming(fraction, { duration: 700, easing: Easing.out(Easing.cubic) });
    }
  }, [fraction, reduced, progress]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (!season) {
    if (__DEV__) {
      console.log(
        '[SeasonPulse] hidden —',
        !enrollment
          ? 'no enrollment in context'
          : `status=${enrollment.status}, track_snapshot=${
              Array.isArray(enrollment.track_snapshot)
                ? `array(${enrollment.track_snapshot.length})`
                : typeof enrollment.track_snapshot
            }`,
      );
    }
    return null;
  }

  const entering = reduced ? undefined : FadeInDown.delay(160).duration(320);

  // view: 'season' clears any stale explore mode on the mounted Train screen.
  const openSeason = () =>
    router.push({ pathname: ClientRoute.workouts, params: { view: 'season' } });
  const continueSeason = () => {
    if (currentWorkoutId) {
      // Same deep-link contract Today's hero uses — Train resolves the id
      // (workout_id / workouts.id / direct fetch) into the WorkoutPreview.
      router.push({
        pathname: ClientRoute.workouts,
        params: { view: 'season', startWorkoutId: String(currentWorkoutId) },
      });
    } else {
      // Diet / milestone / rest node — no workout to preview, just go there.
      openSeason();
    }
  };

  // ── Completed season — the receipt ────────────────────────────────────────
  if (season.completed) {
    return (
      <Animated.View
        entering={entering}
        style={st.card}
        accessible={true}
        accessibilityLabel={`Your season, ${season.planName}, season complete, ${season.sessionsTotal} session${season.sessionsTotal === 1 ? '' : 's'}`}
      >
        <Text style={st.eyebrow}>Your season</Text>
        <Text style={st.title}>{season.planName}</Text>
        <Text style={st.statLine}>
          Season complete{season.sessionsTotal > 0 ? ` — ${season.sessionsTotal} session${season.sessionsTotal === 1 ? '' : 's'}` : ''}
        </Text>
        <View style={st.barTrack}>
          <View style={[st.barFillStatic, { width: '100%' }]} />
        </View>
        <Pressable
          style={st.reviewBtnWide}
          onPress={openSeason}
          accessibilityRole="button"
          accessibilityLabel="Review your season"
        >
          <Text style={st.reviewBtnText}>Review your season</Text>
        </Pressable>
      </Animated.View>
    );
  }

  // ── Active season — standing + the fork ──────────────────────────────────
  const statLine = `Week ${season.currentWeek} of ${season.weeks}${
    season.sessionsTotal > 0
      ? ` · ${season.sessionsDone} of ${season.sessionsTotal} sessions done`
      : ''
  }`;

  return (
    <Animated.View entering={entering} style={st.card}>
      <View
        accessible={true}
        accessibilityLabel={`Your season, ${season.planName}, week ${season.currentWeek} of ${season.weeks}${
          season.sessionsTotal > 0
            ? `, ${season.sessionsDone} of ${season.sessionsTotal} sessions done`
            : ''
        }`}
      >
        <Text style={st.eyebrow}>Your season</Text>
        <Text style={st.title}>{season.planName}</Text>
        <Text style={st.statLine}>{statLine}</Text>
        <View style={st.barTrack}>
          <Animated.View style={[st.barFill, barStyle]} />
        </View>
      </View>

      <View style={st.ctaRow}>
        <Pressable
          style={st.continueBtn}
          onPress={continueSeason}
          accessibilityRole="button"
          accessibilityLabel={
            upNextName ? `Continue season — ${upNextName} is next` : 'Continue season'
          }
        >
          <Text style={st.continueBtnText}>Continue</Text>
        </Pressable>
        <Pressable
          style={st.reviewBtn}
          onPress={openSeason}
          accessibilityRole="button"
          accessibilityLabel="Review your season"
        >
          <Text style={st.reviewBtnText}>Review</Text>
        </Pressable>
      </View>
      {upNextName ? (
        <Text style={st.upNextLine} numberOfLines={1}>
          {upNextName} is next
        </Text>
      ) : null}
    </Animated.View>
  );
}

// ─── Styles — matches the Today screen's card system ─────────────────────────

const st = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 18,
    padding: 15,
    marginTop: 14,
  },
  eyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: F.bodySemiBold,
    fontSize: 15,
    color: C.textPrimary,
    marginTop: 7,
  },
  statLine: {
    fontFamily: F.body,
    fontSize: 12.5,
    color: C.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  barTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: C.borderMuted,
    marginTop: 12,
    overflow: 'hidden',
  },
  barFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  barFillStatic: {
    height: 3,
    borderRadius: 2,
    backgroundColor: C.accent,
  },
  ctaRow: { flexDirection: 'row', gap: 8, marginTop: 13 },
  continueBtn: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: { fontFamily: F.bodyBold, fontSize: 13, color: C.onAccent },
  reviewBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewBtnWide: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 13,
  },
  reviewBtnText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textSecondary },
  upNextLine: {
    fontFamily: F.body,
    fontSize: 11.5,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
