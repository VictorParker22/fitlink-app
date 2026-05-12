import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import { useTheme, type ThemeMode } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'sunny' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'Auto', icon: 'phone-portrait' },
];

export default function ClientProfileScreen() {
  const { signOut } = useAuth();
  const { clientData, trainer, sessions, workouts, plans, requestPlanUpgrade } = useClient();
  const { colors, mode, setMode } = useTheme();
  const { showAlert } = useAlert();

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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Profile</Text>

        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={[styles.accentStrip, { backgroundColor: `${colors.accent}10` }]} />
          <View style={styles.profileInfo}>
            <Avatar name={clientData.name} size="xl" />
            <Text style={[styles.profileName, { color: colors.textPrimary }]}>{clientData.name}</Text>
            {trainer && <Text style={[styles.trainerLine, { color: colors.textTertiary }]}>Training with {trainer.name}</Text>}
          </View>

          <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{completedSessions}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Sessions</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{completedWorkouts}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Workouts</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{clientData.progress?.streak || 0}</Text>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Streak</Text>
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
            <View key={i} style={[styles.infoRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Ionicons name={item.icon as any} size={16} color={colors.textTertiary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoLabel, { color: colors.textTertiary }]}>{item.label}</Text>
                <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{item.value}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* Membership Section */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Membership</Text>
        {clientData.status === 'active' ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
              <View style={[styles.activePlanIcon, { backgroundColor: `${colors.accent}18` }]}>
                <Ionicons name="star" size={24} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.activePlanTitle, { color: colors.textPrimary }]}>
                  {plans.find(p => p.id === clientData.plan_id)?.name || 'Active Subscription'}
                </Text>
                <Text style={[styles.activePlanSub, { color: colors.textSecondary }]}>
                  You have full access to your personalized training.
                </Text>
              </View>
            </View>
          </Card>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {plans.length === 0 ? (
              <Card>
                <Text style={[styles.noPlansText, { color: colors.textTertiary }]}>No subscription plans available yet.</Text>
              </Card>
            ) : (
              plans.map((plan) => (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
                  activeOpacity={0.85}
                  onPress={async () => {
                    try {
                      await requestPlanUpgrade(plan.id);
                      showAlert({ type: 'success', title: 'Upgraded! 🎉', message: `You are now on the "${plan.name}" plan.` });
                    } catch (err: any) {
                      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to upgrade' });
                    }
                  }}
                >
                  <LinearGradient colors={['#FF6B35', '#FF8F65']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planIcon}>
                    <Ionicons name="diamond" size={24} color="#FFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planName, { color: colors.textPrimary }]}>{plan.name}</Text>
                    <Text style={[styles.planPrice, { color: colors.textTertiary }]}>
                      ${plan.price}/{(plan as any).interval === 'monthly' ? 'mo' : (plan as any).interval || 'mo'}
                    </Text>
                  </View>
                  <View style={styles.selectBtn}>
                    <Text style={styles.selectText}>Upgrade</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* Trainer Card */}
        {trainer && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Your Trainer</Text>
            <Card>
              <View style={styles.trainerRow}>
                <Avatar name={trainer.name} size="md" imageUrl={trainer.avatar_url} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.trainerName, { color: colors.textPrimary }]}>{trainer.name}</Text>
                  {trainer.specialization && <Text style={[styles.trainerSpec, { color: colors.accentText }]}>{trainer.specialization}</Text>}
                </View>
              </View>
            </Card>
          </>
        )}

        {/* Theme Toggle */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Appearance</Text>
        <Card>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeOption,
                  { backgroundColor: mode === opt.value ? `${colors.accent}15` : colors.bgElevated, borderColor: mode === opt.value ? colors.accent : colors.border },
                ]}
                onPress={() => setMode(opt.value)}
                activeOpacity={0.7}
              >
                <Ionicons name={opt.icon as any} size={18} color={mode === opt.value ? colors.accent : colors.textTertiary} />
                <Text style={[styles.themeLabel, { color: mode === opt.value ? colors.accent : colors.textSecondary }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        <View style={styles.signOutSection}>
          <Button title="Sign Out" onPress={handleSignOut} variant="danger" full icon={<Ionicons name="log-out-outline" size={18} color={Colors.red} />} />
        </View>

        <Text style={[styles.version, { color: colors.textTertiary }]}>FitLink v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], letterSpacing: -0.5, paddingTop: Spacing.md, marginBottom: Spacing.lg },

  profileCard: { overflow: 'hidden', marginBottom: Spacing.lg },
  accentStrip: { position: 'absolute', top: 0, left: 0, right: 0, height: 60 },
  profileInfo: { alignItems: 'center', paddingTop: Spacing['2xl'], gap: Spacing.xs },
  profileName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, marginTop: Spacing.sm },
  trainerLine: { fontFamily: FontFamily.body, fontSize: FontSize.sm },

  statsRow: { flexDirection: 'row', marginTop: Spacing.xl, paddingTop: Spacing.lg, borderTopWidth: 1 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl },
  statLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },
  statDivider: { width: 1, marginVertical: 4 },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  infoLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs },
  infoValue: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, marginTop: 1 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, marginTop: Spacing.xl, marginBottom: Spacing.md },
  trainerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  trainerName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md },
  trainerSpec: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: 1 },

  themeRow: { flexDirection: 'row', gap: Spacing.sm },
  themeOption: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5 },
  themeLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  signOutSection: { marginTop: Spacing['2xl'] },
  version: { fontFamily: FontFamily.body, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.xl, opacity: 0.5 },

  // Membership Styles
  activePlanIcon: { width: 48, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  activePlanTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md },
  activePlanSub: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: 2 },
  noPlansText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, textAlign: 'center', paddingVertical: Spacing.md },
  
  planCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base, borderRadius: Radius.xl, borderWidth: 1 },
  planIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  planName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md },
  planPrice: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: 2 },
  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: Colors.accent },
  selectText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: '#FFF' },
});
