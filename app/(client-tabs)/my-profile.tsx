/**
 * Athlete profile — what you've done, and what your coach can see (design 25d).
 *
 * Fixed dark/lime via CoachColors (no useTheme — rebuilt athlete screens do not
 * participate in the light/dark toggle, so the old theme picker is gone).
 *
 * Real numbers only: sessions from clients.completed_workouts, PRs from the
 * exercisePrs map, weeks from created_at. The "what your coach can see" block
 * states truthfully what coach-side screens surface; the only live switch is
 * Apple Health sharing (clients.health_sharing_enabled), which really gates it.
 *
 * "Leave" has no clean single mechanism in the schema (the client row IS the
 * coach relationship), so leaving routes to a conversation with the coach;
 * deleting the account (existing delete_client_account RPC) remains the hard
 * exit and is preserved unchanged.
 */

import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute, SharedRoute } from '../../types/routes';

export default function ClientProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const {
    clientData, trainer, exercisePrs, progressLogs,
    updateClientAvatar, healthSharingEnabled, toggleHealthSharing,
  } = useClient();

  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [healthBusy, setHealthBusy] = useState(false);

  const name = clientData?.name || 'You';
  const coachFirst = (trainer?.name || 'your coach').split(' ')[0];

  const sinceLabel = useMemo(() => {
    if (!clientData?.created_at) return null;
    const d = new Date(clientData.created_at);
    if (Number.isNaN(d.getTime())) return null;
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    const now = new Date();
    return d.getFullYear() === now.getFullYear() ? month : `${month} ${d.getFullYear()}`;
  }, [clientData?.created_at]);

  const weeksIn = useMemo(() => {
    if (!clientData?.created_at) return null;
    const start = new Date(clientData.created_at).getTime();
    if (Number.isNaN(start)) return null;
    return Math.max(1, Math.floor((Date.now() - start) / (7 * 24 * 60 * 60 * 1000)) + 1);
  }, [clientData?.created_at]);

  const sessionsDone = clientData?.completed_workouts || 0;
  const prCount = Object.keys(exercisePrs || {}).length;

  const latestWeight = useMemo(() => {
    if (!Array.isArray(progressLogs)) return null;
    for (const log of progressLogs) {
      const w = log?.weight;
      if (typeof w === 'number' && w > 0) return w;
    }
    return null;
  }, [progressLogs]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Profile photo', 'Where from?', [
      { text: 'Camera', onPress: () => pickImage('camera') },
      { text: 'Photo library', onPress: () => pickImage('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickImage = async (source: 'camera' | 'library') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to change your picture.');
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
    if (!asset.base64) { Alert.alert('Something went wrong', 'Could not read that image.'); return; }
    setUploading(true);
    try {
      await updateClientAvatar(asset.base64, asset.uri);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message || 'Could not upload that photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleHealthToggle = async (next: boolean) => {
    if (healthBusy) return;
    setHealthBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await toggleHealthSharing(next);
    } catch {
      Alert.alert('Something went wrong', 'Could not update health sharing. Try again.');
    } finally {
      setHealthBusy(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Sign out of your account on this phone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleLeaveCoach = () => {
    Alert.alert(
      `Leave ${coachFirst}'s roster`,
      `Leaving happens through ${coachFirst} — a message tells ${coachFirst} directly and gets it sorted, including any billing. If you want everything gone instead, delete your account below.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: `Message ${coachFirst}`, onPress: () => router.push(ClientRoute.myMessages) },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently removes your account, training history, check-ins and progress. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => { setDeleteInput(''); setShowDeleteModal(true); },
        },
      ]
    );
  };

  const handleConfirmDelete = async () => {
    if (deleteInput !== 'DELETE') { setShowDeleteModal(false); return; }
    try {
      await supabase.rpc('delete_client_account');
      setShowDeleteModal(false);
      await signOut();
    } catch (err: any) {
      Alert.alert('Something went wrong', err.message || 'Could not delete the account. Contact support.');
      setShowDeleteModal(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header: who you are */}
        <View style={s.headerRow}>
          <TouchableOpacity onPress={handlePickImage} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Change profile photo">
            {uploading ? (
              <View style={s.avatarLoading}><ActivityIndicator size="small" color={CoachColors.accent} /></View>
            ) : (
              <Avatar name={name} imageUrl={clientData?.avatar_url} size="lg" />
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{name}</Text>
            <Text style={s.nameSub}>
              {trainer?.name ? `Training with ${coachFirst}` : 'Training'}
              {sinceLabel ? ` since ${sinceLabel}` : ''}
              {latestWeight ? ` · ${latestWeight} lbs` : ''}
            </Text>
          </View>
          <TouchableOpacity style={s.editBtn} onPress={handlePickImage} activeOpacity={0.8} accessibilityRole="button">
            <Text style={s.editBtnText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* What you've done — real totals */}
        <View style={s.statRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{sessionsDone}</Text>
            <Text style={s.statLabel}>sessions</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{prCount}</Text>
            <Text style={s.statLabel}>PRs</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{weeksIn ?? '—'}</Text>
            <Text style={s.statLabel}>{weeksIn === 1 ? 'week in' : 'weeks in'}</Text>
          </View>
        </View>

        {/* What the coach can see */}
        <Text style={s.sectionLabel}>What {coachFirst} can see</Text>
        <View style={s.visCard}>
          <VisRow label="Every set, weight and rating you log" />
          <View style={s.visDivider} />
          <VisRow label="Your weekly check-ins and body weight" />
          <View style={s.visDivider} />
          <VisRow label="Your progress photos and measurements" />
          <View style={s.visDivider} />
          <VisRow label="Messages you send in the chat" />
          <View style={s.visDivider} />
          <View style={s.visRow}>
            <Text style={s.visLabel}>Your Apple Health data</Text>
            <Switch
              value={healthSharingEnabled}
              onValueChange={handleHealthToggle}
              disabled={healthBusy}
              trackColor={{ false: '#33382F', true: CoachColors.accent }}
              thumbColor={healthSharingEnabled ? CoachColors.bg : CoachColors.textMuted}
              ios_backgroundColor="#33382F"
            />
          </View>
          <Text style={s.visFootnote}>
            Everything above is how {coachFirst} coaches you — it comes with the coaching. Health data is the one thing you can switch off; turning it off just means {coachFirst} stops seeing it.
          </Text>
        </View>

        {/* Account rows */}
        <View style={s.menuList}>
          <MenuRow label="My sessions and bookings" onPress={() => router.push(ClientRoute.mySessions)} />
          <MenuRow label="My diet plan" onPress={() => router.push(ClientRoute.myDiet)} />
          <MenuRow label="Membership and billing" onPress={() => router.push(ClientRoute.mySubscription)} />
          <MenuRow label="Notifications" onPress={() => router.push(SharedRoute.notifications)} />
          <MenuRow label="Help and support" onPress={() => router.push(SharedRoute.helpCenter)} />
          <MenuRow label="Terms and privacy" onPress={() => router.push(SharedRoute.termsPrivacy)} />
        </View>

        {/* Sign out · leave */}
        <View style={s.exitRow}>
          <TouchableOpacity onPress={handleSignOut} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
          <View style={s.exitDivider} />
          <TouchableOpacity onPress={handleLeaveCoach} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.leaveText}>Leave {coachFirst}'s roster</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleDeleteAccount} style={s.deleteRow} accessibilityRole="button">
          <Text style={s.deleteText}>Delete my account</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Delete confirmation */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Delete account</Text>
            <Text style={s.modalMessage}>
              Type <Text style={s.modalStrong}>DELETE</Text> to permanently erase your account and everything you've logged.
            </Text>
            <TextInput
              style={s.modalInput}
              value={deleteInput}
              onChangeText={setDeleteInput}
              placeholder="Type DELETE"
              placeholderTextColor={CoachColors.textFaint}
              autoCapitalize="characters"
              autoFocus
            />
            <View style={s.modalButtons}>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnCancel]}
                onPress={() => setShowDeleteModal(false)}
                activeOpacity={0.8}
              >
                <Text style={s.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnConfirm, deleteInput !== 'DELETE' && { opacity: 0.35 }]}
                onPress={handleConfirmDelete}
                disabled={deleteInput !== 'DELETE'}
                activeOpacity={0.8}
              >
                <Text style={s.modalBtnConfirmText}>Delete forever</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function VisRow({ label }: { label: string }) {
  return (
    <View style={s.visRow}>
      <Text style={s.visLabel}>{label}</Text>
      <Text style={s.visAlways}>Always</Text>
    </View>
  );
}

function MenuRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={s.menuRow}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      <Text style={s.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={CoachColors.textFaint} />
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  scroll: { paddingTop: 16, paddingBottom: 130, paddingHorizontal: 20 },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarLoading: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: CoachColors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontFamily: CoachFonts.headingBold, fontSize: 21, color: CoachColors.textPrimary },
  nameSub: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 3 },
  editBtn: {
    borderWidth: 1, borderColor: '#2E322B', borderRadius: 999,
    paddingHorizontal: 13, paddingVertical: 8,
  },
  editBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: '#C9CEC2' },

  statRow: { flexDirection: 'row', gap: 9, marginTop: 20 },
  statCard: {
    flex: 1,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    padding: 14,
  },
  statNum: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary },
  statLabel: { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textMuted, marginTop: 3 },

  sectionLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: CoachColors.textFaint,
    marginTop: 26,
  },
  visCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
  },
  visRow: { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 30 },
  visLabel: { flex: 1, fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textPrimary, lineHeight: 19 },
  visAlways: { fontFamily: CoachFonts.bodyBold, fontSize: 11.5, color: CoachColors.textMuted },
  visDivider: { height: 1, backgroundColor: '#21241F', marginVertical: 10 },
  visFootnote: {
    fontFamily: CoachFonts.body,
    fontSize: 11.5,
    lineHeight: 17,
    color: CoachColors.textFaint,
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#21241F',
  },

  menuList: { gap: 9, marginTop: 15 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  menuLabel: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textPrimary },

  exitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 24,
  },
  exitDivider: { width: 1, height: 12, backgroundColor: '#2E322B' },
  signOutText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
  leaveText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.danger },

  deleteRow: { alignItems: 'center', marginTop: 22 },
  deleteText: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textFaint },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,11,9,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 18,
    padding: 22,
  },
  modalTitle: { fontFamily: CoachFonts.headingBold, fontSize: 18, color: CoachColors.textPrimary },
  modalMessage: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: CoachColors.textMuted,
    marginTop: 8,
    marginBottom: 18,
  },
  modalStrong: { fontFamily: CoachFonts.bodyBold, color: CoachColors.textPrimary },
  modalInput: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 13,
    letterSpacing: 2,
    marginBottom: 18,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: { borderWidth: 1, borderColor: '#2E322B' },
  modalBtnCancelText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: '#C9CEC2' },
  modalBtnConfirm: { backgroundColor: CoachColors.danger },
  modalBtnConfirmText: { fontFamily: CoachFonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
});
