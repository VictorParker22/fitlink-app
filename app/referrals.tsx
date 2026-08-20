import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Avatar from '../components/Avatar';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

/**
 * Referrals — real rows from the trainer-scoped `referrals` table.
 *
 * Fixes over the previous version: the Bronze/Silver/Gold/Platinum "tier"
 * ladder (emoji medals, invented 10/25/50 targets with no backend behind
 * them) is gone. What remains is all real: referral rows, their statuses,
 * and the reward amounts recorded on each row. The share message keeps the
 * same code + signup-URL pattern that profile.tsx uses.
 */

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  signed_up: 'Signed up',
  pending: 'Pending',
  expired: 'Expired',
};

const FILTERS = ['all', 'active', 'signed_up', 'pending', 'expired'];

export default function ReferralsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { referrals, totalReferrals, trainer, refreshData } = useApp();
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  };

  const activeCount = referrals.filter((r) => r.status === 'active').length;
  const totalEarned = referrals.reduce((sum, r) => sum + (r.reward || 0), 0);

  const filteredReferrals = useMemo(
    () => (filter === 'all' ? referrals : referrals.filter((r) => r.status === filter)),
    [referrals, filter],
  );

  const handleInvite = async () => {
    try {
      await Share.share({
        message: `Join me on FitLink! Sign up using my referral code: ${trainer?.referral_code || 'FITLINK'}\n\nhttps://getfitlink.com/signup?ref=${trainer?.referral_code || ''}`,
      });
    } catch {}
  };

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.textSecondary} />}
      >
        {/* ── Header ── */}
        <View style={st.header}>
          <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={st.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={19} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.headerTitle}>Referrals</Text>
            <Text style={st.headerSub}>Bring people in, get rewarded</Text>
          </View>
        </View>

        {/* ── Code card + share ── */}
        <View style={st.codeCard}>
          <Text style={st.codeLabel}>Your code</Text>
          <Text style={st.codeValue}>{trainer?.referral_code || '—'}</Text>
          <Text style={st.codeDesc}>
            Anyone who signs up with it shows in the list below, with the reward once it's recorded.
          </Text>
          <TouchableOpacity style={st.shareBtn} onPress={handleInvite} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Share referral link">
            <Ionicons name="share-outline" size={18} color={CoachColors.onAccent} />
            <Text style={st.shareBtnText}>Share your link</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats ── */}
        <View style={st.statsRow}>
          <View style={st.statTile}>
            <Text style={st.statLabel}>Referred</Text>
            <Text style={st.statValue}>{totalReferrals}</Text>
          </View>
          <View style={st.statTile}>
            <Text style={st.statLabel}>Active</Text>
            <Text style={st.statValue}>{activeCount}</Text>
          </View>
          <View style={st.statTile}>
            <Text style={st.statLabel}>Earned</Text>
            <Text style={st.statValue}>${totalEarned.toLocaleString()}</Text>
          </View>
        </View>

        {/* ── History ── */}
        <Text style={st.sectionTitle}>History</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filterScroll}>
          {FILTERS.map((f) => (
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
              key={f}
              style={[st.filterChip, filter === f && st.filterChipActive]}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
            >
              <Text style={[st.filterText, filter === f && st.filterTextActive]}>
                {f === 'all' ? 'All' : STATUS_LABEL[f] || f}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredReferrals.length === 0 ? (
          <View style={st.emptyCard}>
            <Text style={st.emptyTitle}>
              {filter === 'all' ? 'No referrals yet' : `No ${STATUS_LABEL[filter]?.toLowerCase() || filter} referrals`}
            </Text>
            <Text style={st.emptyText}>
              {filter === 'all'
                ? 'Share your link — everyone who joins with your code lands here.'
                : 'Try a different filter.'}
            </Text>
          </View>
        ) : (
          <View style={st.listCard}>
            {filteredReferrals.map((ref, i) => {
              const isActive = ref.status === 'active';
              return (
                <View key={ref.id} style={[st.refRow, i < filteredReferrals.length - 1 && st.rowBorder]}>
                  <Avatar name={ref.name || 'Unknown'} size="sm" shape="square" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.refName} numberOfLines={1}>{ref.name}</Text>
                    <Text style={st.refDate}>
                      {new Date(ref.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[st.statusBadge, isActive && st.statusBadgeActive]}>
                      <Text style={[st.statusText, isActive && st.statusTextActive]}>
                        {STATUS_LABEL[ref.status] || ref.status}
                      </Text>
                    </View>
                    {(ref.reward || 0) > 0 && <Text style={st.rewardText}>+${ref.reward}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
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
    borderCurve: 'continuous',
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

  codeCard: {
    marginTop: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 18,
  },
  codeLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    letterSpacing: 0.6,
  },
  codeValue: {
    fontFamily: CoachFonts.mono,
    fontSize: 29,
    color: CoachColors.accent,
    marginTop: 8,
    letterSpacing: 1,
  },
  codeDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    marginTop: 8,
    lineHeight: 20,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 14,
    marginTop: 16,
  },
  shareBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15.5,
    color: CoachColors.onAccent,
  },

  statsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  statTile: {
    flex: 1,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 13,
  },
  statLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
  statValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    marginTop: 4,
  },

  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginTop: 22,
    marginBottom: 10,
  },
  filterScroll: { marginBottom: 12, flexGrow: 0 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    marginRight: 8,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  filterChipActive: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
  },
  filterText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13.5,
    color: CoachColors.textSecondary,
  },
  filterTextActive: { color: CoachColors.onAccent, fontFamily: CoachFonts.bodySemiBold },

  listCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  refName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  refDate: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  statusBadge: {
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.bg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  statusBadgeActive: {
    backgroundColor: CoachColors.accentSoft,
    borderColor: 'transparent',
  },
  statusText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12,
    color: CoachColors.textSecondary,
  },
  statusTextActive: { color: CoachColors.accent },
  rewardText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.accent,
  },

  emptyCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
});
