import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../constants/theme';
import { ClientRoute } from '../../types/routes';
import { useHealth } from '../../context/HealthContext';
import { loginWithSpotify, getStoredToken, disconnectSpotify } from '../../lib/spotify';

// ─── DEVICE DATA ─────────────────────────────────────────
interface Device {
  id: string;
  name: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  description: string;
}

const DEVICES: Device[] = [
  {
    id: 'spotify',
    name: 'Spotify',
    icon: 'play-circle',
    iconBg: '#1DB954',
    iconColor: '#FFFFFF',
    description: 'Connect your Spotify account to control music playback during active gym check-ins.',
  },
  {
    id: 'apple-health',
    name: 'Apple Health',
    icon: 'heart',
    iconBg: '#FFFFFF',
    iconColor: '#FF2D55',
    description: 'Connect your Apple Health device to sync your metrics into our Activity section.',
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    icon: 'grid',
    iconBg: '#00B0B9',
    iconColor: '#FFFFFF',
    description: 'Connect your Fitbit device to sync your metrics into our Activity section.',
  },
  {
    id: 'garmin',
    name: 'Garmin Connect™',
    icon: 'navigate-circle',
    iconBg: '#1A73E8',
    iconColor: '#FFFFFF',
    description: 'Connect your Garmin device to sync your metrics into our Activity section.',
  },
  {
    id: 'oura',
    name: 'Oura',
    icon: 'ellipse-outline',
    iconBg: '#1A1A2E',
    iconColor: '#00B4D8',
    description: 'Connect your Oura device to sync your metrics into our Activity section.',
  },
  {
    id: 'whoop',
    name: 'Whoop',
    icon: 'pulse',
    iconBg: '#1A1A2E',
    iconColor: '#FFFFFF',
    description: 'Connect your Whoop device to sync your metrics into our Activity section.',
  },
];

