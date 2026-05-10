import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Avatar from '../components/Avatar';
import Card from '../components/Card';
import Button from '../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme'
import { useTheme } from '../context/ThemeContext';

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  active: { color: Colors.green, label: 'Active' },
  signed_up: { color: '#30D5C8', label: 'Signed Up' },
  pending: { color: Colors.yellow, label: 'Pending' },
  expired: { color: Colors.textTertiary, label: 'Expired' },
};

function getReferralTier(count: number) {
  if (count >= 50) return { name: 'Platinum', icon: '💎', color: '#A78BFA' };
  if (count >= 25) return { name: 'Gold', icon: '🏆', color: '#F59E0B' };
  if (count >= 10) return { name: 'Silver', icon: '🥈', color: '#9CA3AF' };
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
  const { referrals, totalReferrals, trainer } = useApp();
  const [filter, setFilter] = useState('all');

  const tier = getReferralTier(totalReferrals);
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Referrals</Text>
        <TouchableOpacity onPress={handleInvite} style={[styles.backBtn, { backgroundColor: Colors.accent }]}>
          <Ionicons name="person-add" size={16} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Tier Banner */}
        <Card style={styles.tierCard}>
          <View style={styles.tierRow}>
            <Text style={styles.tierIcon}>{tier.icon}</Text>
            <View style={{ flex: 1 }}>
              <View style={styles.tierHeader}>
                <Text style={[styles.tierName, { color: tier.color }]}>{tier.name} Tier</Text>
                {progress.percent < 100 && (
                  <Text style={styles.tierProgress}>{progress.current}/{progress.target} to {progress.nextTier}</Text>
                )}
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(progress.percent, 100)}%`, backgroundColor: tier.color }]} />
              </View>
            </View>
          </View>
        </Card>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { value: totalReferrals.toString(), label: 'Total', color: Colors.blue },
            { value: `${conversionRate}%`, label: 'Conversion', color: Colors.green },
            { value: `$${totalEarnings}`, label: 'Earned', color: Colors.accent },
          ].map((s, i) => (
            <Card key={i} style={styles.statCard}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </Card>
          ))}
        </View>

        {/* Invite CTA */}
        <Button title="Share Referral Link" onPress={handleInvite} full icon={<Ionicons name="share-outline" size={18} color={Colors.white} />} />

        {/* Filter Tabs */}
        <Text style={styles.sectionLabel}>REFERRAL HISTORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {filters.map((f) => (
            <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f === 'signed_up' ? 'Signed Up' : f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Referral List */}
        {filteredReferrals.length === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No referrals {filter !== 'all' ? `with status "${filter}"` : 'yet'}</Text>
            </View>
          </Card>
        ) : (
          filteredReferrals.map((ref) => {
            const sc = STATUS_CONFIG[ref.status] || STATUS_CONFIG.pending;
            return (
              <Card key={ref.id} style={styles.refCard}>
                <View style={styles.refRow}>
                  <Avatar name={ref.name || 'Unknown'} size="sm" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.refName}>{ref.name}</Text>
                    <Text style={styles.refDate}>{new Date(ref.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[styles.statusBadge, { backgroundColor: `${sc.color}20` }]}>
                      <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                    </View>
                    {(ref.reward || 0) > 0 && (
                      <Text style={styles.rewardText}>+${ref.reward}</Text>
                    )}
                  </View>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  tierCard: { marginBottom: Spacing.lg },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  tierIcon: { fontSize: 32 },
  tierHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },
  tierProgress: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.bgElevated, marginTop: 6 },
  progressFill: { height: 6, borderRadius: 3 },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl },
  statLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },

  sectionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.md },
  filterScroll: { marginBottom: Spacing.md },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.bgElevated, marginRight: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.accentSoft, borderColor: 'rgba(255,95,59,0.3)' },
  filterText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textSecondary },
  filterTextActive: { color: Colors.accent },

  refCard: { marginBottom: Spacing.sm },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  refName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  refDate: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10 },
  rewardText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.green },

  emptyState: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
