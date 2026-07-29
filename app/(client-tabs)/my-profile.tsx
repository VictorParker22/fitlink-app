import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, ActivityIndicator, Switch, Modal, TextInput, Linking } from 'react-native';
import { useState } from 'react';
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
import { useAlert } from '../../context/AlertContext';
import Avatar from '../../components/Avatar';
import { Colors, FontFamily, FontSize, Radius, Spacing } from '../../constants/theme';
import { ClientRoute, SharedRoute } from '../../types/routes';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export default function ClientProfileScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { clientData, updateClientAvatar, healthSharingEnabled, toggleHealthSharing } = useClient();
  const { mode, setMode } = useTheme();
  const { showAlert } = useAlert();
  const [uploading, setUploading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

  const name = clientData?.name || 'MEMBER';
  const memberYear = clientData?.created_at ? new Date(clientData.created_at).getFullYear() : new Date().getFullYear();

  const handleSignOut = () => {
    Alert.alert('SIGN OUT', 'Are you sure you want to log out of your session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'DELETE ACCOUNT',
      'This will permanently remove your membership, active plans, workout history, and personal metrics. This action cannot be reverted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Proceed to Delete',
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
    Alert.alert('PROFILE PHOTO', 'Select an option to update avatar', [
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
    <SafeAreaView style={s.container} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── HEADER TITLE ── */}
        <View style={s.topHeader}>
          <Text style={s.topHeaderTitle}>PROFILE & SETTINGS</Text>
          <View style={s.headerBadge}>
            <Text style={s.headerBadgeText}>LUXURY ATHLETE</Text>
          </View>
        </View>

        {/* ── PROFILE HERO CARD ── */}
        <View style={s.profileCard}>
          <TouchableOpacity onPress={handlePickImage} activeOpacity={0.85} style={s.avatarTouchable}>
            <View style={s.avatarBorderWrap}>
              {uploading ? (
                <View style={s.avatarLoading}>
                  <ActivityIndicator size="small" color="#FFD700" />
                </View>
              ) : (
                <Avatar name={name} imageUrl={clientData?.avatar_url} size="xl" />
              )}
              <View style={s.editBadge}>
                <Ionicons name="camera" size={12} color="#000000" />
              </View>
            </View>
          </TouchableOpacity>

          <View style={s.profileDetails}>
            <Text style={s.profileName} numberOfLines={1}>{name}</Text>
            <Text style={s.memberSince}>MEMBER SINCE {memberYear}</Text>
            <View style={s.statusPill}>
              <View style={s.statusDot} />
              <Text style={s.statusText}>ALL SYSTEMS ACTIVE</Text>
            </View>
          </View>
        </View>

        {/* ── HEALTHKIT / APPLE HEALTH BANNER CARD ── */}
        <View style={s.healthBannerCard}>
          <View style={s.healthBannerLeft}>
            <View style={s.healthIconBox}>
              <Ionicons name="heart" size={20} color="#FF6B35" />
            </View>
            <View style={s.healthTextCol}>
              <Text style={s.healthBannerTitle}>APPLE HEALTH</Text>
              <Text style={s.healthBannerSub}>
                {healthSharingEnabled ? 'Syncing steps, HR, and calories' : 'Connect for real-time recovery analytics'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[s.healthConnectBtn, healthSharingEnabled && s.healthConnectedBtn]}
            activeOpacity={0.8}
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const nextVal = !healthSharingEnabled;
              try {
                await toggleHealthSharing(nextVal);
                showAlert({
                  type: 'success',
                  title: nextVal ? 'HEALTH CONNECTED' : 'HEALTH DISCONNECTED',
                  message: nextVal ? 'Biometrics now active.' : 'Health data sync paused.',
                });
              } catch (e) {
                showAlert({ type: 'error', title: 'Error', message: 'Failed to update HealthKit configuration.' });
              }
            }}
          >
            <Text style={[s.healthBtnText, healthSharingEnabled && s.healthConnectedBtnText]}>
              {healthSharingEnabled ? 'CONNECTED' : 'CONNECT'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── MEMBERSHIP & PERFORMANCE ── */}
        <SectionBlock title="Membership & Performance">
          <MenuItem icon="nutrition-outline" label="My Diet Plan" onPress={() => router.push(ClientRoute.myDiet)} />
          <MenuItem icon="card-outline" label="Membership & Billing" onPress={() => router.push(ClientRoute.mySubscription)} />
          <MenuItem icon="body-outline" label="Fitness Profile & Biometrics" onPress={() => router.push(ClientRoute.healthInsights)} />
        </SectionBlock>

        {/* ── SETTINGS & HARDWARE ── */}
        <SectionBlock title="Settings & Hardware">
          <MenuItem icon="notifications-outline" label="Notifications & Alerts" onPress={() => router.push(SharedRoute.notifications)} />
          <MenuItem icon="watch-outline" label="Connected Tech & Wearables" onPress={() => router.push(ClientRoute.connectedTech)} />

          {/* Theme Row */}
          <View style={s.menuItem}>
            <View style={s.menuIconRow}>
              <View style={[s.menuIconSquare, { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.1)' }]}>
                <Ionicons name="color-palette-outline" size={16} color="#FFD700" />
              </View>
              <Text style={s.menuLabel}>Aesthetics Theme</Text>
            </View>
            <View style={s.themeToggle}>
              {(['dark', 'light', 'system'] as ThemeMode[]).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => { Haptics.selectionAsync(); setMode(opt); }}
                  style={[s.themeChip, mode === opt && s.themeChipActive]}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={opt === 'dark' ? 'moon' : opt === 'light' ? 'sunny' : 'phone-portrait'}
                    size={13}
                    color={mode === opt ? '#000000' : 'rgba(255,255,255,0.4)'}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </SectionBlock>

        {/* ── HELP & SUPPORT ── */}
        <SectionBlock title="Help & Support">
          <MenuItem icon="chatbubble-ellipses-outline" label="Concierge Messages" onPress={() => router.push(ClientRoute.myMessages)} />
          <MenuItem icon="help-circle-outline" label="Knowledge Base & FAQs" onPress={() => router.push(SharedRoute.helpCenter)} />
          <MenuItem icon="chatbubble-outline" label="Contact VIP Support" onPress={() => router.push(SharedRoute.contactSupport)} />
        </SectionBlock>

        {/* ── LEGAL & POLICY LINKS ── */}
        <View style={s.cardBlock}>
          <LinkRow label="Share Feedback" onPress={() => router.push(SharedRoute.contactSupport)} isFirst />
          <LinkRow label="Privacy Policy" onPress={() => router.push(SharedRoute.termsPrivacy)} />
          <LinkRow label="Terms & Conditions" onPress={() => router.push(SharedRoute.termsPrivacy)} />
        </View>

        {/* ── ACCOUNT ACTIONS ── */}
        <View style={s.actionRow}>
          <TouchableOpacity style={s.signOutBtn} activeOpacity={0.8} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={s.signOutText}>SIGN OUT</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={16} color={Colors.red} style={{ marginRight: 8 }} />
            <Text style={s.deleteText}>DELETE ACCOUNT</Text>
          </TouchableOpacity>
        </View>

        {/* ── SOCIAL LINKS ── */}
        <View style={s.socialRow}>
          <TouchableOpacity style={s.socialIcon} activeOpacity={0.7} onPress={() => Linking.openURL('https://instagram.com')}>
            <Ionicons name="logo-instagram" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={s.socialIcon} activeOpacity={0.7} onPress={() => Linking.openURL('https://tiktok.com')}>
            <Ionicons name="logo-tiktok" size={18} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={s.socialIcon} activeOpacity={0.7} onPress={() => Linking.openURL('https://facebook.com')}>
            <Ionicons name="logo-facebook" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* ── VERSION ── */}
        <Text style={s.version}>FITLINK V{Constants.expoConfig?.version || '1.0.0'} • BRUTALIST LUXURY EDITION</Text>

      </ScrollView>

      {/* ── DELETE ACCOUNT CONFIRMATION MODAL ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeaderRow}>
              <Ionicons name="warning-sharp" size={20} color={Colors.red} />
              <Text style={s.modalTag}>CRITICAL ACTION</Text>
            </View>
            <Text style={s.modalTitle}>DELETE ACCOUNT</Text>
            <Text style={s.modalMessage}>
              Type <Text style={s.modalBoldHighlight}>DELETE</Text> to permanently erase your profile and records.
            </Text>

            <TextInput
              style={s.modalInput}
              value={deleteInput}
              onChangeText={setDeleteInput}
              placeholder="TYPE DELETE"
              placeholderTextColor="rgba(255,255,255,0.25)"
              autoCapitalize="characters"
              autoFocus
            />

            <View style={s.modalButtons}>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnCancel]}
                onPress={() => setShowDeleteModal(false)}
                activeOpacity={0.7}
              >
                <Text style={s.modalBtnCancelText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnConfirm, deleteInput !== 'DELETE' && { opacity: 0.3 }]}
                onPress={handleConfirmDelete}
                activeOpacity={0.7}
                disabled={deleteInput !== 'DELETE'}
              >
                <Text style={s.modalBtnConfirmText}>CONFIRM DELETION</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── REUSABLE SUBCOMPONENTS ──────────────────────────────────

const MENU_ICON_COLORS: Record<string, string> = {
  'nutrition-outline': '#22C55E',
  'card-outline': '#A78BFA',
  'body-outline': '#FF6B35',
  'notifications-outline': '#FFD700',
  'watch-outline': '#22C55E',
  'help-circle-outline': '#4D94FF',
  'chatbubble-outline': '#A78BFA',
  'chatbubble-ellipses-outline': '#FFD700',
};

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.sectionContainer}>
      <Text style={s.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={s.cardBlock}>{children}</View>
    </View>
  );
}

function MenuItem({ icon, label, onPress }: { icon: IoniconsName; label: string; onPress: () => void }) {
  const iconColor = MENU_ICON_COLORS[icon as string] || '#FFFFFF';
  return (
    <TouchableOpacity
      style={s.menuItem}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.7}
    >
      <View style={s.menuIconRow}>
        <View style={[s.menuIconSquare, { borderColor: iconColor + '40', backgroundColor: iconColor + '12' }]}>
          <Ionicons name={icon} size={16} color={iconColor} />
        </View>
        <Text style={s.menuLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
    </TouchableOpacity>
  );
}

function LinkRow({ label, onPress, isFirst }: { label: string; onPress: () => void; isFirst?: boolean }) {
  return (
    <TouchableOpacity
      style={[s.linkRow, !isFirst && s.linkRowBorder]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.7}
    >
      <Text style={s.linkLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.3)" />
    </TouchableOpacity>
  );
}

// ─── STYLES ──────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    paddingTop: 12,
    paddingBottom: 120,
    paddingHorizontal: 20,
  },

  // Top header
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingTop: 4,
  },
  topHeaderTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.md,
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
    borderRadius: Radius.xs,
  },
  headerBadgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.5,
    color: '#FFD700',
  },

  // Profile Card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: 16,
    marginBottom: 16,
    gap: 16,
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatarBorderWrap: {
    padding: 2,
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: Radius.xs,
    backgroundColor: '#000000',
  },
  avatarLoading: {
    width: 64,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#FFD700',
    borderRadius: Radius.xs,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileDetails: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.lg,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  memberSince: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.4)',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  statusText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.5,
    color: '#22C55E',
  },

  // Healthkit banner
  healthBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: 14,
    marginBottom: 24,
    gap: 12,
  },
  healthBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  healthIconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthTextCol: {
    flex: 1,
    gap: 2,
  },
  healthBannerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  healthBannerSub: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  healthConnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FF6B35',
    borderRadius: Radius.xs,
  },
  healthConnectedBtn: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.4)',
  },
  healthBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },
  healthConnectedBtnText: {
    color: '#22C55E',
  },

  // Sections
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 10,
  },
  cardBlock: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    overflow: 'hidden',
  },

  // Menu items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  menuIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  menuIconSquare: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.sm,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Theme toggle chips
  themeToggle: {
    flexDirection: 'row',
    gap: 6,
  },
  themeChip: {
    width: 28,
    height: 28,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeChipActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },

  // Link row
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  linkRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  linkLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.5,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  signOutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    paddingVertical: 14,
  },
  signOutText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: Radius.xs,
    paddingVertical: 14,
  },
  deleteText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: Colors.red,
  },

  // Social icons
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  socialIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: '#0C0C0E',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Version
  version: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: 24,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  modalTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: Colors.red,
    letterSpacing: 2,
  },
  modalTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.lg,
    color: '#FFFFFF',
    letterSpacing: 1,
    marginBottom: 8,
  },
  modalMessage: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 20,
    lineHeight: 20,
  },
  modalBoldHighlight: {
    fontFamily: FontFamily.headingExtraBold,
    color: '#FFFFFF',
  },
  modalInput: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: '#FFFFFF',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    paddingHorizontal: 16,
    paddingVertical: 14,
    letterSpacing: 2,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  modalBtnCancelText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.7)',
  },
  modalBtnConfirm: {
    backgroundColor: Colors.red,
  },
  modalBtnConfirmText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#FFFFFF',
  },
});

