import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { trainer, activeClients, sessions, totalReferrals, updateTrainer } = useApp();
  const [uploading, setUploading] = useState(false);

  const name = trainer?.name || user?.user_metadata?.name || 'Trainer';
  const email = user?.email || trainer?.email;
  const phone = user?.phone || trainer?.phone;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;

  const handlePickImage = async () => {
    Alert.alert('Profile Photo', 'Choose how to update your photo', [
      {
        text: 'Take Photo',
        onPress: () => launchPicker('camera'),
      },
      {
        text: 'Choose from Library',
        onPress: () => launchPicker('library'),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    // Request permissions
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to choose a photo.');
        return;
      }
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
    if (!asset.base64) {
      Alert.alert('Error', 'Could not read image data. Please try again.');
      return;
    }
    await uploadAvatar(asset.base64, asset.uri);
  };

  const uploadAvatar = async (base64: string, uri: string) => {
    if (!user) return;
    setUploading(true);

    try {
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}/avatar.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

      // Decode base64 → ArrayBuffer and upload
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, decode(base64), {
          contentType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Save to trainer profile
      await updateTrainer({ avatar_url: avatarUrl });
    } catch (err: any) {
      console.error('Upload failed:', err);
      Alert.alert('Upload Failed', err.message || 'Could not upload photo. Please try again.');
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Profile</Text>

        {/* Profile Hero */}
        <Card style={styles.profileCard}>
          <View style={styles.accentStrip} />
          <View style={styles.profileInfo}>
            {/* Tappable Avatar with Camera Overlay */}
            <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8} style={styles.avatarWrapper}>
              <Avatar name={name} size="xl" imageUrl={trainer?.avatar_url} />
              <View style={styles.cameraOverlay}>
                {uploading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Ionicons name="camera" size={14} color={Colors.white} />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.profileName}>{name}</Text>
            {trainer?.specialization && (
              <Text style={styles.profileSpec}>{trainer.specialization}</Text>
            )}
            <View style={styles.contactRow}>
              {email && (
                <View style={styles.contactItem}>
                  <Ionicons name="mail-outline" size={12} color={Colors.textTertiary} />
                  <Text style={styles.contactText}>{email}</Text>
                </View>
              )}
              {phone && (
                <View style={styles.contactItem}>
                  <Ionicons name="call-outline" size={12} color={Colors.textTertiary} />
                  <Text style={styles.contactText}>{phone}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Edit Profile Button */}
          <TouchableOpacity style={styles.editProfileBtn} onPress={() => router.push('/settings' as any)}>
            <Ionicons name="create-outline" size={16} color={Colors.accent} />
            <Text style={styles.editProfileText}>Edit Profile</Text>
          </TouchableOpacity>

          {/* Stats Row */}
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
            { icon: 'settings', label: 'Settings', color: Colors.textSecondary, route: '/settings' },
            { icon: 'trophy', label: 'Certifications', color: Colors.yellow, route: '/certifications' },
            { icon: 'barbell', label: 'Specializations', color: Colors.blue, route: '/specializations' },
          ].map((item, i, arr) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} activeOpacity={0.7} onPress={() => router.push(item.route as any)}>
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </Card>

        {/* Business */}
        <Text style={styles.sectionTitle}>Business</Text>
        <Card noPadding>
          {[
            { icon: 'card', label: 'Subscription Plans', color: Colors.green, route: '/subscriptions' },
            { icon: 'share-social', label: 'Referral Program', color: Colors.purple, route: '/referrals' },
            { icon: 'analytics', label: 'Analytics', color: Colors.accent, route: '/analytics' },
          ].map((item, i, arr) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} activeOpacity={0.7} onPress={() => router.push(item.route as any)}>
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          ))}
        </Card>

        {/* Support */}
        <Text style={styles.sectionTitle}>Support</Text>
        <Card noPadding>
          {[
            { icon: 'help-circle', label: 'Help Center', color: '#30D5C8', route: '/help-center' },
            { icon: 'chatbubble-ellipses', label: 'Contact Support', color: Colors.blue, route: '/contact-support' },
            { icon: 'document-text', label: 'Terms & Privacy', color: Colors.textTertiary, route: '/terms-privacy' },
          ].map((item, i, arr) => (
            <TouchableOpacity key={i} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} activeOpacity={0.7} onPress={() => router.push(item.route as any)}>
              <View style={[styles.menuIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} style={{ marginLeft: 'auto' }} />
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
            icon={<Ionicons name="log-out-outline" size={18} color={Colors.red} />}
          />
        </View>

        <Text style={styles.version}>FitLink v1.0.0 · Made with 💪</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  title: {
    fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'],
    color: Colors.textPrimary, letterSpacing: -0.5, paddingTop: Spacing.md, marginBottom: Spacing.lg,
  },

  profileCard: { overflow: 'hidden', marginBottom: Spacing.lg },
  accentStrip: { position: 'absolute', top: 0, left: 0, right: 0, height: 70, backgroundColor: 'rgba(255,95,59,0.06)' },
  profileInfo: { alignItems: 'center', paddingTop: Spacing['2xl'], gap: Spacing.xs },
  avatarWrapper: { position: 'relative' },
  cameraOverlay: {
    position: 'absolute', bottom: 0, right: -2,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.white,
  },
  profileName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: Colors.textPrimary, marginTop: Spacing.sm },
  profileSpec: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.accentText },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.sm },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },

  statsRow: {
    flexDirection: 'row', marginTop: Spacing.xl, paddingTop: Spacing.lg,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: Colors.textPrimary },
  statLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },

  editProfileBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: Spacing.lg, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: Colors.accentSoft },
  editProfileText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.accent },

  bioCard: { marginBottom: Spacing.lg },
  bioLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary, letterSpacing: 0.5, marginBottom: Spacing.xs },
  bioText: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textSecondary, lineHeight: 20 },

  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.textTertiary,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.sm, marginTop: Spacing.md,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  menuIcon: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: Colors.textPrimary },

  signOutSection: { marginTop: Spacing['2xl'] },
  version: {
    fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary,
    textAlign: 'center', marginTop: Spacing.xl, opacity: 0.5,
  },
});
