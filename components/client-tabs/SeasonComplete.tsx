import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useAndroidBack } from '../../hooks/useAndroidBack';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { insertSquadEvent, SquadShare } from '../../lib/squadEvents';
import { playChime } from '../../lib/sounds';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { Motion } from '../../constants/motion';
import { WeightUnit, formatWeight, formatWeightNumber } from '../../lib/units';

const C = CoachColors;
const F = CoachFonts;

/**
 * Season finish — "the receipt, then the question" (design turn 24, option 24a).
 *
 * Shown once, in the moment the athlete completes the FINAL node of their
 * enrollment. The receipt is summed entirely from real data:
 *   - sessions completed → track_events rows for this enrollment
 *   - where each lift ended → client_workout_logs, first logged top weight
 *     against all-time best, named via the trainer's exercise library
 *   - weeks and dates → the enrollment row itself
 * Any line whose data doesn't exist is omitted, never invented.
 *
 * The question: message the coach about what's next (real send via the
 * caller's established conversation pattern), or look at the coach's other
 * published plans (real rows from the plans table — caller routes to the
 * storefront). No fake discounts, no fabricated coach quotes.
 *
 * Rendered as an absolutely-positioned overlay inside the screen — NOT a
 * native Modal — following components/client-tabs/PRCelebration.tsx.
 */

type LiftLine = { name: string; first: number; best: number };

