import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Avatar from '../components/Avatar';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

function getStatusConfig(colors: ThemeColors): Record<string, { color: string; label: string }> {
  return {
    active: { color: colors.green, label: 'Active' },
    signed_up: { color: colors.teal, label: 'Signed Up' },
    pending: { color: colors.yellow, label: 'Pending' },
    expired: { color: colors.textTertiary, label: 'Expired' },
  };
}

function getReferralTier(count: number, colors: ThemeColors) {
  if (count >= 50) return { name: 'Platinum', icon: '💎', color: colors.purple };
  if (count >= 25) return { name: 'Gold', icon: '🏆', color: colors.yellow };
  if (count >= 10) return { name: 'Silver', icon: '🥈', color: colors.textTertiary };
  return { name: 'Bronze', icon: '🥉', color: '#CD7F32' };
}

function getTierProgress(count: number) {
  if (count >= 50) return { current: count, target: count, nextTier: 'Platinum', percent: 100 };
  if (count >= 25) return { current: count, target: 50, nextTier: 'Platinum', percent: (count / 50) * 100 };
  if (count >= 10) return { current: count, target: 25, nextTier: 'Gold', percent: (count / 25) * 100 };
  return { current: count, target: 10, nextTier: 'Silver', percent: (count / 10) * 100 };
}

export default function ReferralsScreen() {
  const router = useRouter();
  const { referrals, totalReferrals, trainer, refreshData } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshData(); } finally { setRefreshing(false); }
  };

  const statusConfig = useMemo(() => getStatusConfig(colors), [colors]);
  const tier = getReferralTier(totalReferrals, colors);
  const progress = getTierProgress(totalReferrals);

  const activeReferrals = referrals.filter((r) => r.status === 'active').length;
  const pendingReferrals = referrals.filter((r) => r.status === 'pending').length;
  const totalEarnings = referrals.reduce((sum, r) => sum + (r.reward || 0), 0);
  const conversionRate = totalReferrals > 0 ? Math.round((activeReferrals / totalReferrals) * 100) : 0;

  const filteredReferrals = useMemo(() =>
    filter === 'all' ? referrals : referrals.filter((r) => r.status === filter),
    [referrals, filter]
  );

  const filters = ['all', 'active', 'signed_up', 'pending', 'expired'];

  const handleInvite = async () => {
    try {
      await Share.share({
        message: `Join me on FitLink! Sign up using my referral code: ${trainer?.referral_code || 'FITLINK'}\n\nhttps://getfitlink.com/signup?ref=${trainer?.referral_code || ''}`,
      });
    } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>REFERRAL PROGRAM</Text>
        <TouchableOpacity onPress={handleInvite} style={styles.inviteHeaderBtn} accessibilityRole="button" accessibilityLabel="Share referral link">
          <Ionicons name="person-add-outline" size={18} color={colors.bgPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} colors={[colors.textPrimary]} />}>
        {/* Tier Banner */}
        <View style={styles.tierCard}>
          <View style={styles.tierRow}>
            <Text style={styles.tierIcon}>{tier.icon}</Text>
            <View style={{ flex: 1 }}>
              <View style={styles.tierHeader}>
                <Text style={styles.tierName}>{tier.name.toUpperCase()} TIER</Text>
                {progress.percent < 100 && (
                  <Text style={styles.tierProgress}>{progress.current}/{progress.target} TO {progress.nextTier.toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(progress.percent, 100)}%` }]} />
              </View>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { value: totalReferrals.toString(), label: 'TOTAL' },
            { value: `${conversionRate}%`, label: 'CONVERSION' },
            { value: `$${totalEarnings}`, label: 'EARNED' },
          ].map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Invite CTA */}
        <TouchableOpacity style={styles.inviteBtn} onPress={handleInvite} activeOpacity={0.8} accessibilityRole="button">
          <Ionicons name="share-outline" size={18} color={colors.bgPrimary} />
          <Text style={styles.inviteBtnText}>SHARE REFERRAL LINK</Text>
        </TouchableOpacity>

        {/* Filter Tabs */}
        <Text style={styles.sectionLabel}>REFERRAL HISTORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {filters.map((f) => (
            <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f === 'signed_up' ? 'SIGNED UP' : f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Referral List */}
        {filteredReferrals.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={36} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>NO REFERRALS YET</Text>
              <Text style={styles.emptyText}>No referrals {filter !== 'all' ? `with status "${filter}"` : 'yet'}</Text>
            </View>
          </View>
        ) : (
          filteredReferrals.map((ref) => {
            const sc = statusConfig[ref.status] || statusConfig.pending;
            return (
              <View key={ref.id} style={styles.refCard}>
                <View style={styles.refRow}>
                  <Avatar name={ref.name || 'Unknown'} size="sm" shape="square" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.refName}>{ref.name.toUpperCase()}</Text>
                    <Text style={styles.refDate}>{new Date(ref.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{sc.label.toUpperCase()}</Text>
                    </View>
                    {(ref.reward || 0) > 0 && (
                      <Text style={styles.rewardText}>+${ref.reward}</Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  inviteHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 110 },

  tierCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    padding: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  tierIcon: { fontSize: 28 },
  tierHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierName: { fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: colors.textPrimary, letterSpacing: 1 },
  tierProgress: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.8 },
  progressTrack: { height: 4, borderRadius: Radius.xs, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.border, marginTop: 6 },
  progressFill: { height: '100%' as any, backgroundColor: colors.textPrimary },

  statsRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
  },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: 22, color: colors.textPrimary },
  statLabel: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 1, marginTop: 2 },

  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    borderRadius: Radius.xs,
    paddingVertical: 14,
    marginBottom: Spacing.lg,
  },
  inviteBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: colors.bgPrimary,
    letterSpacing: 1.5,
  },

  sectionLabel: {
    fontFamily: FontFamily.heading,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  filterScroll: { marginBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgSecondary,
    marginRight: Spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  filterText: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.8 },
  filterTextActive: { color: colors.bgPrimary },

  refCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  refName: { fontFamily: FontFamily.bodyBold, fontSize: 12, color: colors.textPrimary, letterSpacing: 0.5 },
  refDate: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.5, marginTop: 2 },
  statusBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  statusText: { fontFamily: FontFamily.bodyBold, fontSize: 8, color: colors.textPrimary, letterSpacing: 0.8 },
  rewardText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: colors.green },

  emptyCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    padding: Spacing.lg,
  },
  emptyState: { alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.heading, fontSize: 12, color: colors.textPrimary, letterSpacing: 1 },
  emptyText: { fontFamily: FontFamily.body, fontSize: 11, color: colors.textTertiary },
});
