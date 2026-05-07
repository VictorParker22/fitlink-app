import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function ClientProfileScreen() {
  const { signOut } = useAuth();
  const { clientData, trainer, sessions, workouts } = useClient();

  if (!clientData) return null;

  const completedSessions = sessions.filter((s: any) => s.status === 'completed').length;
  const completedWorkouts = workouts.filter((w: any) => w.status === 'completed').length;

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profile</Text>

        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.accentStrip} />
          <View style={styles.profileInfo}>
            <Avatar name={clientData.name} size="xl" />
            <Text style={styles.profileName}>{clientData.name}</Text>
            {trainer && <Text style={styles.trainerLine}>Training with {trainer.name}</Text>}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{completedSessions}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{completedWorkouts}</Text>
              <Text style={styles.statLabel}>Workouts</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{clientData.progress?.streak || 0}</Text>
              <Text style={styles.statLabel}>Streak</Text>
            </View>
          </View>
        </Card>

        {/* Info Card */}
        <Card>
          {[
            { icon: 'mail-outline', label: 'Email', value: clientData.email },
            { icon: 'call-outline', label: 'Phone', value: clientData.phone },
            { icon: 'flag-outline', label: 'Goals', value: clientData.goals },
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

        {/* Trainer Card */}
        {trainer && (
          <>
            <Text style={styles.sectionTitle}>Your Trainer</Text>
            <Card>
              <View style={styles.trainerRow}>
                <Avatar name={trainer.name} size="md" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.trainerName}>{trainer.name}</Text>
                  {trainer.specialization && <Text style={styles.trainerSpec}>{trainer.specialization}</Text>}
                </View>
              </View>
            </Card>
          </>
        )}

        <View style={styles.signOutSection}>
          <Button title="Sign Out" onPress={handleSignOut} variant="danger" full icon={<Ionicons name="log-out-outline" size={18} color={Colors.red} />} />
        </View>

        <Text style={styles.version}>FitLink v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, letterSpacing: -0.5, paddingTop: Spacing.md, marginBottom: Spacing.lg },

  profileCard: { overflow: 'hidden', marginBottom: Spacing.lg },
  accentStrip: { position: 'absolute', top: 0, left: 0, right: 0, height: 60, backgroundColor: 'rgba(255,95,59,0.06)' },
  profileInfo: { alignItems: 'center', paddingTop: Spacing['2xl'], gap: Spacing.xs },
  profileName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: Colors.textPrimary, marginTop: Spacing.sm },
  trainerLine: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },

  statsRow: { flexDirection: 'row', marginTop: Spacing.xl, paddingTop: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: Colors.textPrimary },
  statLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  infoLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },
  infoValue: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: Colors.textPrimary, marginTop: 1 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary, marginTop: Spacing.xl, marginBottom: Spacing.md },
  trainerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  trainerName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  trainerSpec: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.accentText, marginTop: 1 },

  signOutSection: { marginTop: Spacing['2xl'] },
  version: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.xl, opacity: 0.5 },
});
