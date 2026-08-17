/**
 * ClientHabitGrid — Coach-side weekly habit dot matrix
 *
 * Shows the last 7 days of a client's habit completions as a grid:
 *   Rows    = habits (Water, Steps, Sleep, Protein, Mindfulness)
 *   Columns = days (Mon → Sun, with today highlighted)
 *   Dots    = filled (accent) = done · dim = missed
 *
 * The grid itself (day headers, habit rows, dots, legend) lives in
 * components/shared/HabitGrid.tsx and is shared with the athlete's Progress
 * tab. This wrapper owns the coach-only parts: the fetch, the realtime
 * overlay from AppContext, the collapsible header and the week score badge.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import HabitGrid, { HABITS, getLast7Days, pct } from '../shared/HabitGrid';

interface HabitGridProps {
  clientId: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientHabitGrid({ clientId }: HabitGridProps) {
  const [fetchedRows, setFetchedRows] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const { liveHabitRows } = useApp();

  const days = getLast7Days();
  const dateStrings = days.map((d) => d.date);

  // Realtime rows win over the initial fetch — a habit checked off on the
  // athlete's phone flips the dot here without pull-to-refresh.
  const rows: Record<string, any> = { ...fetchedRows };
  for (const d of dateStrings) {
    const live = liveHabitRows[`${clientId}:${d}`];
    if (live) rows[d] = live;
  }

  const fetchHabits = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('client_habits')
        .select('*')
        .eq('client_id', clientId)
        .in('date', dateStrings);

      if (error) throw error;

      // Index by date for O(1) lookup
      const indexed: Record<string, any> = {};
      (data || []).forEach((row) => {
        indexed[row.date] = row;
      });
      setFetchedRows(indexed);
    } catch (err) {
      if (__DEV__) console.log('[ClientHabitGrid] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  // Overall week score
  const totalPossible = HABITS.length * days.length;
  const totalLogged = HABITS.reduce(
    (sum, habit) => sum + days.filter((d) => rows[d.date]?.[habit.key] === true).length,
    0,
  );
  const overallPct = pct(totalLogged, totalPossible);

  const scoreColor =
    overallPct === 0   ? CoachColors.textMuted :
    overallPct >= 80   ? CoachColors.accent :
    overallPct >= 50   ? CoachColors.warning : CoachColors.danger;

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <TouchableOpacity
        style={s.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={`Habits this week, ${overallPct} percent complete`}
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Double tap to collapse the habit grid' : 'Double tap to expand the habit grid'}
      >
        <View>
          <Text style={s.tagHeader}>Habits this week</Text>
          <Text style={s.title}>Daily tracking</Text>
        </View>
        <View style={s.headerRight}>
          <View style={[s.scoreBadge, { borderColor: `${scoreColor}50` }]}>
            <Text style={[s.scoreText, { color: scoreColor }]}>
              {overallPct}%
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={CoachColors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          {loading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color={CoachColors.textMuted} />
            </View>
          ) : totalLogged === 0 ? (
            <View style={s.noDataRow}>
              <Text style={s.noDataText}>No habits logged this week</Text>
            </View>
          ) : (
            <HabitGrid rows={rows} days={days} />
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: CoachColors.bg,
  },
  scoreText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14.5,
    letterSpacing: 0.3,
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  noDataRow: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  noDataText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textFaint,
  },
});
