/**
 * (client-tabs)/health-insights.tsx — Health (canvas "Progress Tab", board 3).
 *
 * What Apple Health / Health Connect holds, read from the store: steps over
 * 14 days, heart rate and resting trend, seven nights of sleep, the vitals
 * that exist. A missing measure is a sentence, never a dash. The corner's
 * line at the bottom is the stored weekly read (Solo), not generated here.
 * Before a connection the screen is the ask and nothing that looks like data.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useClient } from '../../context/ClientContext';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { goBackOr } from '../../lib/nav';
import { openHealthSettings } from '../../lib/healthSettings';
import { loadStoredRead, type ProgressRead } from '../../lib/progressRead';
import { lastDays, averageOver, formatHours, STEP_GOAL, SLEEP_GOAL_MIN } from '../../lib/progressData';
import { localDayString } from '../../lib/streak';
import { getSoloCharacter } from '../../lib/soloCharacters';
import { CHARACTER_COLOR } from '../../components/client-tabs/progress/CornerRead';
import { asWeightUnit, unitLabel } from '../../lib/units';

let useHealthHook: (() => any) | null = null;
let countMetricsFn: ((s: any) => number) | null = null;
try {
  const mod = require('../../context/HealthContext');
  useHealthHook = mod.useHealth;
  countMetricsFn = mod.countMetrics;
} catch { useHealthHook = null; }

function timeSince(d: Date): string {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function HealthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clientData } = useClient();
  let healthCtx: any = null;
  if (useHealthHook) { try { healthCtx = useHealthHook(); } catch { healthCtx = null; } }
  const platform = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  const isConnected: boolean = healthCtx?.isConnected ?? false;
  const isLoading: boolean = healthCtx?.isLoading ?? false;
  const data = isConnected ? healthCtx?.healthData ?? null : null;
  const history = isConnected ? healthCtx?.healthHistory ?? null : null;
  const unit = asWeightUnit(clientData?.weight_unit);
  const solo = !clientData?.trainer_id;
  const corner = getSoloCharacter(clientData?.solo_character);

  const [refreshing, setRefreshing] = useState(false);
  const [read, setRead] = useState<ProgressRead | null>(null);
  useEffect(() => { if (solo) loadStoredRead().then(setRead); }, [solo]);

  const onRefresh = async () => { setRefreshing(true); try { await healthCtx?.refreshHealth?.(); } catch {} setRefreshing(false); };

  const now = new Date();
  const d14 = useMemo(() => lastDays(14, now, localDayString), []); // eslint-disable-line react-hooks/exhaustive-deps
  const d7 = d14.slice(7);
  const d28 = useMemo(() => lastDays(28, now, localDayString), []); // eslint-disable-line react-hooks/exhaustive-deps
  const stepsAvg14 = history ? averageOver(history.dailySteps, d14) : null;
  const sleepAvg7 = history ? averageOver(history.sleepMinutes, d7) : null;
  const sleepLast = history?.sleepMinutes?.[localDayString(now)] ?? null;
  const rhrFirst = history ? averageOver(history.restingHr, d28.slice(0, 7)) : null;
  const rhrNow = data?.restingHeartRate ?? (history ? averageOver(history.restingHr, d7) : null);
  const metrics = data && countMetricsFn ? countMetricsFn(data) : 0;
  const hasHistory = !!history && (Object.keys(history.dailySteps).length > 0 || Object.keys(history.sleepMinutes).length > 0);
  const empty = isConnected && data && metrics === 0 && !hasHistory;

  return (
    <View style={st.container}>
      <ScrollView
        contentContainerStyle={[st.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 130 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={() => goBackOr(router, ClientRoute.myProgress)} accessibilityRole="button" accessibilityLabel="Back to progress">
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={st.kicker}>{platform}{data?.lastSynced ? ` · synced ${timeSince(new Date(data.lastSynced))}` : isConnected ? ' · connected' : ''}</Text>
            <Text style={st.title}>Health</Text>
          </View>
        </View>

        {!isConnected ? (
          <View style={st.card}>
            <View style={st.iconWrap}><Ionicons name="heart" size={26} color={C.accent} /></View>
            <Text style={st.connectTitle}>Connect {platform}</Text>
            <Text style={st.body}>{Platform.OS === 'ios' ? 'Apple' : 'Android'} will ask which categories FitLink may read. Once connected, this screen shows your steps, sleep, heart rate, blood oxygen and weight, read from your phone. Nothing is shown until then.</Text>
            <Pressable style={[st.primary, isLoading && { opacity: 0.6 }]} onPress={() => healthCtx?.connectHealth?.()} disabled={isLoading} accessibilityRole="button" accessibilityLabel={`Connect ${platform}`}>
              {isLoading ? <ActivityIndicator color={C.onAccent} /> : <Text style={st.primaryText}>Connect {platform}</Text>}
            </Pressable>
          </View>
        ) : empty ? (
          <View style={st.card}>
            <Text style={st.connectTitle}>Connected, but {platform} returned no data</Text>
            <Text style={st.body}>{Platform.OS === 'ios' ? 'iOS asks once. If the categories were not allowed then, turn them on in the Health app → your profile → Apps → FitLink.' : 'Allow FitLink in Health Connect → App permissions, and check that your phone or watch is recording.'}</Text>
            <Pressable style={st.primary} onPress={openHealthSettings} accessibilityRole="button" accessibilityLabel={Platform.OS === 'ios' ? 'Open the Health app' : 'Open settings'}>
              <Text style={st.primaryText}>{Platform.OS === 'ios' ? 'Open the Health app' : 'Open settings'}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Steps */}
            {(data?.stepsToday > 0 || (history && Object.keys(history.dailySteps).length > 0)) ? (
              <View style={st.card}>
                <Text style={st.big}>{(data?.stepsToday ?? history?.dailySteps?.[localDayString(now)] ?? 0).toLocaleString()} <Text style={st.bigUnit}>steps today</Text></Text>
                <Text style={st.meta}>{stepsAvg14 != null ? `14-day average ${stepsAvg14.toLocaleString()} · ` : ''}goal {STEP_GOAL.toLocaleString()} on rest days</Text>
                {history && (
                  <View style={st.bars} accessible accessibilityLabel={`Steps over 14 days${stepsAvg14 != null ? `, average ${stepsAvg14}` : ''}`}>
                    {d14.map((d, i) => {
                      const v = history.dailySteps[d] ?? 0;
                      const max = Math.max(STEP_GOAL, ...d14.map((x) => history.dailySteps[x] ?? 0));
                      const isToday = i === d14.length - 1;
                      return <View key={d} style={[st.bar, { height: Math.max(3, Math.round((v / max) * 70)), backgroundColor: isToday ? C.accent : v >= STEP_GOAL ? 'rgba(198,242,78,0.45)' : C.border }]} />;
                    })}
                  </View>
                )}
                <View style={st.rowBetween}><Text style={st.tiny}>{new Date(d14[0] + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text><Text style={st.tiny}>lime = over {STEP_GOAL.toLocaleString()}</Text><Text style={st.tiny}>today</Text></View>
              </View>
            ) : <Sentence text={`No steps in ${platform} yet. Carry your phone or wear your watch and they show here.`} />}

            {/* Heart */}
            {(data?.heartRateLatest != null || rhrNow != null) ? (
              <View style={st.twoUp}>
                <View style={st.statCard}>
                  <Text style={st.kicker}>Heart rate</Text>
                  <Text style={st.big}>{data?.heartRateLatest ?? '—'} <Text style={st.bigUnit}>bpm</Text></Text>
                  <Text style={st.meta}>{data?.heartRateMin24h != null && data?.heartRateMax24h != null ? `24 h ${data.heartRateMin24h}–${data.heartRateMax24h}` : 'latest reading'}</Text>
                </View>
                <View style={st.statCard}>
                  <Text style={st.kicker}>Resting</Text>
                  <Text style={st.big}>{rhrNow ?? '—'} <Text style={st.bigUnit}>bpm</Text></Text>
                  <Text style={[st.meta, rhrFirst != null && rhrNow != null && rhrNow < rhrFirst ? { color: C.accent } : null]}>{rhrFirst != null && rhrNow != null && rhrNow !== rhrFirst ? `${rhrNow - rhrFirst > 0 ? '+' : '−'}${Math.abs(rhrNow - rhrFirst)} over four weeks` : 'from your watch'}</Text>
                </View>
              </View>
            ) : null}

            {/* Sleep */}
            {history && Object.keys(history.sleepMinutes).length > 0 ? (
              <View style={st.card}>
                <Text style={st.big}>{sleepLast != null ? formatHours(sleepLast) : sleepAvg7 != null ? formatHours(sleepAvg7) : ''} <Text style={st.bigUnit}>{sleepLast != null ? 'last night' : 'average'}</Text></Text>
                <Text style={st.meta}>{sleepAvg7 != null ? `7-night average ${formatHours(sleepAvg7)}` : 'fewer than seven nights recorded'}{sleepAvg7 != null && sleepAvg7 < SLEEP_GOAL_MIN ? ' · under the 7-hour line' : ''}</Text>
                <View style={[st.bars, { height: 56 }]} accessible accessibilityLabel="Sleep over seven nights">
                  {d7.map((d, i) => {
                    const v = history.sleepMinutes[d];
                    const h = v ? Math.max(3, Math.round((Math.min(v, 600) / 600) * 56)) : 3;
                    const isLast = i === d7.length - 1;
                    return <View key={d} style={[st.bar, { height: h, backgroundColor: !v ? C.borderMuted : isLast ? C.accent : v < 360 ? C.warning : C.border }]} />;
                  })}
                </View>
                <View style={st.legend}><Legend color={C.warning} text="under 6 h" /><Legend color={C.accent} text="last night" /></View>
              </View>
            ) : isConnected ? <Sentence text={`No sleep in ${platform} yet. A watch worn overnight writes it, and the sleep habit fills itself from it.`} /> : null}

            {/* Vitals: only what exists */}
            <View style={st.twoUp}>
              {data?.bloodOxygen != null ? (
                <View style={st.statCard}><Text style={st.kicker}>Blood oxygen</Text><Text style={st.big}>{data.bloodOxygen}<Text style={st.bigUnit}>%</Text></Text><Text style={st.meta}>latest</Text></View>
              ) : null}
              {(data?.latestWeight != null || (history && history.weights.length > 0)) ? (
                <View style={st.statCard}><Text style={st.kicker}>Weight</Text><Text style={st.big}>{data?.latestWeight ?? history?.weights[history.weights.length - 1]?.lbs}</Text><Text style={st.meta}>{unitLabel(unit)}{history && history.weights.length > 0 ? ` · ${new Date(history.weights[history.weights.length - 1].date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })}` : ''}</Text></View>
              ) : null}
            </View>
            {data?.bloodPressureSystolic != null && data?.bloodPressureDiastolic != null ? (
              <View style={st.statCard}><Text style={st.kicker}>Blood pressure</Text><Text style={st.big}>{data.bloodPressureSystolic}/{data.bloodPressureDiastolic} <Text style={st.bigUnit}>mmHg</Text></Text></View>
            ) : (
              <Sentence text={`No blood pressure in ${platform} yet. A cuff that writes to it will show here.`} />
            )}

            {solo && read ? (
              <View style={st.cornerCard}>
                <View style={st.cornerHead}><View style={[st.avatar, { backgroundColor: CHARACTER_COLOR[corner.key] }]} /><Text style={st.cornerKicker}>In your plan</Text></View>
                <Text style={st.cornerText}>{read.body}</Text>
              </View>
            ) : null}

            <View style={st.rowBetween}>
              <Text style={[st.meta, { flex: 1 }]}>Read only. Change what FitLink may read in {Platform.OS === 'ios' ? 'the Health app' : 'Health Connect'}.</Text>
              <Pressable onPress={openHealthSettings} hitSlop={8} accessibilityRole="button" accessibilityLabel={Platform.OS === 'ios' ? 'Open the Health app' : 'Open settings'}><Text style={st.link}>{Platform.OS === 'ios' ? 'Open Health' : 'Open settings'}</Text></Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Sentence({ text }: { text: string }) {
  return <View style={st.sentence}><Text style={st.sentenceText}>{text}</Text></View>;
}
function Legend({ color, text }: { color: string; text: string }) {
  return <View style={st.legendItem}><View style={[st.legendSwatch, { backgroundColor: color }]} /><Text style={st.tiny}>{text}</Text></View>;
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.textFaint },
  title: { fontFamily: F.headingBold, fontSize: 24, color: C.textPrimary, marginTop: 2 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 18, borderCurve: 'continuous', padding: 16, gap: 10 },
  iconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  connectTitle: { fontFamily: F.headingBold, fontSize: 19, color: C.textPrimary },
  body: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.textSecondary },
  primary: { height: 50, borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { fontFamily: F.bodyBold, fontSize: 15, color: C.onAccent },
  big: { fontFamily: F.headingBold, fontSize: 26, color: C.textPrimary },
  bigUnit: { fontFamily: F.body, fontSize: 14, color: C.textSecondary },
  meta: { fontFamily: F.body, fontSize: 12.5, color: C.textSecondary },
  tiny: { fontFamily: F.body, fontSize: 10, color: C.textFaint },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 70 },
  bar: { flex: 1, borderRadius: 3 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  twoUp: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14, borderCurve: 'continuous', padding: 14, gap: 4 },
  legend: { flexDirection: 'row', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
  sentence: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14, borderCurve: 'continuous', padding: 12 },
  sentenceText: { fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: C.textSecondary },
  cornerCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)', borderRadius: 18, borderCurve: 'continuous', padding: 14, gap: 8 },
  cornerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  cornerKicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.accent },
  cornerText: { fontFamily: F.body, fontSize: 14, lineHeight: 21, color: C.textPrimary },
  link: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.accent },
});