// ─── COMPONENT ───────────────────────────────────────────
export default function ConnectedTechScreen() {
  const router = useRouter();
  const { isConnected: isAppleHealthConnected, isLoading: isAppleHealthLoading, connectHealth, disconnectHealth } = useHealth();
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [isSpotifyLoading, setIsSpotifyLoading] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState<Set<string>>(new Set());
  const [connectingDevice, setConnectingDevice] = useState<Device | null>(null);

  // Check Spotify status on mount
  useEffect(() => {
    getStoredToken().then(t => setIsSpotifyConnected(!!t));
  }, []);

  const handleConnect = async (device: Device) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Spotify OAuth flow
    if (device.id === 'spotify') {
      setIsSpotifyLoading(true);
      try {
        const success = await loginWithSpotify();
        if (success) {
          setIsSpotifyConnected(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (e) {
        console.log('[ConnectedTech] Spotify login error:', e);
      } finally {
        setIsSpotifyLoading(false);
      }
      return;
    }

    // Apple Health uses native HealthKit — bypass the Terra modal
    if (device.id === 'apple-health') {
      connectHealth();
      return;
    }

    // All other devices use the Terra modal flow
    setConnectingDevice(device);
  };

  const handleConfirmConnect = () => {
    if (!connectingDevice) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setConnectedDevices(prev => new Set([...prev, connectingDevice.id]));
    setConnectingDevice(null);
  };

  const handleDisconnect = (deviceId: string) => {
    // Spotify disconnect
    if (deviceId === 'spotify') {
      Alert.alert(
        'Disconnect Spotify',
        'This will disconnect Spotify music playback controls. You can reconnect at any time.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              await disconnectSpotify();
              setIsSpotifyConnected(false);
            },
          },
        ]
      );
      return;
    }

    // Apple Health uses native disconnect with confirmation
    if (deviceId === 'apple-health') {
      Alert.alert(
        'Disconnect Apple Health',
        'This will stop syncing your health data from Apple Health. You can reconnect at any time.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              disconnectHealth();
            },
          },
        ]
      );
      return;
    }

    // Other devices use local state
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setConnectedDevices(prev => {
      const next = new Set(prev);
      next.delete(deviceId);
      return next;
    });
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Back button */}
      <TouchableOpacity style={s.backBtn} onPress={() => router.push(ClientRoute.myProfile)} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Go back to profile">
        <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── BANNER ── */}
        <TouchableOpacity style={s.banner} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Book a fitness assessment">
          <Text style={s.bannerText}>
            It all begins with a complimentary fitness assessment. Book your session.
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {/* ── TITLE ── */}
        <Text style={s.title} accessibilityRole="header">Connected Tech</Text>

        {/* ── AVAILABLE SECTION ── */}
        <Text style={s.sectionLabel}>Available</Text>
        <View style={s.sectionDivider} />

        {/* ── DEVICE LIST ── */}
        {DEVICES.map((device, index) => {
          // Apple Health state is driven by HealthContext; others by local mock state
          const isConnected = device.id === 'spotify'
            ? isSpotifyConnected
            : device.id === 'apple-health'
            ? isAppleHealthConnected
            : connectedDevices.has(device.id);
          const isThisLoading =
            (device.id === 'spotify' && isSpotifyLoading) ||
            (device.id === 'apple-health' && isAppleHealthLoading);

          return (
            <View key={device.id}>
              <View style={s.deviceCard}>
                {/* Device header row */}
                <View style={s.deviceHeader}>
                  <View style={[s.deviceIcon, { backgroundColor: device.iconBg }]}>  
                    <Ionicons name={device.icon as any} size={22} color={device.iconColor} />
                  </View>
                  <Text style={s.deviceName}>{device.name}</Text>
                  <View style={{ flex: 1 }} />
                  {isThisLoading ? (
                    <View style={s.connectBtn}>
                      <ActivityIndicator size="small" color="#FFD700" />
                      <Text style={[s.connectText, { color: '#FFD700' }]}>Connecting…</Text>
                    </View>
                  ) : isConnected ? (
                    <TouchableOpacity
                      style={s.connectedBtn}
                      onPress={() => handleDisconnect(device.id)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Disconnect ${device.name}`}
                    >
                      <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                      <Text style={s.connectedText}>Connected</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={s.connectBtn}
                      onPress={() => handleConnect(device)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`Connect ${device.name}`}
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                      <Text style={s.connectText}>Connect</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Description */}
                <Text style={s.deviceDesc}>{device.description}</Text>
              </View>

              {/* Divider between devices */}
              {index < DEVICES.length - 1 && <View style={s.deviceDivider} />}
            </View>
          );
        })}

      </ScrollView>

      {/* ── CONNECT MODAL (Bottom Sheet) ── */}
      <Modal
        visible={!!connectingDevice}
        transparent
        animationType="slide"
        onRequestClose={() => setConnectingDevice(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {/* Drag handle */}
            <View style={s.dragHandle} />

            {/* Header */}
            <Text style={s.modalHeaderText}>Connect</Text>
            <View style={s.modalDividerTop} />

            {/* Icons row: FitLink ↔ Device */}
            <View style={s.modalIconsRow}>
              <View style={s.modalAppIcon}>
                <Text style={s.modalAppText}>FL+</Text>
              </View>
              <Ionicons name="swap-horizontal" size={24} color="rgba(255,255,255,0.4)" />
              {connectingDevice && (
                <View style={[s.modalDeviceIcon, { backgroundColor: connectingDevice.iconBg }]}>
                  <Ionicons name={connectingDevice.icon as any} size={26} color={connectingDevice.iconColor} />
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={s.modalTitle}>Connect {connectingDevice?.name}</Text>
            <Text style={s.modalSubtitle}>{connectingDevice?.description}</Text>

            <View style={s.modalDivider} />

            {/* Partnership info */}
            <Text style={s.modalPartnerText}>
              We partner with Terra to securely connect your devices to receive your wearable data.
            </Text>

            {/* Bullet points */}
            <View style={s.bulletList}>
              <BulletPoint
                icon="lock-closed-outline"
                text="Secure & anonymous handling with end-to-end encryption"
              />
              <BulletPoint
                icon="shield-checkmark-outline"
                text="Privacy first–review permissions before granting Terra access"
              />
              <BulletPoint
                icon="pulse-outline"
                text="You're providing access to health metrics including heart rate, steps, activities and others."
              />
              <BulletPoint
                icon="git-compare-outline"
                text="When syncing multiple devices to FitLink, please be mindful that if you also connect Apple Health, you may receive duplicate metrics."
              />
            </View>

            {/* Privacy links */}
            <Text style={s.modalPrivacy}>
              By continuing you agree to the <Text style={s.modalLink}>Terra</Text> and <Text style={s.modalLink}>FitLink</Text> Privacy Policies.
            </Text>

            {/* Continue button */}
            <TouchableOpacity style={s.continueBtn} onPress={handleConfirmConnect} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Continue connecting ${connectingDevice?.name}`}>
              <Text style={s.continueBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── BULLET POINT SUBCOMPONENT ───────────────────────────
function BulletPoint({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.bulletRow}>
      <Ionicons name={icon as any} size={18} color="rgba(255,255,255,0.5)" style={{ marginTop: 2 }} />
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  scroll: {
    paddingBottom: 100,
  },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 12,
  },
  bannerText: {
    flex: 1,
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
  },

  // Title
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: '#FFFFFF',
    paddingHorizontal: 24,
    marginBottom: 28,
  },

  // Section
  sectionLabel: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 24,
    marginBottom: 8,
  },

  // Device card
  deviceCard: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  deviceName: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 17,
    color: '#FFFFFF',
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: '#FFFFFF',
  },
  connectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: '#4CAF50',
  },
  deviceDesc: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 14,
    lineHeight: 20,
  },
  deviceDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 24,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  modalHeaderText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalDividerTop: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 28,
  },

  // Icons row
  modalIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  modalAppIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalAppText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  modalDeviceIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal content
  modalTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 24,
  },
  modalPartnerText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 20,
  },

  // Bullets
  bulletList: {
    gap: 16,
    marginBottom: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  bulletText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 20,
  },

  // Privacy
  modalPrivacy: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 19,
    marginBottom: 28,
  },
  modalLink: {
    textDecorationLine: 'underline',
    color: '#FFFFFF',
  },

  // Continue button
  continueBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 16,
    color: '#000000',
  },
});
