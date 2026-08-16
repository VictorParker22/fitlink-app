import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  TextInput, KeyboardAvoidingView, Platform, Pressable, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import type { PlanEnrollment } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import {
  weekOfPosition, totalWeeks, weekHistogram, firstUntouchedWeek, isOnLatestTrack,
} from '../lib/passWeeks';
import {
  isCohort, enrollmentState, formatRun, formatDay, enrollmentDeadline, spotsLeft,
} from '../lib/cohort';
import type { EnrollmentState } from '../lib/cohort';
import { daysUntilStart } from '../lib/cohortPreStart';

const STALLED_DAYS = 4;

/** Seat pips stay readable up to this cap; above it a bar reads better. */
const MAX_SEAT_PIPS = 20;

/** The phase word for each cohort state, in the coach's language. Tone drives colour only. */
const COHORT_STATE_META: Record<EnrollmentState, { label: string; tone: 'accent' | 'warning' | 'muted' }> = {
  'open': { label: 'Filling', tone: 'accent' },
  'closing-soon': { label: 'Closing soon', tone: 'warning' },
  'closed-date': { label: 'Enrollment closed', tone: 'muted' },
  'full': { label: 'Full', tone: 'warning' },
  'running': { label: 'Running', tone: 'accent' },
  'finished': { label: 'Finished', tone: 'muted' },
};

const initials = (name: string) =>
  name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "joined today" / "joined yesterday" / "joined Tuesday" — only used when < 7 days old. */
const joinedLabel = (iso: string): string => {
  const d = daysSince(iso);
  if (d <= 0) return 'joined today';
  if (d === 1) return 'joined yesterday';
  return `joined ${DAY_NAMES[new Date(iso).getDay()]}`;
};

/** Roster-row phrasing, real date all the way back: "Joined Sep 3". */
const joinedOn = (iso: string): string => {
  const d = daysSince(iso);
  if (d <= 0) return 'Joined today';
  if (d === 1) return 'Joined yesterday';
  if (d < 7) return `Joined ${DAY_NAMES[new Date(iso).getDay()]}`;
  return `Joined ${formatDay(new Date(iso))}`;
};

/** Whole days from today to a local day. Negative once past. */
const daysUntil = (date: Date): number => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today.getTime()) / 86400000);
};

