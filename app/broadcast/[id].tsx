import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Dimensions,
  Share,
  Modal,
  TextInput,
} from 'react-native';
// The camera preview is deliberately full-bleed and runs under the status bar /
// home indicator. Only the *controls* overlay is inset — and react-native's own
// SafeAreaView is an iOS-only no-op, so those controls sat under the Android
// status bar. The context version insets on both platforms.
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useApp, LiveClassItem } from '../../context/AppContext';
import { Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useAlert } from '../../context/AlertContext';
import { supabase } from '../../lib/supabase';
import { liveBroadcastUnsupportedTitle, liveBroadcastUnsupportedMessage } from '../../lib/liveBroadcast';
import { Motion } from '../../constants/motion';
import { useReducedMotion } from '../../lib/useReducedMotion';

let ExpoCameraRtmpPublisherView: any = null;
let requestCameraPermissionsAsync: any = null;
let requestMicrophonePermissionsAsync: any = null;

if (Platform.OS === 'ios') {
  try {
    const RtmpModule = require('expo-camera-rtmp-publisher');
    ExpoCameraRtmpPublisherView = RtmpModule.ExpoCameraRtmpPublisherView;
    requestCameraPermissionsAsync = RtmpModule.requestCameraPermissionsAsync;
    requestMicrophonePermissionsAsync = RtmpModule.requestMicrophonePermissionsAsync;
  } catch (e) {
    // Expected in Expo Go — the native RTMP module requires a dev/production build.
    // Run `npx expo run:ios` to get a build that includes this module.
    console.log('[Broadcast Studio] RTMP native module unavailable (Expo Go or missing pod). Use a dev build.');
  }
}


const { height: SCREEN_H } = Dimensions.get('window');
const MSG_VISIBLE_MS = 7000;
const MAX_VISIBLE = 5;

type DockTab = 'activity' | 'chat' | 'actions';

type ChatMsg = {
  id: string;
  sender: string;
  content: string;
  isPinned?: boolean;
  arrivedAt: number;
};

type ActivityEvent = {
  id: string;
  type: 'join' | 'follow' | 'marker';
  label: string;
  timestamp: number;
};

const opacityMap = new Map<string, Animated.Value>();

const QUICK_ACTIONS = [
  { id: 'marker', icon: 'bookmark-outline',      label: 'Add marker',   color: CoachColors.accent,      bg: CoachColors.accentSoft },
  { id: 'mute',   icon: 'mic-outline',            label: 'Mute mic',     color: CoachColors.textPrimary, bg: CoachColors.surface },
  { id: 'flip',   icon: 'camera-reverse-outline', label: 'Flip camera',  color: CoachColors.textPrimary, bg: CoachColors.surface },
  { id: 'share',  icon: 'share-outline',          label: 'Share stream', color: CoachColors.textPrimary, bg: CoachColors.surface },
  { id: 'edit',   icon: 'create-outline',         label: 'Edit title',   color: CoachColors.textPrimary, bg: CoachColors.surface },
  { id: 'end',    icon: 'stop-circle-outline',    label: 'End stream',   color: CoachColors.danger,      bg: CoachColors.dangerSoft },
] as const;

