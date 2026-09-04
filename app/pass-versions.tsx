import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '../context/AppContext';
import type { TrackNode, PlanEnrollment } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useAlert } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { weekOfPosition, isOnLatestTrack } from '../lib/passWeeks';
import { isMissingSchemaError } from '../lib/schemaErrors';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

/**
 * 21c — Versions. A published pass is six people mid-season at six different
 * weeks; when the track gets republished, this screen shows who is finishing
 * which shape of the season, and offers a 30-day rollback that never touches
 * anyone's position.
 */

interface PlanVersion {
  id: string;
  plan_id: string;
  version: number;
  track: TrackNode[];
  summary: string | null;
  created_at: string;
}

const initials = (name: string) =>
  name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const ROLLBACK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export default function PassVersionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { plans, clients, updatePlanTrack } = useApp();
  const { user } = useAuth();
  const { showAlert } = useAlert();

  const plan = plans.find(p => p.id === planId);

  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [enrollments, setEnrollments] = useState<PlanEnrollment[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!planId) return;
    const [vRes, eRes] = await Promise.all([
      supabase.from('plan_versions').select('*').eq('plan_id', planId).order('version', { ascending: false }),
      supabase.from('client_plan_enrollments').select('*').eq('plan_id', planId),
    ]);
    // Resilient to the plan_versions table not existing yet (42P01).
    if (!vRes.error && vRes.data) setVersions(vRes.data as PlanVersion[]);
    else setVersions([]);
    if (!eRes.error && eRes.data) setEnrollments(eRes.data as PlanEnrollment[]);
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  const liveHolders = useMemo(() => enrollments
    .filter(e => e.status === 'active' || e.status === 'paused')
    // A deleted athlete's enrollment can outlive their client row. Keep the
    // holder (the season is still in use) but render it as "Deleted athlete"
    // instead of dereferencing a missing client.
    .map(e => {
      const client = clients.find(c => c.id === e.client_id) ?? null;
      return { enrollment: e, client, name: client?.name ?? 'Deleted athlete' };
    }), [enrollments, clients]);

  const currentVersionNumber = versions.length > 0 ? versions[0].version + 1 : 1;
  const latestRow = versions[0] ?? null;

  const onCurrent = liveHolders.filter(h => isOnLatestTrack(h.enrollment.track_snapshot, plan?.track));

  const supersededCards = useMemo(() => versions.map(v => ({
    version: v,
    holders: liveHolders.filter(h =>
      !isOnLatestTrack(h.enrollment.track_snapshot, plan?.track) &&
      isOnLatestTrack(h.enrollment.track_snapshot, v.track)
    ),
  })), [versions, liveHolders, plan]);

  const rollbackTarget = latestRow && (Date.now() - new Date(latestRow.created_at).getTime()) < ROLLBACK_WINDOW_MS
    ? latestRow
    : null;

  const endDate = (e: PlanEnrollment): string | null => {
    if (!plan?.duration_weeks || !e.started_at) return null;
    const end = new Date(new Date(e.started_at).getTime() + plan.duration_weeks * 7 * 86400000);
    return fmtDate(end.toISOString());
  };

  /** Returns null on success, or a human-readable reason the message did not send. */
  const sendMessage = async (clientId: string, content: string): Promise<string | null> => {
    if (!user) return 'You are not signed in.';
    const { data: convs, error: convSelErr } = await supabase
      .from('conversations').select('id, client_id').eq('client_id', clientId);
    if (convSelErr) return convSelErr.message;
    let convId = convs?.[0]?.id;
    if (!convId) {
      const { data: created, error } = await supabase
        .from('conversations')
        .insert({ trainer_id: user.id, client_id: clientId })
        .select()
        .single();
      if (error || !created) return error?.message || 'Could not start a conversation.';
      convId = created.id;
    }
    const { error: msgErr } = await supabase
      .from('messages').insert({ conversation_id: convId, sender_type: 'trainer', content });
    if (msgErr) return msgErr.message;
    const { error: previewErr } = await supabase.from('conversations').update({
      last_message: content,
      last_message_at: new Date().toISOString(),
    }).eq('id', convId);
    if (__DEV__ && previewErr) console.warn('[PassVersions] conversation preview update failed:', previewErr);
    return null;
  };

  const askToSwitch = async (clientName: string, clientId: string) => {
    if (!plan) return;
    setBusy(true);
    const summary = latestRow?.summary ? `: ${latestRow.summary}` : '';
    const failure = await sendMessage(
      clientId,
      `I've updated ${plan.name}${summary}. Want to switch to the new version? Nothing you've done gets lost.`
    );
    setBusy(false);
    // Previously this said "Sent" no matter what the insert returned.
    if (failure) {
      showAlert({ type: 'error', title: 'Not sent', message: failure });
      return;
    }
    showAlert({ type: 'success', title: 'Sent', message: `Asked ${clientName.split(' ')[0]} about v${currentVersionNumber}.` });
  };

  const rollBack = () => {
    if (!plan || !rollbackTarget) return;
    showAlert({
      type: 'confirm',
      title: `Roll back to v${rollbackTarget.version}?`,
      message: 'The pass returns to its previous shape. Anything athletes have already completed stays completed.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Roll back',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              // Record the rollback as a new version (the current track is the one being archived).
              // The audit row is best-effort ONLY while the plan_versions migration
              // may not have run yet (42P01 undefined_table / 42703 undefined_column).
              // Any other error is real and worth telling the coach about.
              const { error: versionErr } = await supabase.from('plan_versions').insert({
                plan_id: plan.id,
                version: currentVersionNumber,
                track: plan.track ?? [],
                summary: `Rolled back to v${rollbackTarget.version}`,
              });
              if (versionErr && !isMissingSchemaError(versionErr)) {
                showAlert({
                  type: 'error',
                  title: 'Rollback not recorded',
                  message: `${versionErr.message}\n\nThe pass has not been changed. Please try again.`,
                });
                return;
              }
              await updatePlanTrack(plan.id, rollbackTarget.track);
              await load();
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Rollback failed' });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    });
  };

  if (!plan) {
    return (
      <View style={[st.container, { paddingTop: insets.top }]}>
        <Text style={st.notFoundText}>Pass not found</Text>
      </View>
    );
  }

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity hitSlop={6} onPress={() => router.back()} style={st.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={25} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} maxFontSizeMultiplier={1.3}>Versions</Text>
          <Text style={st.headerSub} numberOfLines={1} maxFontSizeMultiplier={1.4}>{plan.name}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
        {/* ── Current version ── */}
        <View style={[st.card, st.cardCurrent]}>
          <View style={st.cardTopRow}>
            <View style={st.liveTag}>
              <Text style={st.liveTagText} maxFontSizeMultiplier={1.2}>v{currentVersionNumber} · live</Text>
            </View>
            {latestRow && <Text style={st.cardDate}>Published {fmtDate(latestRow.created_at)}</Text>}
          </View>
          {latestRow?.summary ? <Text style={st.cardSummary}>{latestRow.summary}</Text> : (
            <Text style={st.cardSummary}>The season as it was first published.</Text>
          )}
          <View style={st.holderRow}>
            <View style={st.avatarStack}>
              {onCurrent.slice(0, 5).map((h, i) => (
                <View key={h.enrollment.id} style={[st.avatar, i > 0 && { marginLeft: -10 }]}>
                  <Text style={st.avatarText} maxFontSizeMultiplier={1.4}>{initials(h.name)}</Text>
                </View>
              ))}
            </View>
            <Text style={st.holderCount}>
              {onCurrent.length} athlete{onCurrent.length === 1 ? '' : 's'} · everyone new or current
            </Text>
          </View>
        </View>

        {/* ── Superseded versions still in use ── */}
        {supersededCards.filter(c => c.holders.length > 0).map(({ version: v, holders }) => (
          <View key={v.id} style={st.card}>
            <View style={st.cardTopRow}>
              <Text style={st.oldTag}>v{v.version} · Published {fmtDate(v.created_at)} · finishing out</Text>
            </View>
            {v.summary ? <Text style={st.cardSummary}>{v.summary}</Text> : null}
            {holders.map(h => {
              const w = weekOfPosition(h.enrollment.track_position, h.enrollment.track_snapshot ?? [], plan.duration_weeks);
              const end = endDate(h.enrollment);
              const firstName = h.name.split(' ')[0];
              return (
                <View key={h.enrollment.id} style={st.oldHolderBlock}>
                  <View style={st.oldHolderTop}>
                    <View style={st.avatar}><Text style={st.avatarText} maxFontSizeMultiplier={1.4}>{initials(h.name)}</Text></View>
                    <Text style={st.oldHolderName}>
                      {h.name} only{end ? ` · ends ${end}` : ''}
                    </Text>
                  </View>
                  <Text style={st.honestyLine}>
                    {h.name} is {w} week{w === 1 ? '' : 's'} in and paid for this shape of season. Moving them early is your call, not the app's.
                  </Text>
                  {h.client && (
                    <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={st.askBtn} onPress={() => askToSwitch(h.client!.name, h.client!.id)} disabled={busy} accessibilityRole="button">
                      <Text style={st.askBtnText}>Ask {firstName} if they want v{currentVersionNumber}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        {/* ── Empty old versions collapse to one muted line ── */}
        {supersededCards.filter(c => c.holders.length === 0).map(({ version: v }) => (
          <Text key={v.id} style={st.emptyVersionRow}>
            v{v.version} · {fmtDate(v.created_at)} · no one left on it
          </Text>
        ))}

        {/* ── Rollback ── */}
        {rollbackTarget && (
          <TouchableOpacity style={st.rollbackRow} onPress={rollBack} disabled={busy} activeOpacity={0.8} accessibilityRole="button">
            <Ionicons name="arrow-undo-outline" size={20} color={CoachColors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={st.rollbackTitle}>Roll back to v{rollbackTarget.version}</Text>
              <Text style={st.rollbackSub}>
                Available for 30 days. Anything athletes have already completed stays completed.
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {versions.length === 0 && (
          <Text style={st.noHistoryText}>
            No version history yet. The first time you republish this track with people inside, the old shape gets kept here.
          </Text>
        )}

        <TouchableOpacity style={st.footerBtn} onPress={() => router.back()} accessibilityRole="button">
          <Text style={st.footerBtnText}>Back to the pass</Text>
        </TouchableOpacity>
      </ScrollView>
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
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 18, color: CoachColors.textPrimary },
  headerSub: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 1 },

  card: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 16, marginBottom: 12,
  },
  cardCurrent: { borderColor: 'rgba(198,242,78,0.35)' },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  liveTag: {
    backgroundColor: CoachColors.accentSoft, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 10, paddingVertical: 4,
  },
  liveTagText: { fontFamily: CoachFonts.bodyBold, fontSize: 13, color: CoachColors.accent },
  cardDate: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted },
  oldTag: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },
  cardSummary: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, marginTop: 10, lineHeight: 21.5 },

  holderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  avatarStack: { flexDirection: 'row' },
  avatar: {
    width: 30, height: 30, borderRadius: 15, borderCurve: 'continuous', backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: CoachColors.surface,
  },
  avatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.textSecondary },
  holderCount: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, flex: 1 },

  oldHolderBlock: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: CoachColors.borderMuted },
  oldHolderTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  oldHolderName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary, flex: 1 },
  honestyLine: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 8, lineHeight: 20 },
  askBtn: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 10, alignItems: 'center', marginTop: 12,
  },
  askBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },

  emptyVersionRow: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint, marginBottom: 10, paddingHorizontal: 2 },

  rollbackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, borderCurve: 'continuous', padding: 14, marginTop: 8,
  },
  rollbackTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  rollbackSub: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 3, lineHeight: 18 },

  noHistoryText: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textFaint, lineHeight: 20, marginTop: 4 },

  footerBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingVertical: 15, alignItems: 'center', marginTop: 28,
  },
  footerBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 16, color: CoachColors.onAccent },

  notFoundText: { fontFamily: CoachFonts.body, fontSize: 18, color: CoachColors.textMuted, textAlign: 'center', marginTop: 100 },
});
