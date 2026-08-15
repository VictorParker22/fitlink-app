import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { generatePsychicDraft } from '../../lib/copilot/psychicDraft';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

/**
 * Accountability queue — one surface where the coach handles today's
 * accountability in under a minute.
 *
 * Three row types, computed from real data only:
 *   SLIPPED     client_workouts still 'assigned' past their assigned_date.
 *   GONE QUIET  no habit rows, no workout completions, no messages from the
 *               athlete across every signal we actually checked (listed in
 *               the row sub — a signal we couldn't read is never claimed).
 *   WINS        workout completions in the last 24h (from the realtime
 *               notifications feed) with a one-tap "Send props".
 *
 * Every row is one button: it opens the athlete's chat thread with a
 * pre-drafted message via the chat screen's ?draft= param. Nothing is ever
 * auto-sent — the coach reviews and taps send.
 *
 * Slipped + wins derive from AppContext state (clientWorkouts,
 * notifications, liveHabitRows), so realtime channel events recompute the
 * queue for free. Quiet detection additionally needs two direct queries
 * (client_habits history, athlete messages) fetched per roster change.
 */

const QUIET_DAYS = 3;       // silence threshold before an athlete is flagged
const LOOKBACK_DAYS = 14;   // how far back we scan signals
const VISIBLE_CAP = 6;

type QueueItem = {
  key: string;
  kind: 'slipped' | 'quiet' | 'win';
  clientId: string;
  clientName: string;
  title: string;
  sub: string;
  actionLabel: string;
  draft: string;
  a11y: string;
};

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetweenDates(fromDateStr: string, to: Date): number {
  const [y, m, d] = fromDateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 0;
  const from = new Date(y, m - 1, d);
  const toMid = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toMid.getTime() - from.getTime()) / 86400000);
}

function daysAgoLabel(n: number): string {
  if (n <= 1) return 'yesterday';
  return `${n} days ago`;
}

