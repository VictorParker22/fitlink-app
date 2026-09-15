/**
 * (client-tabs)/lift-detail.tsx — one lift, every session (canvas "Progress
 * Tab", board 6). Best set, estimated 1RM (Epley), the curve over a range,
 * and each session's sets as they were logged, newest first. The corner's
 * line at the bottom is the load hint the Solo builder wrote onto the
 * exercise (workout_exercises.notes), never generated here.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { goBackOr } from '../../lib/nav';
import { Segmented } from '../../components/client-tabs/progress/Segmented';
import { CHARACTER_COLOR } from '../../components/client-tabs/progress/CornerRead';
import { buildLiftSeries, prMoments, bestE1rm, e1rm, shortDate, clockTime, dayLabel, type LiftSeries } from '../../lib/progressData';
import { getSoloCharacter } from '../../lib/soloCharacters';
import { asWeightUnit, unitLabel } from '../../lib/units';

const SCREEN_WIDTH = Dimensions.get('window').width;
const RANGES = [{ key: 28, label: '4 weeks' }, { key: 84, label: '12 weeks' }, { key: 0, label: 'All' }];
const FEEL_TEXT: Record<string, string> = { easy: 'felt easy', right: 'felt right', grind: 'a grind', failed: 'a failed rep' };

export default function LiftDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const { clientData, workouts } = useClient();
  const unit = asWeightUnit(clientData?.weight_unit);
  const corner = getSoloCharacter(clientData?.solo_character);
  const [logs, setLogs] = useState<any[] | null>(null);
  const [range, setRange] = useState<number>(28);

  useEffect(() => {
    if (!clientData?.id) return;
    supabase.from('client_workout_logs').select('exercises, created_at, workout_id').eq('client_id', clientData.id).order('created_at', { ascending: true })
      .then(({ data }) => setLogs(data || []));
  }, [clientData?.id]);

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    (workouts || []).forEach((cw: any) => (cw.workouts?.workout_exercises || []).forEach((we: any) => { if (we.exercises?.id && we.exercises?.name) map[we.exercises.id] = we.exercises.name; }));
    return map;
  }, [workouts]);
  const workoutNames = useMemo(() => {
    const map: Record<string, string> = {};
    (workouts || []).forEach((cw: any) => { if (cw.workouts?.id && cw.workouts?.name) map[cw.workouts.id] = cw.workouts.name; });
    return map;
  }, [workouts]);
  // The builder's load hint for this exercise, from the most recent assignment that has one.
  const cornerNote = useMemo(() => {
    let note: string | null = null;
    [...(workouts || [])].sort((a: any, b: any) => String(b.assigned_date ?? '').localeCompare(String(a.assigned_date ?? ''))).some((cw: any) =>
      (cw.workouts?.workout_exercises || []).some((we: any) => { if (we.exercises?.id === exerciseId && we.notes) { note = String(we.notes); return true; } return false; }));
    return note;
  }, [workouts, exerciseId]);

  const series: LiftSeries | null = useMemo(() => buildLiftSeries(logs || [], names).find((s) => s.exerciseId === exerciseId) ?? null, [logs, names, exerciseId]);
  const inRange = useMemo(() => {
    if (!series) return [];
    if (range === 0) return series.sessions;
    const cutoff = Date.now() - range * 86_400_000;
    return series.sessions.filter((s) => new Date(s.date).getTime() >= cutoff);
  }, [series, range]);
  const prDates = useMemo(() => new Set(series ? prMoments([series]).map((p) => p.date) : []), [series]);

  const best = series ? series.sessions.reduce((b, s) => (s.best > b.best ? s : b), series.sessions[0]) : null;
  const bestSet = best?.sets.find((x) => x.weight === best.best);
  const e1 = series ? bestE1rm(series) : 0;
  const firstE1 = series && series.sessions.length > 1 ? Math.max(...series.sessions[0].sets.map((s) => e1rm(s.weight, s.reps))) : null;

  const chartWidth = SCREEN_WIDTH - 40 - 34;
  const chartData = inRange.map((s, i) => ({
    value: s.best,
    label: i === 0 || i === inRange.length - 1 ? shortDate(s.date) : '',
    dataPointText: i === inRange.length - 1 ? `${s.best}` : '',
  }));

  return (
    <View style={st.container}>
      <ScrollView contentContainerStyle={[st.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={() => goBackOr(router, ClientRoute.myProgress)} accessibilityRole="button" accessibilityLabel="Back to progress">
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={st.kicker}>Main lift</Text>
            <Text style={st.title} numberOfLines={1}>{series?.name ?? names[exerciseId ?? ''] ?? 'Lift'}</Text>
          </View>
        </View>

        {logs === null ? <ActivityIndicator color={C.accent} /> : !series ? (
          <View style={st.card}><Text style={st.empty}>No completed sets logged for this lift yet.</Text></View>
        ) : (
          <>
            <View style={st.threeUp}>
              <View style={st.statCard}><Text style={st.statLabel}>Best set</Text><Text style={[st.statBig, { color: C.accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{best?.best} × {bestSet?.reps ?? '?'}</Text><Text style={st.statSub}>{best ? dayLabel(best.date) : ''}</Text></View>
              <View style={st.statCard}><Text style={st.statLabel}>Est. 1RM</Text><Text style={st.statBig}>{e1}</Text><Text style={st.statSub}>{firstE1 != null && e1 - firstE1 !== 0 ? `${e1 - firstE1 > 0 ? '+' : ''}${e1 - firstE1} since ${shortDate(series.sessions[0].date)}` : unitLabel(unit)}</Text></View>
              <View style={st.statCard}><Text style={st.statLabel}>Sessions</Text><Text style={st.statBig}>{series.sessions.length}</Text><Text style={st.statSub}>since {shortDate(series.sessions[0].date)}</Text></View>
            </View>

            <Segmented options={RANGES} value={range} onChange={setRange} />

            <View style={st.card}>
              <View style={st.rowBetween}><Text style={st.cardTitle}>Best set weight · {unitLabel(unit)}</Text><Text style={st.meta}>{inRange.length} session{inRange.length === 1 ? '' : 's'}</Text></View>
              {inRange.length >= 2 ? (
                <LineChart
                  data={chartData}
                  height={120}
                  width={chartWidth}
                  color={C.accent}
                  thickness={2.5}
                  startFillColor="rgba(198,242,78,0.14)"
                  endFillColor="rgba(198,242,78,0)"
                  areaChart
                  hideRules
                  hideYAxisText
                  xAxisColor={C.borderMuted}
                  yAxisColor="transparent"
                  initialSpacing={12}
                  endSpacing={16}
                  spacing={Math.max(24, (chartWidth - 40) / Math.max(1, chartData.length - 1))}
                  dataPointsColor={C.accent}
                  dataPointsRadius={3.5}
                  textColor={C.textSecondary}
                  textFontSize={11}
                  textShiftY={-8}
                  xAxisLabelTextStyle={{ color: C.textMuted, fontFamily: F.body, fontSize: 11 }}
                  yAxisOffset={Math.max(0, Math.min(...inRange.map((s) => s.best)) * 0.9)}
                />
              ) : (
                <Text style={st.empty}>{inRange.length === 1 ? `One session in this range at ${inRange[0].best}. Widen the range or log one more for a curve.` : 'No sessions in this range.'}</Text>
              )}
            </View>

            <Text style={st.sectionTitle}>Sessions</Text>
            {[...series.sessions].reverse().map((s) => {
              const isPr = prDates.has(s.date);
              const wname = s.workoutId ? workoutNames[s.workoutId] : null;
              return (
                <View key={s.date} style={[st.card, isPr && st.cardPr]} accessible accessibilityLabel={`${dayLabel(s.date)}${wname ? `, ${wname}` : ''}: ${s.sets.map((x) => `${x.weight} by ${x.reps}`).join(', ')}${isPr ? ', new best' : ''}`}>
                  <View style={st.rowBetween}>
                    <Text style={st.sessionTitle} numberOfLines={1}>{dayLabel(s.date)}{wname ? ` · ${wname}` : ''}</Text>
                    {isPr ? <View style={st.prPill}><Text style={st.prPillText}>PR</Text></View> : <Text style={st.meta}>{clockTime(s.date)}</Text>}
                  </View>
                  <View style={st.sets}>
                    {s.sets.map((x, i) => (
                      <View key={i} style={st.setPill}><Text style={[st.setText, x.feel === 'grind' || x.feel === 'failed' ? { color: C.textSecondary } : null]}>{x.weight} × {x.reps}</Text></View>
                    ))}
                  </View>
                  {s.feel ? <Text style={st.feel}>{s.sets.length > 1 && (s.feel === 'grind' || s.feel === 'failed') ? `last set ${FEEL_TEXT[s.feel]}` : FEEL_TEXT[s.feel]}</Text> : null}
                </View>
              );
            })}

            {cornerNote ? (
              <View style={st.cornerRow}>
                <View style={[st.avatar, { backgroundColor: CHARACTER_COLOR[corner.key] }]} />
                <Text style={st.cornerText}>{cornerNote}</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.textFaint },
  title: { fontFamily: F.headingBold, fontSize: 24, color: C.textPrimary, marginTop: 2 },
  threeUp: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14, borderCurve: 'continuous', padding: 12, gap: 2 },
  statLabel: { fontFamily: F.body, fontSize: 11, color: C.textFaint },
  statBig: { fontFamily: F.headingBold, fontSize: 22, color: C.textPrimary },
  statSub: { fontFamily: F.body, fontSize: 11, color: C.textSecondary },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 16, borderCurve: 'continuous', padding: 14, gap: 10 },
  cardPr: { borderColor: 'rgba(198,242,78,0.35)' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textPrimary },
  meta: { fontFamily: F.body, fontSize: 12, color: C.textSecondary },
  empty: { fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: C.textMuted },
  sectionTitle: { fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary, marginTop: 8 },
  sessionTitle: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary, flexShrink: 1 },
  prPill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: C.accentSoft },
  prPillText: { fontFamily: F.bodyBold, fontSize: 11, color: C.accent },
  sets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  setPill: { borderWidth: 1, borderColor: C.border, borderRadius: 8, borderCurve: 'continuous', paddingVertical: 6, paddingHorizontal: 9 },
  setText: { fontFamily: F.mono, fontSize: 12, color: C.textPrimary },
  feel: { fontFamily: F.body, fontSize: 12, color: C.textSecondary },
  cornerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14, borderCurve: 'continuous', padding: 12 },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  cornerText: { fontFamily: F.body, fontSize: 13, lineHeight: 19, color: C.textSecondary, flex: 1 },
});
