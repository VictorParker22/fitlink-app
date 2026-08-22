/**
 * My pass — "before you pay, what the money actually buys" (design 23d).
 *
 * Pre-purchase: the plan's real track grouped into weeks (same week math as
 * every other surface, lib/passWeeks.ts), each week's true composition,
 * total counts, the coach, and the price. Every number on this screen is
 * computed from the actual plan row — nothing invented.
 *
 * Post-purchase: the Train tab owns the season; this screen collapses to a
 * slim "you're in week N" summary that links there.
 *
 * Purchase contract: unchanged — Stripe checkout via SharedRoute.checkout
 * (app/checkout.tsx) with planId + clientId; enrollment rows
 * (client_plan_enrollments, with frozen track_snapshot) are created by the
 * existing post-payment flow, not here.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useClient } from '../../context/ClientContext';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute, SharedRoute } from '../../types/routes';
import type { TrackNode } from '../../context/AppContext';
import { weekStartIndices, weekOfPosition, totalWeeks } from '../../lib/passWeeks';
import {
  isCohort, enrollmentState, spotsLeft, canJoin,
  formatDay, parseLocalDay,
} from '../../lib/cohort';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useWorkout } from '../../context/WorkoutContext';
import { computeStreak } from '../../lib/streak';
import PassStreakCalendar from '../../components/client-tabs/pass/PassStreakCalendar';
import CardImage from '../../components/ui/CardImage';
import CohortProgramCard from '../../components/client-tabs/cohort/CohortProgramCard';

// The purpose-shot season-pass photograph — the ticket this screen sells,
// and the membership card once it's bought. Used whenever the pass (or the
// coach) hasn't uploaded a real cover of their own.
const SEASON_PASS_IMG = require('../../assets/images/card-season-pass.jpg');

const WEEK_LABEL_RE = /^Week (\d+):\s*/;

type WeekSummary = {
  week: number; // 1-based
  title: string | null; // from the "Week N: …" milestone, if the builder set one
  isRest: boolean;
  workouts: number;
  meals: number;
  checkins: number;
  markers: string[]; // other milestone labels inside the week
};

function summarizeWeeks(track: TrackNode[], durationWeeks?: number | null): WeekSummary[] {
  const sorted = [...track].sort((a, b) => a.order - b.order);
  const starts = weekStartIndices(sorted, durationWeeks);
  const weeks = totalWeeks(sorted, durationWeeks);

  const out: WeekSummary[] = Array.from({ length: weeks }, (_, i) => ({
    week: i + 1, title: null, isRest: false, workouts: 0, meals: 0, checkins: 0, markers: [],
  }));

  sorted.forEach((node, i) => {
    // Which week does this node index fall in?
    let w = 1;
    for (let s = 0; s < starts.length; s++) {
      if (i >= starts[s]) w = s + 1; else break;
    }
    const wk = out[Math.min(w, weeks) - 1];
    if (node.type === 'workout') wk.workouts += 1;
    else if (node.type === 'diet') wk.meals += 1;
    else if (node.type === 'milestone') {
      const label = node.label || '';
      const m = label.match(WEEK_LABEL_RE);
      if (m) {
        const text = label.replace(WEEK_LABEL_RE, '').trim();
        if (/^rest week$/i.test(text)) wk.isRest = true;
        else if (text) wk.title = text;
      } else if (label === 'Check-in') {
        wk.checkins += 1;
      } else if (label) {
        wk.markers.push(label);
      }
    }
  });

  return out;
}

function composition(wk: WeekSummary): string {
  const parts: string[] = [];
  if (wk.workouts > 0) parts.push(`${wk.workouts} workout${wk.workouts === 1 ? '' : 's'}`);
  if (wk.meals > 0) parts.push(wk.meals === 1 ? 'meal plan' : `${wk.meals} meal plans`);
  if (wk.checkins > 0) parts.push(wk.checkins === 1 ? 'check-in' : `${wk.checkins} check-ins`);
  if (parts.length === 0 && wk.isRest) return 'Recovery — nothing scheduled';
  if (parts.length === 0) return 'No sessions scheduled';
  return parts.join(' · ');
}