// Deterministic template pick — stable per client per day, varied across rows.
function pick<T>(options: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

function slippedDraft(firstName: string, workoutName: string, daysAgo: number): string {
  const when = daysAgo <= 1 ? 'yesterday' : `${daysAgo} days ago`;
  return pick([
    `Hey ${firstName}, saw ${workoutName} didn't happen ${when} — no stress. Want to knock it out today, or should I move it?`,
    `Hey ${firstName}, ${workoutName} is still waiting from ${when}. One session gets you right back on track — can you fit it in today?`,
    `Hey ${firstName}, life happens — ${workoutName} slipped. Let's not let one miss become two. When can you get it in?`,
  ], firstName + workoutName);
}

function winDraft(firstName: string, workoutName: string): string {
  return pick([
    `${firstName}, you crushed ${workoutName} — that's the consistency that pays off. Keep stacking days.`,
    `Big one, ${firstName}. ${workoutName} done. I see the work you're putting in.`,
    `${firstName} — ${workoutName} in the books. Proud of the follow-through, same energy next session.`,
  ], firstName + workoutName);
}

// Workout-completion notifications are written as
// "<client> finished <workout>[ — n sets logged]" (ClientContext).
// Returns the workout name, or null when the shape doesn't match.
function workoutNameFromNotification(description?: string): string | null {
  if (!description) return null;
  const idx = description.indexOf(' finished ');
  if (idx < 0) return null;
  return description.slice(idx + ' finished '.length).replace(/ — \d+ sets? logged$/, '').trim() || null;
}

export default function AccountabilityQueue() {
  const router = useRouter();
  const { trainer, clients, clientWorkouts, workouts, notifications, liveHabitRows } = useApp();
  const [showAll, setShowAll] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  // ── Quiet-detection signals fetched directly (context doesn't carry them) ──
  // habitLatest / msgLatest: clientId → most recent signal date within lookback.
  // signalsChecked names only the sources that actually answered, so the row
  // sub never claims a check we couldn't make (table missing pre-migration, etc).
  const [habitLatest, setHabitLatest] = useState<Record<string, string>>({});
  const [msgLatest, setMsgLatest] = useState<Record<string, string>>({});
  const [signalsChecked, setSignalsChecked] = useState<string[] | null>(null);

  const clientIdsKey = useMemo(() => clients.map((c) => c.id).sort().join(','), [clients]);

  useEffect(() => {
    if (!trainer?.id || !clientIdsKey) { setSignalsChecked(null); return; }
    let cancelled = false;
    (async () => {
      const ids = clientIdsKey.split(',');
      const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
      const checked: string[] = ['workouts'];

      const habits: Record<string, string> = {};
      const habitRes = await supabase
        .from('client_habits')
        .select('client_id, date')
        .in('client_id', ids)
        .gte('date', localDateStr(cutoff));
      if (!habitRes.error && habitRes.data) {
        checked.push('habit logs');
        for (const row of habitRes.data as { client_id: string; date: string }[]) {
          if (!habits[row.client_id] || row.date > habits[row.client_id]) habits[row.client_id] = row.date;
        }
      }

      const msgs: Record<string, string> = {};
      const msgRes = await supabase
        .from('messages')
        .select('created_at, conversations!inner(client_id, trainer_id)')
        .eq('conversations.trainer_id', trainer.id)
        .eq('sender_type', 'client')
        .gte('created_at', cutoff.toISOString());
      if (!msgRes.error && msgRes.data) {
        checked.push('messages');
        for (const row of msgRes.data as any[]) {
          const cid = row.conversations?.client_id;
          if (!cid) continue;
          if (!msgs[cid] || row.created_at > msgs[cid]) msgs[cid] = row.created_at;
        }
      }

      if (cancelled) return;
      setHabitLatest(habits);
      setMsgLatest(msgs);
      setSignalsChecked(checked);
    })();
    return () => { cancelled = true; };
  }, [trainer?.id, clientIdsKey]);

  // ── Queue computation — pure derivation, recomputes on realtime updates ──
  const queue = useMemo<QueueItem[]>(() => {
    const now = new Date();
    const todayStr = localDateStr(now);
    const activeClients = clients.filter((c) => c.status !== 'inactive');
    const byId = new Map(activeClients.map((c) => [c.id, c]));
    const workoutName = (id: string) => workouts.find((w) => w.id === id)?.name || 'their workout';

    // SLIPPED — assigned workouts past their date, freshest slip first
    // (the slip moment is the peak churn moment; fast outreach saves it).
    const slipped: (QueueItem & { daysAgo: number })[] = [];
    for (const cw of clientWorkouts) {
      if (cw.status !== 'assigned') continue;
      const client = byId.get(cw.client_id);
      if (!client) continue;
      const daysAgo = daysBetweenDates(cw.assigned_date, now);
      if (daysAgo <= 0 || cw.assigned_date.slice(0, 10) >= todayStr) continue;
      const wName = workoutName(cw.workout_id);
      const firstName = client.name.split(' ')[0];

      // Adherence this week — real completed/assigned counts, only when
      // there's enough volume for the ratio to mean something.
      const weekCutoff = localDateStr(new Date(now.getTime() - 7 * 86400000));
      const weekAssignments = clientWorkouts.filter(
        (w) => w.client_id === client.id && w.assigned_date.slice(0, 10) >= weekCutoff && w.assigned_date.slice(0, 10) <= todayStr
      );
      const weekDone = weekAssignments.filter((w) => w.status === 'completed').length;
      const adherence = weekAssignments.length >= 2 ? ` · ${weekDone} of ${weekAssignments.length} done this week` : '';

      slipped.push({
        key: `slipped-${cw.id}`,
        kind: 'slipped',
        clientId: client.id,
        clientName: client.name,
        title: client.name,
        sub: `Missed ${wName} — ${daysAgoLabel(daysAgo)}${adherence}`,
        actionLabel: 'Check in',
        draft: slippedDraft(firstName, wName, daysAgo),
        a11y: `${client.name} missed ${wName} ${daysAgoLabel(daysAgo)}${adherence ? `, ${weekDone} of ${weekAssignments.length} done this week` : ''}. Double tap to open chat with a drafted check-in message`,
        daysAgo,
      });
    }
    slipped.sort((a, b) => a.daysAgo - b.daysAgo);

    // WINS — workout completions in the last 24h, from the coach's
    // notifications feed (realtime, carries a true completion timestamp).
    const winByClient = new Map<string, { at: string; workout: string | null }>();
    const dayAgo = Date.now() - 86400000;
    for (const n of notifications) {
      if (n.type !== 'workout') continue;
      const cid = n.metadata?.client_id;
      if (!cid || !byId.has(cid)) continue;
      if (new Date(n.created_at).getTime() < dayAgo) continue;
      const existing = winByClient.get(cid);
      if (!existing || n.created_at > existing.at) {
        winByClient.set(cid, { at: n.created_at, workout: workoutNameFromNotification(n.description) });
      }
    }
    const wins: QueueItem[] = [];
    for (const [cid, win] of winByClient) {
      const client = byId.get(cid)!;
      const firstName = client.name.split(' ')[0];
      const when = new Date(win.at).toDateString() === now.toDateString() ? 'today' : 'yesterday';
      const wName = win.workout || 'their workout';
      wins.push({
        key: `win-${cid}`,
        kind: 'win',
        clientId: cid,
        clientName: client.name,
        title: client.name,
        sub: win.workout ? `Crushed ${win.workout} ${when}` : `Completed a workout ${when}`,
        actionLabel: 'Send props',
        draft: winDraft(firstName, wName),
        a11y: `${client.name} ${win.workout ? `crushed ${win.workout}` : 'completed a workout'} ${when}. Double tap to open chat with a drafted congratulations`,
      });
    }
    wins.sort((a, b) => (a.key < b.key ? -1 : 1));

    // GONE QUIET — only once the direct signal queries answered, only across
    // signals we truly checked, and never doubling up a slipped/win client.
    const quiet: (QueueItem & { daysSince: number })[] = [];
    if (signalsChecked) {
      const surfaced = new Set([...slipped.map((s) => s.clientId), ...wins.map((w) => w.clientId)]);
      for (const client of activeClients) {
        if (surfaced.has(client.id)) continue;

        // Most recent signal across: habit rows (fetched + realtime overlay),
        // workout-completion notifications, messages from the athlete.
        let last: Date | null = null;
        const consider = (iso?: string) => {
          if (!iso) return;
          const d = new Date(iso);
          if (!isNaN(d.getTime()) && (!last || d > last)) last = d;
        };
        consider(habitLatest[client.id]);
        consider(msgLatest[client.id]);
        for (const key of Object.keys(liveHabitRows)) {
          if (key.startsWith(`${client.id}:`)) consider(key.slice(client.id.length + 1));
        }
        for (const n of notifications) {
          if (n.type === 'workout' && n.metadata?.client_id === client.id) consider(n.created_at);
        }

        const sinceJoin = Math.floor((now.getTime() - new Date(client.created_at).getTime()) / 86400000);
        if (sinceJoin < QUIET_DAYS) continue; // too new to call quiet
        const daysSince = last === null
          ? Math.min(LOOKBACK_DAYS, sinceJoin)
          : Math.floor((now.getTime() - (last as Date).getTime()) / 86400000);
        if (daysSince < QUIET_DAYS) continue;

        const signalList = signalsChecked.join(', ');
        const daysLabel = last === null && sinceJoin > LOOKBACK_DAYS ? `${LOOKBACK_DAYS}+ days` : `${daysSince} days`;
        quiet.push({
          key: `quiet-${client.id}`,
          kind: 'quiet',
          clientId: client.id,
          clientName: client.name,
          title: client.name,
          sub: `No activity for ${daysLabel} (checked ${signalList})`,
          actionLabel: 'Reach out',
          draft: generatePsychicDraft(client, { type: 'ghosted', clientId: client.id, daysInactive: daysSince }),
          a11y: `${client.name}, no activity for ${daysLabel} across ${signalList}. Double tap to open chat with a drafted message`,
          daysSince,
        });
      }
      quiet.sort((a, b) => b.daysSince - a.daysSince);
    }

    return [...slipped, ...quiet, ...wins];
  }, [clients, clientWorkouts, workouts, notifications, liveHabitRows, habitLatest, msgLatest, signalsChecked]);

  // ── One-tap nudge: get-or-create the conversation, open chat pre-filled ──
  const openChatWithDraft = useCallback(async (item: QueueItem) => {
    if (!trainer?.id || openingId) return;
    setOpeningId(item.clientId);
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('client_id', item.clientId)
        .maybeSingle();
      let convId = existing?.id as string | undefined;
      if (!convId) {
        const { data: nc, error } = await supabase
          .from('conversations')
          .insert({ trainer_id: trainer.id, client_id: item.clientId })
          .select('id')
          .single();
        if (error || !nc) return;
        convId = nc.id;
      }
      router.push({ pathname: '/chat/[id]', params: { id: convId, draft: item.draft } } as any);
    } catch {
      // Silent — the row stays in the queue, the coach can retry.
    } finally {
      setOpeningId(null);
    }
  }, [trainer?.id, openingId, router]);

  if (clients.filter((c) => c.status !== 'inactive').length === 0) return null;

  const attentionCount = queue.filter((q) => q.kind !== 'win').length;
  const visible = showAll ? queue : queue.slice(0, VISIBLE_CAP);
  const hiddenCount = queue.length - visible.length;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.headerLabel}>Accountability</Text>
        {queue.length > 0 && (
          <View style={[styles.countBadge, attentionCount > 0 && styles.countBadgeAttention]}>
            <Text style={[styles.countBadgeText, attentionCount > 0 && styles.countBadgeTextAttention]}>
              {queue.length}
            </Text>
          </View>
        )}
      </View>

      {queue.length === 0 ? (
        <Text style={styles.emptyLine}>Everyone's on track today.</Text>
      ) : (
        <View style={styles.list}>
          {visible.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={styles.row}
              activeOpacity={0.75}
              disabled={openingId !== null}
              onPress={() => openChatWithDraft(item)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={item.a11y}
              accessibilityState={{ disabled: openingId !== null, busy: openingId === item.clientId }}
            >
              <View style={[
                styles.kindDot,
                item.kind === 'slipped' && styles.dotSlipped,
                item.kind === 'quiet' && styles.dotQuiet,
                item.kind === 'win' && styles.dotWin,
              ]} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.rowSub} numberOfLines={2}>{item.sub}</Text>
              </View>
              <Text style={styles.rowAction}>
                {openingId === item.clientId ? 'Opening…' : `${item.actionLabel} →`}
              </Text>
            </TouchableOpacity>
          ))}

          {hiddenCount > 0 && (
            <TouchableOpacity
              style={styles.showAllBtn}
              activeOpacity={0.7}
              onPress={() => setShowAll(true)}
              accessibilityRole="button"
              accessibilityLabel={`Show all, ${hiddenCount} more`}
            >
              <Text style={styles.showAllText}>Show all ({queue.length})</Text>
            </TouchableOpacity>
          )}
          {showAll && queue.length > VISIBLE_CAP && (
            <TouchableOpacity
              style={styles.showAllBtn}
              activeOpacity={0.7}
              onPress={() => setShowAll(false)}
              accessibilityRole="button"
              accessibilityLabel="Show fewer"
            >
              <Text style={styles.showAllText}>Show fewer</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 22,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  headerLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: CoachColors.textFaint,
    textTransform: 'uppercase',
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeAttention: {
    backgroundColor: CoachColors.dangerSoft,
  },
  countBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.accent,
  },
  countBadgeTextAttention: {
    color: CoachColors.danger,
  },
  emptyLine: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textMuted,
    paddingHorizontal: 20,
  },
  list: {
    marginHorizontal: 20,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CoachColors.borderMuted,
  },
  kindDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotSlipped: { backgroundColor: CoachColors.danger },
  dotQuiet: { backgroundColor: CoachColors.warning },
  dotWin: { backgroundColor: CoachColors.accent },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },
  rowSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
    marginTop: 2,
    lineHeight: 17,
  },
  rowAction: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.accent,
  },
  showAllBtn: {
    paddingVertical: 11,
    alignItems: 'center',
  },
  showAllText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textSecondary,
  },
});
