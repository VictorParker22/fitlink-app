import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function DashboardScreen() {
  const { user } = useAuth();
  const name = user?.user_metadata?.name || 'Coach';
  const firstName = name.split(' ')[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name}>{firstName} 👋</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.notifDot} />
            <Ionicons name="notifications-outline" size={22} color={Colors.textSecondary} />
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Active Clients', value: '—', icon: 'people', color: Colors.accent },
            { label: 'Sessions Today', value: '—', icon: 'calendar', color: Colors.blue },
            { label: 'Revenue', value: '—', icon: 'cash', color: Colors.green },
            { label: 'Referrals', value: '—', icon: 'share', color: Colors.purple },
          ].map((stat, i) => (
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
            { label: 'Add Client', icon: 'person-add', color: Colors.accent },
            { label: 'Book Session', icon: 'calendar-outline', color: Colors.blue },
            { label: 'New Workout', icon: 'barbell', color: Colors.green },
            { label: 'Invite', icon: 'share-social', color: Colors.purple },
          ].map((action, i) => (
            <View key={i} style={styles.quickAction}>
              <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}18` }]}>
                <Ionicons name={action.icon as any} size={22} color={action.color} />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </View>
          ))}
        </View>

        {/* Activity Feed Placeholder */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <Card>
          <View style={styles.emptyState}>
            <Ionicons name="pulse-outline" size={32} color={Colors.textTertiary} />
            <Text style={styles.emptyText}>Activity will appear here</Text>
            <Text style={styles.emptySubtext}>Start by adding clients and booking sessions</Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  greeting: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  name: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize['2xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerRight: { position: 'relative' },
  notifDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    zIndex: 1,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  statCard: {
    width: '48.5%',
    flexGrow: 1,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  statValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.xl,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  sectionTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    letterSpacing: -0.3,
  },

  quickActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    gap: Spacing.sm,
  },
  emptyText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
});
