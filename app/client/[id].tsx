import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getClientById, getClientSessions } = useApp();

  const client = getClientById(id || '');
  const sessions = getClientSessions(id || '');

  if (!client) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Client not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  const upcomingSessions = sessions.filter((s) => s.status === 'upcoming' && new Date(s.date) > new Date());
  const completedSessions = sessions.filter((s) => s.status === 'completed');

  const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: Colors.greenSoft, text: Colors.green },
    trial: { bg: Colors.yellowSoft, text: Colors.yellow },
    inactive: { bg: Colors.bgElevated, text: Colors.textTertiary },
  };

  const statusStyle = statusColors[client.status] || statusColors.inactive;

  const contactActions = [
    ...(client.phone ? [{ icon: 'call', label: 'Call', color: Colors.green, onPress: () => Linking.openURL(`tel:${client.phone}`) }] : []),
    ...(client.phone ? [{ icon: 'chatbubble', label: 'Text', color: Colors.blue, onPress: () => Linking.openURL(`sms:${client.phone}`) }] : []),
    ...(client.email ? [{ icon: 'mail', label: 'Email', color: Colors.purple, onPress: () => Linking.openURL(`mailto:${client.email}`) }] : []),
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Client Profile</Text>
        <TouchableOpacity onPress={() => router.push(`/edit-client/${id}` as any)} style={styles.backBtn}>
          <Ionicons name="create-outline" size={18} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Hero */}
        <View style={styles.profileHero}>
          <Avatar name={client.name} size="xl" />
          <Text style={styles.profileName}>{client.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{client.status}</Text>
          </View>
        </View>

        {/* Contact Actions */}
        {contactActions.length > 0 && (
          <View style={styles.contactActions}>
            {contactActions.map((action, i) => (
              <TouchableOpacity key={i} style={styles.contactBtn} onPress={action.onPress} activeOpacity={0.7}>
                <View style={[styles.contactIcon, { backgroundColor: `${action.color}18` }]}>
                  <Ionicons name={action.icon as any} size={20} color={action.color} />
                </View>
                <Text style={styles.contactLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Info Card */}
        <Card style={styles.infoCard}>
          {[
            { icon: 'mail-outline', label: 'Email', value: client.email },
            { icon: 'call-outline', label: 'Phone', value: client.phone },
            { icon: 'calendar-outline', label: 'Member Since', value: new Date(client.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) },
          ].filter((item) => item.value).map((item, i) => (
            <View key={i} style={[styles.infoRow, i > 0 && styles.infoRowBorder]}>
              <Ionicons name={item.icon as any} size={16} color={Colors.textTertiary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text style={styles.infoValue}>{item.value}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Goals */}
        {client.goals && (
          <>
            <Text style={styles.sectionTitle}>Goals</Text>
            <Card>
              <Text style={styles.goalsText}>{client.goals}</Text>
            </Card>
          </>
        )}

        {/* Notes */}
        {client.notes && (
          <>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Card>
              <Text style={styles.notesText}>{client.notes}</Text>
            </Card>
          </>
        )}

        {/* Stats */}
        <Text style={styles.sectionTitle}>Session History</Text>
        <View style={styles.statsRow}>
          <Card style={styles.miniStat}>
            <Text style={styles.miniStatValue}>{upcomingSessions.length}</Text>
            <Text style={styles.miniStatLabel}>Upcoming</Text>
          </Card>
          <Card style={styles.miniStat}>
            <Text style={styles.miniStatValue}>{completedSessions.length}</Text>
            <Text style={styles.miniStatLabel}>Completed</Text>
          </Card>
          <Card style={styles.miniStat}>
            <Text style={styles.miniStatValue}>{sessions.length}</Text>
            <Text style={styles.miniStatLabel}>Total</Text>
          </Card>
        </View>

        {/* Recent Sessions */}
        {sessions.length > 0 && (
          <Card noPadding>
            {sessions.slice(0, 5).map((session, i) => {
              const dt = new Date(session.date);
              return (
                <View key={session.id} style={[styles.sessionRow, i < Math.min(sessions.length, 5) - 1 && styles.sessionBorder]}>
                  <View style={[styles.sessionDot, {
                    backgroundColor: session.status === 'completed' ? Colors.green : session.status === 'cancelled' ? Colors.red : Colors.blue,
                  }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sessionDate}>
                      {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </Text>
                    <Text style={styles.sessionTime}>
                      {dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {session.type} · {session.duration}min
                    </Text>
                  </View>
                  {session.status !== 'upcoming' && (
                    <Text style={[styles.sessionStatus, { color: session.status === 'completed' ? Colors.green : Colors.red }]}>
                      {session.status === 'completed' ? 'Done' : 'Cancelled'}
                    </Text>
                  )}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  profileHero: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  profileName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, letterSpacing: -0.5 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.full },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, textTransform: 'capitalize' },

  contactActions: { flexDirection: 'row', justifyContent: 'center', gap: Spacing['2xl'], marginBottom: Spacing.xl },
  contactBtn: { alignItems: 'center', gap: 6 },
  contactIcon: { width: 48, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  contactLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, color: Colors.textSecondary },

  infoCard: { marginBottom: Spacing.lg },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  infoLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  infoValue: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: Colors.textPrimary, marginTop: 1 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary, marginBottom: Spacing.md, marginTop: Spacing.sm },
  goalsText: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textSecondary, lineHeight: 20 },
  notesText: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textSecondary, lineHeight: 20 },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  miniStat: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  miniStatValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: Colors.textPrimary },
  miniStatLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },

  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  sessionBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  sessionDot: { width: 8, height: 8, borderRadius: 4 },
  sessionDate: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textPrimary },
  sessionTime: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 1 },
  sessionStatus: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  emptyText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: Colors.textSecondary },
});
