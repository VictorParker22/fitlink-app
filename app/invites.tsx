/**
 * invites.tsx — the coach's invite list (design canvas "FitLink Invitations",
 * board 02).
 *
 * Header: back, LIVE dot while the realtime channel is subscribed, "+" that
 * opens InviteSheet. Three tiles (sent, opened, joined; joined in lime). Then
 * one row per person: joined (lime check, "Open" → their profile), opened
 * (amber ring, "Nudge" re-shares the message), sent (plane, "Resend" once two
 * days have passed). A row that turns accepted while the screen is open gets
 * a 1.6 s lime flash and one success haptic — the moment the board is for.
 *
 * The coach's standing link and live-class links are rows too, but not
 * people: the list hides them and the tiles do not count them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  Animated, RefreshControl, Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useAppBusiness } from '../context/AppContext';
import { CoachColors as C, CoachFonts as F } from '../constants/coachDesign';
import { useReducedMotion } from '../lib/useReducedMotion';
import InviteSheet from '../components/invites/InviteSheet';
import {
  type InviteRow, canResend, fetchMyInvites, firstName, hapticMoment,
  isStandingInvite, messageForInvite, relativeTime,
} from '../lib/invites';

const FLASH_MS = 1600;

type RowKind = 'joined' | 'opened' | 'sent' | 'expired';

function rowKind(row: InviteRow): RowKind {
  if (row.status === 'accepted') return 'joined';
  if (row.status === 'expired') return 'expired';
  if (row.status === 'opened' || row.opened_at) return 'opened';
  return 'sent';
}

function activityAt(row: InviteRow): number {
  const t = Date.parse(row.accepted_at ?? row.opened_at ?? row.sent_at ?? '');
  return Number.isFinite(t) ? t : 0;
}

export default function InvitesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { user } = useAuth();
  const { trainer } = useAppBusiness();
  const coachFirst = firstName(trainer?.name) || 'Your coach';
  const uid = user?.id ?? null;

  const [rows, setRows] = useState<InviteRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  // Status per row id from the last load: a row that goes sent/opened →
  // accepted between two loads is the one that "just landed".
  const lastStatus = useRef<Map<string, InviteRow['status']>>(new Map());
  const flashes = useRef<Map<string, Animated.Value>>(new Map());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());

  const flashRow = useCallback((id: string) => {
    const v = flashes.current.get(id) ?? new Animated.Value(0);
    flashes.current.set(id, v);
    setFlashing((prev) => new Set(prev).add(id));
    const done = () => setFlashing((prev) => { const next = new Set(prev); next.delete(id); return next; });
    if (reduceMotion) {
      // No motion: the row simply arrives in its joined state.
      v.setValue(0);
      done();
      return;
    }
    v.setValue(1);
    Animated.timing(v, { toValue: 0, duration: FLASH_MS, useNativeDriver: false }).start(({ finished }) => { if (finished) done(); });
  }, [reduceMotion]);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!uid) return;
    const { rows: fresh, error } = await fetchMyInvites(uid);
    if (error) {
      if (!opts.silent) setLoadError('Your invites did not load. Pull to try again.');
      return;
    }
    setLoadError(null);
    const prev = lastStatus.current;
    const landed: string[] = [];
    for (const r of fresh) {
      const before = prev.get(r.id);
      if (before && before !== 'accepted' && r.status === 'accepted' && !isStandingInvite(r)) landed.push(r.id);
    }
    lastStatus.current = new Map(fresh.map((r) => [r.id, r.status]));
    setRows(fresh);
    if (landed.length > 0) {
      // One haptic for the moment, however many rows landed at once.
      hapticMoment('done');
      landed.forEach(flashRow);
    }
  }, [uid, flashRow]);

  useEffect(() => { load(); }, [load]);

  // Realtime: every change to this coach's invites refetches. The channel
  // name is per coach so two coaches on one device never share a socket.
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel(`invites:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invites', filter: `trainer_id=eq.${uid}` }, () => {
        load({ silent: true });
      })
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
      });
    return () => {
      setLive(false);
      supabase.removeChannel(channel);
    };
  }, [uid, load]);

  const people = useMemo(() => {
    const list = (rows ?? []).filter((r) => r.kind === 'coach' && !isStandingInvite(r) && r.status !== 'revoked');
    return list.sort((a, b) => activityAt(b) - activityAt(a));
  }, [rows]);

  const stats = useMemo(() => {
    const sent = people.length;
    const opened = people.filter((r) => r.status === 'accepted' || r.status === 'opened' || !!r.opened_at).length;
    const joined = people.filter((r) => r.status === 'accepted').length;
    return { sent, opened, joined };
  }, [people]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shareMessage = (row: InviteRow) => {
    Share.share({ message: messageForInvite(row, coachFirst) }).catch(() => { /* dismissed */ });
  };

  const openProfile = (row: InviteRow) => {
    if (!row.accepted_client_id) return;
    router.push(`/client/${row.accepted_client_id}` as any);
  };

  const renderRow = ({ item }: { item: InviteRow }) => {
    const kind = rowKind(item);
    const who = (item.invitee_name && item.invitee_name.trim()) || (item.invitee_contact && item.invitee_contact.trim()) || 'Someone';
    const sub =
      kind === 'joined' ? `Joined ${relativeTime(item.accepted_at)} · your week is waiting for them`
      : kind === 'opened' ? `Opened ${relativeTime(item.opened_at)} · not signed up yet`
      : kind === 'expired' ? `Expired · sent ${relativeTime(item.sent_at)}`
      : `Sent ${relativeTime(item.sent_at)}`;
    const action =
      kind === 'joined' && item.accepted_client_id ? { label: 'Open', onPress: () => openProfile(item), a11y: `Open ${who}'s profile` }
      : kind === 'opened' ? { label: 'Nudge', onPress: () => shareMessage(item), a11y: `Nudge ${who}` }
      : kind === 'sent' && canResend(item) ? { label: 'Resend', onPress: () => shareMessage(item), a11y: `Resend the invite to ${who}` }
      : null;
    const flash = flashes.current.get(item.id);
    const flashStyle = flash && flashing.has(item.id)
      ? { backgroundColor: flash.interpolate({ inputRange: [0, 1], outputRange: [C.surface, C.accentSoft] }) }
      : null;

    return (
      <Animated.View style={[s.row, flashStyle]}>
        <View style={[s.badge, kind === 'joined' && s.badgeJoined, kind === 'opened' && s.badgeOpened]}>
          {kind === 'joined' ? <Ionicons name="checkmark" size={18} color={C.accent} />
            : kind === 'opened' ? null
            : kind === 'expired' ? <Ionicons name="time-outline" size={17} color={C.textFaint} />
            : <Ionicons name="paper-plane-outline" size={16} color={C.textSecondary} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowName, kind === 'expired' && { color: C.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{who}</Text>
          <Text style={s.rowSub} numberOfLines={2} maxFontSizeMultiplier={1.3}>{sub}</Text>
        </View>
        {action ? (
          <TouchableOpacity
            onPress={action.onPress}
            style={[s.actionBtn, kind === 'joined' && s.actionBtnJoined]}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={action.a11y}
          >
            <Text style={[s.actionText, kind === 'joined' && { color: C.onAccent }]} maxFontSizeMultiplier={1.2}>{action.label}</Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>
    );
  };

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/clients' as any); }}
            style={s.iconBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={C.textPrimary} />
          </TouchableOpacity>
          <View style={s.headerMid}>
            <Text style={s.headerTitle} maxFontSizeMultiplier={1.2} accessibilityRole="header">Invites</Text>
            {live ? (
              <View style={s.liveTag} accessibilityLabel="Live updates on">
                <View style={s.liveDot} />
                <Text style={s.liveText} maxFontSizeMultiplier={1.2}>LIVE</Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => setShowSheet(true)}
            style={s.addBtn}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="New invite"
          >
            <Ionicons name="add" size={22} color={C.onAccent} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={people}
          keyExtractor={(r) => r.id}
          renderItem={renderRow}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.textMuted} />}
          ListHeaderComponent={
            <View style={s.tiles}>
              <StatTile label="Sent" value={stats.sent} />
              <StatTile label="Opened" value={stats.opened} />
              <StatTile label="Joined" value={stats.joined} accent />
            </View>
          }
          ListEmptyComponent={
            rows === null && !loadError ? (
              <View style={s.empty}><ActivityIndicator color={C.textMuted} /></View>
            ) : (
              <View style={s.empty}>
                <Text style={s.emptyTitle} maxFontSizeMultiplier={1.3}>{loadError ? 'Nothing to show' : 'No invites yet'}</Text>
                <Text style={s.emptyText} maxFontSizeMultiplier={1.4}>
                  {loadError ?? 'Send the first one. You will see it here the moment it is opened, and again when they join.'}
                </Text>
                {!loadError ? (
                  <TouchableOpacity onPress={() => setShowSheet(true)} style={s.emptyBtn} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Invite someone">
                    <Text style={s.emptyBtnText} maxFontSizeMultiplier={1.2}>Invite someone</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )
          }
          ListFooterComponent={
            people.length > 0 ? (
              <Text style={s.footer} maxFontSizeMultiplier={1.4}>
                Opened means the link was tapped. Joined means they made an account and are on your roster, with the week you set up waiting.
              </Text>
            ) : null
          }
        />
      </SafeAreaView>

      <InviteSheet
        visible={showSheet}
        kind="coach"
        coachName={trainer?.name}
        onClose={() => setShowSheet(false)}
        onCreated={() => { load({ silent: true }); }}
      />
    </View>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={[s.tile, accent && s.tileAccent]} accessibilityLabel={`${label}: ${value}`}>
      <Text style={[s.tileValue, accent && { color: C.onAccent }]} maxFontSizeMultiplier={1.2}>{value}</Text>
      <Text style={[s.tileLabel, accent && { color: C.onAccent }]} maxFontSizeMultiplier={1.2}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerMid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontFamily: F.headingBold, fontSize: 24, color: C.textPrimary, letterSpacing: -0.4 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  liveText: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.5, color: C.accent },
  addBtn: {
    width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous',
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },

  list: { paddingHorizontal: 20, paddingTop: 4 },
  tiles: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tile: {
    flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 14, gap: 4,
  },
  tileAccent: { backgroundColor: C.accent, borderColor: C.accent },
  tileValue: { fontFamily: F.headingBold, fontSize: 26, color: C.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: -0.4 },
  tileLabel: { fontFamily: F.bodyMedium, fontSize: 12.5, color: C.textMuted },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 12, minHeight: 68,
  },
  badge: {
    width: 36, height: 36, borderRadius: 18, borderCurve: 'continuous',
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeJoined: { backgroundColor: C.accentSoft, borderColor: C.accentSoft },
  badgeOpened: { backgroundColor: 'transparent', borderWidth: 2, borderColor: C.warning },
  rowName: { fontFamily: F.bodySemiBold, fontSize: 15.5, color: C.textPrimary },
  rowSub: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.textMuted, marginTop: 2 },
  actionBtn: {
    minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  actionBtnJoined: { backgroundColor: C.accent, borderColor: C.accent },
  actionText: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textPrimary },

  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 8 },
  emptyTitle: { fontFamily: F.headingSemiBold, fontSize: 18, color: C.textPrimary },
  emptyText: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textSecondary, textAlign: 'center' },
  emptyBtn: {
    marginTop: 8, height: 48, paddingHorizontal: 24, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  emptyBtnText: { fontFamily: F.bodyBold, fontSize: 15, color: C.onAccent },
  footer: { fontFamily: F.body, fontSize: 13, lineHeight: 19, color: C.textFaint, marginTop: 20, paddingHorizontal: 4 },
});
