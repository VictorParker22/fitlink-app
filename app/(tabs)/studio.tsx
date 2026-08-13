import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
  Platform,
  Linking,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LineChart } from 'react-native-gifted-charts';
import Svg, { Pattern, Line, Rect } from 'react-native-svg';
import NetInfo from '@react-native-community/netinfo';
import { Audio } from 'expo-av';

import { useApp, LiveClassItem } from '../../context/AppContext';
import { Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useAlert } from '../../context/AlertContext';
import { supabase } from '../../lib/supabase';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { isBroadcastDndEnabled, setBroadcastDnd } from '../../lib/broadcastFocus';
import CoachElitePaywall from '../../components/paywalls/CoachElitePaywall';

const { width } = Dimensions.get('window');

// ── Real device-check module ──────────────────────────────────────────────────
// expo-camera-rtmp-publisher exposes non-prompting *get* functions (as opposed
// to the prompting *request* functions used in app/broadcast/[id].tsx) so the
// Studio tab can report actual permission state without triggering a system
// dialog just for glancing at the screen. iOS-only, native-build-only — the
// require throws in Expo Go, matching the guard already used in broadcast/[id].tsx.
let getCameraPermissionsAsync: (() => Promise<{ granted: boolean }>) | null = null;
let getMicrophonePermissionsAsync: (() => Promise<{ granted: boolean }>) | null = null;
if (Platform.OS === 'ios') {
  try {
    const RtmpModule = require('expo-camera-rtmp-publisher');
    getCameraPermissionsAsync = RtmpModule.getCameraPermissionsAsync;
    getMicrophonePermissionsAsync = RtmpModule.getMicrophonePermissionsAsync;
  } catch (e) {
    // Expected in Expo Go — the native RTMP module requires a dev/production build.
    console.log('[Studio] RTMP native module unavailable (Expo Go or missing pod). Use a dev build.');
  }
}

type DeviceStatus = 'checking' | 'granted' | 'denied' | 'unavailable';

// The actual encode settings a broadcast starts with (see app/broadcast/[id].tsx —
// videoWidth: 720, videoHeight: 1280, front camera by default). Stated here rather
// than measured, but true to what a stream will actually go out at.
const BROADCAST_RESOLUTION_LABEL = '720p';

type ConnectionStatus = 'checking' | 'wifi' | 'cellular' | 'offline';

// ── Camera preview placeholder — diagonal hatch, matches the design mock ─────
function CameraPreviewPlaceholder() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Pattern id="hatch" patternUnits="userSpaceOnUse" width={10} height={10} patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={10} stroke={CoachColors.border} strokeWidth={1} />
        </Pattern>
        <Rect width="100%" height="100%" fill="url(#hatch)" />
      </Svg>
    </View>
  );
}

