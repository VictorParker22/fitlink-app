// components/coach/RosterHeatmap.tsx
// GitHub-style 7-day activity heatmap for all active clients.
// Uses sessions + progressLogs from useApp() — zero extra queries.

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { FontFamily, FontSize, Radius, Spacing } from '../../constants/theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toDateStr = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

const last7Days = (): { date: Date; label: string; iso: string }[] => {
  const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  return Array.from({ length: 7 }, (_, i) => {
    const d   = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    return {
      date:  d,
      label: DAY_ABBR[d.getDay()],
      iso:   toDateStr(d),
    };
  });
};

type CellState = 'session' | 'progress' | 'empty' | 'future';

const cellConfig: Record<CellState, { bg: string; opacity: number }> = {
  session:  { bg: '#22C55E', opacity: 1   },   // session completed → green
  progress: { bg: '#6C9BF2', opacity: 0.8 },   // progress logged   → blue
  empty:    { bg: 'rgba(255,255,255,0.06)', opacity: 1 }, // nothing
  future:   { bg: 'transparent', opacity: 1 }, // future day — not applicable
};

// ─── Component ────────────────────────────────────────────────────────────────
export const RosterHeatmap: React.FC = () => {
  const router = useRouter();
  const { clients, sessions, progressLogs } = useApp();

  const days   = useMemo(() => last7Days(), []);
  const today  = toDateStr(new Date());

  const activeClients = useMemo(
    () => clients.filter(c => c.status !== 'inactive').slice(0, 8), // cap at 8 rows
    [clients],
  );

  // Pre-index sessions and progress by client_id → date
  const sessionDates  = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of sessions) {
      if (s.status !== 'completed' || !s.client_id) continue;
      const key = s.client_id;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(toDateStr(new Date(s.date)));
    }
    return map;
  }, [sessions]);

  const progressDates = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const p of progressLogs) {
      if (!p.client_id) continue;
      const key = p.client_id;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(toDateStr(new Date(p.date)));
    }
    return map;
  }, [progressLogs]);

  if (activeClients.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="grid-outline" size={14} color="rgba(255,255,255,0.5)" />
          <Text style={styles.title}>Team Adherence</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/clients' as any)}>
          <Text style={styles.seeAll}>See Roster →</Text>
        </TouchableOpacity>
      </View>

      {/* Day labels */}
      <View style={styles.dayLabelRow}>
        <View style={styles.nameCol} />
        {days.map((d, i) => (
          <View key={i} style={styles.dayCol}>
            <Text style={[styles.dayLabel, d.iso === today && styles.dayLabelToday]}>
              {d.label}
            </Text>
          </View>
        ))}
        <View style={styles.scoreCol} />
      </View>

      {/* Client rows */}
      {activeClients.map(client => {
        const hasSessions  = sessionDates.get(client.id)  ?? new Set<string>();
        const hasProgress  = progressDates.get(client.id) ?? new Set<string>();

        // Days with any activity
        const activeDays = days.filter(d => hasSessions.has(d.iso) || hasProgress.has(d.iso)).length;
        const isAlert    = activeDays === 0 && client.status === 'active';

        return (
          <TouchableOpacity
            key={client.id}
            style={styles.clientRow}
            onPress={() => router.push(`/client/${client.id}` as any)}
            activeOpacity={0.7}
          >
            {/* Avatar initial */}
            <View style={styles.nameCol}>
              <View style={styles.avatarChip}>
                <Text style={styles.avatarText}>
                  {client.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Day cells */}
            {days.map((d, i) => {
              const isFuture = d.iso > today;
              const hasS     = hasSessions.has(d.iso);
              const hasP     = hasProgress.has(d.iso);
              const state: CellState = isFuture ? 'future' : hasS ? 'session' : hasP ? 'progress' : 'empty';
              const cfg = cellConfig[state];

              return (
                <View key={i} style={styles.dayCol}>
                  <View style={[
                    styles.cell,
                    { backgroundColor: cfg.bg, opacity: cfg.opacity },
                    d.iso === today && styles.cellToday,
                    state === 'future' && styles.cellFuture,
                  ]} />
                </View>
              );
            })}

            {/* Score */}
            <View style={styles.scoreCol}>
              <Text style={[
                styles.scoreText,
                isAlert && { color: '#EF4444' },
                activeDays >= 5 && { color: '#22C55E' },
              ]}>
                {activeDays}/7{isAlert ? ' ⚠' : ''}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Legend */}
      <View style={styles.legend}>
        {[
          { color: '#22C55E',                    label: 'Session' },
          { color: '#6C9BF2',                    label: 'Progress log' },
          { color: 'rgba(255,255,255,0.06)',     label: 'No activity' },
        ].map((item, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const CELL_SIZE = 24;

const styles = StyleSheet.create({
  container: {
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  seeAll: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#6C9BF2',
  },

  // Grid layout
  dayLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  nameCol: {
    width: 38,
    alignItems: 'flex-start',
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
  },
  scoreCol: {
    width: 36,
    alignItems: 'flex-end',
  },

  dayLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
  dayLabelToday: {
    color: '#FFCC00',
  },

  avatarChip: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
  },

  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 7,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  cellFuture: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'dashed',
  },

  scoreText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },

  legend: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
});
