import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import Card from '../../components/Card';
import Avatar from '../../components/Avatar';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function DashboardScreen() {
  const router = useRouter();
  const {
    trainer, activeClients, todaySessions, totalReferrals,
    totalMonthlyRevenue, activities, upcomingSessions,
    getClientById, refreshData, loading,
  } = useApp();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const firstName = trainer?.name?.split(' ')[0] || 'Coach';

  const stats = [
    { label: 'Active Clients', value: String(activeClients.length), icon: 'people', color: Colors.accent },
    { label: 'Sessions Today', value: String(todaySessions.length), icon: 'calendar', color: Colors.blue },
    { label: 'Revenue', value: `$${totalMonthlyRevenue.toLocaleString()}`, icon: 'cash', color: Colors.green },
    { label: 'Referrals', value: String(totalReferrals), icon: 'share', color: Colors.purple },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'signup': return { icon: 'person-add', color: Colors.green };
      case 'session': return { icon: 'calendar', color: Colors.blue };
      case 'referral': return { icon: 'share', color: Colors.purple };
      case 'payment': return { icon: 'cash', color: Colors.accent };
      default: return { icon: 'pulse', color: Colors.textTertiary };
    }
  };

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name}>{firstName} 👋</Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn}>
            <Avatar name={trainer?.name || 'Coach'} size="md" imageUrl={trainer?.avatar_url} />
          </TouchableOpacity>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat, i) => (
            <Card key={i} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: `${stat.color}18` }]}>
                <Ionicons name={stat.icon as any} size={18} color={stat.color} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Card>
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActions}>
          {[
            { label: 'Add Client', icon: 'person-add', color: Colors.accent, route: '/(tabs)/clients' },
            { label: 'Book Session', icon: 'calendar-outline', color: Colors.blue, route: '/(tabs)/schedule' },
            { label: 'Send Message', icon: 'chatbubble', color: Colors.green, route: '/(tabs)/messages' },
            { label: 'Invite', icon: 'share-social', color: Colors.purple, route: '/(tabs)/clients' },
          ].map((action, i) => (
            <TouchableOpacity key={i} style={styles.quickAction} onPress={() => router.push(action.route as any)} activeOpacity={0.7}>
              <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}18` }]}>
                <Ionicons name={action.icon as any} size={22} color={action.color} />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Upcoming Sessions */}
        {upcomingSessions.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/schedule')}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            {upcomingSessions.slice(0, 3).map((session) => {
              const client = getClientById(session.client_id || '');
              const dt = new Date(session.date);
              return (
                <Card key={session.id} style={styles.sessionCard}>
                  <View style={styles.sessionRow}>
                    {client ? <Avatar name={client.name} size="sm" /> : (
                      <View style={styles.groupAvatar}><Text style={styles.groupAvatarText}>G</Text></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionName}>{client?.name || session.group_name}</Text>
                      <Text style={styles.sessionMeta}>
                        {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: `${Colors.blue}20` }]}>
                      <Text style={[styles.typeBadgeText, { color: Colors.blue }]}>{session.type}</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </>
        )}

        {/* Recent Activity */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
        </View>
        {activities.length === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              <Ionicons name="pulse-outline" size={32} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No activity yet</Text>
              <Text style={styles.emptySubtext}>Start by adding clients and booking sessions</Text>
            </View>
          </Card>
        ) : (
          <Card noPadding>
            {activities.slice(0, 6).map((activity, i) => {
              const meta = getActivityIcon(activity.type);
              return (
                <View key={activity.id} style={[styles.activityItem, i < activities.slice(0, 6).length - 1 && styles.activityBorder]}>
                  <View style={[styles.activityIcon, { backgroundColor: `${meta.color}18` }]}>
                    <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityMessage} numberOfLines={1}>{activity.message}</Text>
                    <Text style={styles.activityTime}>{getTimeAgo(activity.timestamp)}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  greeting: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textSecondary },
  name: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, letterSpacing: -0.5 },
  avatarBtn: {},

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xl },
  statCard: { width: '48%', flexGrow: 1 },
  statIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: Colors.textPrimary },
  statLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary, letterSpacing: -0.3, marginBottom: Spacing.md },
  seeAll: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.accentText, marginBottom: Spacing.md },

  quickActions: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  quickAction: { flex: 1, alignItems: 'center', gap: 6 },
  quickActionIcon: { width: 52, height: 52, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },

  sessionCard: { marginBottom: Spacing.sm },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sessionName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textPrimary },
  sessionMeta: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  groupAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.purple, alignItems: 'center', justifyContent: 'center' },
  groupAvatarText: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: Colors.white },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.xs },
  typeBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['2xl'], gap: Spacing.sm },
  emptyText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: Colors.textSecondary },
  emptySubtext: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },

  activityItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  activityIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  activityMessage: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textPrimary },
  activityTime: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },
});
