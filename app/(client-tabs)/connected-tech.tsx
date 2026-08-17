import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { useHealth } from '../../context/HealthContext';
import { loginWithSpotify, getStoredToken, disconnectSpotify } from '../../lib/spotify';

// ─── PLATFORM COPY ───────────────────────────────────────
// iOS wearable data flows through Apple Health; Android through Health Connect.
const HEALTH_PLATFORM = Platform.select({ ios: 'Apple Health', default: 'Health Connect' });

// ─── BRAND SYNC GUIDES ───────────────────────────────────
// These are NOT connections FitLink can make or detect. Each wearable's own
// companion app writes into Apple Health / Health Connect, and FitLink reads
// from there. The tiles open an honest how-to sheet — nothing more.
// Icon tiles keep third-party brand colors (Fitbit teal, Garmin blue, …) —
// they identify the external service, not FitLink UI.
interface BrandGuide {
  id: string;
  name: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  /** Extra caveat shown under the steps, when honesty needs it. */
  note?: string;
}

const BRAND_GUIDES: BrandGuide[] = [
  {
    id: 'fitbit',
    name: 'Fitbit',
    icon: 'grid',
    iconBg: '#00B0B9',
    iconColor: '#FFFFFF',
    note: Platform.OS === 'ios'
      ? 'If the Fitbit app does not offer Apple Health sharing on your version, a third-party bridge app from the App Store may be needed.'
      : undefined,
  },
  {
    id: 'garmin',
    name: 'Garmin Connect™',
    icon: 'navigate-circle',
    iconBg: '#1A73E8',
    iconColor: '#FFFFFF',
  },
  {
    id: 'oura',
    name: 'Oura',
    icon: 'ellipse-outline',
    iconBg: '#1A1A2E',
    iconColor: '#00B4D8',
  },
  {
    id: 'whoop',
    name: 'Whoop',
    icon: 'pulse',
    iconBg: '#1A1A2E',
    iconColor: '#FFFFFF',
  },
];

function guideSteps(brandName: string): string[] {
  return [
    `Open the ${brandName} app on this phone and sign in.`,
    `In its settings, look for ${HEALTH_PLATFORM} — often under integrations, connected apps or health sharing — and turn on sharing.`,
    `Connect ${HEALTH_PLATFORM} in FitLink above. Your ${brandName} data will flow in automatically once it syncs.`,
  ];
}