export default function MyPassScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clientData, plans, trainer, enrollment, conversation, workouts, mealLogs } = useClient();
  const { workoutHistory } = useWorkout();
  // Same streak number every other athlete surface shows — device-logged
  // sessions plus completed coach assignments (lib/streak.ts).
  const currentStreak = useMemo(
    () => computeStreak(workoutHistory, workouts).days,
    [workoutHistory, workouts]
  );
  // 'hidden' | 'open' | 'sent' — the not-yet-approved sheet (see
  // handleStartSeason). 'sent' survives reopening so the athlete is not
  // nudged into messaging the coach twice about the same pass.
  const [queueSheet, setQueueSheet] = useState<'hidden' | 'open' | 'sent' | 'locked'>('hidden');
  const [queueSending, setQueueSending] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  const activeEnrollment = enrollment && enrollment.status === 'active' ? enrollment : null;

  // Plan the athlete is looking at (pre-purchase) — default to the plan their
  // coach attached to them, else the first published plan.
  const plan = useMemo(() => {
    if (!plans || plans.length === 0) return null;
    if (selectedPlanId) return plans.find((p: any) => p.id === selectedPlanId) || plans[0];
    if (clientData?.plan_id) {
      const attached = plans.find((p: any) => p.id === clientData.plan_id);
      if (attached) return attached;
    }
    return plans[0];
  }, [plans, selectedPlanId, clientData]);

  // ── Cohort seats — a real count, never a guess ────────────────────────
  // Keyed by plan id. `number` = counted, `null` = the query failed (we then
  // omit the seats line entirely rather than invent one), `undefined` = not
  // asked yet. Only cohorts with a coach-set capacity are ever counted.
  const [seatCounts, setSeatCounts] = useState<Record<string, number | null>>({});
  const cohortPlan = isCohort(plan);
  const capacity = cohortPlan ? (plan as any)?.capacity ?? null : null;
  // The pass's own photo first, the coach's cover second, nothing invented.
  const heroCover: string | null = (plan as any)?.cover_url || trainer?.cover_url || null;

  useEffect(() => {
    const planId = plan?.id;
    if (!planId || !cohortPlan || !capacity || capacity <= 0) return;
    let cancelled = false;
    (async () => {
      // Preferred: the server-side count (it sees every enrollment, not just
      // the rows this athlete is allowed to read). Falls back to the direct
      // count while that RPC is still rolling out.
      const rpc = await supabase.rpc('cohort_member_count', { p_plan_id: planId });
      if (cancelled) return;
      if (!rpc.error && typeof rpc.data === 'number') {
        setSeatCounts(prev => ({ ...prev, [planId]: rpc.data as number }));
        return;
      }

      const { count, error } = await supabase
        .from('client_plan_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', planId)
        .in('status', ['active', 'completed']);
      if (cancelled) return;
      // Either query failing leaves the seat count unknown — the seats row is
      // then omitted entirely rather than guessed at.
      setSeatCounts(prev => ({
        ...prev,
        [planId]: error || typeof count !== 'number' ? null : count,
      }));
    })();
    return () => { cancelled = true; };
  }, [plan?.id, cohortPlan, capacity]);

  const seatCount = plan ? seatCounts[plan.id] : undefined;
  const seatsKnown = typeof seatCount === 'number';
  const left = seatsKnown ? spotsLeft(plan as any, seatCount as number) : null;

  const track: TrackNode[] = useMemo(() => {
    if (!plan?.track || !Array.isArray(plan.track)) return [];
    return [...plan.track].sort((a: TrackNode, b: TrackNode) => a.order - b.order);
  }, [plan]);

  const weeks = useMemo(() => summarizeWeeks(track, plan?.duration_weeks), [track, plan]);
  const seasonWeeks = weeks.length;

  const totals = useMemo(() => {
    let workouts = 0, meals = 0, checkins = 0;
    weeks.forEach(w => { workouts += w.workouts; meals += w.meals; checkins += w.checkins; });
    return { workouts, meals, checkins };
  }, [weeks]);

  const coachInitials = (trainer?.name || 'C')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleStartSeason = () => {
    if (!plan || !clientData) return;
    // Cohorts that are full or past their deadline never open checkout.
    if (cohortPlan && !canJoin(plan as any, seatsKnown ? (seatCount as number) : 0)) return;
    // A request-to-join creates the client row with status 'new' — the coach
    // has NOT accepted yet. Opening checkout from here used to be a dead
    // end; worse, taking money from an athlete the coach might decline
    // would be its own incident. The tap still lands somewhere: a sheet
    // that says exactly where they stand and turns the intent into a
    // message the coach sees. Real queue, real FOMO — no invented
    // "3 spots left".
    if (clientData.status === 'new') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setQueueSheet((prev) => (prev === 'sent' ? 'sent' : 'open'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: SharedRoute.checkout as any,
      params: { planId: plan.id, clientId: clientData.id },
    });
  };

  // Turn the blocked tap into the thing the coach actually sees: a message
  // in the existing thread (created with the join request). Insert resolves
  // with { error }, never throws (INVARIANTS §2).
  //
  // EVERY exit of this function changes the screen. The first shipped
  // version handled only success — on an RLS refusal the button spun,
  // reverted, and the athlete stared at "Tell them I'm ready" wondering if
  // anything happened (TestFlight, same day it shipped). A denial here is
  // not an outage: messaging before approval may simply not be allowed for
  // a 'new' client, and that is an ANSWER the athlete deserves in words.
  const flagReadyToStart = async () => {
    if (!plan || !conversation?.id || queueSending) return;
    setQueueSending(true);
    setQueueError(null);
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_type: 'client',
      content: `I'm ready to start "${plan.name}" as soon as you approve me.`,
    });
    setQueueSending(false);
    if (!error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQueueSheet('sent');
      return;
    }
    if (__DEV__) console.warn('[my-pass] ready-flag insert failed:', error.code, error.message);
    // 42501 = row-level security refusal. The thread is closed to them
    // until approval — say so as a state, not a failure.
    if (error.code === '42501') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setQueueSheet('locked');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setQueueError("That didn't send — our side, not yours. Try again in a moment.");
  };

  // ── No profile yet ─────────────────────────────────────────────────────
  if (!clientData) {
    return (
      <View style={s.emptyContainer}>
        <Ionicons name="ticket-outline" size={45} color={CoachColors.textFaint} />
        <Text style={s.emptyTitle}>No pass yet</Text>
      </View>
    );
  }

  // ── Already enrolled: Train owns the season, keep this slim ───────────
  if (activeEnrollment) {
    const snapshot: TrackNode[] = Array.isArray(activeEnrollment.track_snapshot)
      ? [...activeEnrollment.track_snapshot].sort((a: TrackNode, b: TrackNode) => a.order - b.order)
      : [];
    const enrolledPlan = plans?.find((p: any) => p.id === activeEnrollment.plan_id) || plan;
    const durWeeks = enrolledPlan?.duration_weeks ?? null;
    const total = totalWeeks(snapshot, durWeeks);
    const position = activeEnrollment.track_position || 0;
    const currentWeek = snapshot.length > 0
      ? Math.min(
          weekOfPosition(Math.min(position, Math.max(snapshot.length - 1, 0)), snapshot, durWeeks),
          total,
        )
      : 1;

    // Cohort: the athlete is in it, so state is 'open' (not started yet),
    // 'running' or 'finished' — never a sold-out banner.
    const enrolledIsCohort = isCohort(enrolledPlan);
    const enrolledState = enrolledIsCohort ? enrollmentState(enrolledPlan, 0, true) : null;
    const enrolledStartDay = enrolledIsCohort ? formatDay(parseLocalDay((enrolledPlan as any)?.starts_on)) : null;
    // Before the first day there is no "week N" yet — say what actually happens.
    const enrolledCohortNote = enrolledState === 'open' && enrolledStartDay
      ? `Everyone starts on ${enrolledStartDay} and moves through the weeks together.`
      : null;

    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Pass</Text>
        </View>
        <ScrollView contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>
          <View style={s.enrolledCard}>
            {/* The membership card itself — the pass's own photo when the
                coach shot one, else the purpose-shot season-pass image.
                Owned, not for sale: name and week over the scrim. */}
            <View style={s.enrolledHero}>
              <CardImage
                source={
                  (enrolledPlan as any)?.cover_url
                    ? { uri: (enrolledPlan as any).cover_url }
                    : SEASON_PASS_IMG
                }
                scrim="gradient"
              />
              <Text style={s.enrolledEyebrow}>Your season</Text>
              <Text style={s.enrolledPlanName}>{enrolledPlan?.name || 'Your pass'}</Text>
              <Text style={s.enrolledWeek}>
                {enrolledState === 'open'
                  ? "Your spot is booked"
                  : `You're in week ${currentWeek} of ${total}`}
              </Text>
            </View>
            <View style={s.enrolledBody}>
            {enrolledIsCohort ? (
              <View style={s.cohortEnrolledFacts}>
                <CohortProgramCard
                  plan={enrolledPlan as any}
                  weeks={total}
                  state={enrolledState}
                  variant="enrolled"
                  reducedMotion={reducedMotion}
                />
                {enrolledCohortNote ? (
                  <Text style={s.cohortNote}>{enrolledCohortNote}</Text>
                ) : null}
              </View>
            ) : null}
            <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
              style={s.enrolledCta}
              activeOpacity={0.85}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: ClientRoute.workouts, params: { view: 'season' } });
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to training"
              accessibilityHint="Opens your season in the training tab"
            >
              <Text style={s.enrolledCtaText}>Go to training</Text>
              <Ionicons name="arrow-forward" size={18} color={CoachColors.onAccent} />
            </TouchableOpacity>
            </View>
          </View>

          {/* Streak strip + month grid — same real completion data the Train
              tab reads; streak number matches every other athlete surface. */}
          <PassStreakCalendar
            currentStreak={currentStreak}
            workouts={workouts}
            mealLogs={mealLogs}
          />

          {trainer ? (
            <View style={s.coachRow}>
              {trainer.avatar_url ? (
                <Image source={{ uri: trainer.avatar_url }} style={s.coachAvatar} />
              ) : (
                <View style={s.coachAvatarFallback}>
                  <Text style={s.coachInitials}>{coachInitials}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.coachName}>Coached by {trainer.name}</Text>
                {trainer.specialization ? <Text style={s.coachSub}>{trainer.specialization}</Text> : null}
              </View>
            </View>
          ) : null}

          <Text style={s.footnote}>
            Your season was locked in when you joined. If your coach edits the pass later,
            your copy doesn't change mid-season.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── No plan to buy ─────────────────────────────────────────────────────
  if (!plan) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Pass</Text>
        </View>
        <View style={s.emptyContainer}>
          <Ionicons name="ticket-outline" size={45} color={CoachColors.textFaint} />
          <Text style={s.emptyTitle}>Nothing on sale yet</Text>
          <Text style={s.emptyBody}>When your coach publishes a season, you'll see exactly what it contains here.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Pre-purchase: what the money buys, week by week ───────────────────
  const priceLabel = `$${Number(plan.price)}`;
  const periodLabel = plan.period === 'year' ? 'per year' : 'per month';

  // ── Cohort facts (evergreen passes: every value below is null/false and the
  //    screen renders exactly as it always has) ──────────────────────────────
  const cohortState = cohortPlan ? enrollmentState(plan as any, seatsKnown ? (seatCount as number) : 0) : null;
  const startDay = cohortPlan ? formatDay(parseLocalDay((plan as any).starts_on)) : null;
  const joinBlocked = cohortState === 'full' || cohortState === 'closed-date';
  const startedAlready = cohortPlan && cohortState === 'closed-date'
    && !!parseLocalDay((plan as any).starts_on)
    && parseLocalDay((plan as any).starts_on)! <= new Date();

  const blockedReason = cohortState === 'full'
    ? 'This cohort is full'
    : cohortState === 'closed-date'
      ? (startDay
          ? `Enrollment closed — this cohort ${startedAlready ? 'started' : 'starts'} on ${startDay}`
          : 'Enrollment closed')
      : null;

  // The calm second line: why it's closed, and that this isn't the last one.
  const blockedNote = cohortState === 'full'
    ? (capacity
        ? `Every one of the ${capacity} spots is taken, so the group stays the size your coach planned for.`
        : 'Every spot is taken, so the group stays the size your coach planned for.')
    : cohortState === 'closed-date'
      ? 'Enrollment closed so everyone could start together on the same day.'
      : null;

  // Somewhere else to go when this cohort can't be joined.
  const otherJoinable = joinBlocked && plans
    ? plans.filter((p: any) => p.id !== plan.id && canJoin(p, seatCounts[p.id] ?? 0))
    : [];

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>
        {/* Plan switcher — only if the coach sells more than one */}
        {plans && plans.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.switcher} contentContainerStyle={s.switcherContent}>
            {plans.map((p: any) => {
              const active = p.id === plan.id;
              return (
                <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
                  key={p.id}
                  style={[s.switcherChip, active && s.switcherChipActive]}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPlanId(p.id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={p.name}
                  accessibilityHint={active ? undefined : 'Shows this pass instead'}
                >
                  <Text style={[s.switcherChipText, active && s.switcherChipTextActive]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Hero — the Ladder team-card move: photograph as ground, name over
            it, scrim for contrast. The pass's own photo first, the coach's
            cover second, and failing both the purpose-shot season-pass image
            — the hero is always a photograph, never a flat color block. */}
        <View style={s.heroCard}>
          <View style={s.hero}>
            <CardImage
              source={heroCover ? { uri: heroCover } : SEASON_PASS_IMG}
              scrim="gradient"
            />
            <View style={s.heroBadgeRow}>
              <View style={s.heroBadge}>
                <Text style={s.heroBadgeText}>{seasonWeeks}-week season</Text>
              </View>
              {cohortPlan ? (
                <View style={s.heroBadge}>
                  <Text style={s.heroBadgeText}>Starts together</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.heroName}>{plan.name}</Text>
            {plan.description ? (
              <Text style={s.heroPromise}>
                {plan.description}
              </Text>
            ) : null}
          </View>

          <View style={s.heroBody}>
            {cohortPlan ? (
              <CohortProgramCard
                plan={plan as any}
                weeks={seasonWeeks}
                state={cohortState}
                capacity={capacity}
                spotsLeft={left}
                reducedMotion={reducedMotion}
              />
            ) : null}

            {trainer ? (
              <View style={s.coachRow}>
                {trainer.avatar_url ? (
                  <Image source={{ uri: trainer.avatar_url }} style={s.coachAvatar} />
                ) : (
                  <View style={s.coachAvatarFallback}>
                    <Text style={s.coachInitials}>{coachInitials}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.coachName}>Coached by {trainer.name}</Text>
                  {trainer.specialization ? <Text style={s.coachSub}>{trainer.specialization}</Text> : null}
                </View>
              </View>
            ) : null}

            {/* Totals — computed from the actual track */}
            <View style={s.statRow}>
              {[
                { n: totals.workouts, label: totals.workouts === 1 ? 'workout' : 'workouts' },
                { n: totals.meals, label: totals.meals === 1 ? 'meal plan' : 'meal plans' },
                { n: totals.checkins, label: totals.checkins === 1 ? 'check-in' : 'check-ins' },
              ].filter(x => x.n > 0).map(x => (
                <View key={x.label} style={s.statCell}>
                  <Text style={s.statNum}>{x.n}</Text>
                  <Text style={s.statLabel}>{x.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Week by week — the real track, grouped */}
        <Text style={s.sectionLabel}>
          {seasonWeeks === 1 ? 'The season' : `The ${seasonWeeks} weeks`}
        </Text>
        <View style={s.weekList}>
          {weeks.map(wk => (
            <View key={wk.week} style={s.weekRow}>
              <Text style={s.weekChip}>W{wk.week}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.weekTitle}>
                  {wk.title || (wk.isRest ? 'Rest week' : `Week ${wk.week}`)}
                </Text>
                <Text style={s.weekComposition}>{composition(wk)}</Text>
                {wk.markers.map(m => (
                  <View key={m} style={s.markerRow}>
                    <Ionicons name="flag-outline" size={12} color={CoachColors.accent} />
                    <Text style={s.markerText}>{m}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* The honest footnote — true because enrollments freeze track_snapshot */}
        <Text style={s.footnote}>
          The season you buy is the season you get. Your copy is locked in at purchase —
          later edits to the pass don't change it under you.
        </Text>
      </ScrollView>

      {/* Price + CTA — the unchanged path into app/checkout.tsx */}
      <View style={s.footerWrap}>
        {joinBlocked ? (
          <View style={s.blockedBar}>
            <Text style={s.blockedText}>{blockedReason}</Text>
            {blockedNote ? <Text style={s.blockedNote}>{blockedNote}</Text> : null}
            <View style={s.blockedActions}>
              {otherJoinable.length > 0 ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPlanId(otherJoinable[0].id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="See the other passes you can still join"
                >
                  <Text style={s.blockedLink}>See passes you can still join</Text>
                </TouchableOpacity>
              ) : null}
              {trainer ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(ClientRoute.myMessages);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${trainer.name} about the next cohort`}
                >
                  <Text style={s.blockedLink}>Message {trainer.name} about the next one</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
        <View style={[s.footer, { paddingBottom: insets.bottom + 70 }]}>
          <View>
            <Text style={s.footerPrice}>{priceLabel}</Text>
            <Text style={s.footerPeriod}>{periodLabel}</Text>
          </View>
          <TouchableOpacity
            style={[s.footerCta, joinBlocked && s.footerCtaDisabled]}
            activeOpacity={0.85}
            onPress={handleStartSeason}
            disabled={joinBlocked}
            accessibilityRole="button"
            accessibilityState={{ disabled: joinBlocked }}
            accessibilityLabel={
              joinBlocked
                ? `Start the season, unavailable. ${blockedReason}`
                : 'Start the season'
            }
          >
            <Text style={[s.footerCtaText, joinBlocked && s.footerCtaTextDisabled]}>
              {joinBlocked
                ? (cohortState === 'full' ? 'Cohort full' : 'Enrollment closed')
                : 'Start the season'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Not-yet-approved sheet. The athlete pressed the money button while
          their request is still in the coach's queue — the one moment we
          know they are genuinely interested. Everything here is true: the
          queue is real, the message goes into the real thread, and there is
          no invented scarcity. */}
      <Modal
        visible={queueSheet !== 'hidden'}
        transparent
        animationType="fade"
        onRequestClose={() => setQueueSheet('hidden')}
      >
        <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={() => setQueueSheet('hidden')}>
          <TouchableOpacity activeOpacity={1} style={s.sheetCard} onPress={() => {}}>
            <View style={s.sheetBadge}>
              <Ionicons name="hourglass-outline" size={26} color={CoachColors.accent} />
            </View>
            {queueSheet === 'locked' ? (
              <>
                <Text style={s.sheetTitle}>Your place is held</Text>
                <Text style={s.sheetBody}>
                  Messaging opens once {trainer?.name ? String(trainer.name).split(' ')[0] : 'your coach'} approves
                  your request — until then the thread is theirs to open. You'll get a notification the moment
                  it happens, and this button takes your payment right after.
                </Text>
                <TouchableOpacity style={s.sheetPrimary} activeOpacity={0.85} onPress={() => setQueueSheet('hidden')}>
                  <Text style={s.sheetPrimaryText}>Keep browsing the season</Text>
                </TouchableOpacity>
              </>
            ) : queueSheet === 'sent' ? (
              <>
                <Text style={s.sheetTitle}>{trainer?.name ? `${String(trainer.name).split(' ')[0]} knows` : 'Your coach knows'}</Text>
                <Text style={s.sheetBody}>
                  Your message is in the thread{plan ? ` — "${plan.name}" is flagged as your first season` : ''}. The moment
                  they approve you, this button takes your payment and the season starts.
                </Text>
                <TouchableOpacity style={s.sheetPrimary} activeOpacity={0.85} onPress={() => setQueueSheet('hidden')}>
                  <Text style={s.sheetPrimaryText}>Keep browsing the season</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.sheetTitle}>You're in {trainer?.name ? `${String(trainer.name).split(' ')[0]}'s` : 'the'} queue</Text>
                <Text style={s.sheetBody}>
                  Your request to join hasn't been approved yet — payment unlocks the moment it is.
                  {plan ? ` Want ${trainer?.name ? String(trainer.name).split(' ')[0] : 'them'} to know "${plan.name}" is the one you're waiting on?` : ''}
                </Text>
                {queueError ? <Text style={s.sheetError}>{queueError}</Text> : null}
                {conversation?.id ? (
                  <TouchableOpacity
                    style={[s.sheetPrimary, queueSending && { opacity: 0.6 }]}
                    activeOpacity={0.85}
                    disabled={queueSending}
                    onPress={flagReadyToStart}
                    accessibilityRole="button"
                    accessibilityLabel="Tell your coach you're ready to start"
                  >
                    <Text style={s.sheetPrimaryText}>{queueSending ? 'Sending…' : "Tell them I'm ready"}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={s.sheetNote}>You'll get a notification the moment they approve you.</Text>
                )}
                <TouchableOpacity style={s.sheetSecondary} activeOpacity={0.7} onPress={() => setQueueSheet('hidden')}>
                  <Text style={s.sheetSecondaryText}>Keep browsing the season</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  sheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  sheetCard: {
    width: '100%', maxWidth: 400,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 24,
    borderCurve: 'continuous',
    padding: 24, alignItems: 'center', gap: 12,
  },
  sheetBadge: {
    width: 56, height: 56, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  sheetTitle: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 19,
    color: CoachColors.textPrimary, textAlign: 'center',
  },
  sheetBody: {
    fontFamily: CoachFonts.body, fontSize: 14, lineHeight: 20.5,
    color: CoachColors.textSecondary, textAlign: 'center',
  },
  sheetPrimary: {
    alignSelf: 'stretch', backgroundColor: CoachColors.accent,
    borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  sheetPrimaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.onAccent },
  sheetSecondary: { paddingVertical: 10 },
  sheetSecondaryText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13.5, color: CoachColors.textMuted },
  sheetError: {
    fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.danger,
    textAlign: 'center',
  },
  sheetNote: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint,
    textAlign: 'center', marginTop: 4,
  },
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 27, color: CoachColors.textPrimary },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 140 },

  // Plan switcher
  switcher: { marginBottom: 14, marginHorizontal: -20 },
  switcherContent: { paddingHorizontal: 20, gap: 8 },
  switcherChip: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 14, paddingVertical: 8, maxWidth: 220,
  },
  switcherChipActive: { backgroundColor: CoachColors.accentSoft, borderColor: CoachColors.accent },
  switcherChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },
  switcherChipTextActive: { color: CoachColors.accent },

  // Hero — always a photograph now; tall so the image can breathe, content
  // pushed to the bottom edge where CardImage's gradient scrim is strongest.
  heroCard: { borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden', borderWidth: 1, borderColor: CoachColors.borderMuted },
  hero: { backgroundColor: CoachColors.surface, minHeight: 210, padding: 20, justifyContent: 'flex-end' },
  heroBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  heroBadge: {
    // The sanctioned veil wash (CoachColors.bg at 0.55) — chips must hold
    // their own against whatever photo sits behind them.
    alignSelf: 'flex-start', backgroundColor: 'rgba(16,18,16,0.55)',
    borderRadius: 999, borderCurve: 'continuous', paddingHorizontal: 11, paddingVertical: 5,
  },
  heroBadgeText: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.textPrimary,
    letterSpacing: 0.9, textTransform: 'uppercase',
  },
  heroName: { fontFamily: CoachFonts.headingBold, fontSize: 29, color: CoachColors.textPrimary, lineHeight: 34.5 },
  heroPromise: { fontFamily: CoachFonts.body, fontSize: 15, color: 'rgba(255,255,255,0.82)', marginTop: 6, lineHeight: 22.5 },
  heroBody: { backgroundColor: CoachColors.surface, padding: 16, gap: 14 },

  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachAvatar: { width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous' },
  coachAvatarFallback: {
    width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  coachInitials: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15.5, color: CoachColors.accent },
  coachName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  coachSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 1 },

  statRow: { flexDirection: 'row', gap: 8 },
  statCell: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    backgroundColor: CoachColors.bg, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  statNum: { fontFamily: CoachFonts.headingBold, fontSize: 21.5, color: CoachColors.textPrimary },
  statLabel: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 2 },

  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textFaint,
    letterSpacing: 1, textTransform: 'uppercase', marginTop: 26, marginBottom: 12,
  },
  weekList: { gap: 8 },
  weekRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 13, borderCurve: 'continuous', paddingVertical: 12, paddingHorizontal: 14,
  },
  weekChip: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 13, color: CoachColors.accent,
    width: 34, marginTop: 1,
  },
  weekTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  weekComposition: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 3 },
  markerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  markerText: { fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textSecondary },

  footnote: {
    fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint,
    lineHeight: 20, marginTop: 20, paddingHorizontal: 2,
  },

  // Cohort facts (the designed card itself lives in
  // components/client-tabs/cohort/CohortProgramCard.tsx)
  cohortEnrolledFacts: { marginTop: 14, gap: 10 },
  cohortNote: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted,
    lineHeight: 19, marginTop: 1,
  },

  // Sticky footer — price + CTA
  footerWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, backgroundColor: CoachColors.bg,
  },
  blockedBar: {
    paddingHorizontal: 20, paddingTop: 12, gap: 4,
  },
  blockedText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  blockedNote: {
    fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, lineHeight: 19,
  },
  blockedActions: { gap: 4, marginTop: 4 },
  blockedLink: { fontFamily: CoachFonts.bodyMedium, fontSize: 14, color: CoachColors.accent },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingTop: 14,
  },
  footerCtaDisabled: { backgroundColor: CoachColors.borderMuted },
  footerPrice: { fontFamily: CoachFonts.headingBold, fontSize: 23.5, color: CoachColors.textPrimary },
  footerPeriod: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
  footerCta: {
    flex: 1, backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 15, alignItems: 'center',
  },
  footerCtaText: { fontFamily: CoachFonts.bodyBold, fontSize: 17, color: CoachColors.onAccent },
  footerCtaTextDisabled: { color: CoachColors.textMuted },

  // Enrolled summary — the membership card. Photo on top (CardImage owns the
  // scrim), facts and CTA on solid surface below.
  enrolledCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden', marginBottom: 16,
  },
  enrolledHero: { minHeight: 170, padding: 18, justifyContent: 'flex-end' },
  enrolledBody: { padding: 18, paddingTop: 4 },
  enrolledEyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.accent,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },
  enrolledPlanName: { fontFamily: CoachFonts.headingBold, fontSize: 23.5, color: CoachColors.textPrimary },
  enrolledWeek: { fontFamily: CoachFonts.body, fontSize: 15, color: 'rgba(255,255,255,0.82)', marginTop: 4 },
  enrolledCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 13, marginTop: 16,
  },
  enrolledCtaText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },

  // Empty states
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: CoachColors.bg, paddingHorizontal: 40,
  },
  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textSecondary },
  emptyBody: {
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textFaint,
    textAlign: 'center', lineHeight: 20,
  },
});
