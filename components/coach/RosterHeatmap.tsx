// components/coach/RosterHeatmap.tsx
// GitHub-style 7-day activity heatmap for all active clients.
// Uses sessions + progressLogs from useApp() — zero extra queries.

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

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
  session:  { bg: CoachColors.accent, opacity: 1   },   // session completed — full accent
  progress: { bg: CoachColors.accent, opacity: 0.4 },   // progress logged   — dim accent
  empty:    { bg: CoachColors.borderMuted, opacity: 1 },   // nothing
  future:   { bg: 'transparent', opacity: 1 },             // future day — not applicable
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
          <Ionicons name="grid-outline" size={16} color={CoachColors.textSecondary} />
          <Text style={styles.title}>Team adherence</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(tabs)/clients' as any)}>
          <Text style={styles.seeAll}>See roster</Text>
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
                isAlert && { color: CoachColors.danger },
                activeDays >= 5 && { color: CoachColors.accent },
              ]}>
                {activeDays}/7
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* Legend */}
      <View style={styles.legend}>
        {[
          { color: CoachColors.accent,      opacity: 1,   label: 'Session' },
          { color: CoachColors.accent,      opacity: 0.4, label: 'Progress log' },
          { color: CoachColors.borderMuted, opacity: 1,   label: 'No activity' },
        ].map((item, i) => (
          <View key={i} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color, opacity: item.opacity }]} />
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
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
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
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  seeAll: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.accent,
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
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textMuted,
  },
  dayLabelToday: {
    color: CoachColors.accent,
  },

  avatarChip: {
    // minWidth/minHeight: holds the scalable two-letter initials.
    minWidth: 26,
    minHeight: 26,
    borderRadius: 8,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 10,
    color: CoachColors.textSecondary,
  },

  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 7,
  },
  cellToday: {
    borderWidth: 1.5,
    borderColor: CoachColors.border,
  },
  cellFuture: {
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderStyle: 'dashed',
  },

  scoreText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textMuted,
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
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
});
