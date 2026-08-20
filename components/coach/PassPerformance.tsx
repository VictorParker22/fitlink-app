import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

/**
 * Pass performance — coach-side attribution analytics
 * (COACH_IDENTITY_PLAN.md Phase 4).
 *
 * Per pass, from real rows only:
 * - Acquired: client_plan_enrollments.created_at in the last 30 days.
 * - Retained: enrollments with status 'active' right now.
 * - Collected: sum of `payments` rows with status 'succeeded' for this plan
 *   in the last 30 days. `payments.amount` is Stripe cents. Recurring
 *   invoice payments recorded by the webhook can lack plan_id/trainer_id,
 *   so this figure is money *attributed to the pass* — never an estimate,
 *   possibly an undercount. price × holders is deliberately not used.
 *
 * REACTIVATED IS OMITTED — it cannot be derived from real columns:
 * resumeEnrollment() sets status 'active' and NULLs paused_at (see
 * context/AppContext.tsx), re-enrollment upserts over the same row
 * (onConflict client_id,plan_id), and no table records status transitions
 * (track_events only records workout-node events). Rendering a guess would
 * violate the real-data-or-omitted rule, so the column does not exist.
 *
 * RLS (verified against live pg_policies): the coach reads enrollments via
 * "Trainers manage enrollments" (clients.trainer_id = auth.uid()) and
 * payments via "Trainers can view their own payments" (trainer_id =
 * auth.uid()). If the enrollments query errors, the whole section is
 * omitted; if only payments errors, dollars are omitted — a failed query is
 * never rendered as zero.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface PassRow {
  planId: string;
  name: string;
  acquired30d: number;
  retained: number;
  /** null ⇒ payments unreadable, dollars omitted for every pass */
  collected30dCents: number | null;
}

export default function PassPerformance() {
  const { plans } = useApp();
  const [rows, setRows] = useState<PassRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (plans.length === 0) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const planIds = plans.map((p) => p.id);
      const cutoffIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

      const { data: enrollments, error: enrollError } = await supabase
        .from('client_plan_enrollments')
        .select('plan_id, status, created_at')
        .in('plan_id', planIds);
      if (cancelled) return;
      if (enrollError || !enrollments) {
        // Query failed (RLS or otherwise) — omit the section, never fake zeroes.
        setFailed(true);
        return;
      }

      // Dollars are optional: a payments failure drops the column, not the section.
      const { data: payments, error: payError } = await supabase
        .from('payments')
        .select('plan_id, amount, created_at')
        .eq('status', 'succeeded')
        .gte('created_at', cutoffIso)
        .in('plan_id', planIds);
      if (cancelled) return;
      const paymentsReadable = !payError && payments !== null;

      const result: PassRow[] = plans.map((p) => {
        const mine = enrollments.filter((e: any) => e.plan_id === p.id);
        const acquired30d = mine.filter(
          (e: any) => e.created_at && e.created_at >= cutoffIso,
        ).length;
        const retained = mine.filter((e: any) => e.status === 'active').length;
        const collected30dCents = paymentsReadable
          ? payments
              .filter((row: any) => row.plan_id === p.id)
              .reduce((sum: number, row: any) => sum + (row.amount || 0), 0)
          : null;
        return { planId: p.id, name: p.name, acquired30d, retained, collected30dCents };
      });

      // Only show passes with at least one enrollment ever or money collected —
      // an all-zero row for a brand-new pass is noise, not insight.
      const withSignal = result.filter(
        (r) =>
          r.acquired30d > 0 ||
          r.retained > 0 ||
          (r.collected30dCents !== null && r.collected30dCents > 0) ||
          enrollments.some((e: any) => e.plan_id === r.planId),
      );
      setRows(withSignal);
    })();
    return () => {
      cancelled = true;
    };
  }, [plans]);

  // Loading, failed, no passes, or no enrollment signal at all: render nothing.
  if (failed || rows === null || rows.length === 0) return null;

  const dollarsAvailable = rows.some((r) => r.collected30dCents !== null);
  const formatDollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

  return (
    <View>
      <Text style={st.sectionTitle}>Pass performance</Text>
      <Text style={st.sectionDesc}>
        Enrollments per pass{dollarsAvailable ? ' and payments recorded in the last 30 days' : ''}.
      </Text>
      <View style={st.card}>
        {/* Column headers */}
        <View style={st.headerRow}>
          <Text style={[st.colHeader, st.nameCol]} numberOfLines={1}>Pass</Text>
          <Text style={[st.colHeader, st.numCol]}>New 30d</Text>
          <Text style={[st.colHeader, st.numCol]}>Active</Text>
          {dollarsAvailable && <Text style={[st.colHeader, st.moneyCol]}>Collected 30d</Text>}
        </View>
        {rows.map((r, i) => (
          <View key={r.planId} style={[st.row, i > 0 && st.rowDivider]}>
            <Text style={[st.rowName, st.nameCol]} numberOfLines={1}>{r.name}</Text>
            <Text style={[st.rowNum, st.numCol]}>{r.acquired30d}</Text>
            <Text style={[st.rowNum, st.numCol]}>{r.retained}</Text>
            {dollarsAvailable && (
              <Text style={[st.rowNum, st.moneyCol]}>
                {r.collected30dCents !== null ? formatDollars(r.collected30dCents) : '—'}
              </Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginTop: 22,
    marginBottom: 4,
  },
  sectionDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    lineHeight: 20,
    marginBottom: 12,
  },
  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
    marginTop: 8,
    overflow: 'hidden',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  colHeader: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11.5,
    letterSpacing: 0.5,
    color: CoachColors.textFaint,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  rowName: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14,
    color: CoachColors.textSecondary,
    paddingRight: 8,
  },
  rowNum: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  nameCol: { flex: 1, minWidth: 0 },
  numCol: { width: 58, textAlign: 'right' },
  moneyCol: { width: 92, textAlign: 'right' },
});
