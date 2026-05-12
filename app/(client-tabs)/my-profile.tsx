import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useMemo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import { useTheme, type ThemeMode } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
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
  const { clientData, trainer, sessions, workouts, plans, requestPlanUpgrade, updateClientAvatar } = useClient();
  const { colors, isDark, mode, setMode } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { showAlert } = useAlert();
  const [uploading, setUploading] = useState(false);

  if (!clientData) return null;

  const completedSessions = sessions.filter((s: any) => s.status === 'completed').length;
  const completedWorkouts = workouts.filter((w: any) => w.status === 'completed').length;
  const streak = clientData.progress?.streak || 0;
  const xp = completedWorkouts * 50;
  const level = Math.floor(xp / 250) + 1;
  const xpInLevel = xp % 250;
  const memberSince = new Date(clientData.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Profile Photo', 'Choose a source', [
      { text: 'Camera', onPress: () => pickImage('camera') },
      { text: 'Photo Library', onPress: () => pickImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need access to your photos to update your profile.');
      return;
    }
    const pickerOptions: ImagePicker.ImagePickerOptions = {
      mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true,
    };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Error', 'Could not read image data.'); return; }
    setUploading(true);
    try {
      await updateClientAvatar(asset.base64, asset.uri);
    } catch (err: any) {
      console.error('Upload Failed', err);
      Alert.alert('Upload Failed', err.message || 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── HERO HEADER ── */}
        <LinearGradient colors={isDark ? ['#1A1A24', '#111114'] : ['#1C1C21', '#2A2A32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <TouchableOpacity onPress={handlePickImage} activeOpacity={0.85} style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <Avatar name={clientData.name} size="xl" imageUrl={clientData.avatar_url} />
            </View>
            <View style={styles.cameraBtn}>
              {uploading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="camera" size={14} color="#FFF" />}
            </View>
          </TouchableOpacity>

          <Text style={styles.heroName}>{clientData.name}</Text>
          {trainer && <Text style={styles.heroTrainer}>Training with {trainer.name}</Text>}
          <Text style={styles.heroMember}>Member since {memberSince}</Text>

          {/* Level + XP bar */}
          <View style={styles.levelRow}>
            <View style={styles.levelBadge}>
              <Ionicons name="flash" size={12} color={colors.accent} />
              <Text style={styles.levelText}>Level {level}</Text>
            </View>
            <View style={styles.xpBarTrack}>
              <View style={[styles.xpBarFill, { width: `${(xpInLevel / 250) * 100}%` }]} />
            </View>
            <Text style={styles.xpLabel}>{xpInLevel}/250 XP</Text>
          </View>

          {/* Stats row */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatVal}>{completedWorkouts}</Text>
              <Text style={styles.heroStatLabel}>Workouts</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatVal}>{completedSessions}</Text>
              <Text style={styles.heroStatLabel}>Sessions</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatVal}>{streak > 0 ? `${streak}🔥` : '0'}</Text>
              <Text style={styles.heroStatLabel}>Streak</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── INFO ── */}
        <Text style={styles.sectionTitle}>Personal Info</Text>
        <Card>
          {[
            { icon: 'mail-outline', label: 'Email', value: clientData.email },
            { icon: 'call-outline', label: 'Phone', value: clientData.phone },
            { icon: 'flag-outline', label: 'Goals', value: clientData.goals },
            { icon: 'ribbon-outline', label: 'Status', value: clientData.status, capitalize: true },
          ].filter((item) => item.value).map((item, i) => (
            <View key={i} style={[styles.infoRow, i > 0 && styles.infoRowBorder]}>
              <View style={[styles.infoIcon, { backgroundColor: `${colors.accent}12` }]}>
                <Ionicons name={item.icon as any} size={16} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text style={[styles.infoValue, item.capitalize && { textTransform: 'capitalize' }]}>{item.value}</Text>
              </View>
            </View>
          ))}
        </Card>

        {/* ── MEMBERSHIP ── */}
        <Text style={styles.sectionTitle}>Membership</Text>
        {clientData.status === 'active' ? (
          <Card>
            <View style={styles.activePlan}>
              <LinearGradient colors={[colors.accent, '#FF9F6B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.activePlanIcon}>
                <Ionicons name="star" size={22} color="#FFF" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.activePlanName}>{plans.find(p => p.id === clientData.plan_id)?.name || 'Active Plan'}</Text>
                <Text style={styles.activePlanSub}>Full access to personalized training</Text>
              </View>
              <View style={[styles.activeBadge, { backgroundColor: `${colors.green}15` }]}>
                <Text style={[styles.activeBadgeText, { color: colors.green }]}>Active</Text>
              </View>
            </View>
          </Card>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {plans.length === 0 ? (
              <Card><Text style={styles.noPlans}>No subscription plans available yet.</Text></Card>
            ) : (
              plans.map((plan) => (
                <TouchableOpacity key={plan.id} activeOpacity={0.85} onPress={async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  try {
                    await requestPlanUpgrade(plan.id);
                    showAlert({ type: 'success', title: 'Upgraded! 🎉', message: `You are now on the "${plan.name}" plan.` });
                  } catch (err: any) {
                    showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to upgrade' });
                  }
                }}>
                  <Card style={styles.planCard}>
                    <LinearGradient colors={['#FF6B35', '#FF8F65']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planIcon}>
                      <Ionicons name="diamond" size={22} color="#FFF" />
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      <Text style={styles.planPrice}>${plan.price}/{(plan as any).interval === 'monthly' ? 'mo' : (plan as any).interval || 'mo'}</Text>
                    </View>
                    <View style={styles.upgradeBtn}>
                      <Text style={styles.upgradeBtnText}>Upgrade</Text>
                      <Ionicons name="arrow-forward" size={14} color="#FFF" />
                    </View>
                  </Card>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {/* ── TRAINER ── */}
        {trainer && (
          <>
            <Text style={styles.sectionTitle}>Your Coach</Text>
            <Card>
              <View style={styles.trainerRow}>
                <Avatar name={trainer.name} size="lg" imageUrl={trainer.avatar_url} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.trainerName}>{trainer.name}</Text>
                  {trainer.specialization && <Text style={styles.trainerSpec}>{trainer.specialization}</Text>}
                  {trainer.email && <Text style={styles.trainerContact}>{trainer.email}</Text>}
                </View>
              </View>
            </Card>
          </>
        )}

        {/* ── APPEARANCE ── */}
        <Text style={styles.sectionTitle}>Appearance</Text>
        <Card>
          <View style={styles.themeRow}>
            {THEME_OPTIONS.map((opt) => {
              const active = mode === opt.value;
              return (
                <TouchableOpacity key={opt.value} style={[styles.themeOpt, active && styles.themeOptActive]} onPress={() => { Haptics.selectionAsync(); setMode(opt.value); }} activeOpacity={0.7}>
                  <View style={[styles.themeIconCircle, { backgroundColor: active ? `${colors.accent}18` : colors.bgElevated }]}>
                    <Ionicons name={opt.icon as any} size={20} color={active ? colors.accent : colors.textTertiary} />
                  </View>
                  <Text style={[styles.themeLabel, active && { color: colors.accent }]}>{opt.label}</Text>
                  {active && <View style={[styles.themeCheck, { backgroundColor: colors.accent }]}><Ionicons name="checkmark" size={10} color="#FFF" /></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* ── SIGN OUT ── */}
        <View style={styles.signOut}>
          <Button title="Sign Out" onPress={handleSignOut} variant="danger" full icon={<Ionicons name="log-out-outline" size={18} color={Colors.red} />} />
        </View>
        <Text style={styles.version}>FitLink v1.0.0</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 120 },

  // Hero
  heroCard: { borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', marginTop: Spacing.md },
  avatarWrap: { position: 'relative' },
  avatarRing: { borderWidth: 3, borderColor: colors.accent, borderRadius: 999, padding: 3 },
  cameraBtn: { position: 'absolute', bottom: 2, right: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: isDark ? '#1A1A24' : '#1C1C21' },
  heroName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: '#FFF', marginTop: Spacing.md },
  heroTrainer: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  heroMember: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.35)', marginTop: 2 },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.lg, width: '100%' },
  levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${colors.accent}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  levelText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.accent },
  xpBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  xpBarFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  xpLabel: { fontFamily: FontFamily.body, fontSize: 9, color: 'rgba(255,255,255,0.4)' },
  heroStats: { flexDirection: 'row', marginTop: Spacing.xl, width: '100%' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: '#FFF' },
  heroStatLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 4 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary, marginTop: Spacing.xl, marginBottom: Spacing.md },

  // Info
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  infoIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  infoValue: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: colors.textPrimary, marginTop: 1 },

  // Active plan
  activePlan: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  activePlanIcon: { width: 48, height: 48, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  activePlanName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  activePlanSub: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary, marginTop: 2 },
  activeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  activeBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10 },
  noPlans: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary, textAlign: 'center', paddingVertical: Spacing.md },

  // Plan cards
  planCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  planIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  planName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  planPrice: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary, marginTop: 2 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: colors.accent },
  upgradeBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: '#FFF' },

  // Trainer
  trainerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  trainerName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  trainerSpec: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.accentText, marginTop: 2 },
  trainerContact: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 2 },

  // Theme
  themeRow: { flexDirection: 'row', gap: Spacing.sm },
  themeOpt: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5, borderColor: colors.border },
  themeOptActive: { borderColor: colors.accent, backgroundColor: `${colors.accent}08` },
  themeIconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  themeLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textSecondary },
  themeCheck: { position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  signOut: { marginTop: Spacing['2xl'] },
  version: { fontFamily: FontFamily.body, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.xl, color: colors.textTertiary, opacity: 0.5 },
});
