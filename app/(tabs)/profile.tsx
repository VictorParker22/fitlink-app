import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { trainer, activeClients, sessions, totalReferrals, updateTrainer } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [uploading, setUploading] = useState(false);

  const name = trainer?.name || user?.user_metadata?.name || 'Trainer';
  const email = user?.email || trainer?.email;
  const phone = user?.phone || trainer?.phone;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;

  const handlePickImage = async () => {
    Alert.alert('Profile Photo', 'Choose how to update your photo', [
      { text: 'Take Photo', onPress: () => launchPicker('camera') },
      { text: 'Choose from Library', onPress: () => launchPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Camera access is needed.'); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission Required', 'Photo library access is needed.'); return; }
    }

    const pickerOptions: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1] as [number, number],
      quality: 0.7,
      base64: true,
    };

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(pickerOptions)
      : await ImagePicker.launchImageLibraryAsync(pickerOptions);

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
      for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, bytes.buffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await updateTrainer({ avatar_url: `${urlData.publicUrl}?t=${Date.now()}` });
    } catch (err: any) {
      console.error('Upload failed:', err);
      Alert.alert('Upload Failed', err.message || 'Could not upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data (clients, workouts, sessions, messages). This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            Alert.prompt(
              'Confirm Deletion',
              'Type DELETE to confirm.',
              async (text) => {
                if (text !== 'DELETE') {
                  Alert.alert('Cancelled', 'Account deletion cancelled.');
                  return;
                }
                try {
                  await supabase.rpc('delete_trainer_account');
                  await signOut();
                } catch (err: any) {
                  Alert.alert('Error', err.message || 'Failed to delete account. Contact support.');
                }
              },
              'plain-text',
              '',
              'default'
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Editorial Header */}
        <View style={styles.header}>
          <Text style={styles.title}>COACH PROFILE</Text>
          <Text style={styles.subtitle}>ACCOUNT & BUSINESS HUB</Text>
        </View>

        {/* Profile Hero */}
        <View style={styles.profileCard}>
          <View style={styles.accentStrip} />
          <View style={styles.profileInfo}>
            <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8} style={styles.avatarWrapper} accessibilityRole="button" accessibilityLabel="Change profile photo">
              <Avatar name={name} size="xl" imageUrl={trainer?.avatar_url} shape="square" />
              <View style={styles.cameraOverlay}>
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                ) : (
                  <Ionicons name="camera" size={14} color={colors.textPrimary} />
                )}
              </View>
            </TouchableOpacity>
            
            <Text style={styles.profileName}>{name}</Text>
            
            {trainer?.specialization && (
              <View style={styles.specBadge}>
                <Text style={styles.profileSpec}>{trainer.specialization}</Text>
              </View>
            )}

            <View style={styles.contactRow}>
              {email && (
                <View style={styles.contactItem}>
                  <Ionicons name="mail-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.contactText}>{email}</Text>
                </View>
              )}
              {phone && (
                <View style={styles.contactItem}>
                  <Ionicons name="call-outline" size={12} color={colors.textTertiary} />
                  <Text style={styles.contactText}>{phone}</Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity style={styles.editProfileBtn} onPress={() => router.push('/settings' as any)} accessibilityRole="button" accessibilityLabel="Edit profile">
            <Ionicons name="create-outline" size={16} color={colors.textPrimary} />
            <Text style={styles.editProfileText}>EDIT PROFILE</Text>
          </TouchableOpacity>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{activeClients.length}</Text>
              <Text style={styles.statLabel}>CLIENTS</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{completedSessions}</Text>
              <Text style={styles.statLabel}>SESSIONS</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalReferrals}</Text>
              <Text style={styles.statLabel}>REFERRALS</Text>
            </View>
          </View>
        </View>

        {/* Bio */}
        {trainer?.bio && (
          <View style={styles.bioCard}>
            <Text style={styles.bioLabel}>ABOUT</Text>
            <Text style={styles.bioText}>{trainer.bio}</Text>
          </View>
        )}

        {/* Account */}
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.menuContainer}>
          {[
            { icon: 'settings-outline', label: 'SETTINGS', route: '/settings' },
            { icon: 'trophy-outline', label: 'CERTIFICATIONS', route: '/certifications' },
            { icon: 'barbell-outline', label: 'SPECIALIZATIONS', route: '/specializations' },
          ].map((item, i, arr) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} activeOpacity={0.7} onPress={() => router.push(item.route as any)} accessibilityRole="link" accessibilityLabel={`Open ${item.label}`}>
              <View style={styles.menuIcon}>
                <Ionicons name={item.icon as any} size={16} color={colors.textPrimary} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="arrow-forward-outline" size={16} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Business */}
        <Text style={styles.sectionTitle}>BUSINESS</Text>
        <View style={styles.menuContainer}>
          {[
            { icon: 'card-outline', label: 'SUBSCRIPTION PLANS', route: '/subscriptions' },
            { icon: 'wallet-outline', label: 'EARNINGS & PAYOUTS', route: '/earnings' },
            { icon: 'share-social-outline', label: 'REFERRAL PROGRAM', route: '/referrals' },
            { icon: 'analytics-outline', label: 'ANALYTICS', route: '/analytics' },
          ].map((item, i, arr) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} activeOpacity={0.7} onPress={() => router.push(item.route as any)} accessibilityRole="link" accessibilityLabel={`Open ${item.label}`}>
              <View style={styles.menuIcon}>
                <Ionicons name={item.icon as any} size={16} color={colors.textPrimary} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="arrow-forward-outline" size={16} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Support */}
        <Text style={styles.sectionTitle}>SUPPORT</Text>
        <View style={styles.menuContainer}>
          {[
            { icon: 'help-circle-outline', label: 'HELP CENTER', route: '/help-center' },
            { icon: 'chatbubble-ellipses-outline', label: 'CONTACT SUPPORT', route: '/contact-support' },
            { icon: 'document-text-outline', label: 'TERMS & PRIVACY', route: '/terms-privacy' },
          ].map((item, i, arr) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} activeOpacity={0.7} onPress={() => router.push(item.route as any)} accessibilityRole="link" accessibilityLabel={`Open ${item.label}`}>
              <View style={styles.menuIcon}>
                <Ionicons name={item.icon as any} size={16} color={colors.textPrimary} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="arrow-forward-outline" size={16} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.signOutSection}>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Sign out of your account">
            <Ionicons name="log-out-outline" size={18} color={colors.red} />
            <Text style={styles.signOutText}>SIGN OUT</Text>
          </TouchableOpacity>
        </View>

        {/* Delete Account */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Delete your account">
          <Ionicons name="trash-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.deleteText}>DELETE ACCOUNT</Text>
        </TouchableOpacity>

        <Text style={styles.version}>FITLINK SYSTEM V1.0 · BRUTALIST LUXURY EDITION</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 110 },
  
  header: {
    paddingTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: colors.textPrimary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.2,
    marginTop: 2,
  },

  profileCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  accentStrip: {
    height: 3,
    backgroundColor: colors.accent,
  },
  profileInfo: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: colors.textPrimary,
    letterSpacing: 0.5,
    marginTop: Spacing.xs,
    textTransform: 'uppercase',
  },
  specBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.xs,
    marginTop: 2,
  },
  profileSpec: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contactText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 0.2,
  },

  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editProfileText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: colors.textPrimary,
    letterSpacing: 1,
  },

  statsRow: {
    flexDirection: 'row',
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgPrimary,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  statLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1.2,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },

  bioCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  bioLabel: {
    fontFamily: FontFamily.heading,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  bioText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },

  sectionTitle: {
    fontFamily: FontFamily.heading,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  menuContainer: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 13,
    color: colors.textPrimary,
    letterSpacing: 0.8,
  },

  signOutSection: {
    marginTop: Spacing['2xl'],
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.red,
  },
  signOutText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 13,
    color: colors.red,
    letterSpacing: 1.2,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  deleteText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1.2,
  },
  version: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xl,
    letterSpacing: 1,
    opacity: 0.6,
  },
});
