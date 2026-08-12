import { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import { FontFamily } from '../../constants/theme';

// ─── Menu sections ────────────────────────────────────────────────────────────
const ACCOUNT_ITEMS = [
  { icon: 'settings-outline',   label: 'Settings',          route: '/settings'         },
  { icon: 'trophy-outline',     label: 'Certifications',    route: '/certifications'   },
  { icon: 'barbell-outline',    label: 'Specializations',   route: '/specializations'  },
];
const BUSINESS_ITEMS = [
  { icon: 'card-outline',         label: 'Subscription Plans', route: '/subscriptions' },
  { icon: 'wallet-outline',       label: 'Earnings & Payouts', route: '/earnings'      },
  { icon: 'share-social-outline', label: 'Referral Program',   route: '/referrals'     },
  { icon: 'analytics-outline',    label: 'Analytics',          route: '/analytics'     },
];
const SUPPORT_ITEMS = [
  { icon: 'help-circle-outline',        label: 'Help Center',     route: '/help-center'     },
  { icon: 'chatbubble-ellipses-outline',label: 'Contact Support', route: '/contact-support' },
  { icon: 'document-text-outline',      label: 'Terms & Privacy', route: '/terms-privacy'   },
];

export default function ProfileScreen() {
  const router    = useRouter();
  const { user, signOut } = useAuth();
  const { trainer, activeClients, sessions, totalReferrals, updateTrainer } = useApp();
  const { isCoachElite } = useRevenueCat();
  const [uploading, setUploading] = useState(false);

  // Elite badge shimmer
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isCoachElite) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isCoachElite]);

  const name              = trainer?.name || user?.user_metadata?.name || 'Trainer';
  const email             = user?.email || trainer?.email;
  const completedSessions = sessions.filter(s => s.status === 'completed').length;

  // ── Image picker ──────────────────────────────────────────────────────────
  const handlePickImage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Profile Photo', 'Choose how to update your photo', [
      { text: 'Take Photo',           onPress: () => launchPicker('camera')  },
      { text: 'Choose from Library',  onPress: () => launchPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission Required', source === 'camera' ? 'Camera access is needed.' : 'Photo library access is needed.');
      return;
    }
    const result = await (source === 'camera'
      ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1,1], quality: 0.7, base64: true })
      : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1,1], quality: 0.7, base64: true }));
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Error', 'Could not read image data.'); return; }
    await uploadAvatar(asset.base64, asset.uri);
  };

  const uploadAvatar = async (base64: string, uri: string) => {
    if (!user) return;
    setUploading(true);
    try {
      const fileExt    = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName   = `${user.id}/avatar.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
      const binaryStr  = atob(base64);
      const bytes      = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, bytes.buffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await updateTrainer({ avatar_url: `${urlData.publicUrl}?t=${Date.now()}` });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  };

  // ── Auth actions ──────────────────────────────────────────────────────────
  const handleSignOut = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => Alert.prompt(
            'Confirm Deletion', 'Type DELETE to confirm.',
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
      <SafeAreaView edges={['top']}>
        {/* Simple nav */}
        <View style={s.nav}>
          <Text style={s.navTitle}>Profile</Text>
          <TouchableOpacity onPress={() => router.push('/settings' as any)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="settings-outline" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ══════════════ HERO ══════════════ */}
        <View style={s.hero}>
          {/* Avatar with camera overlay */}
          <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8} style={s.avatarWrap}>
            <Avatar name={name} size="xl" imageUrl={trainer?.avatar_url} />
            <View style={s.cameraOverlay}>
              {uploading
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Ionicons name="camera" size={14} color="#FFF" />}
            </View>
          </TouchableOpacity>

          {/* Name */}
          <Text style={s.heroName}>{name}</Text>

          {/* Elite badge or specialization */}
          {isCoachElite ? (
            <Animated.View style={[s.eliteBadge, { opacity: shimmerAnim.interpolate({ inputRange: [0,1], outputRange: [0.85,1] }) }]}>
              <LinearGradient colors={['#B8860B','#FFD700','#FFF7A1','#FFD700','#B8860B']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.eliteBadgeGrad}>
                <Ionicons name="flash" size={11} color="#000" />
                <Text style={s.eliteBadgeText}>COACH ELITE</Text>
              </LinearGradient>
            </Animated.View>
          ) : trainer?.specialization ? (
            <Text style={s.heroSpec}>{trainer.specialization}</Text>
          ) : null}

          {/* Email */}
          {email && (
            <View style={s.heroEmailRow}>
              <Ionicons name="mail-outline" size={13} color="rgba(255,255,255,0.3)" />
              <Text style={s.heroEmail}>{email}</Text>
            </View>
          )}

          {/* Strava-style stat row */}
          <View style={s.statRow}>
            <View style={s.statBlock}>
              <Text style={s.statNum}>{activeClients.length}</Text>
              <Text style={s.statLabel}>Clients</Text>
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

          {/* Primary action buttons */}
          <View style={s.heroActions}>
            <TouchableOpacity
              style={s.actionPrimary}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/settings' as any); }}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={17} color="#FFF" />
              <Text style={s.actionPrimaryText}>Edit Profile</Text>
            </TouchableOpacity>
            {!isCoachElite && (
              <TouchableOpacity
                style={s.actionElite}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(tabs)/studio' as any); }}
                activeOpacity={0.85}
              >
                <Ionicons name="flash" size={17} color="#FFD700" />
                <Text style={s.actionEliteText}>Go Elite</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Bio */}
        {trainer?.bio && (
          <>
            <Text style={s.sectionLabel}>ABOUT</Text>
            <View style={s.block}>
              <View style={s.blockPad}>
                <Text style={s.bioText}>{trainer.bio}</Text>
              </View>
            </View>
          </>
        )}

        {/* Account */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <MenuSection items={ACCOUNT_ITEMS} router={router} />

        {/* Business */}
        <Text style={s.sectionLabel}>BUSINESS</Text>
        <MenuSection items={BUSINESS_ITEMS} router={router} />

        {/* Support */}
        <Text style={s.sectionLabel}>SUPPORT</Text>
        <MenuSection items={SUPPORT_ITEMS} router={router} />

        {/* Sign out */}
        <View style={{ marginTop: 32 }}>
          <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Delete account */}
        <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={13} color="rgba(255,255,255,0.2)" />
          <Text style={s.deleteText}>Delete Account</Text>
        </TouchableOpacity>

        <View style={{ height: 120 }} />
      </ScrollView>
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
            <Ionicons name={item.icon as any} size={20} color="rgba(255,255,255,0.45)" />
            <Text style={s.blockRowText}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.18)" />
          </TouchableOpacity>
          {i < items.length - 1 && <View style={s.blockDivider} />}
        </View>
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#000' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // NAV
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
  },
  navTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 20, color: '#FFF' },

  // HERO
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 28, gap: 10 },

  avatarWrap:   { position: 'relative' },
  cameraOverlay: {
    position: 'absolute', bottom: -4, right: -4,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#FF6B35', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#000',
  },

  heroName: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 30, color: '#FFF',
    letterSpacing: -0.5, marginTop: 6,
  },
  heroSpec: {
    fontFamily: FontFamily.bodyMedium, fontSize: 14,
    color: '#FF6B35', letterSpacing: 0.3,
  },
  heroEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEmail: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.35)' },

  // Elite badge
  eliteBadge:     { borderRadius: 20, overflow: 'hidden' },
  eliteBadgeGrad: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  eliteBadgeText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#000', letterSpacing: 1.5 },

  // Stat row — Strava-style
  statRow:    { flexDirection: 'row', alignItems: 'center', width: '100%', marginTop: 16, marginBottom: 4 },
  statBlock:  { flex: 1, alignItems: 'center', gap: 4 },
  statNum:    { fontFamily: FontFamily.headingExtraBold, fontSize: 28, color: '#FFF', letterSpacing: -1 },
  statLabel:  { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.38)' },
  statDivider:{ width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Primary action buttons
  heroActions:      { flexDirection: 'row', gap: 10, width: '100%', marginTop: 6 },
  actionPrimary:    {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#FF6B35', borderRadius: 14, paddingVertical: 14,
  },
  actionPrimaryText:{ fontFamily: FontFamily.bodySemiBold, fontSize: 15, color: '#FFF' },
  actionElite:      {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.25)',
  },
  actionEliteText:  { fontFamily: FontFamily.bodySemiBold, fontSize: 15, color: '#FFD700' },

  // Section label
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 11,
    color: 'rgba(255,255,255,0.32)', letterSpacing: 1,
    marginTop: 24, marginBottom: 8,
  },

  // Block — iOS Settings style
  block:      { backgroundColor: '#111', borderRadius: 16, overflow: 'hidden' },
  blockPad:   { padding: 16 },
  blockRow:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 17 },
  blockDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 50 },
  blockRowText: { fontFamily: FontFamily.bodyMedium, fontSize: 16, color: '#FFF', flex: 1 },

  // Bio
  bioText: {
    fontFamily: FontFamily.body, fontSize: 15,
    color: 'rgba(255,255,255,0.65)', lineHeight: 24,
  },

  // Sign out
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: '#111', borderRadius: 16, paddingVertical: 17,
  },
  signOutText: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, color: '#EF4444' },

  // Delete
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 16, marginTop: 4,
  },
  deleteText: {
    fontFamily: FontFamily.bodyMedium, fontSize: 13,
    color: 'rgba(255,255,255,0.2)',
  },
});
