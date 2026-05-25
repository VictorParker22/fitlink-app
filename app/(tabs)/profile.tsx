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
import Card from '../../components/Card';
import Button from '../../components/Button';
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
        <Text style={styles.title}>Profile</Text>

        {/* Profile Hero */}
        <Card style={styles.profileCard}>
          <View style={styles.accentStrip} />
          <View style={styles.profileInfo}>
            <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8} style={styles.avatarWrapper}>
              <Avatar name={name} size="xl" imageUrl={trainer?.avatar_url} />
              <View style={styles.cameraOverlay}>
                {uploading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="camera" size={14} color="#FFFFFF" />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.profileName}>{name}</Text>
            {trainer?.specialization && <Text style={styles.profileSpec}>{trainer.specialization}</Text>}
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

          <TouchableOpacity style={styles.editProfileBtn} onPress={() => router.push('/settings' as any)}>
            <Ionicons name="create-outline" size={16} color={colors.accent} />
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </TouchableOpacity>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{activeClients.length}</Text>
              <Text style={styles.statLabel}>Clients</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{completedSessions}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{totalReferrals}</Text>
              <Text style={styles.statLabel}>Referrals</Text>
            </View>
          </View>
        </Card>

        {/* Bio */}
        {trainer?.bio && (
          <Card style={styles.bioCard}>
            <Text style={styles.bioLabel}>About</Text>
            <Text style={styles.bioText}>{trainer.bio}</Text>
          </Card>
        )}

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <Card noPadding>
          {[
            { icon: 'settings', label: 'Settings', color: colors.textSecondary, route: '/settings' },
            { icon: 'trophy', label: 'Certifications', color: colors.yellow, route: '/certifications' },
            { icon: 'barbell', label: 'Specializations', color: colors.blue, route: '/specializations' },
          ].map((item, i, arr) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} activeOpacity={0.7} onPress={() => router.push(item.route as any)}>
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </Card>

        {/* Business */}
        <Text style={styles.sectionTitle}>Business</Text>
        <Card noPadding>
          {[
            { icon: 'card', label: 'Subscription Plans', color: colors.green, route: '/subscriptions' },
            { icon: 'share-social', label: 'Referral Program', color: colors.purple, route: '/referrals' },
            { icon: 'analytics', label: 'Analytics', color: colors.accent, route: '/analytics' },
          ].map((item, i, arr) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} activeOpacity={0.7} onPress={() => router.push(item.route as any)}>
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </Card>

        {/* Support */}
        <Text style={styles.sectionTitle}>Support</Text>
        <Card noPadding>
          {[
            { icon: 'help-circle', label: 'Help Center', color: '#30D5C8', route: '/help-center' },
            { icon: 'chatbubble-ellipses', label: 'Contact Support', color: colors.blue, route: '/contact-support' },
            { icon: 'document-text', label: 'Terms & Privacy', color: colors.textTertiary, route: '/terms-privacy' },
          ].map((item, i, arr) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} activeOpacity={0.7} onPress={() => router.push(item.route as any)}>
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </Card>

        {/* Sign Out */}
        <View style={styles.signOutSection}>
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="danger"
            full
            icon={<Ionicons name="log-out-outline" size={18} color={colors.red} />}
          />
        </View>

        {/* Delete Account */}
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.deleteText}>Delete Account</Text>
        </TouchableOpacity>

        <Text style={styles.version}>FitLink v1.0.0 · Made with 💪</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  title: {
    fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'],
    color: colors.textPrimary, letterSpacing: -0.5, paddingTop: Spacing.md, marginBottom: Spacing.lg,
  },

  profileCard: { overflow: 'hidden', marginBottom: Spacing.lg },
  accentStrip: { position: 'absolute', top: 0, left: 0, right: 0, height: 70, backgroundColor: `${colors.accent}10` },
  profileInfo: { alignItems: 'center', paddingTop: Spacing['2xl'], gap: Spacing.xs },
  avatarWrapper: { position: 'relative' },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bgCard,
  },
  profileName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: colors.textPrimary, marginTop: Spacing.sm },
  profileSpec: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.accentText },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.sm },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },

  statsRow: {
    flexDirection: 'row', marginTop: Spacing.xl, paddingTop: Spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: colors.textPrimary },
  statLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },

  editProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.lg, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: colors.accentSoft },
  editProfileText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.accent },

  bioCard: { marginBottom: Spacing.lg },
  bioLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, letterSpacing: 0.5, marginBottom: Spacing.xs },
  bioText: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textSecondary, lineHeight: 20 },

  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.md,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: colors.textPrimary },

  signOutSection: { marginTop: Spacing['2xl'] },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.xl, paddingVertical: Spacing.md },
  deleteText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, textDecorationLine: 'underline' },
  version: {
    fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary,
    textAlign: 'center', marginTop: Spacing.lg, opacity: 0.5,
  },
});
