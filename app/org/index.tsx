import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { bpsToPercentLabel } from '../../lib/platformFee';

/**
 * Org overview (design 29a) — what a gym owner or admin sees.
 *
 * The design intent, verbatim: "A gym buys seats, not features. The org sees
 * rosters, revenue and seats; it never sees inside a coaching thread. Money is
 * stated as a split the owner sets, not a fee buried in terms."
 *
 * So this screen shows exactly three things — seats, money, and the roster of
 * coaches on those seats. There is no thread, no check-in and no health data
 * here, and `org_overview()` deliberately cannot return any.
 *
 * EVERY FIGURE IS SOURCED (INVARIANTS §4). Nothing on this screen is derived
 * from a placeholder, and each absent value has its own honest rendering:
 *
 *  - `last_active_at` NULL means the coach has never performed a write. It
 *    renders "Never" — not "just now", and not a dash that reads as a
 *    formatting bug.
 *  - `seat_limit` NULL means seats have not been provisioned yet. The figure
 *    renders "Seats 4" with no denominator, never "4 of 0".
 *  - `org_share_bps` 0 means the owner has not set a split. That renders as
 *    "No org share set", and the dollar figure is omitted entirely — 0% of
 *    revenue is not an interesting number, it is an unset one.
 *  - An RPC error, or a caller with no org, gets its own state. The table is
 *    never zero-filled.
 *
 * Access control lives in the database: `org_overview()` is SECURITY DEFINER
 * and checks `is_org_member(p_org_id, ['owner','admin'])` internally, so a
 * plain coach on a seat gets an empty result rather than their colleagues'
 * revenue.
 */

interface CoachRow {
  trainer_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'coach';
  athlete_count: number;
  revenue_cents: number;
  last_active_at: string | null;
}

interface OrgRow {
  name: string;
  seat_limit: number | null;
  org_share_bps: number;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'no-org' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; org: OrgRow; coaches: CoachRow[] };

/** `payments.amount` is integer cents, which is what org_overview sums. */
function formatDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/**
 * NULL means never — the column is only stamped by a real write (a message, a
 * logged workout, a published plan), so "never" is a true statement about a
 * coach who has done none of those, not missing data.
 */
