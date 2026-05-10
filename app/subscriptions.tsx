import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Avatar from '../components/Avatar';
import Card from '../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme'
import { useTheme } from '../context/ThemeContext';

export default function SubscriptionsScreen() {
  const router = useRouter();
  const { plans, clients } = useApp();

  const getSubCount = (planId: string) => clients.filter((c) => c.plan_id === planId && c.status !== 'inactive').length;

  const totalRevenue = useMemo(() => plans.reduce((sum, p) => sum + Number(p.price) * getSubCount(p.id), 0), [plans, clients]);
  const totalSubscribers = useMemo(() => plans.reduce((sum, p) => sum + getSubCount(p.id), 0), [plans, clients]);

  const formatCurrency = (n: number) => `$${n.toFixed(0)}`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscriptions</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Revenue Summary */}
        <Card style={styles.revenueCard}>
          <Text style={styles.revenueLabel}>Monthly Recurring Revenue</Text>
          <Text style={styles.revenueAmount}>{formatCurrency(totalRevenue)}</Text>
          <Text style={styles.revenueSubLabel}>{totalSubscribers} active subscriber{totalSubscribers !== 1 ? 's' : ''}</Text>
        </Card>

        {/* Plans */}
        <Text style={styles.sectionLabel}>YOUR PLANS</Text>
        {plans.length === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={40} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No plans yet</Text>
              <Text style={styles.emptyText}>Create subscription plans for your clients in the web dashboard</Text>
            </View>
          </Card>
        ) : (
          plans.map((plan) => {
            const subCount = getSubCount(plan.id);
            const planRevenue = Number(plan.price) * subCount;
            const planClients = clients.filter((c) => c.plan_id === plan.id && c.status !== 'inactive');
            const planColor = (plan as any).color || Colors.blue;

            return (
              <Card key={plan.id} style={styles.planCard}>
                <View style={styles.planHeader}>
                  <View style={[styles.planDot, { backgroundColor: planColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, { color: planColor }]}>{plan.name}</Text>
                    <Text style={styles.planPrice}>{formatCurrency(Number(plan.price))}/{(plan as any).period || 'month'}</Text>
                  </View>
                  {(plan as any).is_popular && (
                    <View style={[styles.popularBadge, { backgroundColor: `${planColor}20` }]}>
                      <Ionicons name="star" size={10} color={planColor} />
                      <Text style={[styles.popularText, { color: planColor }]}>Popular</Text>
                    </View>
                  )}
                </View>

                {/* Subscribers */}
                <View style={styles.subRow}>
                  <View style={styles.avatarStack}>
                    {planClients.slice(0, 3).map((c, i) => (
                      <View key={c.id} style={[styles.avatarRing, { marginLeft: i > 0 ? -8 : 0, zIndex: 3 - i }]}>
                        <Avatar name={c.name} size="sm" />
                      </View>
                    ))}
                  </View>
                  <Text style={styles.subCount}>{subCount} subscriber{subCount !== 1 ? 's' : ''}</Text>
                </View>

                {/* Features */}
                {((plan as any).features || []).length > 0 && (
                  <View style={styles.featureList}>
                    {((plan as any).features as string[]).slice(0, 4).map((f, i) => (
                      <View key={i} style={styles.featureRow}>
                        <Ionicons name="checkmark" size={14} color={planColor} />
                        <Text style={styles.featureText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Revenue */}
                <View style={styles.planRevenueRow}>
                  <Text style={styles.planRevenueLabel}>Monthly revenue</Text>
                  <Text style={[styles.planRevenueValue, { color: planColor }]}>{formatCurrency(planRevenue)}</Text>
                </View>
              </Card>
            );
          })
        )}

        {/* Revenue Breakdown */}
        {plans.length > 1 && (
          <>
            <Text style={styles.sectionLabel}>REVENUE BREAKDOWN</Text>
            <Card>
              {plans.map((plan) => {
                const revenue = Number(plan.price) * getSubCount(plan.id);
                const percent = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
                const planColor = (plan as any).color || Colors.blue;
                return (
                  <View key={plan.id} style={styles.breakdownRow}>
                    <View style={[styles.breakdownDot, { backgroundColor: planColor }]} />
                    <Text style={styles.breakdownName}>{plan.name}</Text>
                    <Text style={styles.breakdownAmount}>{formatCurrency(revenue)}</Text>
                    <View style={styles.breakdownBarTrack}>
                      <View style={[styles.breakdownBarFill, { width: `${percent}%`, backgroundColor: planColor }]} />
                    </View>
                  </View>
                );
              })}
            </Card>
          </>
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

  revenueCard: { alignItems: 'center', paddingVertical: Spacing.xl },
  revenueLabel: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
  revenueAmount: { fontFamily: FontFamily.headingExtraBold, fontSize: 36, color: Colors.textPrimary, marginTop: Spacing.xs },
  revenueSubLabel: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },

  sectionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.md },

  planCard: { marginBottom: Spacing.md },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  planDot: { width: 10, height: 10, borderRadius: 5 },
  planName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },
  planPrice: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },
  popularBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  popularText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10 },

  subRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  avatarStack: { flexDirection: 'row' },
  avatarRing: { borderWidth: 2, borderColor: Colors.bgCard, borderRadius: 100 },
  subCount: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary },

  featureList: { marginTop: Spacing.md, gap: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary },

  planRevenueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  planRevenueLabel: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
  planRevenueValue: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },

  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 8 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownName: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: Colors.textPrimary, flex: 1 },
  breakdownAmount: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textPrimary, marginRight: Spacing.sm },
  breakdownBarTrack: { width: 60, height: 4, borderRadius: 2, backgroundColor: Colors.bgElevated },
  breakdownBarFill: { height: 4, borderRadius: 2 },

  emptyState: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center' },
});
