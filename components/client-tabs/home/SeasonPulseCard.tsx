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
 * COHORTS (lib/cohort.ts): a cohort pass has a real start date, so the card
 * gains exactly one line — the run, "Sep 8 – Sep 29" — and, before the cohort
 * begins, the stat line becomes "Starts Tuesday · 3 days to go" instead of
 * "Week 1 of 8". Evergreen passes are unchanged; the card stays compact.
 *
 * BEFORE A COHORT STARTS the card becomes the anticipation card: pass name,
 * the countdown as a stated fact, the run, and ONE way in — "See what's
 * coming", into the waiting room on Train. No progress bar (a 0% bar before
 * day one measures nothing) and no Continue (there is nothing to continue).
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
import { isCohort, formatRun } from '../../../lib/cohort';
import { preStartLine } from '../../../lib/cohortPreStart';
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

    // Cohort reads — null/false for an evergreen, athlete-paced pass.
    const cohort = isCohort(plan);

    return {
      planName: plan?.name || 'Your season',
      runLine: cohort ? formatRun(plan) : null,
      preStart: cohort && !completed ? preStartLine(plan) : null,
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
        {season.runLine ? <Text style={st.runLine}>{season.runLine}</Text> : null}
        <View style={st.barTrack}>
          <View style={[st.barFillStatic, { width: '100%' }]} />
        </View>
        <Pressable hitSlop={{ top: 3, bottom: 3 }}
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

  // ── Pre-start cohort — the anticipation card ─────────────────────────────
  // Bought, dated, not begun. Nothing here is a progress read, because there
  // is no progress yet; the card states the fact and offers the one way in.
  if (season.preStart) {
    return (
      <Animated.View entering={entering} style={st.card}>
        <View
          accessible={true}
          accessibilityLabel={`Your season, ${season.planName}, ${season.preStart}${
            season.runLine ? `. Runs ${season.runLine}` : ''
          }`}
        >
          <Text style={st.eyebrow}>Your season</Text>
          <Text style={st.title}>{season.planName}</Text>
          <Text style={st.statLine}>{season.preStart}</Text>
          {season.runLine ? <Text style={st.runLine}>{season.runLine}</Text> : null}
        </View>
        <Pressable hitSlop={{ top: 3, bottom: 3 }}
          style={st.reviewBtnWide}
          onPress={openSeason}
          accessibilityRole="button"
          accessibilityLabel="See what's coming"
          accessibilityHint="Opens your waiting room on Train — week one and what to have ready"
        >
          <Text style={st.reviewBtnText}>{"See what's coming"}</Text>
        </Pressable>
      </Animated.View>
    );
  }

  // ── Active season — standing + the fork ──────────────────────────────────
  // Before a cohort's real start date, "week 1 of 8" would be untrue — the
  // pre-start line says what is actually so.
  const statLine =
    season.preStart ||
    `Week ${season.currentWeek} of ${season.weeks}${
      season.sessionsTotal > 0
        ? ` · ${season.sessionsDone} of ${season.sessionsTotal} sessions done`
        : ''
    }`;

  return (
    <Animated.View entering={entering} style={st.card}>
      <View
        accessible={true}
        accessibilityLabel={`Your season, ${season.planName}, ${
          season.preStart ||
          `week ${season.currentWeek} of ${season.weeks}${
            season.sessionsTotal > 0
              ? `, ${season.sessionsDone} of ${season.sessionsTotal} sessions done`
              : ''
          }`
        }${season.runLine ? `. Runs ${season.runLine}` : ''}`}
      >
        <Text style={st.eyebrow}>Your season</Text>
        <Text style={st.title}>{season.planName}</Text>
        <Text style={st.statLine}>{statLine}</Text>
        {season.runLine ? <Text style={st.runLine}>{season.runLine}</Text> : null}
        <View style={st.barTrack}>
          <Animated.View style={[st.barFill, barStyle]} />
        </View>
      </View>

      <View style={st.ctaRow}>
        <Pressable hitSlop={{ top: 3, bottom: 3 }}
          style={st.continueBtn}
          onPress={continueSeason}
          accessibilityRole="button"
          accessibilityLabel={
            upNextName ? `Continue season — ${upNextName} is next` : 'Continue season'
          }
        >
          <Text style={st.continueBtnText}>Continue</Text>
        </Pressable>
        <Pressable hitSlop={{ top: 3, bottom: 3 }}
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
    fontSize: 12.5,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: F.bodySemiBold,
    fontSize: 17,
    color: C.textPrimary,
    marginTop: 7,
  },
  statLine: {
    fontFamily: F.body,
    fontSize: 14,
    color: C.textMuted,
    marginTop: 4,
    lineHeight: 20,
  },
  // Cohort run — the real calendar window. One line, never more.
  runLine: {
    fontFamily: F.body,
    fontSize: 13,
    color: C.textFaint,
    marginTop: 3,
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
  continueBtnText: { fontFamily: F.bodyBold, fontSize: 14.5, color: C.onAccent },
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
  reviewBtnText: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textSecondary },
  upNextLine: {
    fontFamily: F.body,
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
});
