import { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '../context/AppContext';
import type { PlanEnrollment } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

const STALLED_DAYS = 4;

const initials = (name: string) =>
  name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export default function PassHoldersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { plans, clients } = useApp();

  const plan = plans.find(p => p.id === planId);
  const trackLength = plan?.track?.length || 0;

  const [enrollments, setEnrollments] = useState<PlanEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const finished = rows.filter(r => r.enrollment.status === 'completed');
  const stalled = rows.filter(r => r.enrollment.status === 'active' && daysSince(r.enrollment.updated_at) >= STALLED_DAYS);
  const onTrack = rows.filter(r => r.enrollment.status === 'active' && daysSince(r.enrollment.updated_at) < STALLED_DAYS);

  const progressLabel = (e: PlanEnrollment) =>
    trackLength > 0 ? `${e.track_position} / ${trackLength}` : `${e.track_position}`;
  const progressPct = (e: PlanEnrollment) =>
    trackLength > 0 ? Math.min(1, e.track_position / trackLength) : 0;

  if (!plan) {
    return (
      <View style={[st.container, { paddingTop: insets.top }]}>
        <Text style={st.notFoundText}>Pass not found</Text>
      </View>
    );
  }

  const monthlyTotal = plan.price * rows.filter(r => r.enrollment.status !== 'completed').length;

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
          <Ionicons name="chevron-back" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{plan.name}</Text>
          <Text style={st.headerSub}>{rows.length} holder{rows.length === 1 ? '' : 's'} · ${monthlyTotal.toLocaleString()} monthly</Text>
        </View>
        <TouchableOpacity onPress={() => router.push(`/pass-track-editor?planId=${plan.id}` as any)}>
          <Text style={st.trackLink}>Track</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.textSecondary} />}
      >
        <View style={st.statsRow}>
          <View style={st.statCard}>
            <Text style={st.statLabel}>Finished</Text>
            <Text style={st.statValue}>{finished.length}</Text>
          </View>
          <View style={st.statCard}>
            <Text style={st.statLabel}>On track</Text>
            <Text style={st.statValue}>{onTrack.length}</Text>
          </View>
          <View style={st.statCard}>
            <Text style={st.statLabel}>Stalled</Text>
            <Text style={[st.statValue, stalled.length > 0 && { color: CoachColors.warning }]}>{stalled.length}</Text>
          </View>
        </View>

        {!loading && rows.length === 0 && (
          <View style={st.emptyState}>
            <Text style={st.emptyTitle}>No one has bought this pass yet</Text>
            <Text style={st.emptyText}>Once an athlete buys in, you'll see their progress through the track here.</Text>
          </View>
        )}

        {stalled.length > 0 && (
          <View style={st.section}>
            <Text style={st.sectionLabel}>Stalled — nudge or adjust</Text>
            <View style={{ gap: 10 }}>
              {stalled.map(({ enrollment, client }) => (
                <View key={enrollment.id} style={st.stalledCard}>
                  <View style={st.stalledTop}>
                    <View style={st.avatar}><Text style={st.avatarText}>{initials(client!.name)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.stalledName}>{client!.name}</Text>
                      <Text style={st.stalledMeta}>Stuck on node {enrollment.track_position} for {daysSince(enrollment.updated_at)} days</Text>
                    </View>
                    <TouchableOpacity onPress={() => router.push(`/client/${client!.id}` as any)}>
                      <Text style={st.nudgeLink}>Nudge</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={st.progressRow}>
                    <View style={st.progressTrack}>
                      <View style={[st.progressFill, { width: `${progressPct(enrollment) * 100}%`, backgroundColor: CoachColors.warning }]} />
                    </View>
                    <Text style={st.progressLabel}>{progressLabel(enrollment)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {onTrack.length > 0 && (
          <View style={st.section}>
            <Text style={st.sectionLabel}>Moving well</Text>
            <View>
              {onTrack.map(({ enrollment, client }, i) => (
                <TouchableOpacity
                  key={enrollment.id}
                  style={[st.movingRow, i === onTrack.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => router.push(`/client/${client!.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={st.avatar}><Text style={st.avatarText}>{initials(client!.name)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <View style={st.movingTop}>
                      <Text style={st.movingName} numberOfLines={1}>{client!.name}</Text>
                      <Text style={st.movingProgress}>{progressLabel(enrollment)}</Text>
                    </View>
                    <View style={st.progressTrackThin}>
                      <View style={[st.progressFill, { width: `${progressPct(enrollment) * 100}%` }]} />
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {finished.length > 0 && (
          <View style={st.section}>
            <View style={st.finishedCard}>
              <Text style={st.finishedTitle}>
                {finished.length} athlete{finished.length === 1 ? '' : 's'} finished the season.
              </Text>
              <Text style={st.finishedText}>Offer them the next pass before their month renews.</Text>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
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
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 16, color: CoachColors.textPrimary },
  headerSub: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted, marginTop: 1 },
  trackLink: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.accent },

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 18 },
  statCard: {
    flex: 1, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, padding: 12,
  },
  statLabel: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted },
  statValue: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.textPrimary, marginTop: 2 },

  section: { paddingHorizontal: 20, marginTop: 22 },
  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.textFaint,
    letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 10,
  },

  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 13, color: CoachColors.textSecondary },

  stalledCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 14,
  },
  stalledTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stalledName: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.textPrimary },
  stalledMeta: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.warning, marginTop: 2 },
  nudgeLink: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.accent },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  progressTrack: { flex: 1, height: 5, borderRadius: 999, backgroundColor: CoachColors.borderMuted, overflow: 'hidden' },
  progressTrackThin: { height: 4, borderRadius: 999, backgroundColor: CoachColors.borderMuted, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 999 },
  progressLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textMuted },

  movingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted,
  },
  movingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  movingName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary, flex: 1, marginRight: 8 },
  movingProgress: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textMuted },

  finishedCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 15,
  },
  finishedTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
  finishedText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginTop: 4, lineHeight: 18 },

  emptyState: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 60, gap: 6 },
  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary, textAlign: 'center' },
  emptyText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 18 },

  notFoundText: { fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textMuted, textAlign: 'center', marginTop: 100 },
});