function lastActiveLabel(iso: string | null): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function initialsOf(name: string | null, email: string | null): string {
  const source = (name || '').trim() || (email || '').trim();
  if (!source) return '?';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

const ROLE_LABEL: Record<CoachRow['role'], string> = {
  owner: 'Owner',
  admin: 'Admin',
  coach: 'Coach',
};

export default function OrgOverviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // .rpc() and .from() resolve with { error }; they do not throw (§2).
    const { data: orgId, error: orgIdError } = await supabase.rpc('my_org_id');
    if (orgIdError) {
      setPhase({ kind: 'error', message: 'We could not check your organisation membership.' });
      return;
    }
    // No org is the normal case today — every independent coach has org_id
    // NULL. It is a state, not a failure.
    if (!orgId) {
      setPhase({ kind: 'no-org' });
      return;
    }

    const [orgResult, coachResult] = await Promise.all([
      supabase
        .from('organizations')
        .select('name, seat_limit, org_share_bps')
        .eq('id', orgId)
        .maybeSingle(),
      supabase.rpc('org_overview', { p_org_id: orgId }),
    ]);

    if (orgResult.error || !orgResult.data) {
      setPhase({ kind: 'error', message: 'We could not load this organisation.' });
      return;
    }
    if (coachResult.error) {
      setPhase({ kind: 'error', message: 'We could not load the coaches on your seats.' });
      return;
    }

    const org: OrgRow = {
      name: orgResult.data.name,
      // NULL stays NULL: seats have not been provisioned, and inventing a
      // limit would misstate what the gym is paying for.
      seat_limit:
        orgResult.data.seat_limit === null || orgResult.data.seat_limit === undefined
          ? null
          : Number(orgResult.data.seat_limit),
      org_share_bps: Number(orgResult.data.org_share_bps ?? 0),
    };

    const coaches: CoachRow[] = ((coachResult.data as any[]) ?? []).map((r) => ({
      trainer_id: r.trainer_id,
      name: r.name ?? null,
      email: r.email ?? null,
      avatar_url: r.avatar_url ?? null,
      role: r.role,
      athlete_count: Number(r.athlete_count ?? 0),
      revenue_cents: Number(r.revenue_cents ?? 0),
      last_active_at: r.last_active_at ?? null,
    }));
    // The RPC orders by last activity; the design orders by revenue.
    coaches.sort((a, b) => b.revenue_cents - a.revenue_cents);

    setPhase({ kind: 'ready', org, coaches });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const totals = useMemo(() => {
    if (phase.kind !== 'ready') return null;
    const athletes = phase.coaches.reduce((s, c) => s + c.athlete_count, 0);
    const revenueCents = phase.coaches.reduce((s, c) => s + c.revenue_cents, 0);
    const bps = phase.org.org_share_bps;
    return {
      athletes,
      revenueCents,
      // 0 bps is "the owner has not set a split", so both the percent label
      // and the dollar figure stay null and the tile says so in words.
      shareLabel: bps > 0 ? bpsToPercentLabel(bps) : null,
      shareCents: bps > 0 ? (revenueCents * bps) / 10000 : null,
    };
  }, [phase]);

  const monthLabel = useMemo(
    () => new Date().toLocaleDateString('en-US', { month: 'long' }),
    [],
  );

  const seatsUsed = phase.kind === 'ready' ? phase.coaches.length : 0;
  const seatLimit = phase.kind === 'ready' ? phase.org.seat_limit : null;
  const seatFraction =
    seatLimit !== null && seatLimit > 0 ? Math.min(seatsUsed / seatLimit, 1) : null;

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={CoachColors.textSecondary}
          />
        }
      >
        {/* ── Header ── */}
        <View style={st.header}>
          <TouchableOpacity
            hitSlop={8}
            onPress={() => router.back()}
            style={st.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={19} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.headerTitle} numberOfLines={1}>
              {phase.kind === 'ready' ? phase.org.name : 'Organisation'}
            </Text>
            {phase.kind === 'ready' && (
              <Text style={st.headerSub}>
                {/* No denominator when seats are unprovisioned — never "of 0". */}
                {seatLimit !== null ? `Seats ${seatsUsed} of ${seatLimit}` : `Seats ${seatsUsed}`}
              </Text>
            )}
          </View>
        </View>

        {phase.kind === 'loading' && (
          <View style={st.stateWrap}>
            <ActivityIndicator size="small" color={CoachColors.textSecondary} />
          </View>
        )}

        {phase.kind === 'no-org' && (
          <View style={st.stateCard}>
            <Text style={st.stateTitle}>You are not part of an organisation</Text>
            <Text style={st.stateBody}>
              This screen belongs to gyms that buy seats for their coaches. You are coaching
              independently, which changes nothing about your athletes, passes or earnings.
            </Text>
          </View>
        )}

        {phase.kind === 'error' && (
          <View style={st.stateCard}>
            <Text style={st.stateTitle}>We could not load this</Text>
            <Text style={st.stateBody}>{phase.message}</Text>
            <TouchableOpacity
              hitSlop={12}
              onPress={onRefresh}
              style={st.retryBtn}
              accessibilityRole="button"
              accessibilityLabel="Try loading the organisation again"
            >
              <Text style={st.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase.kind === 'ready' && totals !== null && (
          <>
            {/* ── Seats ── */}
            <View style={st.seatCard}>
              <Text style={st.tileLabel}>Seats</Text>
              <Text style={st.seatValue}>
                {seatsUsed}
                {seatLimit !== null && <Text style={st.seatOf}> of {seatLimit}</Text>}
              </Text>
              {seatFraction !== null ? (
                <View style={st.barTrack}>
                  <View style={[st.barFill, { width: `${seatFraction * 100}%` }]} />
                </View>
              ) : (
                <Text style={st.tileSub}>Seats not provisioned yet</Text>
              )}
            </View>

            {/* ── Stat row ── */}
            <View style={st.tileGrid}>
              <View style={st.tile}>
                <Text style={st.tileLabel}>Athletes across the org</Text>
                <Text style={st.tileValue}>{totals.athletes}</Text>
              </View>
              <View style={st.tile}>
                <Text style={st.tileLabel}>Athlete revenue, {monthLabel}</Text>
                <Text style={st.tileValue}>{formatDollars(totals.revenueCents)}</Text>
              </View>
              <View style={[st.tile, st.tileWide]}>
                {totals.shareLabel !== null ? (
                  <>
                    <Text style={st.tileLabel}>Your org share · {totals.shareLabel}</Text>
                    <Text style={[st.tileValue, { color: CoachColors.accent }]}>
                      {formatDollars(totals.shareCents as number)}
                    </Text>
                    <Text style={st.tileSub}>Set by the owner · coaches see it</Text>
                  </>
                ) : (
                  <>
                    {/* 0 bps is unset, not zero. No dollar figure follows it. */}
                    <Text style={st.tileLabel}>Your org share</Text>
                    <Text style={st.tileUnset}>No org share set</Text>
                    <Text style={st.tileSub}>
                      Coaches keep their athlete revenue until an owner sets a split.
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* ── Coaches on seats ── */}
            <View style={st.tableCard}>
              <View style={st.tableHeader}>
                <Text style={st.tableTitle}>Coaches on seats</Text>
                <Text style={st.tableHint}>Sorted by revenue</Text>
              </View>

              {phase.coaches.length === 0 ? (
                <Text style={st.emptyText}>
                  No coaches are on a seat yet. Invited coaches appear here once they accept.
                </Text>
              ) : (
                phase.coaches.map((c, i) => {
                  const displayName = c.name?.trim() || c.email || 'Coach';
                  return (
                    <View
                      key={c.trainer_id}
                      style={[st.coachRow, i > 0 && st.coachRowDivided]}
                      accessible
                      accessibilityLabel={[
                        displayName,
                        ROLE_LABEL[c.role],
                        `${c.athlete_count} athlete${c.athlete_count === 1 ? '' : 's'}`,
                        `${formatDollars(c.revenue_cents)} this month`,
                        `last active ${lastActiveLabel(c.last_active_at).toLowerCase()}`,
                      ].join(', ')}
                    >
                      {c.avatar_url ? (
                        <Image
                          source={{ uri: c.avatar_url }}
                          cachePolicy="memory-disk"
                          transition={200}
                          style={st.avatar}
                        />
                      ) : (
                        <View style={[st.avatar, st.avatarFallback]}>
                          <Text style={st.avatarInitials}>{initialsOf(c.name, c.email)}</Text>
                        </View>
                      )}

                      <View style={st.coachMain}>
                        <View style={st.coachNameRow}>
                          <Text style={st.coachName} numberOfLines={1}>
                            {displayName}
                          </Text>
                          <View style={[st.roleChip, c.role === 'owner' && st.roleChipOwner]}>
                            <Text
                              style={[st.roleText, c.role === 'owner' && st.roleTextOwner]}
                            >
                              {ROLE_LABEL[c.role]}
                            </Text>
                          </View>
                        </View>
                        {!!c.email && c.email !== displayName && (
                          <Text style={st.coachEmail} numberOfLines={1}>
                            {c.email}
                          </Text>
                        )}
                        <View style={st.metricRow}>
                          <Text style={st.metricStrong}>{formatDollars(c.revenue_cents)}</Text>
                          <Text style={st.metricDot}>·</Text>
                          <Text style={st.metric}>
                            {c.athlete_count} athlete{c.athlete_count === 1 ? '' : 's'}
                          </Text>
                          <Text style={st.metricDot}>·</Text>
                          <Text style={st.metric}>{lastActiveLabel(c.last_active_at)}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <Text style={st.footnote}>
              The org sees rosters, seats and money. Coaching threads, check-in answers, photos
              and health notes stay between coach and athlete.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  // paddingBottom is applied inline from the real bottom inset (pushed route: no tab bar).
  scrollContent: { paddingHorizontal: 20 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 21.5,
    letterSpacing: -0.3,
    color: CoachColors.textPrimary,
  },
  headerSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textMuted,
    marginTop: 1,
  },

  stateWrap: { paddingVertical: 80, alignItems: 'center' },
  stateCard: {
    marginTop: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 18,
  },
  stateTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16.5,
    color: CoachColors.textPrimary,
  },
  stateBody: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: CoachColors.textMuted,
    marginTop: 6,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  retryText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },

  seatCard: {
    marginTop: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 14,
  },
  seatValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
    marginTop: 4,
  },
  seatOf: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textMuted,
  },
  barTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: CoachColors.borderMuted,
    overflow: 'hidden',
    marginTop: 10,
  },
  barFill: { height: '100%', borderRadius: 999, backgroundColor: CoachColors.accent },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 12,
    padding: 13,
  },
  tileWide: { flexBasis: '100%' },
  tileLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
  tileValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
    marginTop: 4,
  },
  tileUnset: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    marginTop: 6,
  },
  tileSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: CoachColors.textFaint,
    marginTop: 4,
  },

  tableCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    marginTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  tableTitle: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
  },
  tableHint: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textFaint,
  },

  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  coachRowDivided: { borderTopWidth: 1, borderTopColor: CoachColors.borderMuted },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: CoachColors.borderMuted },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13,
    color: CoachColors.textSecondary,
  },
  coachMain: { flex: 1, minWidth: 0 },
  coachNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coachName: {
    flexShrink: 1,
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
  },
  roleChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: CoachColors.borderMuted,
  },
  roleChipOwner: { backgroundColor: CoachColors.accentSoft },
  roleText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10.5,
    letterSpacing: 0.4,
    color: CoachColors.textSecondary,
  },
  roleTextOwner: { color: CoachColors.accent },
  coachEmail: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' },
  metricStrong: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
  },
  metric: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
  metricDot: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint },

  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: CoachColors.textMuted,
    textAlign: 'center',
    paddingVertical: 22,
    paddingHorizontal: 6,
  },

  footnote: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    lineHeight: 18,
    color: CoachColors.textFaint,
    marginTop: 14,
  },
});
