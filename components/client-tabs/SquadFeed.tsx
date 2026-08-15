import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { isCohort } from '../../lib/cohort';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

const C = CoachColors;
const F = CoachFonts;

/**
 * The squad — athletes on the same pass see each other's PRs and finishes.
 * Last 5 squad_events for the athlete's plan (self included, shown as "You").
 * Names come from payload.first_name, denormalized at write time — client
 * rows are not cross-readable between athletes under RLS.
 *
 * Real data or nothing: renders null until the table exists (42P01-silent)
 * and there is at least one event on this plan.
 *
 * COHORTS (lib/cohort.ts): a cohort is a fixed group starting together, so
 * the same plan-scoped feed IS the cohort — it is only labeled truthfully:
 * "Your cohort", with a real "N training together" count when the enrollment
 * count actually comes back queryable and greater than one. A failed count, a
 * count the athlete cannot see past their own row, or an evergreen pass all
 * leave the feed exactly as it was: "The squad", no count. No fabricated
 * members, no fabricated activity.
 */

type SquadEvent = {
  id: string;
  client_id: string;
  event_type: 'pr' | 'season_complete';
  payload: any;
  created_at: string;
};

function formatKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

export default function SquadFeed() {
  const { clientData, enrollment, plans } = useClient();
  const [events, setEvents] = useState<SquadEvent[]>([]);
  // Real cohort size, or null when the count is not queryable — never guessed.
  const [memberCount, setMemberCount] = useState<number | null>(null);

  const planId = enrollment?.plan_id;
  const plan = useMemo(
    () => (planId ? (plans || []).find((p: any) => p.id === planId) || null : null),
    [plans, planId],
  );
  const cohort = isCohort(plan as any);

  useEffect(() => {
    if (!planId) { setEvents([]); return; }
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('squad_events')
        .select('id, client_id, event_type, payload, created_at')
        .eq('plan_id', planId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!alive) return;
      // Pre-migration (42P01) or any error: feature stays silent.
      if (error || !data) { setEvents([]); return; }
      setEvents(data as SquadEvent[]);
    })();
    return () => { alive = false; };
  }, [planId]);

  // Cohort size — the same count my-pass uses for seats. Only asked for a
  // cohort; anything other than a number leaves the header uncounted.
  useEffect(() => {
    setMemberCount(null);
    if (!planId || !cohort) return;
    let alive = true;
    (async () => {
      const { count, error } = await supabase
        .from('client_plan_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', planId)
        .in('status', ['active', 'completed']);
      if (!alive) return;
      setMemberCount(error || typeof count !== 'number' ? null : count);
    })();
    return () => { alive = false; };
  }, [planId, cohort]);

  if (!planId || events.length === 0) return null;

  const line = (e: SquadEvent): string | null => {
    const isSelf = clientData?.id && e.client_id === clientData.id;
    const name = isSelf ? 'You' : e.payload?.first_name;
    if (!name) return null; // no honest name, no invented one
    if (e.event_type === 'pr') {
      const exercise = e.payload?.exercise;
      const weight = parseFloat(String(e.payload?.weight));
      if (!exercise || !(weight > 0)) return null;
      return `${name} hit a ${String(exercise).toLowerCase()} PR — ${formatKg(weight)} kg`;
    }
    const planName = e.payload?.plan_name;
    return planName ? `${name} finished ${planName}` : `${name} finished the season`;
  };

  const rows = events
    .map((e) => ({ id: e.id, text: line(e), when: timeAgo(e.created_at) }))
    .filter((r): r is { id: string; text: string; when: string } => !!r.text);

  if (rows.length === 0) return null;

  // A count of 1 is just the athlete's own row — nothing worth saying, and
  // "1 training together" would read as a claim about the group.
  const countLabel =
    cohort && typeof memberCount === 'number' && memberCount > 1
      ? `${memberCount} training together`
      : null;

  return (
    <View style={s.card}>
      <View style={s.headRow}>
        <Text style={s.label}>{cohort ? 'Your cohort' : 'The squad'}</Text>
        {countLabel ? <Text style={s.count}>{countLabel}</Text> : null}
      </View>
      <View style={{ marginTop: 10, gap: 9 }}>
        {rows.map((r, i) => (
          <View key={r.id}>
            {i > 0 && <View style={s.divider} />}
            <View style={s.row}>
              <View style={s.dot} />
              <Text style={s.rowText} numberOfLines={2}>{r.text}</Text>
              <Text style={s.rowWhen}>{r.when}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={s.foot}>
        {cohort
          ? 'Athletes in your cohort. Only what they chose to share.'
          : 'Athletes on your pass. Only what they chose to share.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 18, padding: 15, marginTop: 12,
  },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  label: {
    fontFamily: F.bodyBold, fontSize: 11, color: C.textFaint,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  count: { fontFamily: F.bodyMedium, fontSize: 11.5, color: C.textMuted },
  divider: { height: 1, backgroundColor: '#21241F', marginBottom: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent },
  rowText: {
    flex: 1, fontFamily: F.bodyMedium, fontSize: 13, color: C.textPrimary, lineHeight: 18,
  },
  rowWhen: { fontFamily: F.body, fontSize: 11, color: C.textFaint },
  foot: {
    fontFamily: F.body, fontSize: 11.5, color: C.textMuted, lineHeight: 16,
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#21241F',
  },
});