// ─── HELPERS ─────────────────────────────────────────────
function formatSyncTime(date: Date): string {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today at ${time}` : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

// ─── COMPONENT ───────────────────────────────────────────
export default function ConnectedTechScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    isHealthAvailable,
    isConnected: isHealthConnected,
    isLoading: isHealthLoading,
    healthData,
    connectHealth,
    disconnectHealth,
  } = useHealth();
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [isSpotifyLoading, setIsSpotifyLoading] = useState(false);
  const [activeGuide, setActiveGuide] = useState<BrandGuide | null>(null);

  // Check Spotify status on mount
  useEffect(() => {
    getStoredToken().then(t => setIsSpotifyConnected(!!t));
  }, []);

  // Honest summary of what's actually syncing, from real snapshot data only.
  const syncingMetrics: string[] = [];
  if (healthData) {
    if (healthData.stepsToday > 0 || healthData.stepsWeekly.some(v => v > 0)) syncingMetrics.push('steps');
    if (healthData.heartRateLatest !== null || healthData.restingHeartRate !== null) syncingMetrics.push('heart rate');
    if (healthData.activeCaloriesToday > 0) syncingMetrics.push('calories');
    if (healthData.bloodOxygen !== null) syncingMetrics.push('blood oxygen');
    if (healthData.latestWeight !== null) syncingMetrics.push('weight');
  }

  const healthStatusLine = !isHealthAvailable
    ? `Requires the full app build. ${HEALTH_PLATFORM} is not available in this preview version of FitLink.`
    : isHealthConnected
      ? healthData?.lastSynced
        ? syncingMetrics.length > 0
          ? `Syncing ${syncingMetrics.join(', ')}. Last synced ${formatSyncTime(healthData.lastSynced)}.`
          : `Connected. No data found yet — last checked ${formatSyncTime(healthData.lastSynced)}.`
        : 'Connected. Waiting for the first sync.'
      : `Sync steps, heart rate, calories and more from ${HEALTH_PLATFORM} into your Activity section.`;

  const handleConnectHealth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    connectHealth();
  };

  const handleDisconnectHealth = () => {
    Alert.alert(
      `Disconnect ${HEALTH_PLATFORM}`,
      `This will stop syncing your health data from ${HEALTH_PLATFORM}. You can reconnect at any time.`,
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
  };

  const handleSpotifyConnect = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
  };

  const handleSpotifyDisconnect = () => {
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
  };

  const handleOpenGuide = (guide: BrandGuide) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveGuide(guide);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Back button */}
      <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }} style={s.backBtn} onPress={() => router.push(ClientRoute.myProfile)} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Go back to profile">
        <Ionicons name="chevron-back" size={31} color={CoachColors.textPrimary} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>

        {/* ── BANNER ── */}
        <TouchableOpacity style={s.banner} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Book a fitness assessment">
          <Text style={s.bannerText}>
            It all begins with a complimentary fitness assessment. Book your session.
          </Text>
          <Ionicons name="chevron-forward" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>

        {/* ── TITLE ── */}
        <Text style={s.title} accessibilityRole="header">Connected tech</Text>

        {/* ── HEALTH DATA SECTION ── */}
        <Text style={s.sectionLabel}>Health data</Text>
        <View style={s.sectionDivider} />

        {/* Health platform card — the one real connection on this screen */}
        <View style={s.deviceCard}>
          <View style={s.deviceHeader}>
            <View style={[s.deviceIcon, { backgroundColor: Platform.OS === 'ios' ? '#FFFFFF' : '#E8F0FE' }]}>
              <Ionicons name="heart" size={25} color={Platform.OS === 'ios' ? '#FF2D55' : '#1A73E8'} />
            </View>
            <Text style={s.deviceName}>{HEALTH_PLATFORM}</Text>
            <View style={{ flex: 1 }} />
            {isHealthLoading ? (
              <View style={s.connectBtn}>
                <ActivityIndicator size="small" color={CoachColors.accent} />
                <Text style={[s.connectText, { color: CoachColors.accent }]}>Connecting…</Text>
              </View>
            ) : !isHealthAvailable ? (
              <View style={s.unavailableBadge} accessibilityLabel={`${HEALTH_PLATFORM} requires the full app build`}>
                <Ionicons name="construct-outline" size={18} color={CoachColors.textMuted} />
                <Text style={s.unavailableText}>Full build only</Text>
              </View>
            ) : isHealthConnected ? (
              <TouchableOpacity
                style={s.connectedBtn}
                onPress={handleDisconnectHealth}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Disconnect ${HEALTH_PLATFORM}`}
              >
                <Ionicons name="checkmark-circle" size={22} color={CoachColors.accent} />
                <Text style={s.connectedText}>Connected</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={s.connectBtn}
                onPress={handleConnectHealth}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={`Connect ${HEALTH_PLATFORM}`}
              >
                <Ionicons name="add-circle-outline" size={22} color={CoachColors.textPrimary} />
                <Text style={s.connectText}>Connect</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.deviceDesc}>{healthStatusLine}</Text>
        </View>

        <View style={s.deviceDivider} />

        {/* Spotify — real PKCE OAuth connection */}
        <View style={s.deviceCard}>
          <View style={s.deviceHeader}>
            <View style={[s.deviceIcon, { backgroundColor: '#1DB954' }]}>
              <Ionicons name="play-circle" size={25} color="#FFFFFF" />
            </View>
            <Text style={s.deviceName}>Spotify</Text>
            <View style={{ flex: 1 }} />
            {isSpotifyLoading ? (
              <View style={s.connectBtn}>
                <ActivityIndicator size="small" color={CoachColors.accent} />
                <Text style={[s.connectText, { color: CoachColors.accent }]}>Connecting…</Text>
              </View>
            ) : isSpotifyConnected ? (
              <TouchableOpacity
                style={s.connectedBtn}
                onPress={handleSpotifyDisconnect}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Disconnect Spotify"
              >
                <Ionicons name="checkmark-circle" size={22} color={CoachColors.accent} />
                <Text style={s.connectedText}>Connected</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={s.connectBtn}
                onPress={handleSpotifyConnect}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Connect Spotify"
              >
                <Ionicons name="add-circle-outline" size={22} color={CoachColors.textPrimary} />
                <Text style={s.connectText}>Connect</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.deviceDesc}>
            Connect your Spotify account to control music playback during active gym check-ins.
          </Text>
        </View>

        {/* ── WEARABLES SECTION ── */}
        <Text style={[s.sectionLabel, s.sectionLabelSpaced]}>Wearables</Text>
        <View style={s.sectionDivider} />
        <Text style={s.sectionHint}>
          Fitbit, Garmin, Oura and Whoop sync through {HEALTH_PLATFORM}. Enable sharing in each brand's own app, then connect {HEALTH_PLATFORM} above — no separate FitLink connection needed.
        </Text>

        {BRAND_GUIDES.map((guide, index) => (
          <View key={guide.id}>
            <TouchableOpacity
              style={s.deviceCard}
              onPress={() => handleOpenGuide(guide)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`How to sync ${guide.name} through ${HEALTH_PLATFORM}`}
            >
              <View style={s.deviceHeader}>
                <View style={[s.deviceIcon, { backgroundColor: guide.iconBg }]}>
                  <Ionicons name={guide.icon as any} size={25} color={guide.iconColor} />
                </View>
                <Text style={s.deviceName}>{guide.name}</Text>
                <View style={{ flex: 1 }} />
                <View style={s.guideBtn}>
                  <Text style={s.connectText}>Sync guide</Text>
                  <Ionicons name="chevron-forward" size={18} color={CoachColors.textMuted} />
                </View>
              </View>
              <Text style={s.deviceDesc}>
                Your {guide.name} data flows through {HEALTH_PLATFORM}.
              </Text>
            </TouchableOpacity>
            {index < BRAND_GUIDES.length - 1 && <View style={s.deviceDivider} />}
          </View>
        ))}

      </ScrollView>

      {/* ── SYNC GUIDE SHEET ── */}
      <Modal
        visible={!!activeGuide}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveGuide(null)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            {/* Drag handle */}
            <View style={s.dragHandle} />

            {/* Header */}
            <Text style={s.modalHeaderText}>Sync guide</Text>
            <View style={s.modalDividerTop} />

            {/* Icons row: Device → Health platform → FitLink */}
            <View style={s.modalIconsRow}>
              {activeGuide && (
                <View style={[s.modalDeviceIcon, { backgroundColor: activeGuide.iconBg }]}>
                  <Ionicons name={activeGuide.icon as any} size={29} color={activeGuide.iconColor} />
                </View>
              )}
              <Ionicons name="arrow-forward" size={22} color={CoachColors.textMuted} />
              <View style={[s.modalDeviceIcon, { backgroundColor: Platform.OS === 'ios' ? '#FFFFFF' : '#E8F0FE' }]}>
                <Ionicons name="heart" size={29} color={Platform.OS === 'ios' ? '#FF2D55' : '#1A73E8'} />
              </View>
              <Ionicons name="arrow-forward" size={22} color={CoachColors.textMuted} />
              <View style={s.modalAppIcon}>
                <Text style={s.modalAppText}>FL+</Text>
              </View>
            </View>

            {/* Title */}
            <Text style={s.modalTitle}>Sync {activeGuide?.name}</Text>
            <Text style={s.modalSubtitle}>
              FitLink doesn't connect to {activeGuide?.name} directly. Your {activeGuide?.name} data flows through {HEALTH_PLATFORM}, so once sharing is on, everything arrives automatically.
            </Text>

            <View style={s.modalDivider} />

            {/* Steps */}
            <View style={s.stepList}>
              {activeGuide && guideSteps(activeGuide.name).map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <View style={s.stepBadge}>
                    <Text style={s.stepBadgeText}>{i + 1}</Text>
                  </View>
                  <Text style={s.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            {/* Brand-specific caveat */}
            {activeGuide?.note && (
              <Text style={s.modalNote}>{activeGuide.note}</Text>
            )}

            {/* Honesty note: we can't detect which watch feeds the platform */}
            <Text style={s.modalPrivacy}>
              FitLink can't detect which device feeds {HEALTH_PLATFORM}, so this screen won't show a per-device connected status.
            </Text>

            {/* Close button */}
            <TouchableOpacity
              style={s.continueBtn}
              onPress={() => setActiveGuide(null)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Close sync guide"
            >
              <Text style={s.continueBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
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
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    lineHeight: 24.5,
  },

  // Title
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 31.5,
    color: CoachColors.textPrimary,
    paddingHorizontal: 24,
    marginBottom: 28,
  },

  // Section
  sectionLabel: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  sectionLabelSpaced: {
    marginTop: 32,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.border,
    marginHorizontal: 24,
    marginBottom: 8,
  },
  sectionHint: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    lineHeight: 22.5,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
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
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 19,
    color: CoachColors.textPrimary,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectText: {
    fontFamily: CoachFonts.body,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  connectedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectedText: {
    fontFamily: CoachFonts.body,
    fontSize: 17,
    color: CoachColors.accent,
  },
  guideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unavailableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unavailableText: {
    fontFamily: CoachFonts.body,
    fontSize: 17,
    color: CoachColors.textMuted,
  },
  deviceDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    marginTop: 14,
    lineHeight: 22.5,
  },
  deviceDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: 24,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    backgroundColor: CoachColors.surface,
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
    backgroundColor: CoachColors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  modalHeaderText: {
    fontFamily: CoachFonts.body,
    fontSize: 17,
    color: CoachColors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalDividerTop: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.border,
    marginBottom: 28,
  },

  // Icons row
  modalIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  modalAppIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: CoachColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  modalAppText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
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
    fontFamily: CoachFonts.headingBold,
    fontSize: 24.5,
    color: CoachColors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    lineHeight: 22.5,
    marginBottom: 24,
  },
  modalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.border,
    marginBottom: 24,
  },

  // Steps
  stepList: {
    gap: 16,
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
  stepText: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    lineHeight: 22.5,
  },
  modalNote: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
    lineHeight: 21.5,
    marginBottom: 16,
  },

  // Honesty note
  modalPrivacy: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
    lineHeight: 21.5,
    marginBottom: 28,
  },

  // Close button
  continueBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 18,
    color: CoachColors.onAccent,
  },
});
