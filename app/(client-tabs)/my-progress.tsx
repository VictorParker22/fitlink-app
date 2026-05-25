import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Modal, TextInput, KeyboardAvoidingView,
  Platform, Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import Card from '../../components/Card';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import type { ThemeColors } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - Spacing.lg * 2 - Spacing.base * 2; // card padding
const CHART_HEIGHT = 180;
const CHART_PADDING = { top: 24, right: 16, bottom: 28, left: 40 };

export default function ClientProgressScreen() {
  const { progressLogs, refreshData, logProgress } = useClient();
  const { colors } = useTheme();
  const { showAlert } = useAlert();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state
  const [weight, setWeight] = useState('');
  const [bodyFat, setBodyFat] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [arms, setArms] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Modal animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // Sort progress logs
  const sortedLogs = useMemo(() =>
    [...progressLogs].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [progressLogs]
  );

  const weightLogs = useMemo(() =>
    progressLogs
      .filter((p: any) => p.weight != null)
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [progressLogs]
  );

  const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight : null;
  const firstWeight = weightLogs.length > 0 ? weightLogs[0].weight : null;
  const totalChange = latestWeight && firstWeight ? (latestWeight - firstWeight).toFixed(1) : null;

  const latestBodyFat = useMemo(() => {
    const bfLogs = sortedLogs.filter((p: any) => p.body_fat != null);
    return bfLogs.length > 0 ? bfLogs[0].body_fat : null;
  }, [sortedLogs]);

  const daysSinceLastCheckin = useMemo(() => {
    if (sortedLogs.length === 0) return null;
    const last = new Date(sortedLogs[0].date);
    const now = new Date();
    return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  }, [sortedLogs]);

  // Open/close modal
  const openModal = useCallback(() => {
    setModalVisible(true);
    slideAnim.setValue(0);
    Animated.spring(slideAnim, { toValue: 1, tension: 65, friction: 10, useNativeDriver: true }).start();
  }, [slideAnim]);

  const closeModal = useCallback(() => {
    Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setModalVisible(false);
      // Reset form
      setWeight(''); setBodyFat(''); setChest(''); setWaist(''); setHips(''); setArms(''); setNotes('');
    });
  }, [slideAnim]);

  // Save progress
  const handleSave = useCallback(async () => {
    if (!weight && !bodyFat) {
      showAlert({ type: 'warning', title: 'Missing Data', message: 'Please enter at least a weight or body fat percentage.' });
      return;
    }

    setSaving(true);
    try {
      const measurements: any = {};
      if (chest) measurements.chest = parseFloat(chest);
      if (waist) measurements.waist = parseFloat(waist);
      if (hips) measurements.hips = parseFloat(hips);
      if (arms) measurements.arms = parseFloat(arms);

      await logProgress({
        weight: weight ? parseFloat(weight) : undefined,
        bodyFat: bodyFat ? parseFloat(bodyFat) : undefined,
        measurements: Object.keys(measurements).length > 0 ? measurements : undefined,
        notes: notes || undefined,
      });

      closeModal();
      showAlert({ type: 'success', title: 'Progress Logged!', message: 'Your check-in has been saved.' });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to save progress.' });
    } finally {
      setSaving(false);
    }
  }, [weight, bodyFat, chest, waist, hips, arms, notes, logProgress, closeModal, showAlert]);

  // Toggle expansion of history entries
  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  // ─── Line Chart Builder ───────────────────────────────────────
  const chartData = useMemo(() => {
    const data = weightLogs.slice(-15);
    if (data.length < 2) return null;

    const weights = data.map((l: any) => l.weight);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const range = max - min || 1;
    const padding = range * 0.1;
    const yMin = min - padding;
    const yMax = max + padding;
    const yRange = yMax - yMin;

    const plotW = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const plotH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

    const points = data.map((l: any, i: number) => ({
      x: CHART_PADDING.left + (i / (data.length - 1)) * plotW,
      y: CHART_PADDING.top + (1 - (l.weight - yMin) / yRange) * plotH,
      weight: l.weight,
      date: l.date,
    }));

    // Smooth SVG path using cubic bezier
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      linePath += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }

    // Fill path (close to bottom)
    const bottomY = CHART_PADDING.top + plotH;
    const fillPath = linePath + ` L ${points[points.length - 1].x} ${bottomY} L ${points[0].x} ${bottomY} Z`;

    // Y-axis labels (5 ticks)
    const yLabels = Array.from({ length: 5 }, (_, i) => {
      const val = yMin + (yRange * i) / 4;
      const y = CHART_PADDING.top + (1 - i / 4) * plotH;
      return { val: Math.round(val * 10) / 10, y };
    });

    // X-axis labels (first, middle, last)
    const xLabels = [0, Math.floor(data.length / 2), data.length - 1].map(i => {
      const dt = new Date(data[i].date);
      return {
        x: points[i].x,
        label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };
    });

    return { points, linePath, fillPath, yLabels, xLabels, plotH, bottomY };
  }, [weightLogs]);

  // ─── Render ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <Text style={styles.title}>My Progress</Text>

        {progressLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="trending-up" size={36} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>Start tracking your progress!</Text>
            <Text style={styles.emptyText}>
              Log your weight, body fat, and measurements to see your trends over time.
            </Text>
            <TouchableOpacity style={styles.emptyCta} onPress={openModal} activeOpacity={0.8}>
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.emptyCtaText}>Log Your First Check-in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Stats Summary Cards */}
            <View style={styles.summaryRow}>
              <Card style={styles.summaryCard}>
                <View style={[styles.summaryIconWrap, { backgroundColor: `${colors.blue}15` }]}>
                  <Ionicons name="scale-outline" size={16} color={colors.blue} />
                </View>
                <Text style={styles.summaryLabel}>Current</Text>
                <Text style={styles.summaryValue}>{latestWeight ? `${latestWeight}` : '—'}</Text>
                <Text style={styles.summaryUnit}>lbs</Text>
              </Card>

              <Card style={styles.summaryCard}>
                <View style={[styles.summaryIconWrap, { backgroundColor: totalChange && parseFloat(totalChange) < 0 ? `${colors.green}15` : totalChange && parseFloat(totalChange) > 0 ? `${colors.accent}15` : `${colors.textTertiary}15` }]}>
                  <Ionicons
                    name={totalChange && parseFloat(totalChange) < 0 ? 'trending-down' : totalChange && parseFloat(totalChange) > 0 ? 'trending-up' : 'remove-outline'}
                    size={16}
                    color={totalChange && parseFloat(totalChange) < 0 ? colors.green : totalChange && parseFloat(totalChange) > 0 ? colors.accent : colors.textTertiary}
                  />
                </View>
                <Text style={styles.summaryLabel}>Change</Text>
                <Text style={[styles.summaryValue, {
                  color: totalChange && parseFloat(totalChange) < 0 ? colors.green : totalChange && parseFloat(totalChange) > 0 ? colors.accent : colors.textPrimary,
                }]}>
                  {totalChange ? `${parseFloat(totalChange) > 0 ? '+' : ''}${totalChange}` : '—'}
                </Text>
                <Text style={styles.summaryUnit}>lbs</Text>
              </Card>

              <Card style={styles.summaryCard}>
                <View style={[styles.summaryIconWrap, { backgroundColor: `${colors.purple}15` }]}>
                  <Ionicons name="fitness-outline" size={16} color={colors.purple} />
                </View>
                <Text style={styles.summaryLabel}>Body Fat</Text>
                <Text style={styles.summaryValue}>{latestBodyFat != null ? `${latestBodyFat}%` : '—'}</Text>
                <Text style={styles.summaryUnit}> </Text>
              </Card>
            </View>

            <View style={styles.summaryRowSecond}>
              <Card style={styles.summaryCardWide}>
                <View style={styles.summaryCardWideInner}>
                  <View style={[styles.summaryIconWrap, { backgroundColor: `${colors.accent}15` }]}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} />
                  </View>
                  <View>
                    <Text style={styles.summaryLabel}>Total Check-ins</Text>
                    <Text style={styles.summaryValue}>{progressLogs.length}</Text>
                  </View>
                </View>
              </Card>

              <Card style={styles.summaryCardWide}>
                <View style={styles.summaryCardWideInner}>
                  <View style={[styles.summaryIconWrap, { backgroundColor: `${colors.yellow}15` }]}>
                    <Ionicons name="time-outline" size={16} color={colors.yellow} />
                  </View>
                  <View>
                    <Text style={styles.summaryLabel}>Last Check-in</Text>
                    <Text style={styles.summaryValue}>
                      {daysSinceLastCheckin != null ? (daysSinceLastCheckin === 0 ? 'Today' : `${daysSinceLastCheckin}d ago`) : '—'}
                    </Text>
                  </View>
                </View>
              </Card>
            </View>

            {/* Weight Trend Line Chart */}
            {chartData && (
              <>
                <Text style={styles.sectionTitle}>Weight Trend</Text>
                <Card style={styles.chartCard}>
                  <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                    <Defs>
                      <SvgLinearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={colors.accent} stopOpacity="0.3" />
                        <Stop offset="1" stopColor={colors.accent} stopOpacity="0.02" />
                      </SvgLinearGradient>
                    </Defs>

                    {/* Grid lines */}
                    {chartData.yLabels.map((yl, i) => (
                      <Line
                        key={i}
                        x1={CHART_PADDING.left}
                        y1={yl.y}
                        x2={CHART_WIDTH - CHART_PADDING.right}
                        y2={yl.y}
                        stroke={colors.border}
                        strokeWidth={1}
                        strokeDasharray="4,4"
                      />
                    ))}

                    {/* Y-axis labels */}
                    {chartData.yLabels.map((yl, i) => (
                      <SvgText
                        key={`y-${i}`}
                        x={CHART_PADDING.left - 8}
                        y={yl.y + 4}
                        textAnchor="end"
                        fontSize={9}
                        fontFamily={FontFamily.body}
                        fill={colors.textTertiary}
                      >
                        {yl.val}
                      </SvgText>
                    ))}

                    {/* X-axis labels */}
                    {chartData.xLabels.map((xl, i) => (
                      <SvgText
                        key={`x-${i}`}
                        x={xl.x}
                        y={CHART_HEIGHT - 4}
                        textAnchor="middle"
                        fontSize={9}
                        fontFamily={FontFamily.body}
                        fill={colors.textTertiary}
                      >
                        {xl.label}
                      </SvgText>
                    ))}

                    {/* Gradient fill */}
                    <Path d={chartData.fillPath} fill="url(#chartFill)" />

                    {/* Line */}
                    <Path d={chartData.linePath} stroke={colors.accent} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Data points */}
                    {chartData.points.map((pt, i) => (
                      <Circle
                        key={i}
                        cx={pt.x}
                        cy={pt.y}
                        r={i === 0 || i === chartData.points.length - 1 ? 5 : 3}
                        fill={i === 0 || i === chartData.points.length - 1 ? colors.accent : colors.bgCard}
                        stroke={colors.accent}
                        strokeWidth={2}
                      />
                    ))}

                    {/* Start & End weight labels */}
                    <SvgText
                      x={chartData.points[0].x}
                      y={chartData.points[0].y - 10}
                      textAnchor="start"
                      fontSize={10}
                      fontWeight="bold"
                      fontFamily={FontFamily.bodySemiBold}
                      fill={colors.textSecondary}
                    >
                      {chartData.points[0].weight}
                    </SvgText>
                    <SvgText
                      x={chartData.points[chartData.points.length - 1].x}
                      y={chartData.points[chartData.points.length - 1].y - 10}
                      textAnchor="end"
                      fontSize={10}
                      fontWeight="bold"
                      fontFamily={FontFamily.bodySemiBold}
                      fill={colors.accent}
                    >
                      {chartData.points[chartData.points.length - 1].weight}
                    </SvgText>
                  </Svg>
                </Card>
              </>
            )}

            {/* History */}
            <Text style={styles.sectionTitle}>History</Text>
            {sortedLogs.map((log: any, i: number) => {
              const dt = new Date(log.date);
              const measurements = log.measurements || {};
              const hasMeasurements = Object.keys(measurements).length > 0;
              const isExpanded = expandedId === (log.id || `log-${i}`);
              const logId = log.id || `log-${i}`;

              return (
                <TouchableOpacity
                  key={logId}
                  activeOpacity={0.7}
                  onPress={() => (hasMeasurements || log.notes) ? toggleExpand(logId) : undefined}
                >
                  <Card style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <View style={[styles.historyIcon, { backgroundColor: `${colors.purple}15` }]}>
                        <Ionicons name="calendar" size={16} color={colors.purple} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyDate}>
                          {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                      </View>
                      {(hasMeasurements || log.notes) && (
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.textTertiary}
                        />
                      )}
                    </View>

                    <View style={styles.historyMetrics}>
                      {log.weight != null && (
                        <View style={[styles.metricPill, { backgroundColor: `${colors.blue}12` }]}>
                          <Text style={[styles.metricValue, { color: colors.blue }]}>{log.weight} lbs</Text>
                          <Text style={styles.metricLabel}>Weight</Text>
                        </View>
                      )}
                      {log.body_fat != null && (
                        <View style={[styles.metricPill, { backgroundColor: `${colors.accent}12` }]}>
                          <Text style={[styles.metricValue, { color: colors.accent }]}>{log.body_fat}%</Text>
                          <Text style={styles.metricLabel}>Body Fat</Text>
                        </View>
                      )}
                    </View>

                    {isExpanded && hasMeasurements && (
                      <View style={styles.measurementsRow}>
                        {Object.entries(measurements).map(([key, val]) => (
                          <View key={key} style={styles.measurementItem}>
                            <Text style={styles.measurementLabel}>{key}</Text>
                            <Text style={styles.measurementVal}>{val as string}"</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {isExpanded && log.notes && (
                      <Text style={styles.historyNotes}>{log.notes}</Text>
                    )}
                  </Card>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Bottom spacer for FAB */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab} onPress={openModal} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Bottom Sheet Modal */}
      <Modal visible={modalVisible} transparent animationType="none" statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeModal} />
          <Animated.View style={[
            styles.modalSheet,
            {
              transform: [{
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [600, 0],
                }),
              }],
            },
          ]}>
            {/* Handle */}
            <View style={styles.modalHandle} />

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
                <Text style={styles.modalTitle}>Log Progress</Text>

                {/* Weight */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Weight (lbs)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={weight}
                    onChangeText={setWeight}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 185.5"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>

                {/* Body Fat */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Body Fat % (optional)</Text>
                  <TextInput
                    style={styles.formInput}
                    value={bodyFat}
                    onChangeText={setBodyFat}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 15.0"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>

                {/* Measurements */}
                <Text style={styles.formSectionLabel}>Measurements (optional)</Text>
                <View style={styles.formRow}>
                  <View style={styles.formRowItem}>
                    <Text style={styles.formSmallLabel}>Chest (in)</Text>
                    <TextInput
                      style={styles.formInput}
                      value={chest}
                      onChangeText={setChest}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                  <View style={styles.formRowItem}>
                    <Text style={styles.formSmallLabel}>Waist (in)</Text>
                    <TextInput
                      style={styles.formInput}
                      value={waist}
                      onChangeText={setWaist}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                </View>
                <View style={styles.formRow}>
                  <View style={styles.formRowItem}>
                    <Text style={styles.formSmallLabel}>Hips (in)</Text>
                    <TextInput
                      style={styles.formInput}
                      value={hips}
                      onChangeText={setHips}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                  <View style={styles.formRowItem}>
                    <Text style={styles.formSmallLabel}>Arms (in)</Text>
                    <TextInput
                      style={styles.formInput}
                      value={arms}
                      onChangeText={setArms}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={colors.textTertiary}
                    />
                  </View>
                </View>

                {/* Notes */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Notes (optional)</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextArea]}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="How are you feeling? Energy, soreness, diet adherence..."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                </View>

                {/* Buttons */}
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Progress'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelBtn} onPress={closeModal} activeOpacity={0.7}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], letterSpacing: -0.5, marginBottom: Spacing.lg, color: colors.textPrimary },

  // Summary cards
  summaryRow: { flexDirection: 'row', gap: Spacing.sm },
  summaryRowSecond: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  summaryCardWide: { flex: 1, paddingVertical: Spacing.md },
  summaryCardWideInner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  summaryIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  summaryValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, marginTop: 2, color: colors.textPrimary },
  summaryUnit: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 1 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, marginTop: Spacing['2xl'], marginBottom: Spacing.md, color: colors.textPrimary },

  // Chart
  chartCard: { padding: Spacing.sm, alignItems: 'center' },

  // History
  historyCard: { marginBottom: Spacing.sm },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  historyIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  historyDate: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary },

  historyMetrics: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  metricPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm },
  metricValue: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm },
  metricLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },

  measurementsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  measurementItem: { minWidth: 60 },
  measurementLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, textTransform: 'capitalize', color: colors.textTertiary },
  measurementVal: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary },

  historyNotes: { fontFamily: FontFamily.body, fontSize: FontSize.sm, fontStyle: 'italic', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, lineHeight: 18, color: colors.textSecondary, borderTopColor: colors.border },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: `${colors.accent}15`, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary, textAlign: 'center', paddingHorizontal: Spacing['2xl'] },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: colors.accent, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.md, marginTop: Spacing.md },
  emptyCtaText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: '#FFF' },

  // FAB
  fab: {
    position: 'absolute', bottom: 28, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 8,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    maxHeight: '85%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 20,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.textTertiary, alignSelf: 'center', marginTop: Spacing.md, marginBottom: Spacing.sm, opacity: 0.4 },
  modalContent: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  modalTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: colors.textPrimary, marginBottom: Spacing.lg },

  // Form
  formGroup: { marginBottom: Spacing.md },
  formLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary, marginBottom: Spacing.xs },
  formSmallLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textSecondary, marginBottom: 4 },
  formSectionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  formInput: { height: 48, backgroundColor: colors.bgInput, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textPrimary },
  formTextArea: { height: 80, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  formRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  formRowItem: { flex: 1 },

  saveBtn: { backgroundColor: colors.accent, paddingVertical: 16, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.lg },
  saveBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: '#FFF' },
  cancelBtn: { paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm },
  cancelBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textTertiary },
});
