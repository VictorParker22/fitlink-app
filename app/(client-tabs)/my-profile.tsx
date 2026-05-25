import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, ActivityIndicator, Switch, Modal, TextInput } from 'react-native';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import { supabase } from '../../lib/supabase';
import { useTheme, type ThemeMode } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { calculateXp, calculateLevel, calculateProgressToNextLevel } from '../../utils/xp';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'sunny' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'Auto', icon: 'phone-portrait' },
];

export default function ClientProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { clientData, trainer, sessions, workouts, plans, updateClientAvatar, healthSharingEnabled, toggleHealthSharing } = useClient();
  const { colors, isDark, mode, setMode } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { showAlert } = useAlert();
  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

  if (!clientData) return (
    <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]} edges={['top']}>
      <ActivityIndicator size="large" color={colors.accent} />
    </SafeAreaView>
  );

  const completedSessions = sessions.filter((s: any) => s.status === 'completed').length;
  const completedWorkouts = workouts.filter((w: any) => w.status === 'completed').length;
  const streak = clientData.progress?.streak || 0;
  const xp = calculateXp(completedWorkouts);
  const level = calculateLevel(xp);
  const xpInLevel = xp % 250;
  const memberSince = new Date(clientData.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data (workouts, diet plans, messages). This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            setDeleteInput('');
            setShowDeleteModal(true);
          },
        },
      ]
    );
  };

  const handleConfirmDelete = async () => {
    if (deleteInput !== 'DELETE') {
      Alert.alert('Cancelled', 'Account deletion cancelled.');
      setShowDeleteModal(false);
      return;
    }
    try {
      await supabase.rpc('delete_client_account');
      setShowDeleteModal(false);
      await signOut();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete account. Contact support.');
      setShowDeleteModal(false);
    }
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
              <View style={[styles.xpBarFill, { width: `${calculateProgressToNextLevel(xp) * 100}%` }]} />
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
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/my-subscription' as any)}>
          <Card style={[styles.planCard, { paddingVertical: Spacing.md }]}>
            <LinearGradient colors={[colors.accent, '#FF9F6B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planIcon}>
              <Ionicons name="card" size={22} color="#FFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>My Subscription</Text>
              <Text style={styles.planPrice}>Manage your plan and billing</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
          </Card>
        </TouchableOpacity>

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
                <TouchableOpacity key={opt.value} style={[styles.themeOpt, active && styles.themeOptActive]} onPress={() => { Haptics.selectionAsync(); setMode(opt.value); }} activeOpacity={0.7} accessibilityLabel={`${opt.label} theme`} accessibilityRole="button">
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

        {/* ── HEALTH DATA SHARING ── */}
        <Card style={{ marginBottom: Spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: Spacing.md }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${Colors.accent}15`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="heart" size={20} color={Colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: colors.textPrimary }}>
                  Share Health Data
                </Text>
                <Text style={{ fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 2 }}>
                  Let your coach view your daily health metrics
                </Text>
              </View>
            </View>
            <Switch
              accessibilityLabel="Enable health data sharing"
              accessibilityRole="switch"
              value={healthSharingEnabled}
              onValueChange={async (val) => {
                try {
                  await toggleHealthSharing(val);
                  showAlert({ type: 'success', title: val ? 'Sharing Enabled' : 'Sharing Disabled', message: val ? 'Your coach can now see your health data.' : 'Your coach can no longer see your health data.' });
                } catch (e) {
                  showAlert({ type: 'error', title: 'Error', message: 'Failed to update sharing preference.' });
                }
              }}
              trackColor={{ false: colors.bgElevated, true: `${Colors.accent}50` }}
              thumbColor={healthSharingEnabled ? Colors.accent : colors.textTertiary}
            />
          </View>
        </Card>

        {/* ── SIGN OUT ── */}
        <View style={styles.signOut}>
          <Button title="Sign Out" onPress={handleSignOut} variant="danger" full icon={<Ionicons name="log-out-outline" size={18} color={Colors.red} />} />
        </View>

        {/* ── DELETE ACCOUNT ── */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.deleteText}>Delete Account</Text>
        </TouchableOpacity>

        <Text style={styles.version}>FitLink v{Constants.expoConfig?.version || '1.0.0'}</Text>

      </ScrollView>

      {/* ── DELETE ACCOUNT CONFIRMATION MODAL ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Deletion</Text>
            <Text style={styles.modalMessage}>Type <Text style={{ fontFamily: FontFamily.headingSemiBold }}>DELETE</Text> to confirm.</Text>
            <TextInput
              style={styles.modalInput}
              value={deleteInput}
              onChangeText={setDeleteInput}
              placeholder="Type DELETE"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowDeleteModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm, deleteInput !== 'DELETE' && { opacity: 0.4 }]}
                onPress={handleConfirmDelete}
                activeOpacity={0.7}
                disabled={deleteInput !== 'DELETE'}
              >
                <Text style={styles.modalBtnConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  themeLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, color: colors.textSecondary, marginTop: Spacing.sm },
  themeCheck: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bgElevated },

  signOut: { marginTop: Spacing['2xl'] },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.xl, paddingVertical: Spacing.md },
  deleteText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, textDecorationLine: 'underline' },
  version: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.lg, opacity: 0.5 },

  // Delete Account Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  modalContent: { width: '100%', backgroundColor: isDark ? '#1A1A24' : '#2A2A32', borderRadius: Radius.xl, padding: Spacing.xl },
  modalTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, color: '#FFF', marginBottom: Spacing.sm },
  modalMessage: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: 'rgba(255,255,255,0.6)', marginBottom: Spacing.lg },
  modalInput: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: '#FFF', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 14 },
  modalButtons: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xl },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  modalBtnCancel: { backgroundColor: 'rgba(255,255,255,0.08)' },
  modalBtnCancelText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: 'rgba(255,255,255,0.6)' },
  modalBtnConfirm: { backgroundColor: Colors.red },
  modalBtnConfirmText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#FFF' },
});