export default function PassHoldersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { plans, clients } = useApp();
  const { user } = useAuth();

  const plan = plans.find(p => p.id === planId);
  const track = plan?.track || [];
  const trackLength = track.length;
  const durationWeeks = plan?.duration_weeks ?? null;

  const [enrollments, setEnrollments] = useState<PlanEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Compose sheet (in-screen overlay, not a native Modal)
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!planId) return;
    const { data, error } = await supabase
      .from('client_plan_enrollments')
      .select('*')
      .eq('plan_id', planId);
    if (!error && data) setEnrollments(data as PlanEnrollment[]);
  }, [planId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const rows = useMemo(() => {
    return enrollments
      .map(e => {
        const client = clients.find(c => c.id === e.client_id);
        return { enrollment: e, client };
      })
      .filter(r => !!r.client);
  }, [enrollments, clients]);

  // Sorted: completed pinned top, then active/paused by position desc.
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aDone = a.enrollment.status === 'completed' ? 1 : 0;
      const bDone = b.enrollment.status === 'completed' ? 1 : 0;
      if (aDone !== bDone) return bDone - aDone;
      return b.enrollment.track_position - a.enrollment.track_position;
    });
  }, [rows]);

  // Roster order for a cohort that hasn't started: newest joiner on top, from
  // the real created_at (falling back to started_at on older rows).
  const rosterRows = useMemo(() => {
    const at = (e: PlanEnrollment) => new Date(e.created_at || e.started_at).getTime();
    return [...rows].sort((a, b) => at(b.enrollment) - at(a.enrollment));
  }, [rows]);

  const activePositions = useMemo(
    () => rows.filter(r => r.enrollment.status === 'active').map(r => r.enrollment.track_position),
    [rows]
  );

  const bars = useMemo(
    () => weekHistogram(activePositions, track, durationWeeks),
    [activePositions, track, durationWeeks]
  );
  const maxBar = Math.max(...bars, 1);
  const untouched = useMemo(
    () => firstUntouchedWeek(activePositions, track, durationWeeks),
    [activePositions, track, durationWeeks]
  );
  const nTotalWeeks = totalWeeks(track, durationWeeks);

  const outdatedCount = useMemo(
    () => rows.filter(r => r.enrollment.status !== 'completed' && !isOnLatestTrack(r.enrollment.track_snapshot, track)).length,
    [rows, track]
  );

  const sendToAll = async () => {
    const content = composeText.trim();
    if (!content || rows.length === 0 || !user) return;
    setSending(true);
    let sent = 0;
    let failed = 0;
    let lastError: string | null = null;
    const { data: convs } = await supabase.from('conversations').select('id, client_id');
    for (const { client } of rows) {
      let convId = (convs || []).find((c: any) => c.client_id === client!.id)?.id;
      if (!convId) {
        const { data: created, error } = await supabase
          .from('conversations')
          .insert({ trainer_id: user.id, client_id: client!.id })
          .select()
          .single();
        if (error || !created) {
          failed += 1;
          lastError = error?.message || 'Could not start a conversation.';
          continue;
        }
        convId = created.id;
      }
      // This insert resolves with { error }; it does not throw. The old code
      // counted an attempt as a send, so the sheet reported "Sent to N" even
      // when every single message had failed.
      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: convId,
        sender_type: 'trainer',
        content,
      });
      if (msgErr) {
        failed += 1;
        lastError = msgErr.message;
        continue;
      }
      const { error: previewErr } = await supabase.from('conversations').update({
        last_message: content,
        last_message_at: new Date().toISOString(),
      }).eq('id', convId);
      if (__DEV__ && previewErr) console.warn('[PassHolders] conversation preview update failed:', previewErr);
      sent += 1;
    }
    setSending(false);

    if (sent === 0) {
      // Nothing went out — keep the sheet and the typed text.
      Alert.alert('Not sent', lastError || 'The message could not be sent to anyone. Please try again.');
      return;
    }
    setSentCount(sent);
    setComposeText('');
    if (failed > 0) {
      Alert.alert(
        'Sent to some athletes',
        `${sent} of ${rows.length} got the message. ${failed} did not${lastError ? `: ${lastError}` : '.'}`
      );
    }
    setTimeout(() => {
      setComposeOpen(false);
      setSentCount(null);
    }, 1200);
  };

  if (!plan) {
    return (
      <View style={[st.container, { paddingTop: insets.top }]}>
        <Text style={st.notFoundText}>Pass not found</Text>
      </View>
    );
  }

  const hasHolders = rows.length > 0;

  // ── Cohort launch state ─────────────────────────────────────────────────
  // Only for a dated pass. Seats are counted from the real enrollment rows
  // already loaded above — nothing here is estimated.
  const cohort = isCohort(plan) ? plan : null;
  const seatsTaken = enrollments.length;
  // enrollmentState() reports from a would-be joiner's view, so it says
  // 'closed-date' the moment a cohort starts. Asking it again as an enrolled
  // athlete separates a cohort that is running from one that has finished —
  // which is what the coach actually wants to see.
  const cohortState: EnrollmentState | null = (() => {
    if (!cohort) return null;
    const asMember = enrollmentState(cohort, seatsTaken, true);
    if (asMember === 'running' || asMember === 'finished') return asMember;
    return enrollmentState(cohort, seatsTaken);
  })();
  const cohortMeta = cohortState ? COHORT_STATE_META[cohortState] : null;
  const seatsLeft = spotsLeft(cohort, seatsTaken);
  const runLine = formatRun(cohort);

  // Before day one nobody has trained, so the week histogram is an empty grid
  // and the progress list is a column of zeros. That phase gets the roster.
  const daysToStart = cohort ? daysUntilStart(cohort) : null;
  const preStart = daysToStart !== null && daysToStart > 0;

  const startsInLine =
    daysToStart === null ? null
      : daysToStart === 0 ? 'starts today'
      : daysToStart === 1 ? 'starts tomorrow'
      : daysToStart > 0 ? `starts in ${daysToStart} days`
      : null;

  // "enrollment ends Sunday" inside the week, a real date beyond it.
  const deadlineSoftLine = (() => {
    const deadline = enrollmentDeadline(cohort);
    if (!deadline) return null;
    const d = daysUntil(deadline);
    if (d < 0) return null;
    if (d === 0) return 'enrollment ends today';
    if (d === 1) return 'enrollment ends tomorrow';
    if (d < 7) return `enrollment ends ${DAY_NAMES[deadline.getDay()]}`;
    return `enrollment ends ${formatDay(deadline)}`;
  })();

  // Which week the cohort is in right now, from the real elapsed days.
  const weekNow = daysToStart !== null && daysToStart <= 0
    ? Math.floor(-daysToStart / 7) + 1
    : null;

  // The phase in one plain-language line, always with a real number attached.
  const launchDetail = (() => {
    switch (cohortState) {
      case 'open':
      case 'full':
      case 'closed-date':
        return startsInLine;
      case 'closing-soon':
        return deadlineSoftLine ?? startsInLine;
      case 'running':
        return weekNow === null ? null
          : nTotalWeeks > 0 ? `week ${Math.min(weekNow, nTotalWeeks)} of ${nTotalWeeks}`
          : `week ${weekNow}`;
      case 'finished':
        return runLine ? `ran ${runLine}` : null;
      default:
        return null;
    }
  })();
  const launchLine = cohortMeta
    ? [cohortMeta.label, launchDetail].filter(Boolean).join(' · ')
    : null;
  // The run dates are already inside the "Finished · ran …" line.
  const showRunLine = !!runLine && cohortState !== 'finished';

  const capacity = cohort?.capacity ?? null;
  const seatsLabel = capacity
    ? `${Math.min(seatsTaken, capacity)} of ${capacity} seat${capacity === 1 ? '' : 's'} taken`
    : null;
  const usePips = !!capacity && capacity <= MAX_SEAT_PIPS;

  const bulkLabel = preStart ? 'Message the cohort' : `Message all ${rows.length}`;

  const subtitle = hasHolders
    ? `Live · $${plan.price.toLocaleString()} · ${rows.length} holder${rows.length === 1 ? '' : 's'}`
    : `$${plan.price.toLocaleString()} · no holders yet`;

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="chevron-back" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{plan.name}</Text>
          <Text style={st.headerSub}>{subtitle}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.textSecondary} />}
      >
        {cohort && (
          <View style={st.section}>
            <View style={st.card}>
              {/* Launch state: one grouped label for screen readers, so it reads
                  as a sentence rather than three orphan fragments. */}
              <View
                accessible
                accessibilityRole="header"
                accessibilityLabel={[launchLine, showRunLine ? runLine : null].filter(Boolean).join('. ')}
              >
                <Text style={st.eyebrow}>Cohort</Text>
                {launchLine ? (
                  <Text style={[
                    st.launchLine,
                    cohortMeta?.tone === 'accent' && { color: CoachColors.accent },
                    cohortMeta?.tone === 'warning' && { color: CoachColors.warning },
                  ]}>{launchLine}</Text>
                ) : null}
                {showRunLine ? <Text style={st.cohortRun}>{runLine}</Text> : null}
              </View>

              {/* Seats — only when the coach actually set a cap. An uncapped
                  cohort shows nothing here rather than implying a ceiling. */}
              {capacity ? (
                <View
                  style={st.seatsBlock}
                  accessible
                  accessibilityLabel={seatsLabel ?? undefined}
                >
                  <Text style={st.seatsLabel}>{seatsLabel}</Text>
                  {usePips ? (
                    <View style={st.pipRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      {Array.from({ length: capacity }).map((_, i) => (
                        <View key={i} style={[st.pip, i < seatsTaken && st.pipTaken]} />
                      ))}
                    </View>
                  ) : (
                    <View style={st.seatTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <View style={[st.seatFill, { width: `${Math.min(100, (seatsTaken / capacity) * 100)}%` }]} />
                    </View>
                  )}
                  {seatsLeft !== null && seatsLeft > 0 && (cohortState === 'open' || cohortState === 'closing-soon') && (
                    <Text style={st.cohortMeta}>
                      {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} left
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          </View>
        )}

        {!loading && !hasHolders && !preStart && (
          <View style={st.emptyState}>
            <Text style={st.emptyTitle}>No one has bought this pass yet</Text>
            <Text style={st.emptyText}>Once an athlete buys in, you'll see where everyone is in the season here.</Text>
          </View>
        )}

        {/* Roster forming — before day one there is no progress to chart, so
            the week histogram would be an empty grid. Who has joined, and
            when, is the only real signal in this phase. */}
        {preStart && (
          <View style={st.section}>
            <View style={st.holdersHeader}>
              <Text style={st.eyebrow}>Roster forming</Text>
              {hasHolders && <Text style={st.sortNote}>Newest first</Text>}
            </View>
            {!hasHolders ? (
              <Text style={st.rosterEmpty}>
                No one has taken a seat yet. Anyone who joins before day one shows up here, newest first.
              </Text>
            ) : (
              <View>
                {rosterRows.map(({ enrollment, client }, i) => (
                  <TouchableOpacity
                    key={enrollment.id}
                    style={[st.holderRow, i === rosterRows.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => router.push(`/client/${client!.id}` as any)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${client!.name}. ${joinedOn(enrollment.created_at || enrollment.started_at)}`}
                  >
                    <View style={st.avatar}><Text style={st.avatarText}>{initials(client!.name)}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.holderName} numberOfLines={1}>{client!.name}</Text>
                      <Text style={st.holderMeta} numberOfLines={1}>
                        {joinedOn(enrollment.created_at || enrollment.started_at)}
                      </Text>
                    </View>
                    <Text style={st.rosterSeat}>#{rosterRows.length - i}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {!preStart && hasHolders && trackLength > 0 && (
          <View style={st.section}>
            <View style={st.card}>
              <Text style={st.eyebrow}>Where everyone is</Text>
              <View style={st.histRow}>
                {bars.map((count, i) => (
                  <View key={i} style={st.histCol}>
                    <View style={st.histBarWell}>
                      {count > 0 ? (
                        <View style={[st.histBar, { height: `${Math.max((count / maxBar) * 100, 18)}%` }]} />
                      ) : (
                        <View style={st.histStub} />
                      )}
                    </View>
                    <Text style={st.histWeekNum}>{i + 1}</Text>
                  </View>
                ))}
              </View>
              {untouched !== null && activePositions.length > 0 && (
                <Text style={st.histContext}>
                  Nobody has reached week {untouched} yet. Anything you change from there on lands before they get to it.
                </Text>
              )}
            </View>

            {outdatedCount > 0 && (
              <TouchableOpacity
                style={st.versionsRow}
                onPress={() => router.push(`/pass-versions?planId=${plan.id}` as any)}
                activeOpacity={0.7}
              >
                <Text style={st.versionsText}>
                  {outdatedCount} athlete{outdatedCount === 1 ? '' : 's'} finishing an earlier version
                </Text>
                <Text style={st.versionsLink}>Versions →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!preStart && hasHolders && (
          <View style={st.section}>
            <View style={st.holdersHeader}>
              <Text style={st.eyebrow}>Holders</Text>
              <Text style={st.sortNote}>Sorted by progress</Text>
            </View>
            <View>
              {sortedRows.map(({ enrollment, client }, i) => {
                const finished = enrollment.status === 'completed';
                const week = weekOfPosition(enrollment.track_position, track, durationWeeks);
                const pct = trackLength > 0 ? Math.min(1, enrollment.track_position / trackLength) : 0;
                const recentlyJoined = daysSince(enrollment.started_at) < 7;
                const stale = enrollment.status === 'active' && daysSince(enrollment.updated_at) >= STALLED_DAYS;
                const outdated = !finished && !isOnLatestTrack(enrollment.track_snapshot, track);
                return (
                  <TouchableOpacity
                    key={enrollment.id}
                    style={[
                      st.holderRow,
                      i === sortedRows.length - 1 && { borderBottomWidth: 0 },
                      stale && st.holderRowStale,
                    ]}
                    onPress={() => router.push(`/client/${client!.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={st.avatar}><Text style={st.avatarText}>{initials(client!.name)}</Text></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={st.holderNameRow}>
                        <Text style={st.holderName} numberOfLines={1}>{client!.name}</Text>
                        {finished && <View style={st.finishedTag}><Text style={st.finishedTagText}>Finished</Text></View>}
                        {outdated && <View style={st.versionTag}><Text style={st.versionTagText}>v1</Text></View>}
                      </View>
                      <Text style={st.holderMeta} numberOfLines={1}>
                        {finished
                          ? `${trackLength} of ${trackLength} nodes done`
                          : `Week ${week} · ${enrollment.track_position} of ${trackLength} nodes done${recentlyJoined ? ` · ${joinedLabel(enrollment.started_at)}` : ''}`}
                      </Text>
                      {stale && (
                        <Text style={st.holderWarn}>nothing logged in {daysSince(enrollment.updated_at)} days</Text>
                      )}
                    </View>
                    <View style={st.holderBarTrack}>
                      <View style={[st.holderBarFill, { width: `${(finished ? 1 : pct) * 100}%` }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {hasHolders && (
          <TouchableOpacity
            style={st.outlineBtn}
            onPress={() => setComposeOpen(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${bulkLabel}. Sends to ${rows.length} athlete${rows.length === 1 ? '' : 's'}.`}
          >
            <Text style={st.outlineBtnText}>{bulkLabel}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={st.limeBtn}
          onPress={() => router.push(`/pass-track-editor?planId=${plan.id}` as any)}
          activeOpacity={0.8}
        >
          <Text style={st.limeBtnText}>Edit season</Text>
        </TouchableOpacity>
      </View>

      {composeOpen && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={StyleSheet.absoluteFill}
          pointerEvents="box-none"
        >
          <Pressable style={st.sheetBackdrop} onPress={() => !sending && setComposeOpen(false)} />
          <View style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {sentCount !== null ? (
              <Text style={st.sheetSentText}>Sent to {sentCount} holder{sentCount === 1 ? '' : 's'}</Text>
            ) : (
              <>
                <Text style={st.eyebrow}>{bulkLabel}</Text>
                <Text style={st.sheetHint}>
                  Lands in each of the {rows.length} {preStart ? 'joiner' : 'holder'}{rows.length === 1 ? '' : 's'}' conversation as a message from you.
                </Text>
                <TextInput
                  style={st.sheetInput}
                  placeholder="Write your message"
                  placeholderTextColor={CoachColors.textFaint}
                  value={composeText}
                  onChangeText={setComposeText}
                  multiline
                  autoFocus
                  editable={!sending}
                />
                <View style={st.sheetActions}>
                  <TouchableOpacity onPress={() => setComposeOpen(false)} disabled={sending}>
                    <Text style={st.sheetCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.limeBtn, st.sheetSendBtn, (!composeText.trim() || sending) && { opacity: 0.5 }]}
                    onPress={sendToAll}
                    disabled={!composeText.trim() || sending}
                    activeOpacity={0.8}
                  >
                    {sending
                      ? <ActivityIndicator size="small" color={CoachColors.bg} />
                      : <Text style={st.limeBtnText}>Send</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 16, color: CoachColors.textPrimary },
  headerSub: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted, marginTop: 1 },

  section: { paddingHorizontal: 20, marginTop: 20 },
  eyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint,
    letterSpacing: 0.9, textTransform: 'uppercase',
  },

  card: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 15,
  },
  launchLine: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 19, lineHeight: 25,
    color: CoachColors.textPrimary, marginTop: 9,
  },
  cohortRun: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 5 },
  cohortMeta: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginTop: 5 },

  seatsBlock: {
    marginTop: 15, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  seatsLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },
  pipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  pip: {
    width: 13, height: 13, borderRadius: 4,
    borderWidth: 1, borderColor: CoachColors.borderMuted, backgroundColor: 'transparent',
  },
  pipTaken: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  seatTrack: {
    height: 6, borderRadius: 999, backgroundColor: CoachColors.borderMuted,
    overflow: 'hidden', marginTop: 10,
  },
  seatFill: { height: '100%', borderRadius: 999, backgroundColor: CoachColors.accent },

  rosterEmpty: {
    fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted,
    lineHeight: 18, marginTop: 8,
  },
  rosterSeat: { fontFamily: CoachFonts.bodyBold, fontSize: 11.5, color: CoachColors.textFaint },

  histRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 14, height: 88 },
  histCol: { flex: 1, alignItems: 'center', height: '100%' },
  histBarWell: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  histBar: { width: '100%', borderRadius: 4, backgroundColor: CoachColors.accent },
  histStub: { width: '100%', height: 3, borderRadius: 2, backgroundColor: CoachColors.borderMuted },
  histWeekNum: { fontFamily: CoachFonts.bodySemiBold, fontSize: 10, color: CoachColors.textFaint, marginTop: 6 },
  histContext: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginTop: 14, lineHeight: 18 },

  versionsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4, paddingTop: 12,
  },
  versionsText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
  versionsLink: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.accent },

  holdersHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  sortNote: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textFaint },

  holderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted,
  },
  holderRowStale: {
    borderLeftWidth: 2, borderLeftColor: CoachColors.warning, paddingLeft: 10, marginLeft: -12,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 13, color: CoachColors.textSecondary },
  holderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  holderName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary, flexShrink: 1 },
  holderMeta: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted, marginTop: 2 },
  holderWarn: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.warning, marginTop: 2 },
  finishedTag: {
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1.5,
    backgroundColor: CoachColors.borderMuted,
  },
  finishedTagText: { fontFamily: CoachFonts.bodyBold, fontSize: 9.5, color: CoachColors.textSecondary, letterSpacing: 0.4 },
  versionTag: {
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1.5,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  versionTagText: { fontFamily: CoachFonts.bodyBold, fontSize: 9.5, color: CoachColors.textFaint, letterSpacing: 0.4 },
  holderBarTrack: { width: 52, height: 4, borderRadius: 999, backgroundColor: CoachColors.borderMuted, overflow: 'hidden' },
  holderBarFill: { height: '100%', borderRadius: 999, backgroundColor: CoachColors.accent },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: CoachColors.bg,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  outlineBtn: {
    flex: 1, borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  outlineBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.textPrimary },
  limeBtn: {
    flex: 1, backgroundColor: CoachColors.accent, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
  },
  limeBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.bg },

  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: CoachColors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    paddingHorizontal: 20, paddingTop: 18,
  },
  sheetHint: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginTop: 8, lineHeight: 18 },
  sheetInput: {
    marginTop: 12, minHeight: 90, maxHeight: 160, borderRadius: 12,
    borderWidth: 1, borderColor: CoachColors.borderMuted, backgroundColor: CoachColors.bg,
    padding: 12, fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textPrimary,
    textAlignVertical: 'top',
  },
  sheetActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 18, marginTop: 14 },
  sheetCancel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textMuted },
  sheetSendBtn: { flex: 0, paddingHorizontal: 26 },
  sheetSentText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary,
    textAlign: 'center', paddingVertical: 14,
  },

  emptyState: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 60, gap: 6 },
  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary, textAlign: 'center' },
  emptyText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 18 },

  notFoundText: { fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textMuted, textAlign: 'center', marginTop: 100 },
});
