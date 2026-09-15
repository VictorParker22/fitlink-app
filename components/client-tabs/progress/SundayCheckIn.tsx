/**
 * SundayCheckIn — the Solo athlete's weekly check-in (canvas "Progress Tab",
 * board 5). The week is read from the logs first, four ratings are one tap
 * each, one line of text, and the corner replies in place (solo-progress
 * mode 'checkin' → client_progress_reads + client_checkins.corner_reply).
 * Coached athletes keep the coach-authored WeeklyCheckIn.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { useClient } from '../../../context/ClientContext';
import { CoachColors as C, CoachFonts as F } from '../../../constants/coachDesign';
import { Segmented } from './Segmented';
import { CHARACTER_COLOR } from './CornerRead';
import { getSoloCharacter } from '../../../lib/soloCharacters';
import { fetchProgressRead, type HealthFacts } from '../../../lib/progressRead';
import { mondayOf, formatHours } from '../../../lib/progressData';
import { localDayString } from '../../../lib/streak';

export interface WeekFacts {
  sessionsDone: number;
  sessionsPlanned: number | null;
  stepsAvg: number | null;
  sleepAvgMin: number | null;
  habitsDone: number;
  habitsPossible: number;
  proteinDays: number;
}

const RATING = [1, 2, 3, 4, 5].map((n) => ({ key: n, label: String(n) }));

export function SundayCheckIn({ facts, health, characterKey, onReplied }: {
  facts: WeekFacts;
  health: HealthFacts;
  characterKey?: string | null;
  onReplied?: () => void;
}) {
  const { clientData } = useClient();
  const ch = getSoloCharacter(characterKey ?? undefined);
  const color = CHARACTER_COLOR[ch.key] ?? CHARACTER_COLOR.reyes;
  const weekStart = useMemo(() => localDayString(mondayOf(new Date())), []);

  const [existing, setExisting] = useState<any | null | undefined>(undefined); // undefined = loading
  const [energy, setEnergy] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [training, setTraining] = useState<number | null>(null);
  const [food, setFood] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [replyState, setReplyState] = useState<'idle' | 'thinking' | 'locked' | 'failed'>('idle');

  useEffect(() => {
    if (!clientData?.id) return;
    let alive = true;
    supabase.from('client_checkins').select('*').eq('client_id', clientData.id).eq('week_start', weekStart).maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setExisting(data ?? null);
        if (data?.corner_reply) setReply(data.corner_reply);
      });
    return () => { alive = false; };
  }, [clientData?.id, weekStart]);

  const submitted = !!existing?.submitted_at;
  const canSend = energy !== null && sleep !== null && training !== null && food !== null && !sending;

  const askCorner = useCallback(async () => {
    setReplyState('thinking');
    const res = await fetchProgressRead('checkin', health);
    if (res.ok) { setReply(res.read.body); setReplyState('idle'); onReplied?.(); }
    else setReplyState(res.reason === 'premium_required' ? 'locked' : 'failed');
  }, [health, onReplied]);

  const send = useCallback(async () => {
    if (!clientData?.id || !canSend) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSending(true); setError(null);
    const payload: Record<string, any> = {
      ...(existing?.id ? { id: existing.id } : {}),
      client_id: clientData.id,
      trainer_id: null,
      week_start: weekStart,
      energy_level: energy, sleep_quality: sleep, workout_adherence: training, diet_adherence: food,
      highlight: note.trim() || null,
      submitted_at: new Date().toISOString(),
    };
    const { data, error: err } = await supabase.from('client_checkins').upsert(payload, { onConflict: 'client_id,week_start' }).select('*').maybeSingle();
    setSending(false);
    if (err) { setError('The check-in did not save. Check your connection and try again.'); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setExisting(data ?? { ...payload });
    askCorner();
  }, [clientData?.id, canSend, existing?.id, weekStart, energy, sleep, training, food, note, askCorner]);

  const weekLabel = new Date(weekStart + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <View style={st.wrap}>
      <View style={st.headRow}>
        <View>
          <Text style={st.kicker}>Sunday check-in</Text>
          <Text style={st.title}>Week of {weekLabel}</Text>
        </View>
        {submitted ? <View style={st.sentPill}><Text style={st.sentPillText}>Sent</Text></View> : null}
      </View>

      {/* The week, from the logs, before any question */}
      <View style={st.factsCard}>
        <Text style={st.factsKicker}>Your week, from the logs</Text>
        <View style={st.factsGrid}>
          <Fact big={facts.sessionsPlanned != null ? `${facts.sessionsDone}/${facts.sessionsPlanned}` : String(facts.sessionsDone)} small="sessions" />
          <Fact big={facts.stepsAvg != null ? `${(facts.stepsAvg / 1000).toFixed(1)}k` : '—'} small={facts.stepsAvg != null ? 'steps / day' : 'no steps yet'} />
          <Fact big={facts.sleepAvgMin != null ? formatHours(facts.sleepAvgMin) : '—'} small={facts.sleepAvgMin != null ? 'sleep avg' : 'no sleep yet'} />
          <Fact big={`${facts.habitsDone}/${facts.habitsPossible}`} small="habits" />
        </View>
      </View>

      {existing === undefined ? (
        <ActivityIndicator color={C.accent} style={{ alignSelf: 'flex-start' }} />
      ) : submitted ? (
        <View style={st.answers}>
          {[['Energy', existing.energy_level], ['Sleep', existing.sleep_quality], ['Training', existing.workout_adherence], ['Food', existing.diet_adherence]].map(([l, v]) => (
            v != null ? <View key={String(l)} style={st.answerPill}><Text style={[st.answerText, Number(v) >= 4 && { color: C.accent }]}>{l} {v}</Text></View> : null
          ))}
          {!!existing.highlight && <Text style={st.quote}>"{existing.highlight}"</Text>}
        </View>
      ) : (
        <>
          <RatingRow label="Energy" hint="1 flat · 5 fired up" value={energy} onChange={setEnergy} />
          <RatingRow label="Sleep" hint={facts.sleepAvgMin != null ? `Apple Health says ${formatHours(facts.sleepAvgMin)} avg` : '1 rough · 5 rested'} value={sleep} onChange={setSleep} />
          <RatingRow label="Training" hint={facts.sessionsPlanned != null ? `${facts.sessionsDone} of ${facts.sessionsPlanned} planned, done` : `${facts.sessionsDone} done`} value={training} onChange={setTraining} />
          <RatingRow label="Food" hint={`protein hit ${facts.proteinDays} of 7 days`} value={food} onChange={setFood} />
          <View style={{ gap: 8 }}>
            <Text style={st.label}>One thing worth telling {ch.name}</Text>
            <TextInput
              style={st.input}
              value={note}
              onChangeText={setNote}
              placeholder="A pinch, a win, a week that got away…"
              placeholderTextColor={C.textFaint}
              multiline
              maxLength={400}
              selectionColor={C.accent}
              accessibilityLabel={`One thing worth telling ${ch.name}`}
            />
          </View>
          {error ? <Text style={st.error}>{error}</Text> : null}
          <Pressable
            style={[st.send, !canSend && st.sendOff]}
            onPress={send}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={`Send to ${ch.name}`}
            accessibilityState={{ disabled: !canSend, busy: sending }}
          >
            {sending ? <ActivityIndicator color={C.onAccent} /> : <Text style={st.sendText}>Send to {ch.name}</Text>}
          </Pressable>
        </>
      )}

      {(reply || replyState !== 'idle') && (
        <View style={st.replyCard}>
          <View style={st.replyHead}><View style={[st.avatar, { backgroundColor: color }]} /><Text style={st.replyKicker}>{ch.name} replied</Text></View>
          {reply ? <Text style={st.replyText}>{reply}</Text> : null}
          {replyState === 'thinking' && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator size="small" color={C.accent} /><Text style={st.replyMeta}>Reading your week…</Text></View>}
          {replyState === 'locked' && <Text style={st.replyMeta}>{ch.name} replies with Solo.</Text>}
          {replyState === 'failed' && (
            <Pressable onPress={askCorner} accessibilityRole="button"><Text style={[st.replyMeta, { color: C.accent }]}>The reply did not arrive. Try again →</Text></Pressable>
          )}
          {reply && replyState === 'idle' ? <Text style={st.replyMeta}>From your check-in, your logs and the block.</Text> : null}
        </View>
      )}
    </View>
  );
}

