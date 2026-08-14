import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

export default function RevenuePanel() {
  const router = useRouter();
  const { plans, clients, sessions, activeClients } = useApp();

  const revenueByPlan = useMemo(() => {
    return plans.map(p => {
      const subCount = clients.filter(c => c.plan_id === p.id && c.status !== 'inactive').length;
      const revenue = Number(p.price) * subCount;
      return { plan: p, clients: subCount, revenue };
    }).filter(r => r.clients > 0 || r.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  }, [plans, clients]);

  const maxPlanRevenue = Math.max(...revenueByPlan.map(r => r.revenue), 1);

  const completedSessionsThisMonth = useMemo(() => {
    const now = new Date();
    return sessions.filter((s: any) => {
      const d = new Date(s.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && s.status === 'completed';
    }).length;
  }, [sessions]);

  return (
    <View style={st.revenuePanel}>
      {/* Stats row */}
      <View style={st.revStatsRow}>
        <View style={st.revStat}>
          <Text style={st.revStatValue}>{activeClients.length}</Text>
          <Text style={st.revStatLabel}>Active clients</Text>
        </View>
        <View style={st.revStatDivider} />
        <View style={st.revStat}>
          <Text style={st.revStatValue}>{completedSessionsThisMonth}</Text>
          <Text style={st.revStatLabel}>Sessions (mo)</Text>
        </View>
        <View style={st.revStatDivider} />
        <View style={st.revStat}>
          <Text style={st.revStatValue}>{plans.length}</Text>
          <Text style={st.revStatLabel}>Plans</Text>
        </View>
      </View>

      {/* Per-plan bars */}
      {revenueByPlan.length > 0 ? (
        <View style={st.revPlans}>
          {revenueByPlan.map((r, i) => (
            <View key={r.plan.id} style={st.revPlanRow}>
              <View style={st.revPlanInfo}>
                <Text style={st.revPlanName} numberOfLines={1}>{r.plan.name}</Text>
                <Text style={st.revPlanMeta}>{r.clients} client{r.clients !== 1 ? 's' : ''} × ${r.plan.price}</Text>
              </View>
              <View style={st.revBarTrack}>
                <View style={[st.revBarFill, { width: `${(r.revenue / maxPlanRevenue) * 100}%` }]} />
              </View>
              <Text style={st.revPlanAmount}>${r.revenue.toLocaleString()}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <Text style={st.revPlanMeta}>No plan revenue yet</Text>
        </View>
      )}

      <TouchableOpacity
        style={st.revCta}
        onPress={() => router.push('/subscriptions' as any)}
        activeOpacity={0.7}
      >
        <Text style={st.revCtaText}>Manage subscriptions</Text>
        <Ionicons name="chevron-forward" size={14} color={CoachColors.accent} />
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  revenuePanel: {
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    gap: 14,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  revStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  revStat: { alignItems: 'center', gap: 2 },
  revStatValue: { fontFamily: CoachFonts.headingBold, fontSize: 22, color: CoachColors.textPrimary },
  revStatLabel: { fontFamily: CoachFonts.body, fontSize: 10, color: CoachColors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  revStatDivider: { width: 1, height: 30, backgroundColor: CoachColors.borderMuted },
  revPlans: { gap: 10 },
  revPlanRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  revPlanInfo: { width: 90 },
  revPlanName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },
  revPlanMeta: { fontFamily: CoachFonts.body, fontSize: 10, color: CoachColors.textMuted },
  revBarTrack: { flex: 1, height: 6, backgroundColor: CoachColors.borderMuted, borderRadius: 3, overflow: 'hidden' },
  revBarFill: { height: '100%', backgroundColor: CoachColors.accent, borderRadius: 3 },
  revPlanAmount: { fontFamily: CoachFonts.headingSemiBold, fontSize: 14, color: CoachColors.textPrimary, width: 60, textAlign: 'right' },
  revCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1, borderColor: CoachColors.accentSoft,
  },
  revCtaText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.accent },
});
