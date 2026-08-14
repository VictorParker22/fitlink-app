import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Animated, Easing, Dimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useClient } from '../../context/ClientContext';
import { Spacing, Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';

// ─── Try to import health hook; gracefully handle missing module ────
let useHealthHook: (() => any) | null = null;
try {
  const mod = require('../../context/HealthContext');
  useHealthHook = mod.useHealth;
} catch {
  useHealthHook = null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ──────────────────────────────────────────────────────────
interface HealthSnapshot {
  stepsToday: number;
  stepsWeekly: number[];
  activeCaloriesToday: number;
  basalCaloriesToday: number;
  totalCaloriesToday: number;
  heartRateLatest: number | null;
  heartRateAvg24h: number | null;
  heartRateMin24h: number | null;
  heartRateMax24h: number | null;
  restingHeartRate: number | null;
  bloodOxygen: number | null;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  latestWeight: number | null;
  lastSynced: Date | null;
}

// ─── Empty snapshot shown until a health source is connected ────────
const EMPTY_DATA: HealthSnapshot = {
  stepsToday: 0,
  stepsWeekly: [0, 0, 0, 0, 0, 0, 0],
  activeCaloriesToday: 0,
  basalCaloriesToday: 0,
  totalCaloriesToday: 0,
  heartRateLatest: null,
  heartRateAvg24h: null,
  heartRateMin24h: null,
  heartRateMax24h: null,
  restingHeartRate: null,
  bloodOxygen: null,
  bloodPressureSystolic: null,
  bloodPressureDiastolic: null,
  latestWeight: null,
  lastSynced: null,
};

// ─── Constants ──────────────────────────────────────────────────────
const STEP_GOAL = 10000;
const RING_SIZE = 200;
const RING_STROKE = 14;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Component ──────────────────────────────────────────────────────
export default function HealthInsightsScreen() {
  const router = useRouter();
  const { clientData } = useClient();

  // Health hook (may be null if module not available)
  let healthCtx: any = null;
  if (useHealthHook) {
    try { healthCtx = useHealthHook(); } catch { healthCtx = null; }
  }

  const isConnected = healthCtx?.isConnected ?? false;
  const isLoading = healthCtx?.isLoading ?? false;
  const connectHealth = healthCtx?.connectHealth ?? (() => {});
  const refreshHealth = healthCtx?.refreshHealth ?? (() => Promise.resolve());
  const syncToServer = healthCtx?.syncToServer ?? ((_id: string) => Promise.resolve());

  // Use real data if connected, otherwise the empty snapshot
  const data: HealthSnapshot = (isConnected && healthCtx?.healthData) ? healthCtx.healthData : EMPTY_DATA;
  const isUsingMock = !isConnected || !healthCtx?.healthData;

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshHealth();
      if (clientData?.id) {
        await syncToServer(clientData.id);
      }
    } catch {}
    setRefreshing(false);
  }, [refreshHealth, syncToServer, clientData]);

  // ─── Pulse animation for heart rate ─────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // ─── Derived Values ─────────────────────────────────────────────
  const stepsProgress = Math.min(data.stepsToday / STEP_GOAL, 1);
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - stepsProgress);
  const distanceKm = (data.stepsToday * 0.0008).toFixed(1);
  const weeklyAvg = Math.round(data.stepsWeekly.reduce((a, b) => a + b, 0) / data.stepsWeekly.length);
  const maxWeeklySteps = Math.max(...data.stepsWeekly, STEP_GOAL);
  const todayIndex = new Date().getDay(); // 0=Sun, convert: Mon=0
  const todayBarIdx = todayIndex === 0 ? 6 : todayIndex - 1;

  // Resting HR classification
  const getHRClassification = (hr: number | null) => {
    if (hr === null) return { label: 'N/A', color: CoachColors.textMuted };
    if (hr < 60) return { label: 'Athletic', color: CoachColors.accent };
    if (hr <= 80) return { label: 'Normal', color: CoachColors.textSecondary };
    return { label: 'Elevated', color: CoachColors.warning };
  };
  const hrClass = getHRClassification(data.restingHeartRate);

  // Smart Insights
  const insights = useMemo(() => {
    const list: { icon: string; text: string; color: string }[] = [];
    if (data.stepsToday >= 8000) list.push({ icon: 'flame', text: 'Great activity day! You\'re on track.', color: CoachColors.accent });
    else if (data.stepsToday < 3000) list.push({ icon: 'walk', text: 'Try a short walk today to boost your energy.', color: CoachColors.warning });
    if (data.restingHeartRate !== null && data.restingHeartRate < 60) list.push({ icon: 'barbell', text: 'Athletic heart rate — excellent cardiovascular fitness!', color: CoachColors.accent });
    if (data.heartRateAvg24h !== null && data.heartRateAvg24h > 100) list.push({ icon: 'warning', text: 'Elevated average heart rate. Consider rest or consult a doctor.', color: CoachColors.danger });
    if (data.bloodOxygen !== null && data.bloodOxygen >= 95) list.push({ icon: 'checkmark-circle', text: 'Blood oxygen is healthy and within normal range.', color: CoachColors.accent });
    else if (data.bloodOxygen !== null && data.bloodOxygen < 95) list.push({ icon: 'warning', text: 'Blood oxygen is below normal. Monitor closely.', color: CoachColors.warning });
    if (data.stepsToday >= 3000 && data.stepsToday < 8000) list.push({ icon: 'thumbs-up', text: 'Decent activity. A little more and you\'ll hit your goal!', color: CoachColors.textSecondary });
    return list.slice(0, 3);
  }, [data]);

  // Last synced text
  const syncedText = data.lastSynced
    ? `Synced ${formatTimeSince(data.lastSynced)}`
    : 'Not synced';

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Back button */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.push(ClientRoute.more)} activeOpacity={0.6}>
        <Ionicons name="chevron-back" size={28} color={CoachColors.textPrimary} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} />}
      >
        {/* ═══ HEADER ═══ */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="heart" size={24} color={CoachColors.accent} />
              <Text style={styles.headerTitle}>Health insights</Text>
            </View>
            <Text style={styles.headerSubtitle}>
              {Platform.OS === 'ios' ? 'Powered by Apple Health' : 'Powered by Health Connect'}
            </Text>
          </View>
          <View style={styles.syncBadge}>
            <View style={[styles.syncDot, { backgroundColor: isConnected ? CoachColors.accent : CoachColors.textMuted }]} />
            <Text style={styles.syncText}>{syncedText}</Text>
          </View>
        </View>

        {/* Demo mode banner */}
        {isUsingMock && (
          <View style={styles.demoBanner}>
            <Ionicons name="information-circle-outline" size={14} color={CoachColors.textMuted} />
            <Text style={styles.demoBannerText}>Connect Apple Health or Health Connect to see your health data</Text>
          </View>
        )}

        {/* ═══ CONNECTION BANNER ═══ */}
        {!isConnected && (
          <View style={styles.connectCard}>
            <View style={styles.connectIconWrap}>
              <Ionicons name="fitness" size={28} color={CoachColors.accent} />
            </View>
            <Text style={styles.connectTitle}>Connect your health app</Text>
            <Text style={styles.connectDesc}>
              Sync steps, heart rate, and vitals from your device for real-time insights.
            </Text>
            <TouchableOpacity style={styles.connectBtn} onPress={connectHealth} activeOpacity={0.8} accessibilityLabel="Connect to Apple Health" accessibilityRole="button">
              <Ionicons name="link" size={18} color={CoachColors.onAccent} />
              <Text style={styles.connectBtnText}>Connect health</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ═══ TODAY'S ACTIVITY ═══ */}
        <Text style={styles.sectionTitle}>Today's activity</Text>
        <View style={styles.activityCard}>
          <View style={styles.activityInner}>
            {/* Progress Ring */}
            <View style={styles.ringContainer}>
              <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
                {/* Background circle */}
                <SvgCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  stroke={CoachColors.borderMuted}
                  strokeWidth={RING_STROKE}
                  fill="none"
                />
                {/* Progress circle */}
                <SvgCircle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  stroke={CoachColors.accent}
                  strokeWidth={RING_STROKE}
                  fill="none"
                  strokeDasharray={`${RING_CIRCUMFERENCE}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  transform={`rotate(-90, ${RING_SIZE / 2}, ${RING_SIZE / 2})`}
                />
              </Svg>
              {/* Center label */}
              <View style={styles.ringCenter}>
                <Text style={styles.ringStepCount}>{data.stepsToday.toLocaleString()}</Text>
                <Text style={styles.ringStepLabel}>steps</Text>
                <Text style={styles.ringGoalText}>{`/ ${STEP_GOAL.toLocaleString()} goal`}</Text>
              </View>
            </View>

            {/* Mini stat cards */}
            <View style={styles.miniStatsRow}>
              <View style={styles.miniStatCard}>
                <View style={[styles.miniStatIcon, { backgroundColor: CoachColors.accentSoft }]}>
                  <Ionicons name="flame" size={16} color={CoachColors.accent} />
                </View>
                <Text style={styles.miniStatValue}>{data.activeCaloriesToday}</Text>
                <Text style={styles.miniStatLabel}>Active cal</Text>
              </View>
              <View style={styles.miniStatCard}>
                <View style={[styles.miniStatIcon, { backgroundColor: CoachColors.accentSoft }]}>
                  <Ionicons name="trending-up" size={16} color={CoachColors.accent} />
                </View>
                <Text style={styles.miniStatValue}>{data.totalCaloriesToday.toLocaleString()}</Text>
                <Text style={styles.miniStatLabel}>Total cal</Text>
              </View>
              <View style={styles.miniStatCard}>
                <View style={[styles.miniStatIcon, { backgroundColor: CoachColors.accentSoft }]}>
                  <Ionicons name="walk" size={16} color={CoachColors.accent} />
                </View>
                <Text style={styles.miniStatValue}>{distanceKm}</Text>
                <Text style={styles.miniStatLabel}>Est. km</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ═══ HEART RATE MONITOR ═══ */}
        <Text style={styles.sectionTitle}>Heart rate</Text>
        <View style={styles.hrCard}>
          <View style={styles.hrTopRow}>
            <View style={styles.hrMainDisplay}>
              <View style={styles.hrBpmRow}>
                <Animated.View style={[styles.pulseDot, { opacity: pulseAnim, backgroundColor: CoachColors.accent }]} />
                <Text style={styles.hrBpmNumber}>{data.heartRateLatest ?? '—'}</Text>
                <Text style={styles.hrBpmUnit}>BPM</Text>
              </View>
              <Text style={styles.hrLatestLabel}>Latest reading</Text>
            </View>
            <View style={styles.hrHeartWrap}>
              <Animated.View style={{ opacity: pulseAnim }}>
                <Ionicons name="heart" size={44} color={CoachColors.accent} />
              </Animated.View>
            </View>
          </View>

          {/* HR stat pills */}
          <View style={styles.hrPillsRow}>
            {[
              { label: 'Latest', value: data.heartRateLatest, color: CoachColors.accent },
              { label: 'Avg', value: data.heartRateAvg24h, color: CoachColors.textPrimary },
              { label: 'Min', value: data.heartRateMin24h, color: CoachColors.textPrimary },
              { label: 'Max', value: data.heartRateMax24h, color: CoachColors.textPrimary },
            ].map((item) => (
              <View key={item.label} style={styles.hrPill}>
                <Text style={[styles.hrPillValue, { color: item.color }]}>{item.value ?? '—'}</Text>
                <Text style={styles.hrPillLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* Resting HR */}
          <View style={styles.restingHrCard}>
            <View style={styles.restingHrLeft}>
              <Text style={styles.restingHrLabel}>Resting heart rate</Text>
              <View style={styles.restingHrValueRow}>
                <Text style={styles.restingHrValue}>{data.restingHeartRate ?? '—'}</Text>
                <Text style={styles.restingHrUnit}>BPM</Text>
              </View>
            </View>
            <View style={[styles.restingHrBadge, { backgroundColor: CoachColors.accentSofter }]}>
              <View style={[styles.restingHrBadgeDot, { backgroundColor: hrClass.color }]} />
              <Text style={[styles.restingHrBadgeText, { color: hrClass.color }]}>{hrClass.label}</Text>
            </View>
          </View>
        </View>

        {/* ═══ WEEKLY STEPS CHART ═══ */}
        <Text style={styles.sectionTitle}>Weekly steps</Text>
        <View style={styles.chartCard}>
          {/* Average line label */}
          <View style={styles.chartAvgRow}>
            <View style={styles.chartAvgLine} />
            <Text style={styles.chartAvgText}>Avg: {weeklyAvg.toLocaleString()}</Text>
          </View>

          <View style={styles.chartBarsContainer}>
            {data.stepsWeekly.map((steps, i) => {
              const barHeight = Math.max((steps / maxWeeklySteps) * 140, 6);
              const isToday = i === todayBarIdx;
              const avgHeight = Math.max((weeklyAvg / maxWeeklySteps) * 140, 6);

              return (
                <View key={i} style={styles.chartBarCol} accessible={true} accessibilityLabel={`${DAY_LABELS[i]} steps: ${steps}`} accessibilityRole="text">
                  <Text style={[styles.chartBarValue, isToday && { color: CoachColors.accent, fontFamily: CoachFonts.bodySemiBold }]}>
                    {steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : steps}
                  </Text>
                  <View style={styles.chartBarTrack}>
                    {/* Average marker */}
                    <View style={[styles.chartAvgMarker, { bottom: avgHeight }]} />
                    {/* Bar */}
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: barHeight,
                          backgroundColor: isToday ? CoachColors.accent : CoachColors.borderMuted,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.chartDayLabel, isToday && { color: CoachColors.accent, fontFamily: CoachFonts.bodySemiBold }]}>
                    {DAY_LABELS[i]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ═══ VITALS DASHBOARD ═══ */}
        <Text style={styles.sectionTitle}>Vitals</Text>
        <View style={styles.vitalsGrid}>
          {/* SpO2 Card */}
          <View style={[styles.vitalCard, { flex: 1 }]}>
            <View style={styles.vitalHeader}>
              <View style={[styles.vitalIconWrap, { backgroundColor: CoachColors.accentSoft }]}>
                <Ionicons name="water" size={16} color={CoachColors.accent} />
              </View>
              <Text style={styles.vitalTitle}>SpO₂</Text>
            </View>
            <View style={styles.spo2Display}>
              {/* Mini gauge */}
              <Svg width={56} height={56}>
                <SvgCircle
                  cx={28} cy={28} r={22}
                  stroke={CoachColors.borderMuted}
                  strokeWidth={5}
                  fill="none"
                />
                <SvgCircle
                  cx={28} cy={28} r={22}
                  stroke={CoachColors.accent}
                  strokeWidth={5}
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 22}`}
                  strokeDashoffset={2 * Math.PI * 22 * (1 - (data.bloodOxygen ?? 0) / 100)}
                  strokeLinecap="round"
                  transform="rotate(-90, 28, 28)"
                />
              </Svg>
              <View style={styles.spo2TextWrap}>
                <Text style={[styles.vitalBigValue, { color: CoachColors.textPrimary }]}>{data.bloodOxygen ?? '—'}</Text>
                <Text style={styles.vitalBigUnit}>%</Text>
              </View>
            </View>
            <Text style={styles.vitalSubtext}>Blood oxygen</Text>
          </View>

          {/* Blood Pressure Card */}
          <View style={[styles.vitalCard, { flex: 1 }]}>
            <View style={styles.vitalHeader}>
              <View style={[styles.vitalIconWrap, { backgroundColor: CoachColors.accentSoft }]}>
                <Ionicons name="pulse" size={16} color={CoachColors.accent} />
              </View>
              <Text style={styles.vitalTitle}>BP</Text>
            </View>
            <View style={styles.bpDisplay}>
              <Text style={[styles.bpSystolic, { color: CoachColors.textPrimary }]}>
                {data.bloodPressureSystolic ?? '—'}
              </Text>
              <Text style={styles.bpSlash}>/</Text>
              <Text style={styles.bpDiastolic}>{data.bloodPressureDiastolic ?? '—'}</Text>
            </View>
            <Text style={styles.vitalSubtext}>mmHg</Text>
          </View>
        </View>

        {/* Weight Card */}
        <View style={styles.weightCard}>
          <View style={styles.weightLeft}>
            <View style={[styles.vitalIconWrap, { backgroundColor: CoachColors.accentSoft }]}>
              <Ionicons name="scale" size={16} color={CoachColors.accent} />
            </View>
            <View style={styles.weightTextCol}>
              <Text style={styles.weightTitle}>Weight</Text>
              <Text style={styles.weightSub}>Last recorded</Text>
            </View>
          </View>
          <View style={styles.weightRight}>
            <Text style={styles.weightValue}>{data.latestWeight ?? '—'}</Text>
            <Text style={styles.weightUnit}>lbs</Text>
          </View>
        </View>

        {/* ═══ SMART INSIGHTS ═══ */}
        {insights.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Smart insights</Text>
            {insights.map((insight, i) => (
              <View key={i} style={styles.insightCard}>
                <View style={styles.insightInner}>
                  <Ionicons name={insight.icon as any} size={22} color={insight.color} />
                  <View style={styles.insightTextWrap}>
                    <Text style={styles.insightText}>{insight.text}</Text>
                  </View>
                  <View style={[styles.insightAccent, { backgroundColor: insight.color }]} />
                </View>
              </View>
            ))}
          </>
        )}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
function formatTimeSince(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  scrollContent: {
    padding: Spacing.lg,
  },

  // ─── Header ───────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 4,
    marginLeft: 32,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoachColors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
  },

  // ─── Demo Banner ──────────────────────────
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoachColors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    marginBottom: Spacing.lg,
  },
  demoBannerText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
  },

  // ─── Connection Banner ────────────────────
  connectCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
  },
  connectIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  connectTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    marginBottom: Spacing.xs,
  },
  connectDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.base,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  connectBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 17,
    color: CoachColors.onAccent,
  },

  // ─── Section Title ────────────────────────
  sectionTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },

  // ─── Activity Card ────────────────────────
  activityCard: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: CoachColors.border,
    overflow: 'hidden',
  },
  activityInner: {
    padding: Spacing.xl,
    alignItems: 'center',
  },

  // Ring
  ringContainer: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  ringSvg: {
    position: 'absolute',
  },
  ringCenter: {
    alignItems: 'center',
  },
  ringStepCount: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 36,
    color: CoachColors.textPrimary,
    letterSpacing: -1,
  },
  ringStepLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textMuted,
    marginTop: -2,
  },
  ringGoalText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 2,
  },

  // Mini stats
  miniStatsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  miniStatCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: CoachColors.accentSofter,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  miniStatIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  miniStatValue: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  miniStatLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 2,
  },

  // ─── Heart Rate Card ──────────────────────
  hrCard: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: CoachColors.border,
    padding: Spacing.xl,
  },
  hrTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  hrMainDisplay: {},
  hrBpmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  hrBpmNumber: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 44,
    color: CoachColors.textPrimary,
    letterSpacing: -1,
  },
  hrBpmUnit: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 18,
    color: CoachColors.textMuted,
    marginTop: 12,
  },
  hrLatestLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 2,
  },
  hrHeartWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // HR pills
  hrPillsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  hrPill: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: CoachColors.accentSofter,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
  },
  hrPillValue: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 17,
  },
  hrPillLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 2,
  },

  // Resting HR
  restingHrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CoachColors.accentSofter,
    borderRadius: Radius.lg,
    padding: Spacing.base,
  },
  restingHrLeft: {},
  restingHrLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginBottom: 2,
  },
  restingHrValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  restingHrValue: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
  },
  restingHrUnit: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
  },
  restingHrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  restingHrBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  restingHrBadgeText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
  },

  // ─── Weekly Chart ─────────────────────────
  chartCard: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: CoachColors.border,
    padding: Spacing.xl,
  },
  chartAvgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  chartAvgLine: {
    width: 20,
    height: 2,
    backgroundColor: CoachColors.textMuted,
    borderRadius: 1,
    opacity: 0.5,
  },
  chartAvgText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
  },
  chartBarsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 190,
  },
  chartBarCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  chartBarValue: {
    fontFamily: CoachFonts.body,
    fontSize: 9,
    color: CoachColors.textMuted,
  },
  chartBarTrack: {
    width: '60%',
    maxWidth: 32,
    height: 140,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  chartAvgMarker: {
    position: 'absolute',
    left: -4,
    right: -4,
    height: 1.5,
    backgroundColor: CoachColors.textMuted,
    opacity: 0.3,
    borderRadius: 1,
  },
  chartBar: {
    width: '100%',
    borderRadius: 6,
    minHeight: 6,
  },
  chartDayLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
  },

  // ─── Vitals ───────────────────────────────
  vitalsGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  vitalCard: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: CoachColors.border,
    padding: Spacing.base,
    alignItems: 'center',
  },
  vitalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
  },
  vitalIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vitalTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textSecondary,
  },
  spo2Display: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    position: 'relative',
  },
  spo2TextWrap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  vitalBigValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
  },
  vitalBigUnit: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginLeft: 1,
  },
  vitalSubtext: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
  },
  bpDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  bpSystolic: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
  },
  bpSlash: {
    fontFamily: CoachFonts.body,
    fontSize: 26,
    color: CoachColors.textMuted,
    marginHorizontal: 2,
  },
  bpDiastolic: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 26,
    color: CoachColors.textSecondary,
  },

  // Weight card
  weightCard: {
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: CoachColors.border,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  weightLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  weightTextCol: {},
  weightTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  weightSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  weightRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  weightValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
  },
  weightUnit: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textMuted,
  },

  // ─── Insights ─────────────────────────────
  insightCard: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  insightInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  insightTextWrap: {
    flex: 1,
  },
  insightText: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textPrimary,
    lineHeight: 20,
  },
  insightAccent: {
    width: 3,
    height: '100%',
    minHeight: 32,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
});