function Fact({ big, small }: { big: string; small: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={st.factBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{big}</Text>
      <Text style={st.factSmall}>{small}</Text>
    </View>
  );
}

function RatingRow({ label, hint, value, onChange }: { label: string; hint: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={st.ratingHead}><Text style={st.label}>{label}</Text><Text style={st.hint} numberOfLines={1}>{hint}</Text></View>
      <Segmented options={RATING} value={value} onChange={onChange} mono accent />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 14 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  kicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.textFaint },
  title: { fontFamily: F.headingBold, fontSize: 20, color: C.textPrimary, marginTop: 2 },
  sentPill: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: C.accentSoft },
  sentPillText: { fontFamily: F.bodyBold, fontSize: 11, color: C.accent },
  factsCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 18, borderCurve: 'continuous', padding: 14, gap: 8 },
  factsKicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.textFaint },
  factsGrid: { flexDirection: 'row', gap: 8 },
  factBig: { fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary },
  factSmall: { fontFamily: F.body, fontSize: 11, color: C.textSecondary },
  ratingHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  label: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textPrimary },
  hint: { fontFamily: F.body, fontSize: 12, color: C.textSecondary, flexShrink: 1 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 12, borderCurve: 'continuous', padding: 14, minHeight: 84, textAlignVertical: 'top', fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.textPrimary },
  error: { fontFamily: F.body, fontSize: 13, color: C.danger },
  send: { height: 54, borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.4 },
  sendText: { fontFamily: F.bodyBold, fontSize: 16, color: C.onAccent },
  answers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  answerPill: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  answerText: { fontFamily: F.mono, fontSize: 11, color: C.textSecondary },
  quote: { fontFamily: F.body, fontSize: 13, color: C.textSecondary, width: '100%', marginTop: 4 },
  replyCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)', borderRadius: 18, borderCurve: 'continuous', padding: 14, gap: 8 },
  replyHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  replyKicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.accent },
  replyText: { fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.textPrimary },
  replyMeta: { fontFamily: F.body, fontSize: 12, color: C.textFaint },
});