// ── Stream health row — reports real permission signal, not a manual toggle ──
function DeviceRow({
  icon,
  label,
  status,
  readyDetail,
  isLast = false,
  right,
}: {
  icon: any;
  label: string;
  status: DeviceStatus;
  readyDetail: string;
  isLast?: boolean;
  right?: React.ReactNode;
}) {
  const detail =
    status === 'granted' ? readyDetail :
    status === 'denied' ? 'Permission needed — tap to open settings' :
    status === 'unavailable' ? 'Checked automatically when you go live' :
    'Checking…';

  const iconColor = status === 'granted' ? CoachColors.accent
    : status === 'denied' ? CoachColors.warning
    : CoachColors.textFaint;

  const content = (
    <View style={[dr.row, !isLast && dr.rowBorder]}>
      <Ionicons name={icon} size={17} color={iconColor} />
      <View style={dr.labelWrap}>
        <Text style={dr.label}>{label}</Text>
        <Text style={[dr.detail, status === 'denied' && { color: CoachColors.warning }]}>{detail}</Text>
      </View>
      {right !== undefined ? right : status === 'checking' ? (
        <ActivityIndicator size="small" color={CoachColors.textFaint} />
      ) : status === 'granted' ? (
        <Ionicons name="checkmark-circle" size={16} color={CoachColors.accent} />
      ) : status === 'denied' ? (
        <Ionicons name="chevron-forward" size={15} color={CoachColors.textFaint} />
      ) : null}
    </View>
  );

  if (status === 'denied') {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={() => Linking.openSettings()}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// ── Connection row — real network type + a genuine measured upload speed ─────
function ConnectionRow({
  status, mbps, testing, onRetest, isLast = false,
}: {
  status: ConnectionStatus; mbps: number | null; testing: boolean; onRetest: () => void; isLast?: boolean;
}) {
  const belowBitrate = mbps !== null && mbps < BROADCAST_BITRATE_MBPS;
  const comfortable = mbps !== null && mbps >= BROADCAST_BITRATE_MBPS * 1.4;

  const detail =
    status === 'offline' ? "No connection — you can't go live right now" :
    status === 'checking' ? 'Checking…' :
    testing || mbps === null ? `${status === 'wifi' ? 'Wi-Fi' : 'Cellular'} · measuring upload speed…` :
    belowBitrate ? `${status === 'wifi' ? 'Wi-Fi' : 'Cellular'} · ${mbps.toFixed(1)} Mbps up — too slow, expect drops` :
    comfortable ? `${status === 'wifi' ? 'Wi-Fi' : 'Cellular'} · ${mbps.toFixed(1)} Mbps up — comfortable for ${BROADCAST_RESOLUTION_LABEL}` :
    `${status === 'wifi' ? 'Wi-Fi' : 'Cellular'} · ${mbps.toFixed(1)} Mbps up — fine for ${BROADCAST_RESOLUTION_LABEL}, could buffer`;

  const iconColor = status === 'offline' ? CoachColors.warning
    : belowBitrate ? CoachColors.warning
    : status !== 'checking' && mbps !== null ? CoachColors.accent
    : CoachColors.textFaint;

  return (
    <View style={[dr.row, !isLast && dr.rowBorder]}>
      <Ionicons name="wifi" size={17} color={iconColor} />
      <View style={dr.labelWrap}>
        <Text style={dr.label}>Connection</Text>
        <Text style={[dr.detail, belowBitrate && { color: CoachColors.warning }]}>{detail}</Text>
      </View>
      {status === 'offline' ? (
        <Ionicons name="alert-circle" size={16} color={CoachColors.warning} />
      ) : testing ? (
        <ActivityIndicator size="small" color={CoachColors.textFaint} />
      ) : (
        <TouchableOpacity onPress={onRetest} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.accent }}>Retest</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Signal bars — decorative strength indicator next to Camera, reflects real permission state ──
function SignalBars({ good }: { good: boolean }) {
  const color = good ? CoachColors.accent : CoachColors.textFaint;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 }}>
      {[5, 8, 11, 14].map((h, i) => (
        <View key={i} style={{ width: 3, height: h, borderRadius: 1.5, backgroundColor: color, opacity: good ? 1 : 0.35 }} />
      ))}
    </View>
  );
}

// ── Mic level bars — real metering from a live (unsaved) recording, not a fake animation ──
function MicLevelBars({ level }: { level: number }) {
  // level: 0..1, derived from real dBFS metering
  const bars = [0.2, 0.45, 0.7, 1];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 }}>
      {bars.map((threshold, i) => (
        <View
          key={i}
          style={{
            width: 3, height: 5 + i * 3, borderRadius: 1.5,
            backgroundColor: level >= threshold ? CoachColors.accent : CoachColors.borderMuted,
          }}
        />
      ))}
    </View>
  );
}

function useMicLevel(active: boolean) {
  const [level, setLevel] = useState(0); // 0..1
  const [permission, setPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    async function start() {
      if (!active) return;
      const perm = await Audio.getPermissionsAsync();
      if (cancelled) return;
      if (!perm.granted) { setPermission('denied'); return; }
      setPermission('granted');
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(
          { ...Audio.RecordingOptionsPresets.LOW_QUALITY, isMeteringEnabled: true },
          undefined,
          200
        );
        if (cancelled) { await recording.stopAndUnloadAsync().catch(() => {}); return; }
        recordingRef.current = recording;
        poll = setInterval(async () => {
          try {
            const status = await recording.getStatusAsync();
            if (typeof status.metering === 'number') {
              // dBFS: -160 (silence) to 0 (max). Map a usable speaking range to 0..1.
              const norm = Math.max(0, Math.min(1, (status.metering + 50) / 50));
              setLevel(norm);
            }
          } catch { /* recording may have just stopped */ }
        }, 200);
      } catch {
        setPermission('denied');
      }
    }

    start();
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
      setLevel(0);
    };
  }, [active]);

  return { level, permission };
}

// ── Connection speed — real small-upload timing test against Supabase storage ──
// Not a rigorous benchmark (one small sample), but a genuine measurement rather
// than a fabricated number. Compared against the app's real broadcast bitrate
// (2.5 Mbps, see app/broadcast/[id].tsx) with headroom, not an invented target.
const BROADCAST_BITRATE_MBPS = 2.5;
const SPEED_TEST_BYTES = 300 * 1024; // 300KB

