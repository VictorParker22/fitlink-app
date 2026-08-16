/**
 * SessionsCard — the dedicated sessions surface on the athlete's Today screen.
 *
 * Three honest states, always exactly one rendered:
 *   1. Upcoming session(s) booked → the next one, compact (real date, type,
 *      duration, coach name), "+ N more this week" only from real rows.
 *      Tap → my-sessions.
 *   2. Coach, no sessions → nudge to message the coach. Booking is coach-side
 *      only (book-session.tsx picks from the coach's client list), so there is
 *      no "request a session" button here — a dead button would be a lie.
 *   3. No coach → up to 3 real coaches from the marketplace, matched against
 *      the athlete's stored intake via lib/coachMatch. Reasons are shown only
 *      when a real overlap exists; without intake or overlaps the section is
 *      labeled "Coaches on FitLink", never "Recommended for you".
 *
 * The ClientCopilot above has a next-session ROW; this card is the dedicated
 * surface. State 1 stays compact so it complements rather than fights it.
 */

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useClient } from '../../../context/ClientContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { matchCoaches, CoachMatchResult } from '../../../lib/coachMatch';

const C = CoachColors;
const F = CoachFonts;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstName(name?: string): string {
  return (name || '').split(' ')[0] || '';
}

function initials(name?: string): string {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

/** "Today · 7:45 am" / "Tomorrow · 6:00 pm" / "Thu 21 Aug · 7:45 am" */
function sessionWhen(d: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const time = d
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  if (diff === 0) return `Today · ${time}`;
  if (diff === 1) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

/** End of the current Monday-based week (Sunday 23:59:59), local time. */
function endOfWeek(): Date {
  const d = new Date();
  const dow = d.getDay() === 0 ? 6 : d.getDay() - 1; // 0 = Monday
  d.setDate(d.getDate() + (6 - dow));
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SessionsCard() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { clientData, trainer, upcomingSessions } = useClient();

  const coachFirst = firstName(trainer?.name) || 'your coach';

  // ── State 1 data — next real booked session, sorted, plus this-week count ─
  const nextUp = useMemo(() => {
    const valid = (upcomingSessions || [])
      .filter((s: any) => s?.date && !Number.isNaN(new Date(s.date).getTime()))
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    if (valid.length === 0) return null;
    const next = valid[0];
    const weekEnd = endOfWeek().getTime();
    const moreThisWeek = valid
      .slice(1)
      .filter((s: any) => new Date(s.date).getTime() <= weekEnd).length;
    return { next, moreThisWeek };
  }, [upcomingSessions]);

  // ── State 3 data — real coaches, fetched only when there is no coach ──────
  const [coachRows, setCoachRows] = useState<CoachMatchResult[] | null>(null);
  const noCoach = !trainer;

  useEffect(() => {
    if (!noCoach) return;
    let alive = true;
    (async () => {
      try {
        const [{ data: trainers }, { data: allPlans }] = await Promise.all([
          supabase
            .from('trainers')
            .select('id, name, specialization, bio, avatar_url')
            .order('name'),
          supabase.from('plans').select('id, trainer_id, name, description'),
        ]);
        if (!alive) return;
        const plansByTrainer = new Map<string, any[]>();
        (allPlans || []).forEach((p: any) => {
          const list = plansByTrainer.get(p.trainer_id) || [];
          list.push(p);
          plansByTrainer.set(p.trainer_id, list);
        });
        const intake = clientData?.assessment_data?.intake || null;
        setCoachRows(matchCoaches(trainers || [], plansByTrainer, intake).slice(0, 3));
      } catch {
        if (alive) setCoachRows([]);
      }
    })();
    return () => { alive = false; };
  }, [noCoach, clientData?.assessment_data]);

  const entering = reduced ? undefined : FadeInDown.delay(120).duration(320);

  // ── State 3 — no coach ─────────────────────────────────────────────────────
  if (noCoach) {
    // Still loading the marketplace — render nothing rather than a skeleton lie.
    if (coachRows === null) return null;
    const hasReasons = coachRows.some((m) => m.reason);
    const sectionLabel = hasReasons ? 'Recommended for you' : 'Coaches on FitLink';
    return (
      <Animated.View entering={entering} style={st.card}>
        <Text style={st.eyebrow}>Sessions</Text>
        <Text style={st.title}>Find your coach</Text>
        <Text style={st.sub}>
          Sessions land here once a coach takes you on.
        </Text>
        {coachRows.length > 0 && (
          <>
            <Text style={st.coachSectionLabel}>{sectionLabel}</Text>
            {coachRows.map((m, i) => (
              <Pressable
                key={m.trainer.id}
                style={[st.coachRow, i > 0 && st.coachRowBorder]}
                onPress={() => router.push(ClientRoute.findCoach)}
                accessibilityRole="button"
                accessibilityLabel={`${m.trainer.name}${m.trainer.specialization ? `, ${m.trainer.specialization}` : ''}${m.reason ? `. ${m.reason}` : ''}. Double tap to see their profile in find a coach`}
              >
                {m.trainer.avatar_url ? (
                  <Image source={{ uri: m.trainer.avatar_url }} style={st.coachAvatarImg} />
                ) : (
                  <View style={st.coachAvatar}>
                    <Text style={st.coachAvatarText}>{initials(m.trainer.name)}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={st.coachName} numberOfLines={1}>{m.trainer.name}</Text>
                  {m.trainer.specialization ? (
                    <Text style={st.coachSpec} numberOfLines={1}>{m.trainer.specialization}</Text>
                  ) : null}
                  {m.reason ? (
                    <Text style={st.coachReason} numberOfLines={1}>{m.reason}</Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </>
        )}
        <Pressable
          style={st.browseRow}
          onPress={() => router.push(ClientRoute.findCoach)}
          accessibilityRole="button"
          accessibilityLabel="Browse all coaches"
        >
          <Text style={st.browseText}>Browse all coaches</Text>
        </Pressable>
      </Animated.View>
    );
  }

  // ── State 1 — next booked session, compact ────────────────────────────────
  if (nextUp) {
    const s = nextUp.next;
    const d = new Date(s.date);
    const when = sessionWhen(d);
    const metaParts: string[] = [];
    if (s.type) metaParts.push(String(s.type));
    if (s.duration) metaParts.push(`${s.duration} min`);
    if (trainer?.name) metaParts.push(`with ${coachFirst}`);
    const meta = metaParts.join(' · ');
    return (
      <Animated.View entering={entering}>
        <Pressable
          style={st.card}
          onPress={() => router.push(ClientRoute.mySessions)}
          accessibilityRole="button"
          accessibilityLabel={`Next session: ${when}${meta ? `, ${meta}` : ''}${nextUp.moreThisWeek > 0 ? `. Plus ${nextUp.moreThisWeek} more this week` : ''}. Double tap to see all sessions`}
        >
          <View style={st.sessionHead}>
            <View style={{ flex: 1 }}>
              <Text style={st.eyebrow}>Next session</Text>
              <Text style={st.sessionWhen}>{when}</Text>
              {meta ? <Text style={st.sub}>{meta}</Text> : null}
              {nextUp.moreThisWeek > 0 && (
                <Text style={st.moreLine}>
                  + {nextUp.moreThisWeek} more this week
                </Text>
              )}
            </View>
            <View style={st.viewPill}>
              <Text style={st.viewPillText}>View</Text>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // ── State 2 — coach, nothing booked ────────────────────────────────────────
  return (
    <Animated.View entering={entering} style={st.card}>
      <Text style={st.eyebrow}>Sessions</Text>
      <Text style={st.title}>No sessions on the calendar</Text>
      <Text style={st.sub}>
        Want to set one up with {coachFirst}? Booking happens on {coachFirst}'s side — a message is how one gets on the calendar.
      </Text>
      <Pressable hitSlop={{ top: 3, bottom: 3 }}
        style={st.messageBtn}
        onPress={() => router.push(ClientRoute.myMessages)}
        accessibilityRole="button"
        accessibilityLabel={`Message ${coachFirst} about setting up a session`}
      >
        <Text style={st.messageBtnText}>Message {coachFirst}</Text>
      </Pressable>
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
  sub: {
    fontFamily: F.body,
    fontSize: 12.5,
    color: C.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },

  // State 1
  sessionHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionWhen: {
    fontFamily: F.headingBold,
    fontSize: 17,
    color: C.textPrimary,
    marginTop: 7,
  },
  moreLine: {
    fontFamily: F.bodySemiBold,
    fontSize: 11.5,
    color: C.accent,
    marginTop: 6,
  },
  viewPill: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  viewPillText: { fontFamily: F.bodySemiBold, fontSize: 12, color: C.textSecondary },

  // State 2
  messageBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 13,
  },
  messageBtnText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textSecondary },

  // State 3
  coachSectionLabel: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 2,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    minHeight: 56,
  },
  coachRowBorder: { borderTopWidth: 1, borderTopColor: C.borderMuted },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A3320',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  coachAvatarText: { fontFamily: F.bodyBold, fontSize: 12.5, color: C.accent },
  coachName: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textPrimary },
  coachSpec: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  coachReason: { fontFamily: F.bodySemiBold, fontSize: 11.5, color: C.accent, marginTop: 3 },
  browseRow: {
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
    paddingTop: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  browseText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.accent },
});
