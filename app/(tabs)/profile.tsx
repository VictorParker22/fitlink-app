import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Share, Image, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

// ─── Menu sections ────────────────────────────────────────────────────────────
const ACCOUNT_ITEMS = [
  { icon: 'settings-outline',   label: 'Settings',        route: '/settings'        },
  { icon: 'ribbon-outline',     label: 'Certifications',  route: '/certifications'  },
  { icon: 'flash-outline',      label: 'Specializations', route: '/specializations' },
];
const BUSINESS_ITEMS = [
  { icon: 'pricetag-outline',     label: 'Pass revenue',       route: '/subscriptions' },
  { icon: 'wallet-outline',       label: 'Earnings & payouts', route: '/earnings'      },
  { icon: 'share-social-outline', label: 'Referral program',   route: '/referrals'     },
  { icon: 'bar-chart-outline',    label: 'Analytics',          route: '/analytics'     },
];
const SUPPORT_ITEMS = [
  { icon: 'help-circle-outline',         label: 'Help center',     route: '/help-center'     },
  { icon: 'chatbubble-ellipses-outline', label: 'Contact support', route: '/contact-support' },
  { icon: 'document-text-outline',       label: 'Terms & privacy', route: '/terms-privacy'   },
];

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { trainer, activeClients, sessions, totalReferrals, updateTrainer } = useApp();
  const { isCoachElite } = useRevenueCat();
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const name = trainer?.name || user?.user_metadata?.name || 'Trainer';
  const email = user?.email || trainer?.email;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;

  // ── Image picker ──────────────────────────────────────────────────────────
  const handlePickImage = (kind: 'avatar' | 'cover' = 'avatar') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      kind === 'avatar' ? 'Profile photo' : 'Cover photo',
      kind === 'avatar'
        ? 'Choose how to update your photo'
        : 'This is the photo athletes see first — you coaching, your space.',
      [
        { text: 'Take photo', onPress: () => launchPicker('camera', kind) },
        { text: 'Choose from library', onPress: () => launchPicker('library', kind) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const launchPicker = async (source: 'camera' | 'library', kind: 'avatar' | 'cover' = 'avatar') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', source === 'camera' ? 'Camera access is needed.' : 'Photo library access is needed.');
      return;
    }
    // Avatars stay square; the cover crops 16:10 — the card shape it will
    // actually be shown in, so what the coach approves is what athletes get.
    const aspect: [number, number] = kind === 'avatar' ? [1, 1] : [16, 10];
    const result = await (source === 'camera'
      ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.7, base64: true })
      : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.7, base64: true }));
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Error', 'Could not read image data.'); return; }
    await uploadImage(asset.base64, asset.uri, kind);
  };

  const uploadImage = async (base64: string, uri: string, kind: 'avatar' | 'cover') => {
    if (!user) return;
    const setBusy = kind === 'avatar' ? setUploading : setUploadingCover;
    setBusy(true);
    try {
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      // coach-media requires the path to start with the uploader's uid — the
      // bucket policy rejects anything else, so no athlete can overwrite this.
      const bucket = kind === 'avatar' ? 'avatars' : 'coach-media';
      const fileName = `${user.id}/${kind}.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, bytes.buffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      await updateTrainer({ [kind === 'avatar' ? 'avatar_url' : 'cover_url']: `${urlData.publicUrl}?t=${Date.now()}` });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message || 'Could not upload photo.');
    } finally {
      setBusy(false);
    }
  };

  // ── Share profile — same referral link the Referrals screen uses ─────────
  const handleShareProfile = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const code = trainer?.referral_code;
    const link = code ? `https://getfitlink.com/signup?ref=${code}` : 'https://getfitlink.com';
    try {
      await Share.share({
        message: `Train with ${name} on FitLink. ${link}`,
      });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  // ── Auth actions ──────────────────────────────────────────────────────────
  const handleSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          // Alert.prompt is iOS only — it renders nothing on Android, which
          // dead-ended account deletion there (also a Play policy violation).
          // A Modal is the cross-platform confirmation, matching my-profile.
          onPress: () => { setDeleteInput(''); setShowDeleteModal(true); },
        },
      ]
    );
  };

  const handleConfirmDelete = async () => {
    if (deleteInput !== 'DELETE' || deleting) return;
    setDeleting(true);
    // .rpc() RESOLVES with { error } — it does not throw, so a FAILED deletion
    // must not sign the coach out and leave them certain their data was gone.
    // Remove the user's FILES before their rows. Row deletion is what makes
    // the account gone; media cleanup is what makes it actually erased, and
    // it has to happen while we still know who they are. Best effort: a
    // storage failure must not trap someone in an account they asked to
    // delete, but it is reported rather than hidden.
    const { data: mediaResult } = await supabase.functions.invoke('delete-account-media');
    const mediaIncomplete = mediaResult && mediaResult.success === false;

    const { error } = await supabase.rpc('delete_trainer_account');
    setDeleting(false);
    if (error) {
      setShowDeleteModal(false);
      Alert.alert('Account not deleted', `${error.message || 'Failed to delete account.'}\n\nYour account and data are still here. Please try again or contact support.`);
      return;
    }
    setShowDeleteModal(false);
    if (mediaIncomplete) {
      // The account and its rows ARE gone. Saying "fully deleted" when some
      // files survived would be exactly the false-success this codebase keeps
      // deleting elsewhere.
      Alert.alert(
        'Account deleted',
        'Your account and data have been removed. Some uploaded files could not be deleted automatically — contact support and they will be removed for you.'
      );
    }
    await signOut();
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.nav}>
          <Text style={s.navTitle}>Profile</Text>
          <TouchableOpacity
            onPress={() => router.push('/settings' as any)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Ionicons name="settings-outline" size={25} color={CoachColors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>

          {/* ── Hero ─────────────────────────────────────────────────────── */}
          {/* The cover: the photo athletes meet first on marketplace cards and
              pass covers (COACH_IDENTITY_PLAN.md). Shown here exactly as they
              will see it. Without one, an honest dashed "add" well — visible
              only to the coach; athlete surfaces render nothing instead. */}
          <TouchableOpacity
            onPress={() => handlePickImage('cover')}
            activeOpacity={0.85}
            style={s.coverWrap}
            accessible
            accessibilityRole="button"
            accessibilityLabel={trainer?.cover_url ? 'Change cover photo' : 'Add a cover photo'}
            accessibilityHint="Athletes see this photo on your profile and passes"
            accessibilityState={{ busy: uploadingCover }}
          >
            {trainer?.cover_url ? (
              <>
                <Image source={{ uri: trainer.cover_url }} style={s.coverImage} />
                <View style={s.coverEditBadge}>
                  {uploadingCover
                    ? <ActivityIndicator size="small" color={CoachColors.onAccent} />
                    : <Ionicons name="camera" size={14} color={CoachColors.onAccent} />}
                </View>
              </>
            ) : (
              <View style={s.coverEmpty}>
                {uploadingCover ? (
                  <ActivityIndicator size="small" color={CoachColors.textMuted} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={19} color={CoachColors.textMuted} />
                    <Text style={s.coverEmptyText}>Add a cover photo — athletes see it first</Text>
                  </>
                )}
              </View>
            )}
          </TouchableOpacity>

          <View style={s.hero}>
            <TouchableOpacity
              onPress={() => handlePickImage('avatar')}
              activeOpacity={0.8}
              style={s.avatarWrap}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              accessibilityState={{ busy: uploading }}
            >
              {trainer?.avatar_url ? (
                <Image source={{ uri: trainer.avatar_url }} style={s.avatarImage} />
              ) : (
                <View style={s.avatarCircle}>
                  <Text style={s.avatarInitials}>{initials(name)}</Text>
                </View>
              )}
              <View style={s.cameraBadge}>
                {uploading
                  ? <ActivityIndicator size="small" color={CoachColors.onAccent} />
                  : <Ionicons name="camera" size={15} color={CoachColors.onAccent} />}
              </View>
            </TouchableOpacity>

            <Text style={s.heroName}>{name}</Text>

            {isCoachElite ? (
              <View style={s.elitePill}>
                <Ionicons name="checkmark-circle" size={15} color={CoachColors.onAccent} />
                <Text style={s.elitePillText}>Coach Elite</Text>
              </View>
            ) : (
              <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }}
                style={s.eliteOutlinePill}
                activeOpacity={0.8}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/studio' as any); }}
              >
                <Ionicons name="add" size={15} color={CoachColors.accent} />
                <Text style={s.eliteOutlinePillText}>Go Coach Elite</Text>
              </TouchableOpacity>
            )}

            {email && (
              <View style={s.heroEmailRow}>
                <Ionicons name="mail-outline" size={15} color={CoachColors.textFaint} />
                <Text style={s.heroEmail}>{email}</Text>
              </View>
            )}

            <View style={s.statRow}>
              <View style={s.statBlock} accessible accessibilityLabel={`${activeClients.length} athletes`}>
                <Text style={s.statNum}>{activeClients.length}</Text>
                <Text style={s.statLabel}>Athletes</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBlock} accessible accessibilityLabel={`${completedSessions} completed sessions`}>
                <Text style={s.statNum}>{completedSessions}</Text>
                <Text style={s.statLabel}>Sessions</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBlock} accessible accessibilityLabel={`${totalReferrals} referrals`}>
                <Text style={s.statNum}>{totalReferrals}</Text>
                <Text style={s.statLabel}>Referrals</Text>
              </View>
            </View>

            <View style={s.heroActions}>
              <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
                style={s.actionPrimary}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/settings' as any); }}
                activeOpacity={0.85}
              >
                <Ionicons name="create-outline" size={18} color={CoachColors.onAccent} />
                <Text style={s.actionPrimaryText}>Edit profile</Text>
              </TouchableOpacity>
              <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
                style={s.actionSecondary}
                accessibilityRole="button"
                accessibilityLabel="Share profile"
                onPress={handleShareProfile}
                activeOpacity={0.85}
              >
                <Text style={s.actionSecondaryText}>Share profile</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bio */}
          {trainer?.bio && (
            <>
              <Text style={s.sectionLabel}>About</Text>
              <View style={s.block}>
                <View style={s.blockPad}>
                  <Text style={s.bioText}>{trainer.bio}</Text>
                </View>
              </View>
            </>
          )}

          <Text style={s.sectionLabel}>Account</Text>
          <MenuSection items={ACCOUNT_ITEMS} router={router} />

          <Text style={s.sectionLabel}>Business</Text>
          <MenuSection items={BUSINESS_ITEMS} router={router} />

          <Text style={s.sectionLabel}>Support</Text>
          <MenuSection items={SUPPORT_ITEMS} router={router} />

          <TouchableOpacity
            style={s.signOutBtn}
            onPress={handleSignOut}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Ionicons name="log-out-outline" size={20} color={CoachColors.danger} />
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.deleteBtn}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Delete account"
            accessibilityHint="Permanently deletes your account and all your data. This cannot be undone."
          >
            <Ionicons name="trash-outline" size={13} color={CoachColors.textFaint} />
            <Text style={s.deleteText}>Delete account</Text>
          </TouchableOpacity>

        </ScrollView>
      </SafeAreaView>

      {/* Delete confirmation — cross-platform replacement for Alert.prompt */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!deleting) setShowDeleteModal(false); }}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalContent} accessibilityViewIsModal accessibilityRole="alert">
            <Text style={s.modalTitle} accessibilityRole="header">Confirm deletion</Text>
            <Text style={s.modalMessage}>
              Type <Text style={s.modalStrong}>DELETE</Text> to permanently erase your account, your clients&apos; links to you and everything you have built.
            </Text>
            <TextInput
              style={s.modalInput}
              value={deleteInput}
              onChangeText={setDeleteInput}
              placeholder="Type DELETE"
              placeholderTextColor={CoachColors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              autoFocus
              editable={!deleting}
              accessibilityLabel="Confirmation field"
              accessibilityHint="Type the word DELETE in capitals to unlock the delete button"
            />
            <View style={s.modalButtons}>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnCancel]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deleting}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={s.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnConfirm, (deleteInput !== 'DELETE' || deleting) && { opacity: 0.35 }]}
                onPress={handleConfirmDelete}
                disabled={deleteInput !== 'DELETE' || deleting}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Delete forever"
                accessibilityState={{ disabled: deleteInput !== 'DELETE' || deleting, busy: deleting }}
                accessibilityHint={deleteInput !== 'DELETE'
                  ? 'Unavailable until you type DELETE in the field above'
                  : 'Permanently erases your account and all your data'}
              >
                {deleting
                  ? <ActivityIndicator size="small" color={CoachColors.onAccent} />
                  : <Text style={s.modalBtnConfirmText}>Delete forever</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Reusable menu section component ─────────────────────────────────────────
function MenuSection({ items, router }: { items: typeof ACCOUNT_ITEMS; router: ReturnType<typeof useRouter> }) {
  return (
    <View style={s.block}>
      {items.map((item, i) => (
        <View key={item.route}>
          <TouchableOpacity
            style={s.blockRow}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(item.route as any); }}
            activeOpacity={0.7}
            accessible
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Ionicons name={item.icon as any} size={21} color={CoachColors.accent} />
            <Text style={s.blockRowText}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={CoachColors.textFaint} />
          </TouchableOpacity>
          {i < items.length - 1 && <View style={s.blockDivider} />}
        </View>
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CoachColors.bg },
  // paddingBottom is applied inline from the real bottom inset + tab-bar height.
  scroll: { paddingHorizontal: 16 },

  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  navTitle: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary },

  hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 28, gap: 9 },

  // 16:10 — the same crop the picker enforces and the pass cards render.
  coverWrap: { marginBottom: 16 },
  coverImage: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
  },
  coverEditBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmpty: {
    width: '100%',
    minHeight: 76,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: CoachColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  coverEmptyText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13.5,
    color: CoachColors.textMuted,
    flexShrink: 1,
  },

  avatarWrap: { position: 'relative' },
  avatarCircle: {
    width: 96, height: 96, borderRadius: 48, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48, borderCurve: 'continuous', backgroundColor: CoachColors.surface },
  avatarInitials: { fontFamily: CoachFonts.headingBold, fontSize: 33.5, color: CoachColors.textPrimary },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 26, height: 26, borderRadius: 13, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: CoachColors.bg,
  },

  heroName: {
    fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary,
    letterSpacing: -0.3, marginTop: 4,
  },

  elitePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 12, paddingVertical: 5,
  },
  elitePillText: { fontFamily: CoachFonts.bodyBold, fontSize: 13, color: CoachColors.onAccent, letterSpacing: 0.3 },
  eliteOutlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 12, paddingVertical: 5,
  },
  eliteOutlinePillText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.accent },

  heroEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEmail: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textFaint },

  statRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 14, marginBottom: 2 },
  statBlock: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontFamily: CoachFonts.headingBold, fontSize: 27, color: CoachColors.textPrimary, letterSpacing: -0.5 },
  statLabel: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint },
  statDivider: { width: 1, height: 32, backgroundColor: CoachColors.borderMuted },

  heroActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 6 },
  actionPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, backgroundColor: CoachColors.accent, borderRadius: 999, borderCurve: 'continuous', paddingVertical: 13,
  },
  actionPrimaryText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },
  actionSecondary: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, borderCurve: 'continuous', paddingVertical: 13,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  actionSecondaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },

  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12.5,
    color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 22, marginBottom: 8,
  },

  block: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 14, borderCurve: 'continuous', overflow: 'hidden' },
  blockPad: { padding: 16 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 15 },
  blockDivider: { height: 1, backgroundColor: CoachColors.borderMuted, marginLeft: 48 },
  blockRowText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary, flex: 1 },

  bioText: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary, lineHeight: 22.5 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 9, borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 14, borderCurve: 'continuous',
    paddingVertical: 15, marginTop: 28,
  },
  signOutText: { fontFamily: CoachFonts.bodyBold, fontSize: 16, color: CoachColors.danger },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 16, marginTop: 4,
  },
  deleteText: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textFaint },

  // Delete confirmation modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(10,11,9,0.8)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalContent: {
    width: '100%', backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 18, borderCurve: 'continuous', padding: 22,
  },
  modalTitle: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary },
  modalMessage: {
    fontFamily: CoachFonts.body, fontSize: 14.5, lineHeight: 21.5,
    color: CoachColors.textMuted, marginTop: 8, marginBottom: 18,
  },
  modalStrong: { fontFamily: CoachFonts.bodyBold, color: CoachColors.textPrimary },
  modalInput: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 15, paddingVertical: 16,
    letterSpacing: 2, marginBottom: 18,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderCurve: 'continuous', paddingVertical: 13 },
  modalBtnCancel: { borderWidth: 1, borderColor: CoachColors.border },
  modalBtnCancelText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  modalBtnConfirm: { backgroundColor: CoachColors.danger },
  modalBtnConfirmText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },
});