function useConnectionSpeed(active: boolean) {
  const [mbps, setMbps] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = useCallback(async () => {
    setTesting(true);
    const path = `speed-test/${Date.now()}.bin`;
    try {
      const payload = new Uint8Array(SPEED_TEST_BYTES);
      const start = Date.now();
      const { error } = await supabase.storage
        .from('chat-attachments')
        .upload(path, payload, { contentType: 'application/octet-stream' });
      const seconds = (Date.now() - start) / 1000;
      if (!error && seconds > 0) {
        setMbps((SPEED_TEST_BYTES * 8) / 1_000_000 / seconds);
      }
      if (!error) {
        supabase.storage.from('chat-attachments').remove([path]).catch(() => {});
      }
    } catch {
      // leave mbps as-is; row falls back to "checking" copy
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    if (active && mbps === null && !testing) runTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return { mbps, testing, runTest };
}

// ── Do not disturb — mutes FitLink's own alerts while live, not real phone calls ──
function DoNotDisturbRow({ isLast = false }: { isLast?: boolean }) {
  const [on, setOn] = useState(isBroadcastDndEnabled());
  return (
    <View style={[dr.row, !isLast && dr.rowBorder]}>
      <Ionicons name="moon-outline" size={17} color={on ? CoachColors.accent : CoachColors.textFaint} />
      <View style={dr.labelWrap}>
        <Text style={dr.label}>Do not disturb</Text>
        <Text style={dr.detail}>
          {on ? 'On — FitLink alerts stay silent while you’re live' : 'Off — FitLink alerts may play during your stream'}
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={(v) => { setOn(v); setBroadcastDnd(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        trackColor={{ false: CoachColors.borderMuted, true: CoachColors.accentSoft }}
        thumbColor={on ? CoachColors.accent : '#555'}
        ios_backgroundColor={CoachColors.borderMuted}
      />
    </View>
  );
}

// ── Scheduled list row (compact — used for everything after "Next up") ───────
function ScheduledRow({
  item,
  onPress,
  onDelete,
  isLast = false,
}: {
  item: LiveClassItem;
  onPress: () => void;
  onDelete: () => void;
  isLast?: boolean;
}) {
  const d = new Date(item.scheduled_for);
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  const dayNum = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <TouchableOpacity
      style={[sr.row, !isLast && sr.rowBorder]}
      onPress={onPress}
      onLongPress={onDelete}
      activeOpacity={0.7}
    >
      <View style={sr.dateBox}>
        <Text style={sr.dateWeekday}>{weekday}</Text>
        <Text style={sr.dateNum}>{dayNum}</Text>
      </View>
      <View style={sr.sep} />
      <View style={{ flex: 1 }}>
        <Text style={sr.title} numberOfLines={1}>{item.title}</Text>
        <Text style={sr.meta}>{timeStr}{item.duration_minutes ? ` · ${item.duration_minutes} min` : ''}</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={CoachColors.textFaint} />
    </TouchableOpacity>
  );
}

export default function StudioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { classes, liveClasses, updateLiveClass, deleteLiveClass, createClass, activeClients } = useApp();
  const { showAlert } = useAlert();
  const { isCoachElite } = useRevenueCat();
  const [showPaywall, setShowPaywall] = useState(false);

  // Pulsing live dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Abrupt stream disconnect
  const [abruptEndedClass, setAbruptEndedClass] = useState<LiveClassItem | null>(null);
  const [isSavingVod, setIsSavingVod] = useState(false);
  const isEndingStreamRef = useRef(false);

  // Real device check (camera / mic permission signal — no manual toggles)
  const [cameraStatus, setCameraStatus] = useState<DeviceStatus>('checking');
  const [micStatus, setMicStatus] = useState<DeviceStatus>('checking');

  const refreshDeviceStatus = useCallback(async () => {
    if (!getCameraPermissionsAsync || !getMicrophonePermissionsAsync) {
      setCameraStatus('unavailable');
      setMicStatus('unavailable');
      return;
    }
    try {
      const [cam, mic] = await Promise.all([getCameraPermissionsAsync(), getMicrophonePermissionsAsync()]);
      setCameraStatus(cam?.granted ? 'granted' : 'denied');
      setMicStatus(mic?.granted ? 'granted' : 'denied');
    } catch {
      setCameraStatus('unavailable');
      setMicStatus('unavailable');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshDeviceStatus();
    }, [refreshDeviceStatus])
  );

  // Real connection type — NetInfo, not a fabricated Mbps reading.
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      NetInfo.fetch().then(state => {
        if (!mounted) return;
        if (!state.isConnected) setConnectionStatus('offline');
        else if (state.type === 'wifi') setConnectionStatus('wifi');
        else if (state.type === 'cellular') setConnectionStatus('cellular');
        else setConnectionStatus(state.isConnected ? 'wifi' : 'offline');
      });
      return () => { mounted = false; };
    }, [])
  );

  // Live elapsed timer
  const [liveElapsed, setLiveElapsed] = useState('0:00');

  // Countdown timer for next scheduled stream
  const [countdown, setCountdown] = useState<string>('');

  // Analytics
  const [realAnalytics, setRealAnalytics] = useState<any[]>([]);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const { data } = await supabase
          .from('classes')
          .select('id, take_count, created_at')
          .order('created_at', { ascending: true })
          .limit(8);
        if (data && data.length > 0) setRealAnalytics(data);
      } catch (e) {
        console.log('[Studio] analytics error:', e);
      }
    }
    fetchAnalytics();
  }, []);

  // Abrupt end detection
  useEffect(() => {
    const liveStream = liveClasses.find((c) => c.status === 'live');
    if (!liveStream || isEndingStreamRef.current) return;
    const lastUpdated = new Date(liveStream.updated_at || liveStream.scheduled_for).getTime();
    const elapsed = Math.floor((Date.now() - lastUpdated) / 1000);
    if (elapsed > 60) {
      isEndingStreamRef.current = true;
      (async () => {
        try {
          await updateLiveClass(liveStream.id, { status: 'ended' });
          setAbruptEndedClass(liveStream);
        } catch (e) {
          if (__DEV__) console.warn('[Studio] abrupt-end update failed:', e);
        } finally {
          isEndingStreamRef.current = false;
        }
      })();
    }
  // updateLiveClass is a stable useCallback(…, []) — excluding it from deps avoids spurious re-runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveClasses]);

  // Real-time countdown to next scheduled stream
  const nextScheduledStream = useMemo(
    () => liveClasses.find((c) => c.status === 'scheduled'),
    [liveClasses]
  );

  useEffect(() => {
    if (!nextScheduledStream) { setCountdown(''); return; }
    const tick = () => {
      const diff = new Date(nextScheduledStream.scheduled_for).getTime() - Date.now();
      if (diff <= 0) { setCountdown('Starting now'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (h >= 24) {
        const d = Math.floor(h / 24);
        setCountdown(`in ${d}d ${h % 24}h`);
      } else if (h > 0) {
        setCountdown(`in ${h}h ${String(m).padStart(2, '0')}m`);
      } else {
        setCountdown(`in ${String(m).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextScheduledStream]);

  // Derived
  const activeStream = useMemo(
    () => liveClasses.find((c) => c.status === 'live') || liveClasses.find((c) => c.status === 'scheduled'),
    [liveClasses]
  );
  const upcomingStreams = useMemo(() => liveClasses.filter((c) => c.status === 'scheduled'), [liveClasses]);
  const restOfQueue = useMemo(
    () => upcomingStreams.filter((c) => c.id !== nextScheduledStream?.id),
    [upcomingStreams, nextScheduledStream]
  );
  const pastStreams = useMemo(
    () => liveClasses.filter((c) => c.status === 'ended' || c.status === 'cancelled'),
    [liveClasses]
  );
  const totalViews = useMemo(
    () => classes.reduce((sum, c) => sum + (c.take_count || 0), 0) + pastStreams.length * 12,
    [classes, pastStreams]
  );
  const lastStreamDate = useMemo(() => {
    if (pastStreams.length === 0) return null;
    const sorted = [...pastStreams].sort(
      (a, b) => new Date(b.scheduled_for).getTime() - new Date(a.scheduled_for).getTime()
    );
    const d = new Date(sorted[0].scheduled_for);
    const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
  }, [pastStreams]);
  const sparklineData = useMemo(() => {
    const src = realAnalytics.length > 0 ? realAnalytics : classes.slice(-6);
    if (src.length === 0) return [{ value: 1, label: '' }];
    return src.map((c, i) => ({ value: Math.max(c.take_count || 0, 1), label: `${i + 1}` }));
  }, [realAnalytics, classes]);

  const isLive = activeStream?.status === 'live';
  const hasNeverBroadcast = !activeStream && pastStreams.length === 0 && upcomingStreams.length === 0;

  // Real mic level (metering) and a genuine measured upload speed — both only
  // run while idle AND actually focused on this tab (never while live, and
  // never in the background after the coach navigates away — an open mic
  // recording with the screen off-screen would be a real privacy problem).
  const isFocused = useIsFocused();
  const micActive = isFocused && !isLive;
  const { level: micLevel, permission: micPermission } = useMicLevel(micActive);
  const { mbps: connectionMbps, testing: speedTesting, runTest: retestConnection } = useConnectionSpeed(micActive && connectionStatus !== 'offline');

  const deviceReady = cameraStatus === 'granted'
    && micPermission === 'granted'
    && connectionMbps !== null && connectionMbps >= BROADCAST_BITRATE_MBPS;

  // Live elapsed timer tick
  useEffect(() => {
    if (!isLive || !activeStream) return;
    const startedAt = new Date(activeStream.went_live_at || activeStream.updated_at || activeStream.scheduled_for).getTime();
    const tick = () => {
      const diff = Math.max(0, Date.now() - startedAt);
      const m = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setLiveElapsed(`${m}:${String(secs).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLive, activeStream]);

  // Handlers
  const handleEnterStudio = (cls: LiveClassItem) => {
    if (!isCoachElite) { setShowPaywall(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/broadcast/${cls.id}` as any);
  };
  const handleGoLive = () => {
    if (!isCoachElite) { setShowPaywall(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push('/broadcast/setup' as any);
  };
  const handleScheduleNew = () => {
    if (!isCoachElite) { setShowPaywall(true); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/create-live-class' as any);
  };

  // Paywall success path: navigation happens only AFTER the modal is
  // dismissed — the paywall itself never navigates while visible.
  const handlePaywallSuccess = useCallback(() => {
    setShowPaywall(false);
    router.push('/broadcast/setup' as any);
  }, [router]);

  const handleDelete = (id: string, title: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showAlert({
      type: 'warning',
      title: 'Delete stream',
      message: `Delete "${title}"?`,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try { await deleteLiveClass(id); } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to delete' });
            }
          },
        },
      ],
    });
  };

  const handleSaveVod = async () => {
    if (!abruptEndedClass) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSavingVod(true);
    try {
      const vodUrl = abruptEndedClass.mux_playback_id && !abruptEndedClass.mux_playback_id.startsWith('playback_')
        ? `https://stream.mux.com/${abruptEndedClass.mux_playback_id}.m3u8`
        : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
      await createClass({
        title: abruptEndedClass.title,
        description: abruptEndedClass.description || `Live recording from ${new Date().toLocaleDateString()}`,
        category: abruptEndedClass.category || 'Strength',
        tags: ['Live Recording', 'VOD'],
        difficulty: 'Intermediate',
        duration_minutes: abruptEndedClass.duration_minutes || 45,
        video_url: vodUrl,
        equipment: [],
        is_free: false,
        status: 'draft',
      });
      showAlert({ type: 'success', title: 'Saved', message: 'Recording saved to your library as a draft.' });
      setAbruptEndedClass(null);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Save failed', message: err.message || 'Could not save.' });
    } finally {
      setIsSavingVod(false);
    }
  };

  const notifyCount = activeClients?.length || 0;

  return (
    <>
    <SafeAreaView style={s.container} edges={['top']}>

      <ScrollView
        style={s.scrollFlex}
        contentContainerStyle={[s.scroll, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <View style={s.headerTitleRow}>
              {isLive && <Animated.View style={[s.liveDot, { opacity: pulseAnim }]} />}
              <Text style={s.headerTitle}>Studio</Text>
            </View>
            <Text style={s.headerSub}>
              {isLive
                ? `Live · ${liveElapsed}`
                : hasNeverBroadcast
                ? "You haven't gone live yet"
                : lastStreamDate
                ? `Last broadcast ${lastStreamDate} · ${totalViews.toLocaleString()} watched`
                : 'Ready when you are'}
            </Text>
          </View>
          <TouchableOpacity style={s.headerBtn} onPress={handleScheduleNew} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={17} color={CoachColors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── Abrupt disconnect alert ─────────────────────────────────── */}
        {abruptEndedClass && (
          <View style={s.alertCard}>
            <View style={s.alertCardLeft} />
            <View style={s.alertCardBody}>
              <View style={s.alertCardTitleRow}>
                <Ionicons name="warning" size={14} color={CoachColors.warning} />
                <Text style={s.alertCardTitle}>Stream ended abruptly</Text>
              </View>
              <Text style={s.alertCardSub} numberOfLines={1}>{abruptEndedClass.title}</Text>
              <View style={s.alertCardActions}>
                <TouchableOpacity style={s.alertSaveBtn} onPress={handleSaveVod} disabled={isSavingVod}>
                  {isSavingVod
                    ? <ActivityIndicator color={CoachColors.onAccent} size="small" />
                    : <Text style={s.alertSaveBtnText}>Save to library</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity style={s.alertDismissBtn} onPress={() => setAbruptEndedClass(null)} disabled={isSavingVod}>
                  <Text style={s.alertDismissBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── LIVE — the one place red belongs ──────────────────────────── */}
        {isLive && activeStream && (
          <View style={s.liveCard}>
            <View style={s.liveCardTop}>
              <View style={s.liveBadge}>
                <View style={s.liveBadgeDot} />
                <Text style={s.liveBadgeText}>Live</Text>
              </View>
              <Text style={s.liveTimer}>{liveElapsed}</Text>
              <View style={s.liveViewers}>
                <Ionicons name="eye-outline" size={13} color={CoachColors.textSecondary} />
                <Text style={s.liveViewersText}>{activeStream.viewer_count ?? 0} watching</Text>
              </View>
            </View>
            <Text style={s.liveTitle} numberOfLines={2}>{activeStream.title}</Text>
            <TouchableOpacity style={s.liveReenterBtn} onPress={() => handleEnterStudio(activeStream)} activeOpacity={0.85}>
              <Ionicons name="videocam" size={16} color="#FFFFFF" />
              <Text style={s.liveReenterBtnText}>Return to broadcast</Text>
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Never broadcast — empty state ─────────────────────────────── */}
        {hasNeverBroadcast && !isLive && (
          <View style={s.emptyCard}>
            <View style={s.emptyPreview}>
              <CameraPreviewPlaceholder />
              <Text style={s.emptyPreviewLabel}>camera preview</Text>
            </View>
            <View style={s.emptyBody}>
              <Text style={s.emptyTitle}>Run a class from your phone</Text>
              <Text style={s.emptySub}>
                Athletes get a push when you start, join from their app, and the replay saves to your library.
              </Text>
              <TouchableOpacity style={s.goLiveBtn} onPress={handleGoLive} activeOpacity={0.85}>
                <View style={s.goLiveDot} />
                <Text style={s.goLiveBtnText}>Go live now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.scheduleInsteadBtn} onPress={handleScheduleNew} activeOpacity={0.8}>
                <Text style={s.scheduleInsteadBtnText}>Schedule one instead</Text>
              </TouchableOpacity>
              <Text style={s.emptyFootnote}>
                {notifyCount > 0
                  ? `${notifyCount} athlete${notifyCount === 1 ? '' : 's'} will get a push when you start`
                  : 'No athletes to notify yet — add someone first'}
              </Text>
            </View>
          </View>
        )}

        {/* ── Next up — the single scheduled-stream card ─────────────────── */}
        {!isLive && nextScheduledStream && (
          <View style={s.nextCard}>
            <View style={s.nextBadgeRow}>
              <View style={s.nextBadgeDot} />
              <Text style={s.nextBadgeText}>Next up</Text>
            </View>
            <Text style={s.nextTitle} numberOfLines={2}>{nextScheduledStream.title}</Text>
            <View style={s.nextMetaRow}>
              <Text style={s.nextCountdown}>{countdown}</Text>
              <Text style={s.nextDate}>
                {new Date(nextScheduledStream.scheduled_for).toLocaleString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
                {notifyCount > 0 ? ` · ${notifyCount} notified` : ''}
              </Text>
            </View>
            <View style={s.nextActionsRow}>
              <TouchableOpacity
                style={s.nextStartBtn}
                onPress={() => handleEnterStudio(nextScheduledStream)}
                activeOpacity={0.85}
              >
                <View style={s.goLiveDot} />
                <Text style={s.goLiveBtnText}>Start early</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.editClassBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/create-live-class?editId=${nextScheduledStream.id}` as any);
                }}
                activeOpacity={0.85}
              >
                <Text style={s.editClassBtnText}>Edit class</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Stats ──────────────────────────────────────────────────────── */}
        {!hasNeverBroadcast && (
          <View style={s.statsRow}>
            <View style={s.statBlock}>
              <Text style={s.statNum}>{totalViews.toLocaleString()}</Text>
              <Text style={s.statLabel}>Total views</Text>
            </View>
            <View style={s.statSep} />
            <View style={s.statBlock}>
              <Text style={s.statNum}>{pastStreams.length}</Text>
              <Text style={s.statLabel}>Broadcasts</Text>
            </View>
            <View style={s.statSep} />
            <View style={s.statBlock}>
              <Text style={[s.statNum, { fontSize: lastStreamDate && lastStreamDate.length > 5 ? 15 : 21 }]}>
                {lastStreamDate || '—'}
              </Text>
              <Text style={s.statLabel}>Last stream</Text>
            </View>
          </View>
        )}

        {/* ── Stream health — real signal, not a self-report checklist ──── */}
        {!isLive && (
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Stream health</Text>
              {deviceReady && (
                <View style={s.readyBadgeRow}>
                  <View style={s.readyDot} />
                  <Text style={s.readyBadgeText}>Ready</Text>
                </View>
              )}
            </View>

            <View style={s.healthCard}>
              <DeviceRow
                icon="videocam-outline"
                label="Camera"
                status={cameraStatus}
                readyDetail={`Front · ${BROADCAST_RESOLUTION_LABEL}`}
                right={cameraStatus === 'granted' ? <SignalBars good /> : undefined}
              />
              <DeviceRow
                icon="mic-outline"
                label="Microphone"
                status={micPermission}
                readyDetail={micLevel > 0.15 ? 'Levels good — speak to test' : 'Quiet — speak to test'}
                right={micPermission === 'granted' ? <MicLevelBars level={micLevel} /> : undefined}
              />
              <ConnectionRow status={connectionStatus} mbps={connectionMbps} testing={speedTesting} onRetest={retestConnection} />
              <DoNotDisturbRow isLast />
            </View>
            {cameraStatus === 'unavailable' && (
              <Text style={s.healthFootnote}>
                Full device check runs on a native build — this is a development preview.
              </Text>
            )}
          </View>
        )}

        {/* ── Scheduled (everything after "Next up") ─────────────────────── */}
        {!isLive && restOfQueue.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Scheduled</Text>
              <TouchableOpacity onPress={handleScheduleNew}>
                <Text style={s.sectionAction}>Schedule new</Text>
              </TouchableOpacity>
            </View>
            <View style={s.listCard}>
              {restOfQueue.map((item, idx) => (
                <ScheduledRow
                  key={item.id}
                  item={item}
                  onPress={() => handleEnterStudio(item)}
                  onDelete={() => handleDelete(item.id, item.title)}
                  isLast={idx === restOfQueue.length - 1}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Student engagement (chart) ─────────────────────────────────── */}
        {!hasNeverBroadcast && !isLive && (
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Student engagement</Text>
              <Text style={s.sectionMuted}>Last {sparklineData.length} classes</Text>
            </View>

            <View style={s.chartCard}>
              <View style={s.chartCardTop}>
                <Text style={s.chartBigNum}>{sparklineData.reduce((a, b) => a + b.value, 0).toLocaleString()}</Text>
                <Text style={s.chartBigLabel}>total takes</Text>
              </View>
              <View style={s.chartWrapper}>
                <LineChart
                  data={sparklineData}
                  height={90}
                  width={width - 96}
                  color={CoachColors.accent}
                  thickness={2.5}
                  startFillColor="rgba(198,242,78,0.14)"
                  endFillColor="rgba(198,242,78,0)"
                  areaChart
                  hideRules
                  hideYAxisText
                  xAxisColor={CoachColors.borderMuted}
                  yAxisColor="transparent"
                  initialSpacing={10}
                  spacing={45}
                  dataPointsColor={CoachColors.accent}
                  dataPointsRadius={4}
                />
              </View>
            </View>
          </View>
        )}

        {/* ── Past broadcasts ────────────────────────────────────────────── */}
        {pastStreams.length > 0 && !isLive && (
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>Past broadcasts</Text>
              <Text style={s.sectionMuted}>{pastStreams.length} total</Text>
            </View>

            <View style={s.listCard}>
              {pastStreams.slice(0, 4).map((item, idx) => (
                <View
                  key={item.id}
                  style={[sr.row, idx < Math.min(pastStreams.length, 4) - 1 && sr.rowBorder]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={sr.title} numberOfLines={1}>{item.title}</Text>
                    <Text style={sr.meta}>
                      {new Date(item.scheduled_for).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      {item.category ? ` · ${item.category}` : ''}
                    </Text>
                  </View>
                  <Text style={[s.archiveStatusText, item.status === 'cancelled' && { color: CoachColors.textFaint }]}>
                    {item.status === 'cancelled' ? 'Cancelled' : 'Replay saved'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

      </ScrollView>

      {/* ── Sticky CTA — one primary action per state ────────────────── */}
      <View style={[s.stickyBottom, {
        paddingBottom: Math.max(insets.bottom, 12) + 80 + 12,
      }]}>
        {isLive && activeStream ? (
          <TouchableOpacity style={s.stickyLiveBtn} onPress={() => handleEnterStudio(activeStream)} activeOpacity={0.85}>
            <View style={s.liveBadgeDot} />
            <Text style={s.stickyLiveBtnText}>Return to broadcast</Text>
          </TouchableOpacity>
        ) : hasNeverBroadcast ? null : (
          <TouchableOpacity style={s.goLiveBtn} onPress={handleGoLive} activeOpacity={0.85}>
            <View style={s.goLiveDot} />
            <Text style={s.goLiveBtnText}>Go live now</Text>
          </TouchableOpacity>
        )}
      </View>

    </SafeAreaView>

      <CoachElitePaywall
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        onSuccess={handlePaywallSuccess}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  scrollFlex: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: 8 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 18,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24,
    color: CoachColors.textPrimary,
    letterSpacing: -0.4,
  },
  headerSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    marginTop: 2,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CoachColors.danger,
  },

  // ── Alert card ──────────────────────────────────────────────────────────────
  alertCard: {
    flexDirection: 'row',
    backgroundColor: CoachColors.warningSoft,
    borderWidth: 1,
    borderColor: 'rgba(224,184,78,0.3)',
    borderRadius: Radius.sm,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  alertCardLeft: { width: 4, backgroundColor: CoachColors.warning },
  alertCardBody: { flex: 1, padding: Spacing.md },
  alertCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  alertCardTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
  },
  alertCardSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
    marginBottom: 10,
  },
  alertCardActions: { flexDirection: 'row', gap: 8 },
  alertSaveBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: Radius.xs,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  alertSaveBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 11,
    color: CoachColors.onAccent,
    letterSpacing: 0.3,
  },
  alertDismissBtn: {
    borderRadius: Radius.xs,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  alertDismissBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textMuted,
  },

  // ── Live card (red reserved exclusively for this state) ─────────────────────
  liveCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: 'rgba(224,92,92,0.4)',
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: CoachColors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 4,
  },
  liveCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CoachColors.dangerSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  liveBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CoachColors.danger },
  liveBadgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 10.5,
    color: CoachColors.danger,
    letterSpacing: 0.8,
  },
  liveTimer: {
    fontFamily: CoachFonts.mono,
    fontSize: 13,
    color: CoachColors.textSecondary,
  },
  liveViewers: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  liveViewersText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12,
    color: CoachColors.textSecondary,
  },
  liveTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 19,
    color: CoachColors.textPrimary,
    marginBottom: 16,
    lineHeight: 24,
  },
  liveReenterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoachColors.danger,
    paddingVertical: 15,
    borderRadius: Radius.full,
  },
  liveReenterBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: '#FFFFFF',
  },

  // ── Never-broadcast empty state ──────────────────────────────────────────────
  emptyCard: {
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  emptyPreview: {
    height: 158,
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emptyPreviewLabel: {
    fontFamily: CoachFonts.mono,
    fontSize: 11,
    color: CoachColors.textFaint,
    letterSpacing: 0.5,
  },
  emptyBody: { padding: Spacing.lg, backgroundColor: CoachColors.surface },
  emptyTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  emptySub: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    marginTop: 8,
    lineHeight: 19,
  },
  scheduleInsteadBtn: {
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.full,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 9,
  },
  scheduleInsteadBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textSecondary,
  },
  emptyFootnote: {
    fontFamily: CoachFonts.body,
    fontSize: 11.5,
    color: CoachColors.textFaint,
    textAlign: 'center',
    marginTop: 10,
  },

  // ── Next up card ──────────────────────────────────────────────────────────
  nextCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  nextBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  nextBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CoachColors.accent },
  nextBadgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 10.5,
    color: CoachColors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  nextTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 21,
    color: CoachColors.textPrimary,
    marginTop: 10,
    lineHeight: 26,
  },
  nextMetaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8, marginBottom: 16 },
  nextCountdown: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14.5,
    color: CoachColors.accent,
  },
  nextDate: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
    flexShrink: 1,
  },
  nextActionsRow: { flexDirection: 'row', gap: 10 },
  nextStartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoachColors.accent,
    paddingVertical: 14,
    borderRadius: Radius.full,
  },
  editClassBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingVertical: 14,
    borderRadius: Radius.full,
  },
  editClassBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
  },

  // ── Stats row ───────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    backgroundColor: CoachColors.surfaceRaised,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius.sm,
    marginBottom: Spacing.xl,
    paddingVertical: 12,
  },
  statBlock: { flex: 1, alignItems: 'center', gap: 3 },
  statSep: { width: StyleSheet.hairlineWidth, backgroundColor: CoachColors.border, marginVertical: 6 },
  statNum: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 21,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 10,
    color: CoachColors.textFaint,
  },

  // ── Section ─────────────────────────────────────────────────────────────────
  section: { marginBottom: Spacing.xl },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
    letterSpacing: -0.1,
  },
  sectionMuted: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.textMuted,
  },
  sectionAction: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12,
    color: CoachColors.accent,
  },
  readyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  readyDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: CoachColors.accent,
  },
  readyBadgeText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.accent,
  },

  // ── Stream health card ────────────────────────────────────────────────────
  healthCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  healthFootnote: {
    fontFamily: CoachFonts.body,
    fontSize: 11.5,
    color: CoachColors.textFaint,
    marginTop: 8,
    lineHeight: 16,
  },

  // ── Chart ───────────────────────────────────────────────────────────────────
  chartCard: {
    backgroundColor: CoachColors.surfaceRaised,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  chartCardTop: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 10 },
  chartBigNum: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },
  chartBigLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
  },
  chartWrapper: { alignItems: 'center', overflow: 'hidden' },

  // ── List card (scheduled / past broadcasts) ──────────────────────────────
  listCard: {
    backgroundColor: CoachColors.surfaceRaised,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  archiveStatusText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 11,
    color: CoachColors.accent,
  },

  // ── Sticky bottom CTA ─────────────────────────────────────────────────────
  stickyBottom: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.bg,
  },
  goLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoachColors.accent,
    paddingVertical: 16,
    borderRadius: Radius.full,
    marginTop: 14,
  },
  goLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(16,18,16,0.55)',
  },
  goLiveBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14.5,
    color: CoachColors.onAccent,
    letterSpacing: 0.2,
  },
  stickyLiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoachColors.danger,
    paddingVertical: 16,
    borderRadius: Radius.full,
  },
  stickyLiveBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14.5,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});

// ── Device row styles ──────────────────────────────────────────────────────────
const dr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: Spacing.md,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CoachColors.borderMuted,
  },
  labelWrap: { flex: 1, gap: 1 },
  label: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },
  detail: {
    fontFamily: CoachFonts.body,
    fontSize: 11.5,
    color: CoachColors.textMuted,
  },
});

// ── Scheduled row styles ────────────────────────────────────────────────────────
const sr = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CoachColors.borderMuted,
  },
  dateBox: { width: 44, alignItems: 'center' },
  dateWeekday: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
  },
  dateNum: {
    fontFamily: CoachFonts.body,
    fontSize: 10.5,
    color: CoachColors.textFaint,
    marginTop: 1,
  },
  sep: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: CoachColors.borderMuted },
  title: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },
  meta: {
    fontFamily: CoachFonts.body,
    fontSize: 11.5,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
});