export default function SeasonComplete({
  enrollment,
  planName,
  weeks,
  trainerWorkouts,
  otherPlans,
  unit,
  coachName,
  canSend,
  onSend,
  onViewPlans,
  onDone,
  squad,
}: {
  enrollment: any;
  planName: string;
  weeks: number;
  /** Trainer workout library rows (with workout_exercises → exercises) — used only to name lifts. */
  trainerWorkouts: any[];
  /** The coach's other plans (finished one excluded by the caller). Empty array hides the section. */
  otherPlans: any[];
  /** The athlete's lifting unit — the best-lifts list is read in it (lib/units.ts). */
  unit: WeightUnit;
  coachName: string;
  canSend: boolean;
  onSend: (message: string) => Promise<boolean>;
  onViewPlans: () => void;
  onDone: () => void;
  /** Present when the finish belongs to a pass — enables the squad feed share. */
  squad?: SquadShare | null;
}) {
  // absoluteFill View, not a native Modal — Android back would otherwise pop
  // the screen underneath while this was still covering it.
  useAndroidBack(useCallback(() => { onDone(); return true; }, [onDone]));

  const insets = useSafeAreaInsets();
  const [sessionStats, setSessionStats] = useState<{ done: number; total: number } | null>(null);
  const [lifts, setLifts] = useState<LiftLine[]>([]);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [shareSquad, setShareSquad] = useState(true);
  const squadSharedRef = useRef(false);

  const shareWithSquad = () => {
    if (!squad || !shareSquad || squadSharedRef.current) return;
    squadSharedRef.current = true;
    insertSquadEvent(squad, 'season_complete', { plan_name: planName });
  };

  const reduced = useReducedMotion();
  const cardScale = useRef(new Animated.Value(reduced ? 1 : 0.9)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playChime();
    if (reduced) {
      // Reduce Motion: crossfade only, no scale spring.
      Animated.timing(cardOpacity, { toValue: 1, duration: Motion.reduced, useNativeDriver: true }).start();
      return;
    }
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exercise id → name, from the trainer's library.
  const exerciseNames = useMemo(() => {
    const map: Record<string, string> = {};
    (trainerWorkouts || []).forEach((w: any) => {
      (w.workout_exercises || []).forEach((we: any) => {
        const ex = we.exercises;
        if (ex?.id && ex?.name && !map[ex.id]) map[ex.id] = ex.name;
      });
    });
    return map;
  }, [trainerWorkouts]);

  const totalWorkoutNodes = useMemo(() => {
    const track: any[] = Array.isArray(enrollment?.track_snapshot) ? enrollment.track_snapshot : [];
    return track.filter((n: any) => n.type === 'workout').length;
  }, [enrollment]);

  // ── Sessions completed — real track_events for this enrollment ────────────
  useEffect(() => {
    if (!enrollment?.id || totalWorkoutNodes === 0) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('track_events')
        .select('event_type, node_type')
        .eq('enrollment_id', enrollment.id);
      if (!alive || !data) return;
      const done = data.filter(
        (e: any) => e.event_type === 'completed' && (e.node_type === 'workout' || !e.node_type)
      ).length;
      if (done > 0) setSessionStats({ done: Math.min(done, totalWorkoutNodes), total: totalWorkoutNodes });
    })();
    return () => { alive = false; };
  }, [enrollment?.id, totalWorkoutNodes]);

  // ── Where the lifts ended — real logs, first vs best top weight ───────────
  useEffect(() => {
    if (!enrollment?.client_id) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('client_workout_logs')
        .select('exercises, created_at')
        .eq('client_id', enrollment.client_id)
        .gte('created_at', enrollment.started_at || '1970-01-01')
        .order('created_at', { ascending: true });
      if (!alive || !data || data.length === 0) return;
      const firstTop: Record<string, number> = {};
      const bestTop: Record<string, number> = {};
      data.forEach((row: any) => {
        (row.exercises || []).forEach((ex: any) => {
          if (!ex?.id) return;
          let top = 0;
          (ex.sets || []).forEach((set: any) => {
            if (!set?.completed) return;
            const w = parseFloat(String(set.weight)) || 0;
            if (w > top) top = w;
          });
          if (top <= 0) return;
          if (firstTop[ex.id] === undefined) firstTop[ex.id] = top;
          if (top > (bestTop[ex.id] ?? 0)) bestTop[ex.id] = top;
        });
      });
      const lines: LiftLine[] = Object.keys(bestTop)
        .filter((id) => exerciseNames[id] && bestTop[id] > firstTop[id])
        .map((id) => ({ name: exerciseNames[id], first: firstTop[id], best: bestTop[id] }))
        .sort((a, b) => b.best - a.best)
        .slice(0, 3);
      if (lines.length > 0) setLifts(lines);
    })();
    return () => { alive = false; };
  }, [enrollment?.client_id, enrollment?.started_at, exerciseNames]);

  const dateRange = useMemo(() => {
    if (!enrollment?.started_at) return null;
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const end = enrollment.completed_at || new Date().toISOString();
    return `${fmt(enrollment.started_at)} – ${fmt(end)}`;
  }, [enrollment]);

  const handleAsk = async () => {
    if (sendState === 'sending' || sendState === 'sent') return;
    setSendState('sending');
    const ok = await onSend(`Just finished ${planName} — the whole thing. What's next?`);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      shareWithSquad();
    }
    setSendState(ok ? 'sent' : 'failed');
  };

  return (
    <View style={[StyleSheet.absoluteFill, s.root]} pointerEvents="auto">
      <Animated.View style={{ flex: 1, opacity: cardOpacity, transform: [{ scale: cardScale }] }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 28 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.eyebrow}>
            {weeks > 1 ? `${weeks} weeks, done` : 'Season complete'}
          </Text>
          <Text style={s.title}>You finished the whole thing</Text>
          <Text style={s.sub}>
            {planName}
            {sessionStats ? ` · ${sessionStats.done} of ${sessionStats.total} sessions logged` : ''}
            {dateRange ? ` · ${dateRange}` : ''}
          </Text>

          {lifts.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardLabel}>Where you ended</Text>
              <View style={{ gap: 11, marginTop: 13 }}>
                {lifts.map((l, i) => (
                  <View key={l.name}>
                    {i > 0 && <View style={s.divider} />}
                    <View style={s.liftRow}>
                      <Text style={s.liftName} numberOfLines={1}>{l.name}</Text>
                      <Text style={s.liftFrom}>{formatWeightNumber(l.first)}</Text>
                      <Text style={s.liftArrow}>→</Text>
                      <Text style={s.liftTo}>{formatWeight(l.best, unit)}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={s.cardFoot}>
                First logged weight against your best, from your own session logs.
              </Text>
            </View>
          )}

          <Text style={s.sectionLabel}>What's next</Text>

          {canSend && (
            <View style={s.card}>
              <Text style={s.nextTitle}>Ask {coachName}</Text>
              <Text style={s.nextSub}>
                {coachName} can see every session you logged. One message starts the conversation
                about what comes after this.
              </Text>
              {sendState === 'sent' ? (
                <View style={s.sentRow}>
                  <Text style={s.sentText}>Sent. {coachName} will pick it up in your thread.</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={s.askBtn}
                  onPress={handleAsk}
                  activeOpacity={0.85}
                  disabled={sendState === 'sending'}
                >
                  {sendState === 'sending' ? (
                    <ActivityIndicator size="small" color={C.accent} />
                  ) : (
                    <Text style={s.askBtnText}>Ask {coachName} what's next</Text>
                  )}
                </TouchableOpacity>
              )}
              {sendState === 'failed' && (
                <Text style={s.sendError}>That didn't send — try again, or open the thread.</Text>
              )}
            </View>
          )}

          {otherPlans.length > 0 && (
            <TouchableOpacity style={[s.card, s.plansCard]} onPress={onViewPlans} activeOpacity={0.85}>
              <Text style={s.nextTitle}>
                {otherPlans.length === 1
                  ? (otherPlans[0].name || 'Another plan')
                  : `${coachName} has ${otherPlans.length} other plans`}
              </Text>
              <Text style={s.nextSub}>
                {otherPlans.length === 1
                  ? [
                      otherPlans[0].duration_weeks ? `${otherPlans[0].duration_weeks} weeks` : null,
                      otherPlans[0].price ? `$${otherPlans[0].price}` : null,
                    ].filter(Boolean).join(' · ') || 'See the details on the pass page.'
                  : 'Browse them on the pass page — your history carries over.'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={[s.card, s.breakCard]}>
            <Text style={s.nextTitle}>Or take a break</Text>
            <Text style={s.nextSub}>
              Your logs and your numbers stay right here. {coachName} can see them whenever you
              come back.
            </Text>
          </View>

          {squad && (
            <TouchableOpacity
              style={s.squadRow}
              onPress={() => { Haptics.selectionAsync(); setShareSquad(v => !v); }}
              activeOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: shareSquad }}
            >
              <View style={[s.squadBox, shareSquad && s.squadBoxOn]}>
                {shareSquad && <View style={s.squadTick} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.squadLabel}>Share with the squad</Text>
                <Text style={s.squadHint}>
                  Athletes on your pass see that you finished {planName}. Nothing else.
                </Text>
              </View>
            </TouchableOpacity>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>

        {/* In-screen absoluteFill overlay, so the floating tab bar draws over
            it — "Done" was partly under the bar. paddingTop 11 + button ~44 +
            Math.max(insets.bottom, 14). */}
        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 14) + 55 }]}>
          <TouchableOpacity
            style={s.doneBtn}
            onPress={() => { shareWithSquad(); onDone(); }}
            activeOpacity={0.85}
          >
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    backgroundColor: 'rgba(16,18,16,0.98)',
    zIndex: 100,
    elevation: 100,
  },
  scrollContent: { paddingTop: 84, paddingHorizontal: 20 },

  eyebrow: {
    fontFamily: F.bodyBold, fontSize: 12.5, color: C.accent,
    letterSpacing: 1.6, textTransform: 'uppercase', textAlign: 'center',
  },
  title: {
    fontFamily: F.headingBold, fontSize: 34.5, lineHeight: 40.5,
    color: C.textPrimary, textAlign: 'center', marginTop: 11,
  },
  sub: {
    fontFamily: F.body, fontSize: 14.5, color: C.textMuted,
    textAlign: 'center', marginTop: 9, lineHeight: 21.5,
  },

  card: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 18, borderCurve: 'continuous', padding: 16, marginTop: 12,
  },
  cardLabel: {
    fontFamily: F.bodyBold, fontSize: 12.5, color: C.textFaint,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  divider: { height: 1, backgroundColor: '#21241F', marginBottom: 11 },
  liftRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  liftName: { flex: 1, fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  liftFrom: { fontFamily: F.body, fontSize: 14, color: C.textFaint },
  liftArrow: { fontFamily: F.body, fontSize: 14, color: C.textFaint },
  liftTo: {
    fontFamily: F.headingBold, fontSize: 18.5, color: C.accent,
    minWidth: 58, textAlign: 'right',
  },
  cardFoot: {
    fontFamily: F.body, fontSize: 13.5, color: C.textMuted, lineHeight: 19,
    marginTop: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#21241F',
  },

  sectionLabel: {
    fontFamily: F.bodyBold, fontSize: 12.5, color: C.textFaint,
    letterSpacing: 1, textTransform: 'uppercase', marginTop: 26,
  },
  nextTitle: { fontFamily: F.bodySemiBold, fontSize: 16, color: C.textPrimary },
  nextSub: { fontFamily: F.body, fontSize: 13.5, color: C.textMuted, marginTop: 4, lineHeight: 20 },
  plansCard: { borderColor: 'rgba(198,242,78,0.22)', backgroundColor: '#1A2213' },
  breakCard: { backgroundColor: '#141613', borderColor: '#1E211D' },

  askBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 11, alignItems: 'center', marginTop: 12, minHeight: 40,
    justifyContent: 'center',
  },
  askBtnText: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.accent },
  sentRow: {
    marginTop: 12, borderRadius: 12, borderCurve: 'continuous', backgroundColor: C.accentSofter,
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.22)', padding: 11,
  },
  sentText: { fontFamily: F.bodyMedium, fontSize: 14, color: C.textSecondary, lineHeight: 20 },
  sendError: {
    fontFamily: F.body, fontSize: 13.5, color: C.danger, marginTop: 8, textAlign: 'center',
  },

  squadRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 11,
    marginTop: 14, paddingHorizontal: 4,
  },
  squadBox: {
    width: 20, height: 20, borderRadius: 6, borderCurve: 'continuous', marginTop: 1,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  squadBoxOn: { borderColor: C.accent, backgroundColor: C.accentSofter },
  squadTick: { width: 10, height: 10, borderRadius: 3, borderCurve: 'continuous', backgroundColor: C.accent },
  squadLabel: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textPrimary },
  squadHint: {
    fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 2, lineHeight: 18,
  },

  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  doneBtn: {
    backgroundColor: C.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 16, alignItems: 'center',
  },
  doneBtnText: { fontFamily: F.bodyBold, fontSize: 17, color: C.onAccent },
});
