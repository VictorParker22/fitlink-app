import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Share, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  { icon: 'card-outline',         label: 'Subscription plans', route: '/subscriptions' },
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
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { trainer, activeClients, sessions, totalReferrals, updateTrainer } = useApp();
  const { isCoachElite } = useRevenueCat();
  const [uploading, setUploading] = useState(false);

  const name = trainer?.name || user?.user_metadata?.name || 'Trainer';
  const email = user?.email || trainer?.email;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;

  // ── Image picker ──────────────────────────────────────────────────────────
  const handlePickImage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Profile photo', 'Choose how to update your photo', [
      { text: 'Take photo', onPress: () => launchPicker('camera') },
      { text: 'Choose from library', onPress: () => launchPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', source === 'camera' ? 'Camera access is needed.' : 'Photo library access is needed.');
      return;
    }
    const result = await (source === 'camera'
      ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true })
      : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true }));
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Error', 'Could not read image data.'); return; }
    await uploadAvatar(asset.base64, asset.uri);
  };

  const uploadAvatar = async (base64: string, uri: string) => {
    if (!user) return;
    setUploading(true);
    try {
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/avatar.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, bytes.buffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await updateTrainer({ avatar_url: `${urlData.publicUrl}?t=${Date.now()}` });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message || 'Could not upload photo.');
    } finally {
      setUploading(false);
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
          text: 'Delete forever',
          style: 'destructive',
          onPress: () => Alert.prompt(
            'Confirm deletion', 'Type DELETE to confirm.',
            async (text) => {
              if (text !== 'DELETE') { Alert.alert('Cancelled', 'Account deletion cancelled.'); return; }
              try { await supabase.rpc('delete_trainer_account'); await signOut(); }
              catch (err: any) { Alert.alert('Error', err.message || 'Failed to delete account.'); }
            },
            'plain-text', '', 'default'
          ),
        },
      ]
    );
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
            <Ionicons name="settings-outline" size={22} color={CoachColors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Hero ─────────────────────────────────────────────────────── */}
          <View style={s.hero}>
            <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8} style={s.avatarWrap}>
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
                  : <Ionicons name="camera" size={13} color={CoachColors.onAccent} />}
              </View>
            </TouchableOpacity>

            <Text style={s.heroName}>{name}</Text>

            {isCoachElite ? (
              <View style={s.elitePill}>
                <Ionicons name="checkmark-circle" size={13} color={CoachColors.onAccent} />
                <Text style={s.elitePillText}>Coach Elite</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={s.eliteOutlinePill}
                activeOpacity={0.8}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/studio' as any); }}
              >
                <Ionicons name="add" size={13} color={CoachColors.accent} />
                <Text style={s.eliteOutlinePillText}>Go Coach Elite</Text>
              </TouchableOpacity>
            )}

            {email && (
              <View style={s.heroEmailRow}>
                <Ionicons name="mail-outline" size={13} color={CoachColors.textFaint} />
                <Text style={s.heroEmail}>{email}</Text>
              </View>
            )}

            <View style={s.statRow}>
              <View style={s.statBlock}>
                <Text style={s.statNum}>{activeClients.length}</Text>
                <Text style={s.statLabel}>Athletes</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBlock}>
                <Text style={s.statNum}>{completedSessions}</Text>
                <Text style={s.statLabel}>Sessions</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statBlock}>
                <Text style={s.statNum}>{totalReferrals}</Text>
                <Text style={s.statLabel}>Referrals</Text>
              </View>
            </View>

            <View style={s.heroActions}>
              <TouchableOpacity
                style={s.actionPrimary}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/settings' as any); }}
                activeOpacity={0.85}
              >
                <Ionicons name="create-outline" size={16} color={CoachColors.onAccent} />
                <Text style={s.actionPrimaryText}>Edit profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.actionSecondary}
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

          <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color={CoachColors.danger} />
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={12} color={CoachColors.textFaint} />
            <Text style={s.deleteText}>Delete account</Text>
          </TouchableOpacity>

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
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
          >
            <Ionicons name={item.icon as any} size={19} color={CoachColors.accent} />
            <Text style={s.blockRowText}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={CoachColors.textFaint} />
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
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  navTitle: { fontFamily: CoachFonts.headingBold, fontSize: 22, color: CoachColors.textPrimary },

  hero: { alignItems: 'center', paddingTop: 12, paddingBottom: 28, gap: 9 },

  avatarWrap: { position: 'relative' },
  avatarCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48, backgroundColor: CoachColors.surface },
  avatarInitials: { fontFamily: CoachFonts.headingBold, fontSize: 30, color: CoachColors.textPrimary },
  cameraBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: CoachColors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: CoachColors.bg,
  },

  heroName: {
    fontFamily: CoachFonts.headingBold, fontSize: 22, color: CoachColors.textPrimary,
    letterSpacing: -0.3, marginTop: 4,
  },

  elitePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  elitePillText: { fontFamily: CoachFonts.bodyBold, fontSize: 11.5, color: CoachColors.onAccent, letterSpacing: 0.3 },
  eliteOutlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  eliteOutlinePillText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11.5, color: CoachColors.accent },

  heroEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEmail: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint },

  statRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 14, marginBottom: 2 },
  statBlock: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontFamily: CoachFonts.headingBold, fontSize: 24, color: CoachColors.textPrimary, letterSpacing: -0.5 },
  statLabel: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textFaint },
  statDivider: { width: 1, height: 32, backgroundColor: CoachColors.borderMuted },

  heroActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 6 },
  actionPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, backgroundColor: CoachColors.accent, borderRadius: 999, paddingVertical: 13,
  },
  actionPrimaryText: { fontFamily: CoachFonts.bodyBold, fontSize: 14, color: CoachColors.onAccent },
  actionSecondary: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, paddingVertical: 13,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  actionSecondaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },

  sectionLabel: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11,
    color: CoachColors.textFaint, letterSpacing: 0.8, textTransform: 'uppercase',
    marginTop: 22, marginBottom: 8,
  },

  block: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 14, overflow: 'hidden' },
  blockPad: { padding: 16 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 15 },
  blockDivider: { height: 1, backgroundColor: CoachColors.borderMuted, marginLeft: 48 },
  blockRowText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary, flex: 1 },

  bioText: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textSecondary, lineHeight: 20 },

  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 9, borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 14,
    paddingVertical: 15, marginTop: 28,
  },
  signOutText: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.danger },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 16, marginTop: 4,
  },
  deleteText: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textFaint },
});
