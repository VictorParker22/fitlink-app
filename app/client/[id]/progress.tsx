import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';
import { useApp } from '../../../context/AppContext';
import { useTheme } from '../../../context/ThemeContext';
import Card from '../../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../../constants/theme';
import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export default function ProgressDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { getClientById, getClientProgress } = useApp();

  const client = getClientById(id || '');
  const progressLogs = getClientProgress(id || '');

  if (!client) return null;

  // Prepare chart data (reverse to chronological order for the chart)
  const chartData = [...progressLogs]
    .reverse()
    .filter(log => log.weight !== null)
    .map(log => ({
      value: log.weight as number,
      label: new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dataPointText: `${log.weight}`,
    }));

  const latestLog = progressLogs[0];
  const firstLog = progressLogs[progressLogs.length - 1];
  
  const weightChange = (latestLog?.weight && firstLog?.weight) 
    ? (latestLog.weight - firstLog.weight).toFixed(1) 
    : '0';

  const isLoss = Number(weightChange) < 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Progress Tracking</Text>
        <TouchableOpacity onPress={() => router.push(`/client/${id}/log-progress` as any)} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
          <Ionicons name="add" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Stats Summary */}
        <View style={styles.statsRow}>
          <Card style={styles.miniStat}>
            <Text style={[styles.miniStatValue, { color: Colors.blue }]}>{latestLog?.weight ? `${latestLog.weight}` : '--'}</Text>
            <Text style={[styles.miniStatLabel, { color: colors.textTertiary }]}>Current Weight</Text>
          </Card>
          <Card style={styles.miniStat}>
            <Text style={[styles.miniStatValue, { color: isLoss ? Colors.green : Colors.purple }]}>
              {Number(weightChange) > 0 ? '+' : ''}{weightChange}
            </Text>
            <Text style={[styles.miniStatLabel, { color: colors.textTertiary }]}>Total Change</Text>
          </Card>
        </View>

        {/* Chart */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Weight Trend</Text>
        <Card style={styles.chartCard}>
          {chartData.length > 1 ? (
            <LineChart
              data={chartData}
              width={width - Spacing.lg * 2 - Spacing.base * 2 - 20}
              height={180}
              spacing={40}
              initialSpacing={10}
              color1={Colors.purple}
              dataPointsColor1={Colors.purple}
              textColor1={colors.textPrimary}
              textShiftY={-10}
              textShiftX={-10}
              textFontSize={10}
              thickness={3}
              hideRules
              yAxisColor="transparent"
              xAxisColor={colors.border}
              yAxisTextStyle={{ color: colors.textTertiary, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textTertiary, fontSize: 10, rotation: 45 }}
              pointerConfig={{
                pointerStripHeight: 160,
                pointerStripColor: colors.border,
                pointerStripWidth: 2,
                pointerColor: Colors.purple,
                radius: 6,
                pointerLabelWidth: 80,
                pointerLabelHeight: 30,
                pointerLabelComponent: (items: any) => {
                  return (
                    <View style={{ backgroundColor: colors.bgElevated, padding: 4, borderRadius: 4, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ color: colors.textPrimary, fontSize: 10, fontFamily: FontFamily.bodySemiBold }}>
                        {items[0].value} lbs
                      </Text>
                    </View>
                  );
                },
              }}
            />
          ) : (
            <View style={styles.emptyChart}>
              <Ionicons name="bar-chart-outline" size={32} color={colors.borderStrong} />
              <Text style={[styles.emptyChartText, { color: colors.textTertiary }]}>Log more weigh-ins to see your trend</Text>
            </View>
          )}
        </Card>

        {/* History List */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>History</Text>
        {progressLogs.length === 0 ? (
          <View style={styles.emptyChart}>
            <Text style={[styles.emptyChartText, { color: colors.textTertiary }]}>No records found</Text>
          </View>
        ) : (
          <Card noPadding>
            {progressLogs.map((log, i) => (
              <View key={log.id} style={[styles.logRow, i < progressLogs.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={styles.logHeader}>
                  <View>
                    <Text style={[styles.logDate, { color: colors.textPrimary }]}>
                      {new Date(log.date).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                  <Text style={[styles.logWeight, { color: colors.textPrimary }]}>
                    {log.weight ? `${log.weight} lbs` : '--'}
                  </Text>
                </View>

                {(log.body_fat || log.measurements) && (
                  <View style={[styles.logDetails, { backgroundColor: colors.bgElevated }]}>
                    {log.body_fat && (
                      <View style={styles.logDetailItem}>
                        <Text style={[styles.logDetailLabel, { color: colors.textTertiary }]}>Body Fat</Text>
                        <Text style={[styles.logDetailValue, { color: colors.textSecondary }]}>{log.body_fat}%</Text>
                      </View>
                    )}
                    {log.measurements?.chest && (
                      <View style={styles.logDetailItem}>
                        <Text style={[styles.logDetailLabel, { color: colors.textTertiary }]}>Chest</Text>
                        <Text style={[styles.logDetailValue, { color: colors.textSecondary }]}>{log.measurements.chest}"</Text>
                      </View>
                    )}
                    {log.measurements?.waist && (
                      <View style={styles.logDetailItem}>
                        <Text style={[styles.logDetailLabel, { color: colors.textTertiary }]}>Waist</Text>
                        <Text style={[styles.logDetailValue, { color: colors.textSecondary }]}>{log.measurements.waist}"</Text>
                      </View>
                    )}
                  </View>
                )}
                
                {log.notes && (
                  <Text style={[styles.logNotes, { color: colors.textSecondary }]}>{log.notes}</Text>
                )}
              </View>
            ))}
          </Card>
        )}

        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },

  statsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  miniStat: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg },
  miniStatValue: { fontFamily: FontFamily.headingExtraBold, fontSize: 28 },
  miniStatLabel: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: 4 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, marginBottom: Spacing.sm, marginTop: Spacing.sm },
  chartCard: { paddingVertical: Spacing.xl, alignItems: 'center', marginBottom: Spacing.xl },
  emptyChart: { alignItems: 'center', justifyContent: 'center', height: 120, gap: Spacing.sm },
  emptyChartText: { fontFamily: FontFamily.body, fontSize: FontSize.sm },

  logRow: { padding: Spacing.md },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logDate: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base },
  logWeight: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },
  
  logDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.sm },
  logDetailItem: { alignItems: 'flex-start' },
  logDetailLabel: { fontFamily: FontFamily.body, fontSize: 10, textTransform: 'uppercase' },
  logDetailValue: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, marginTop: 2 },

  logNotes: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: Spacing.sm, fontStyle: 'italic' },
});