export default function BroadcastStudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const params = useLocalSearchParams<{ micEnabled?: string; cameraFacing?: string }>();
  const router = useRouter();
  const { liveClasses, updateLiveClass, createClass, classes, deleteClass } = useApp();
  const { showAlert } = useAlert();
  const reduceMotion = useReducedMotion();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>(
    params.cameraFacing === 'back' ? 'back' : 'front'
  );
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [liveClass, setLiveClass] = useState<LiveClassItem | null>(null);
  const [isMuted, setIsMuted] = useState(params.micEnabled === '0');
  const [cameraReady, setCameraReady] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Stream timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dock state
  const [activeDockTab, setActiveDockTab] = useState<DockTab>('activity');

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<ChatMsg | null>(null);
  const chatListRef = useRef<FlatList>(null);

  // Activity feed
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  // Viewer count
  const [viewerCount, setViewerCount] = useState(0);

  // Edit title modal
  const [showEditTitle, setShowEditTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Marker toast
  const [markerToast, setMarkerToast] = useState<string | null>(null);
  const markerToastAnim = useRef(new Animated.Value(0)).current;

  const publisherRef = useRef<any>(null);

  // ── Unmount safety ────────────────────────────────────────────────────────
  const isMountedRef = useRef(true);
  // Stores the 8-second timeout that marks the class as 'live' so we can cancel it if user leaves early
  const liveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cancel the deferred 'live' status update — prevents a ghost stream appearing in studio
      if (liveTimeoutRef.current) clearTimeout(liveTimeoutRef.current);
      // Clear all pending fade-out animations so there are no post-unmount state updates
      opacityMap.clear();
    };
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isBroadcasting) {
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isBroadcasting]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── TikTok-style message fade lifecycle ──────────────────────────────────
  const addMessage = useCallback((msg: Omit<ChatMsg, 'arrivedAt'>) => {
    const now = Date.now();
    const full: ChatMsg = { ...msg, arrivedAt: now };
    const opacity = new Animated.Value(0);
    opacityMap.set(full.id, opacity);

    setChatMessages(prev => {
      const capped = prev.length >= MAX_VISIBLE ? prev.slice(1) : prev;
      return [...capped, full];
    });

    Animated.timing(opacity, { toValue: 1, duration: reduceMotion ? Motion.reduced : 300, useNativeDriver: true }).start();

    const fadeOutTimer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: reduceMotion ? Motion.reduced : 500, useNativeDriver: true }).start(() => {
        setChatMessages(prev => prev.filter(m => m.id !== full.id));
        opacityMap.delete(full.id);
      });
    }, MSG_VISIBLE_MS);

    return () => clearTimeout(fadeOutTimer);
  }, [reduceMotion]);

  // ── Activity events ───────────────────────────────────────────────────────
  const addActivity = useCallback((type: ActivityEvent['type'], label: string) => {
    const event: ActivityEvent = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      label,
      timestamp: Date.now(),
    };
    setActivityEvents(prev => [event, ...prev].slice(0, 50));
  }, []);

  // ── Permissions ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const camPerm = await requestCameraPermissionsAsync();
        const micPerm = await requestMicrophonePermissionsAsync();
        setHasPermission(camPerm.granted && micPerm.granted);
      } catch (e) {
        setHasPermission(true); // Fallback for dev mode
      }
    })();
  }, []);

  // ── Load class ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadClass() {
      if (!id) return;
      const found = liveClasses?.find(c => c.id === id);
      if (found) { setLiveClass(found); return; }
      try {
        const { data, error } = await supabase
          .from('live_classes').select('*').eq('id', id).single();
        if (data && !error) setLiveClass(data);
      } catch (err) {
        console.error('[Broadcast Studio] Fetch class error:', err);
      }
    }
    loadClass();
  }, [id, liveClasses]);

  // ── Realtime ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!liveClass?.id) return;

    const channel = supabase
      .channel(`live-class-${liveClass.id}`)
      .on('broadcast', { event: 'chat_message' }, (payload) => {
        const msg = payload.payload as any;
        if (!msg?.content) return;
        const newMsg: ChatMsg = {
          id: msg.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          sender: msg.sender,
          content: msg.content,
          arrivedAt: Date.now(),
        };
        addMessage(newMsg);
        setChatMessages(prev => [...prev.slice(-99), newMsg]);
      })
      .on('broadcast', { event: 'viewer_join' }, (payload) => {
        const p = payload.payload as any;
        if (p?.name) addActivity('join', `${p.name} joined the stream`);
      })
      .on('broadcast', { event: 'viewer_follow' }, (payload) => {
        const p = payload.payload as any;
        if (p?.name) addActivity('follow', `${p.name} started following`);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'live_classes', filter: `id=eq.${liveClass.id}`
      }, (payload) => {
        if (typeof payload.new.viewer_count === 'number') {
          setViewerCount(payload.new.viewer_count);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [liveClass?.id, addMessage, addActivity]);

  // ── Pin ───────────────────────────────────────────────────────────────────
  const handlePinMessage = useCallback(async (msg: ChatMsg) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setChatMessages(prev => prev.filter(m => m.id !== msg.id));
    const opacity = opacityMap.get(msg.id);
    if (opacity) { opacity.stopAnimation(); opacityMap.delete(msg.id); }
    setPinnedMessage({ ...msg, isPinned: true });
    // Optimistic pin — revert it if the row never actually changed. The update
    // resolves with { error }; it does not throw.
    supabase.from('live_class_messages').update({ is_pinned: true }).eq('id', msg.id)
      .then(({ error }) => {
        if (!error) return;
        console.error('[Broadcast] pin failed:', error);
        setPinnedMessage(prev => (prev?.id === msg.id ? null : prev));
        setChatMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev.slice(-99), msg]));
      });
  }, []);

  const handleUnpinMessage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPinnedMessage(null);
  }, []);

  // ── Marker toast ──────────────────────────────────────────────────────────
  const showMarkerToast = useCallback((timestamp: string) => {
    setMarkerToast(`Marker added at ${timestamp}`);
    Animated.sequence([
      Animated.timing(markerToastAnim, { toValue: 1, duration: reduceMotion ? Motion.reduced : 250, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(markerToastAnim, { toValue: 0, duration: reduceMotion ? Motion.reduced : 300, useNativeDriver: true }),
    ]).start(() => setMarkerToast(null));
  }, [markerToastAnim, reduceMotion]);

  // ── Share stream ──────────────────────────────────────────────────────────
  const handleShareStream = useCallback(async () => {
    if (!liveClass) return;
    // A placeholder playback id (seeded as 'playback_…') means Mux has never
    // issued a real stream for this class — there is nothing anyone could watch.
    const hasPublicFeed =
      !!liveClass.mux_playback_id && !liveClass.mux_playback_id.startsWith('playback_');
    if (!hasPublicFeed) {
      showAlert({
        type: 'info',
        title: 'Share stream',
        message: 'This stream has no public feed yet. Go live once so the stream gets a playback feed, then share it.',
      });
      return;
    }
    try {
      await Share.share({
        message: `Join my live class "${liveClass.title}" on FitLink: fitlink://live-player/${liveClass.id}`,
      });
    } catch {
      // User dismissed the share sheet or it failed to open — nothing to do.
    }
  }, [liveClass, showAlert]);

  // ── Edit title ────────────────────────────────────────────────────────────
  const handleSaveTitle = useCallback(async () => {
    if (!liveClass) return;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === liveClass.title) { setShowEditTitle(false); return; }
    setIsSavingTitle(true);
    try {
      await updateLiveClass(liveClass.id, { title: trimmed });
      setLiveClass(prev => (prev ? { ...prev, title: trimmed } : prev));
      setShowEditTitle(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Title not saved', message: e?.message || 'Could not update the stream title.' });
    } finally {
      setIsSavingTitle(false);
    }
  }, [liveClass, titleDraft, updateLiveClass, showAlert]);

  // ── Quick actions ─────────────────────────────────────────────────────────
  const handleQuickAction = useCallback((actionId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    switch (actionId) {
      case 'marker':
        showMarkerToast(formatTimer(elapsedSeconds));
        addActivity('marker', `Stream marker added at ${formatTimer(elapsedSeconds)}`);
        break;
      case 'mute':
        setIsMuted(v => !v);
        break;
      case 'flip':
        setCameraPosition(v => v === 'front' ? 'back' : 'front');
        break;
      case 'share':
        handleShareStream();
        break;
      case 'edit':
        setTitleDraft(liveClass?.title ?? '');
        setShowEditTitle(true);
        break;
      case 'end':
        handleStopBroadcast();
        break;
    }
  }, [elapsedSeconds, showMarkerToast, addActivity, handleShareStream, liveClass?.title]);

  // ── Start broadcast ───────────────────────────────────────────────────────
  const handleStartBroadcast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!liveClass) return;

    const { data: secrets, error: secretsError } = await supabase
      .from('live_class_secrets')
      .select('mux_stream_key, mux_stream_id')
      .eq('live_class_id', liveClass.id)
      .single();

    if (secretsError || !secrets?.mux_stream_key) {
      showAlert({ type: 'error', title: 'Broadcast Error', message: 'Could not load stream credentials.' });
      return;
    }

    let activeStreamKey = secrets.mux_stream_key;

    if (!activeStreamKey || activeStreamKey.startsWith('key_')) {
      try {
        // NOTE: supabase.functions.invoke puts HTTP error bodies in `data`, not in `error`
        const { data: muxData, error: muxError } = await supabase.functions.invoke('create-mux-stream');
        if (!muxError && muxData?.stream_key && !muxData?.error) {
          activeStreamKey = muxData.stream_key;
          await updateLiveClass(liveClass.id, { mux_playback_id: muxData.playback_id });
          const { error: secretsUpdateError } = await supabase.from('live_class_secrets').update({
            mux_stream_id: muxData.stream_id,
            mux_stream_key: muxData.stream_key,
          }).eq('live_class_id', liveClass.id);
          // Not fatal for THIS broadcast (activeStreamKey is already in memory),
          // but the key won't persist for the next one, so make it loud.
          if (secretsUpdateError) {
            console.error('[Broadcast] failed to persist new Mux stream key:', secretsUpdateError);
          }
        } else {
          const reason = muxError?.message ?? muxData?.error ?? 'no stream_key in response';
          console.warn('[Broadcast] create-mux-stream inline retry failed:', reason);
        }
      } catch (err: any) {
        showAlert({ type: 'error', title: 'Mux Setup Error', message: err.message || 'Could not reach Mux Edge Function.' });
      }
    }

    if (!activeStreamKey || activeStreamKey.startsWith('key_')) {
      showAlert({
        type: 'error',
        title: 'Mux Not Configured',
        message: 'Live streaming requires valid Mux credentials. Check that the MuxAccessToken and MuxSecret environment variables are set in your Supabase project.',
      });
      return;
    }

    try {
      setIsBroadcasting(true);
      setElapsedSeconds(0);

      if (publisherRef.current) {
        const rtmpUrl = 'rtmp://global-live.mux.com:5222/app';
        await publisherRef.current.startPublishing(rtmpUrl, activeStreamKey, {
          videoWidth: 720, videoHeight: 1280, videoBitrate: 2500000, audioBitrate: 128000,
        });
      }

      liveTimeoutRef.current = setTimeout(async () => {
        // Guard: don't update if the coach has already navigated away
        if (!isMountedRef.current) return;
        try {
          await updateLiveClass(liveClass.id, { status: 'live' });
        } catch (e: any) {
          // If this never lands the class stays 'scheduled' and no athlete can
          // find the stream — the coach is broadcasting to nobody.
          console.error('[Broadcast] could not flip class to live:', e);
          showAlert({
            type: 'error',
            title: 'Stream not listed',
            message: 'You are broadcasting, but the class could not be marked live so athletes may not see it. End and start again if nobody joins.',
          });
        }
      }, 8000);
    } catch (e: any) {
      console.warn('[Broadcast] Streaming start warning:', e);
    }
  };

  // ── Stop broadcast ────────────────────────────────────────────────────────
  const handleStopBroadcast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showAlert({
      type: 'confirm',
      title: 'End stream?',
      message: 'Are you sure you want to end this live class broadcast?',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Broadcast', style: 'destructive',
          onPress: async () => {
            try {
              if (publisherRef.current) await publisherRef.current.stopPublishing();
              setIsBroadcasting(false);
              if (timerRef.current) clearInterval(timerRef.current);
              if (liveClass) await updateLiveClass(liveClass.id, { status: 'ended' });
              setShowRecap(true);
            } catch (e: any) {
              showAlert({ type: 'error', title: 'Error', message: e.message || 'Could not stop stream.' });
            }
          },
        },
      ],
    });
  };

  // ── Save to VOD ───────────────────────────────────────────────────────────
  const handleSaveToOnDemand = async () => {
    if (!liveClass) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSaving(true);
    try {
      const vodPlaybackUrl =
        liveClass.mux_playback_id && !liveClass.mux_playback_id.startsWith('playback_')
          ? `https://stream.mux.com/${liveClass.mux_playback_id}.m3u8` : '';

      const muxDrafts = classes
        .filter(c => c.status === 'draft' && c.video_url?.includes('stream.mux.com'))
        .sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
      if (muxDrafts.length >= 3) {
        // Housekeeping only — a failure here just leaves an extra draft behind.
        try { await deleteClass(muxDrafts[0].id); } catch (e) { if (__DEV__) console.warn('[Broadcast] draft prune failed:', e); }
      }

      await createClass({
        title: liveClass.title,
        description: liveClass.description || `Live stream recording from ${new Date().toLocaleDateString()}`,
        category: liveClass.category || 'Strength',
        tags: ['Live Recording', 'VOD'],
        difficulty: 'Intermediate',
        duration_minutes: liveClass.duration_minutes || 45,
        video_url: vodPlaybackUrl,
        equipment: [],
        is_free: false,
        status: 'draft',
      });

      showAlert({ type: 'success', title: 'Saved to Library!', message: 'Your stream recording has been saved as a Draft.' });
      router.back();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Save Failed', message: err.message || 'Could not save class.' });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Guards ────────────────────────────────────────────────────────────────
  const isIosNativeModuleMissing = Platform.OS === 'ios' && !ExpoCameraRtmpPublisherView;
  if (Platform.OS !== 'ios' || isIosNativeModuleMissing) {
    const isAndroid = Platform.OS !== 'ios';
    return (
      <SafeAreaView style={[s.container, { backgroundColor: CoachColors.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xl }]}>
        <View style={s.recapCard}>
          <Ionicons
            name={isAndroid ? 'phone-portrait-outline' : 'construct-outline'}
            size={48}
            color={CoachColors.accent}
            style={{ marginBottom: 12 }}
          />
          <Text style={s.recapTag}>{isAndroid ? 'Android' : 'Dev build required'}</Text>
          {/* "Coming soon" promised a date nobody had committed to. State the
              limitation as it actually is — see lib/liveBroadcast.ts. */}
          <Text style={s.recapTitle}>{isAndroid ? liveBroadcastUnsupportedTitle : 'Native build needed'}</Text>
          <Text style={s.recapSub}>
            {isAndroid
              ? liveBroadcastUnsupportedMessage
              : 'You are running Expo Go, which does not include the native RTMP camera module.\n\nRun \`npx expo run:ios\` to build a development client and unlock live broadcasting.'}
          </Text>
          <TouchableOpacity style={s.saveVodBtn} onPress={() => router.back()}>
            <Text style={s.saveVodBtnText}>Return to studio</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === null || !liveClass) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: CoachColors.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
        <ActivityIndicator color={CoachColors.accent} size="large" />
        <Text style={{ color: CoachColors.textMuted, fontFamily: CoachFonts.body, fontSize: 13.5, marginTop: 12 }}>
          {hasPermission === null ? 'Checking permissions…' : 'Loading broadcast studio…'}
        </Text>
        {/* Cancel button so the user is never trapped on the loading screen */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 32, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, backgroundColor: CoachColors.surface }}
          activeOpacity={0.7}
        >
          <Text style={{ color: CoachColors.textSecondary, fontFamily: CoachFonts.body, fontSize: 15.5 }}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={[s.container, { backgroundColor: CoachColors.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="mic-off" size={54} color={CoachColors.textFaint} />
        <Text style={s.errorText}>No access to camera or microphone.</Text>
        <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={s.backBtnAlt} onPress={() => router.back()}>
          <Text style={s.backBtnAltText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Recap ─────────────────────────────────────────────────────────────────
  if (showRecap) {
    return (
      <SafeAreaView style={s.recapContainer}>
        <View style={s.recapCard}>
          <View style={{ marginBottom: Spacing.md }}>
            <Ionicons name="checkmark-circle" size={63} color={CoachColors.accent} />
          </View>
          <Text style={s.recapTag}>Stream completed</Text>
          <Text style={s.recapTitle}>{liveClass.title}</Text>
          <Text style={s.recapSub}>Great session! Here is your broadcast summary.</Text>

          <View style={s.recapStatsRow}>
            <View style={s.recapStatBox}>
              <Text style={s.recapStatLabel}>Duration</Text>
              <Text style={s.recapStatVal}>{formatTimer(elapsedSeconds)}</Text>
            </View>
            <View style={s.recapStatDivider} />
            <View style={s.recapStatBox}>
              <Text style={s.recapStatLabel}>Viewers</Text>
              <Text style={s.recapStatVal}>{viewerCount || 0}</Text>
            </View>
            <View style={s.recapStatDivider} />
            <View style={s.recapStatBox}>
              <Text style={s.recapStatLabel}>Chat messages</Text>
              <Text style={s.recapStatVal}>{chatMessages.length}</Text>
            </View>
          </View>

          <TouchableOpacity style={s.saveVodBtn} onPress={handleSaveToOnDemand} disabled={isSaving} activeOpacity={0.85}>
            {isSaving ? (
              <ActivityIndicator color={CoachColors.onAccent} size="small" />
            ) : (
              <>
                <Ionicons name="library" size={20} color={CoachColors.onAccent} />
                <Text style={s.saveVodBtnText}>Save to on-demand library</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={s.discardBtn} onPress={() => router.back()} disabled={isSaving}>
            <Text style={s.discardBtnText}>Return to studio</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Panels ────────────────────────────────────────────────────────────────
  const renderActivityFeed = () => (
    <View style={s.panelContainer}>
      <View style={s.panelHeader}>
        <Text style={s.panelTitle}>Activity feed</Text>
        <View style={s.panelHeaderRight}>
          <View style={[s.liveDotSmall, isBroadcasting && s.liveDotSmallActive]} />
          <Text style={s.panelSubtitle}>{isBroadcasting ? 'Live' : 'Offline'}</Text>
        </View>
      </View>
      {activityEvents.length === 0 ? (
        <View style={s.emptyPanel}>
          <Ionicons name="volume-mute-outline" size={36} color={CoachColors.textFaint} />
          <Text style={s.emptyPanelTitle}>It's quiet. Too quiet…</Text>
          <Text style={s.emptyPanelSub}>
            We'll show your new joins, follows, and markers here during the stream.
          </Text>
        </View>
      ) : (
        <ScrollView style={s.panelScroll} showsVerticalScrollIndicator={false}>
          {activityEvents.map(event => (
            <View key={event.id} style={s.activityRow}>
              <View style={[s.activityDot, {
                backgroundColor:
                  event.type === 'join' ? CoachColors.accent :
                  event.type === 'follow' ? CoachColors.warning : CoachColors.textSecondary,
              }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.activityLabel}>{event.label}</Text>
                <Text style={s.activityTime}>
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </Text>
              </View>
              <Ionicons
                name={event.type === 'join' ? 'person-add-outline' : event.type === 'follow' ? 'heart-outline' : 'bookmark-outline'}
                size={16}
                color={CoachColors.textFaint}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );

  const renderChatPanel = () => (
    <View style={s.panelContainer}>
      <View style={s.panelHeader}>
        <Text style={s.panelTitle}>Live chat</Text>
        <Text style={s.panelSubtitle}>{chatMessages.length} messages</Text>
      </View>
      <FlatList
        ref={chatListRef}
        data={chatMessages}
        keyExtractor={item => item.id}
        style={s.chatPanelList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={s.emptyPanel}>
            <Ionicons name="chatbubbles-outline" size={31} color={CoachColors.textFaint} />
            <Text style={s.emptyPanelTitle}>No messages yet</Text>
            <Text style={s.emptyPanelSub}>Chat messages from your viewers will appear here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => handlePinMessage(item)}
            style={s.chatPanelBubble}
            activeOpacity={0.7}
          >
            <Text style={s.chatPanelSender}>{item.sender}</Text>
            <Text style={s.chatPanelContent}>{item.content}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );

  const renderQuickActions = () => (
    <View style={s.panelContainer}>
      <View style={s.panelHeader}>
        <Text style={s.panelTitle}>Quick actions</Text>
        <Text style={s.panelSubtitle}>Tap to execute</Text>
      </View>
      <View style={s.quickActionsGrid}>
        {QUICK_ACTIONS.map(action => (
          <TouchableOpacity
            key={action.id}
            style={[s.quickActionTile, { backgroundColor: action.bg }]}
            onPress={() => handleQuickAction(action.id)}
            activeOpacity={0.75}
          >
            <View style={[s.quickActionIconBg, { borderColor: action.color + '30' }]}>
              <Ionicons
                name={action.id === 'mute' ? (isMuted ? 'mic-off-outline' : 'mic-outline') : action.icon as any}
                size={22}
                color={action.id === 'mute' && isMuted ? CoachColors.danger : action.color}
              />
            </View>
            <Text style={[s.quickActionLabel, { color: action.color }]}>
              {action.id === 'mute' ? (isMuted ? 'Unmute mic' : 'Mute mic') : action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderPanel = () => {
    switch (activeDockTab) {
      case 'activity': return renderActivityFeed();
      case 'chat': return renderChatPanel();
      case 'actions': return renderQuickActions();
      default: return renderActivityFeed();
    }
  };

  const PANEL_HEIGHT = SCREEN_H * 0.34;

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Camera */}
      <ExpoCameraRtmpPublisherView
        ref={publisherRef}
        style={[StyleSheet.absoluteFillObject, { bottom: PANEL_HEIGHT + 56 }]}
        cameraPosition={cameraPosition}
        muted={isMuted}
        onReady={() => setCameraReady(true)}
        onPublishStarted={() => setIsBroadcasting(true)}
        onPublishStopped={() => setIsBroadcasting(false)}
        onPublishError={(err: any) => {
          showAlert({ type: 'error', title: 'Publish Error', message: String(err) });
        }}
      />

      {/* Fill below camera */}
      <View style={[StyleSheet.absoluteFillObject, { top: SCREEN_H - PANEL_HEIGHT - 56, backgroundColor: CoachColors.bg }]} />

      <SafeAreaView style={s.overlay} pointerEvents="box-none">

        {/* Top Bar */}
        <View style={s.topBar}>
          <TouchableOpacity hitSlop={2}
            onPress={() => {
              if (isBroadcasting) {
                showAlert({
                  type: 'confirm',
                  title: 'Leave studio?',
                  message: 'This will end your current broadcast.',
                  buttons: [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'End & Leave', style: 'destructive', onPress: async () => {
                      try {
                        if (publisherRef.current) await publisherRef.current.stopPublishing();
                        if (liveClass) await updateLiveClass(liveClass.id, { status: 'ended' });
                      } catch (e) {
                        // Studio's abrupt-end detector will close the class out,
                        // so leaving is still safe — just record why.
                        console.error('[Broadcast] could not mark class ended on exit:', e);
                      }
                      router.back();
                    }},
                  ],
                });
              } else { router.back(); }
            }}
            style={s.iconBtn}
          >
            <Ionicons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={s.topBarCenter}>
            <View style={[s.liveBadge, isBroadcasting && s.liveBadgeActive]}>
              <View style={[s.liveDot, isBroadcasting && s.liveDotActive]} />
              <Text style={[s.liveBadgeText, isBroadcasting && s.liveBadgeTextActive]}>
                {isBroadcasting ? 'LIVE' : 'READY'}
              </Text>
            </View>
            {isBroadcasting && <Text style={s.timerText}>{formatTimer(elapsedSeconds)}</Text>}
            {isBroadcasting && viewerCount > 0 && (
              <View style={s.viewerPill}>
                <Ionicons name="eye" size={13} color="rgba(255,255,255,0.6)" />
                <Text style={s.viewerPillText}>{viewerCount}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity hitSlop={2}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsMuted(v => !v); }}
              style={[s.iconBtn, isMuted && { backgroundColor: CoachColors.danger }]}
            >
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={2}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCameraPosition(v => v === 'front' ? 'back' : 'front'); }}
              style={s.iconBtn}
            >
              <Ionicons name="camera-reverse-outline" size={25} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pinned banner */}
        {pinnedMessage && (
          <View style={s.pinnedBanner} pointerEvents="box-none">
            <Ionicons name="pin" size={12} color={CoachColors.accent} style={{ marginRight: 6, marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.pinnedSender}>{pinnedMessage.sender}</Text>
              <Text style={s.pinnedContent} numberOfLines={2}>{pinnedMessage.content}</Text>
            </View>
            <TouchableOpacity onPress={handleUnpinMessage} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        )}

        {/* TikTok overlay (hidden when chat panel open) */}
        {activeDockTab !== 'chat' && (
          <View style={s.chatOverlay} pointerEvents="box-none">
            {chatMessages.map((item) => {
              const opacity = opacityMap.get(item.id) ?? new Animated.Value(1);
              return (
                <Animated.View key={item.id} style={{ opacity }}>
                  <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }}
                    onPress={() => handlePinMessage(item)}
                    activeOpacity={0.7}
                    style={s.chatOverlayBubble}
                  >
                    <Text style={s.chatOverlaySender}>{item.sender}: </Text>
                    <Text style={s.chatOverlayContent}>{item.content}</Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* Marker toast */}
        {markerToast && (
          <Animated.View style={[s.markerToast, { opacity: markerToastAnim }]}>
            <Ionicons name="bookmark" size={13} color={CoachColors.accent} />
            <Text style={s.markerToastText}>{markerToast}</Text>
          </Animated.View>
        )}

        {/* Command Center */}
        <View style={s.commandCenter}>
          <View style={[s.panel, { height: PANEL_HEIGHT }]}>{renderPanel()}</View>

          {/* Dock */}
          <View style={s.dock}>
            <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }} style={s.dockTab} onPress={() => { Haptics.selectionAsync(); setActiveDockTab('activity'); }}>
              <Ionicons name="pulse-outline" size={25} color={activeDockTab === 'activity' ? CoachColors.accent : CoachColors.textMuted} />
              <Text style={[s.dockLabel, activeDockTab === 'activity' && s.dockLabelActive]}>Activity</Text>
            </TouchableOpacity>

            <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }} style={s.dockTab} onPress={() => { Haptics.selectionAsync(); setActiveDockTab('chat'); }}>
              <Ionicons name="chatbubble-ellipses-outline" size={25} color={activeDockTab === 'chat' ? CoachColors.accent : CoachColors.textMuted} />
              <Text style={[s.dockLabel, activeDockTab === 'chat' && s.dockLabelActive]}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }} style={s.dockTab} onPress={() => { Haptics.selectionAsync(); setActiveDockTab('actions'); }}>
              <Ionicons name="grid-outline" size={25} color={activeDockTab === 'actions' ? CoachColors.accent : CoachColors.textMuted} />
              <Text style={[s.dockLabel, activeDockTab === 'actions' && s.dockLabelActive]}>Actions</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.goLiveDockBtn, isBroadcasting && s.goLiveDockBtnLive]}
              onPress={isBroadcasting ? handleStopBroadcast : handleStartBroadcast}
              activeOpacity={0.85}
            >
              {/* onAccent in both states: on the live (danger) fill white is only
                  3.27:1, while onAccent reaches 5.75:1 on danger and 14.53:1 on accent. */}
              <Ionicons name={isBroadcasting ? 'stop-circle' : 'radio-outline'} size={20} color={CoachColors.onAccent} />
              <Text style={s.goLiveDockBtnText}>
                {isBroadcasting ? 'End' : 'Go live'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>

      {/* Edit title — cross-platform replacement for Alert.prompt (iOS-only) */}
      <Modal
        visible={showEditTitle}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!isSavingTitle) setShowEditTitle(false); }}
      >
        <KeyboardAvoidingView
          style={s.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalContent} accessibilityViewIsModal>
            <Text style={s.modalTitle} accessibilityRole="header">Edit title</Text>
            <Text style={s.modalMessage}>Rename this live class. Viewers see the new title right away.</Text>
            <TextInput
              style={s.modalInput}
              value={titleDraft}
              onChangeText={setTitleDraft}
              placeholder="Stream title"
              placeholderTextColor={CoachColors.textFaint}
              autoCorrect={false}
              returnKeyType="done"
              autoFocus
              maxLength={80}
              editable={!isSavingTitle}
              onSubmitEditing={handleSaveTitle}
              accessibilityLabel="Stream title"
            />
            <View style={s.modalButtons}>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnCancel]}
                onPress={() => setShowEditTitle(false)}
                disabled={isSavingTitle}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={s.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnConfirm, (!titleDraft.trim() || isSavingTitle) && { opacity: 0.35 }]}
                onPress={handleSaveTitle}
                disabled={!titleDraft.trim() || isSavingTitle}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Save title"
                accessibilityState={{ disabled: !titleDraft.trim() || isSavingTitle, busy: isSavingTitle }}
              >
                {isSavingTitle
                  ? <ActivityIndicator size="small" color={CoachColors.onAccent} />
                  : <Text style={s.modalBtnConfirmText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  overlay: { flex: 1, justifyContent: 'space-between' },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 8,
  },
  // Overlay chrome sitting on live camera footage keeps black scrims +
  // white-on-video text for legibility (media-player exception).
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous',
    backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
  },
  liveBadgeActive: { backgroundColor: CoachColors.dangerSoft, borderColor: CoachColors.danger },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, borderCurve: 'continuous', backgroundColor: 'rgba(255,255,255,0.4)' },
  liveDotActive: { backgroundColor: CoachColors.danger },
  liveBadgeText: { fontFamily: CoachFonts.headingBold, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  liveBadgeTextActive: { color: CoachColors.danger },
  timerText: { fontFamily: CoachFonts.headingBold, fontSize: 15.5, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5, fontVariant: ['tabular-nums'] },
  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full, borderCurve: 'continuous',
  },
  viewerPillText: { fontFamily: CoachFonts.headingBold, fontSize: 12.5, color: 'rgba(255,255,255,0.7)', fontVariant: ['tabular-nums'] },

  pinnedBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.72)', borderLeftWidth: 3, borderLeftColor: CoachColors.accent,
    borderRadius: Radius.xs, borderCurve: 'continuous', marginHorizontal: Spacing.md,
    paddingHorizontal: 10, paddingVertical: 8, gap: 4,
  },
  pinnedSender: { fontFamily: CoachFonts.headingBold, fontSize: 12.5, color: CoachColors.accent, marginBottom: 2 },
  pinnedContent: { fontFamily: CoachFonts.body, fontSize: 13.5, color: '#FFFFFF', lineHeight: 18 },

  chatOverlay: { justifyContent: 'flex-end', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  chatOverlayBubble: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: Radius.xs, borderCurve: 'continuous',
    paddingHorizontal: 8, paddingVertical: 5, marginBottom: 4,
    alignSelf: 'flex-start', maxWidth: '75%',
  },
  chatOverlaySender: { fontFamily: CoachFonts.headingBold, fontSize: 13.5, color: CoachColors.accent },
  chatOverlayContent: { fontFamily: CoachFonts.body, fontSize: 13.5, color: '#FFFFFF', flexShrink: 1 },

  markerToast: {
    position: 'absolute', top: 80, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: Radius.full, borderCurve: 'continuous',
    paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  markerToastText: { fontFamily: CoachFonts.headingBold, fontSize: 13.5, color: '#FFFFFF' },

  commandCenter: { backgroundColor: CoachColors.bg, borderTopWidth: 1, borderTopColor: CoachColors.border },
  panel: { overflow: 'hidden' },
  panelContainer: { flex: 1 },
  panelHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted,
  },
  panelTitle: { fontFamily: CoachFonts.headingBold, fontSize: 11, color: CoachColors.textSecondary, letterSpacing: 2, textTransform: 'uppercase' },
  panelHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  panelSubtitle: { fontFamily: CoachFonts.headingBold, fontSize: 10, color: CoachColors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' },
  liveDotSmall: { width: 5, height: 5, borderRadius: 2.5, borderCurve: 'continuous', backgroundColor: CoachColors.textFaint },
  liveDotSmallActive: { backgroundColor: CoachColors.danger },
  panelScroll: { flex: 1 },

  emptyPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl, gap: 8 },
  emptyPanelTitle: { fontFamily: CoachFonts.headingBold, fontSize: 15.5, color: CoachColors.textSecondary, textAlign: 'center' },
  emptyPanelSub: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 20 },

  activityRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted, gap: 10,
  },
  activityDot: { width: 6, height: 6, borderRadius: 3, borderCurve: 'continuous' },
  activityLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  activityTime: { fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textFaint, marginTop: 2 },

  chatPanelList: { flex: 1, paddingHorizontal: Spacing.md },
  chatPanelBubble: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted },
  chatPanelSender: { fontFamily: CoachFonts.headingBold, fontSize: 13.5, color: CoachColors.accent, marginBottom: 2 },
  chatPanelContent: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textPrimary, lineHeight: 20 },

  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.sm, gap: 8 },
  quickActionTile: {
    width: '30%', flexGrow: 1, borderRadius: Radius.sm, borderCurve: 'continuous',
    padding: Spacing.sm, alignItems: 'center', gap: 6, minHeight: 72,
    justifyContent: 'center', borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  quickActionIconBg: { width: 36, height: 36, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  quickActionLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 10, letterSpacing: 0.5, textAlign: 'center' },

  dock: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, gap: 4,
  },
  dockTab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  dockLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 10, color: CoachColors.textMuted, letterSpacing: 0.5 },
  dockLabelActive: { color: CoachColors.accent },
  goLiveDockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: CoachColors.accent, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: Radius.full,
    borderCurve: 'continuous',
    shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  goLiveDockBtnLive: { backgroundColor: CoachColors.danger, shadowColor: CoachColors.danger },
  goLiveDockBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.onAccent, letterSpacing: 0.8 },

  errorText: { fontFamily: CoachFonts.body, fontSize: 18, color: CoachColors.textPrimary, marginBottom: 20, marginTop: 12, textAlign: 'center' },
  backBtnAlt: { backgroundColor: CoachColors.surface, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.xs, borderCurve: 'continuous' },
  backBtnAltText: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.textPrimary },

  recapContainer: { flex: 1, backgroundColor: CoachColors.bg, justifyContent: 'center', paddingHorizontal: Spacing.lg },
  recapCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1,
    borderColor: CoachColors.border, borderRadius: Radius.md, borderCurve: 'continuous',
    padding: Spacing.xl, alignItems: 'center',
  },
  recapTag: { fontFamily: CoachFonts.headingBold, fontSize: 10, color: CoachColors.textMuted, letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' },
  recapTitle: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary, textAlign: 'center', marginBottom: 8 },
  recapSub: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  recapStatsRow: {
    flexDirection: 'row', backgroundColor: CoachColors.bg,
    borderRadius: Radius.sm, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: Spacing.xl, width: '100%', justifyContent: 'space-around', alignItems: 'center',
  },
  recapStatBox: { alignItems: 'center' },
  recapStatLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 9, color: CoachColors.textMuted, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  recapStatVal: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary },
  recapStatDivider: { width: 1, height: 28, backgroundColor: CoachColors.border },
  saveVodBtn: {
    backgroundColor: CoachColors.accent, width: '100%', paddingVertical: 16,
    borderRadius: Radius.md, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, marginBottom: 12,
    shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  saveVodBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.onAccent, letterSpacing: 1 },
  discardBtn: { paddingVertical: 10 },
  discardBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textMuted, letterSpacing: 1 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(10,11,9,0.8)',
    justifyContent: 'center', alignItems: 'center', padding: Spacing.lg,
  },
  modalContent: {
    width: '100%', backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: Radius.md, borderCurve: 'continuous', padding: Spacing.lg,
  },
  modalTitle: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary },
  modalMessage: {
    fontFamily: CoachFonts.body, fontSize: 14.5, lineHeight: 21.5,
    color: CoachColors.textMuted, marginTop: 8, marginBottom: 18,
  },
  modalInput: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: Radius.sm, borderCurve: 'continuous', paddingHorizontal: 15, paddingVertical: 16,
    marginBottom: 18,
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full, borderCurve: 'continuous', paddingVertical: 13 },
  modalBtnCancel: { borderWidth: 1, borderColor: CoachColors.border },
  modalBtnCancelText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  modalBtnConfirm: { backgroundColor: CoachColors.accent },
  modalBtnConfirmText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },
});
