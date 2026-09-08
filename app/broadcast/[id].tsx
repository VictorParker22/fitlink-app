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
import InviteSheet from '../../components/invites/InviteSheet';
import {
  StreamSetupError,
  isStreamSetupError,
  isPlaceholderStreamKey,
  readStreamSecrets,
  requestMuxStream,
  persistStreamSecrets,
  describeStreamSetupError,
  broadcastBreadcrumb,
  reportBroadcastFailure,
  reportBroadcastWarning,
  withTimeout,
  NETWORK_TIMEOUT_MS,
  endLiveClass,
} from '../../lib/streamSetup';

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

const RTMP_INGEST_URL = 'rtmp://global-live.mux.com:5222/app';
/** How long the publisher gets to report onPublishStarted before the attempt fails. */
const CONNECT_WATCHDOG_MS = 20_000;
/** Delay before the class is flipped to 'live' for athletes, so a stream that drops at once is never listed. */
const LIVE_FLIP_DELAY_MS = 8000;

/**
 * Go-live phases. 'live' is only ever entered from onPublishStarted; the
 * connect watchdog and onPublishError land in 'failed', which is tappable
 * again.
 */
type BroadcastPhase = 'idle' | 'preparing' | 'connecting' | 'live' | 'failed';

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
  const { liveClasses, updateLiveClass, createClass, classes, deleteClass, trainer } = useApp();
  const { showAlert } = useAlert();
  const reduceMotion = useReducedMotion();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>(
    params.cameraFacing === 'back' ? 'back' : 'front'
  );
  const [phase, setPhase] = useState<BroadcastPhase>('idle');
  // Mirror for callbacks and timers that must read the phase without a stale closure.
  const phaseRef = useRef<BroadcastPhase>('idle');
  const isBroadcasting = phase === 'live';
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
  const [showLiveInvite, setShowLiveInvite] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Marker toast
  const [markerToast, setMarkerToast] = useState<string | null>(null);
  const markerToastAnim = useRef(new Animated.Value(0)).current;

  const publisherRef = useRef<any>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptStartedAtRef = useRef(0);
  // The key in use for this attempt, held only to scrub it from anything reported.
  const activeKeyRef = useRef<string | null>(null);
  // Set when the coach ends the stream, so onPublishStopped can tell a chosen stop from a drop.
  const userStoppedRef = useRef(false);
  // Latest handleStartBroadcast, for the retry button on a failure alert.
  const startRef = useRef<() => void>(() => {});

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
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      // Clear all pending fade-out animations so there are no post-unmount state updates
      opacityMap.clear();
      // Leaving the screen unmounts the native publisher, so the stream is
      // over whether or not the coach tapped End. Close the class on the
      // server too (retried, parked on failure) instead of leaving Studio
      // with a "Return to broadcast" that cannot return to anything.
      if (!endedLocallyRef.current && (phaseRef.current === 'live' || phaseRef.current === 'connecting') && liveClassIdRef.current) {
        const id = liveClassIdRef.current;
        endedLocallyRef.current = true;
        try { publisherRef.current?.stopPublishing?.(); } catch {}
        broadcastBreadcrumb('studio: left while live, ending', { live_class_id: id });
        endLiveClass(id, updateLiveClass).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The class id the unmount path needs after state is gone.
  const liveClassIdRef = useRef<string | null>(null);
  useEffect(() => { liveClassIdRef.current = liveClass?.id ?? null; }, [liveClass?.id]);
  const endedLocallyRef = useRef(false);

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
  // Opens the live invite sheet (design canvas "FitLink Invitations", board
  // 06): a fitlink.coach/live/<CODE> link that guests watch on the web. The
  // edit-title Modal and this sheet are never visible together (INVARIANTS §5).
  const handleShareStream = useCallback(() => {
    if (!liveClass || showEditTitle) return;
    setShowLiveInvite(true);
  }, [liveClass, showEditTitle]);

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

  // ── Go-live phase machine ─────────────────────────────────────────────────
  //
  //   idle ──tap──▶ preparing ──key in hand──▶ connecting ──onPublishStarted──▶ live
  //                    │                          │  ▲                            │
  //                    │ StreamSetupError         │  │ retry                      │ End
  //                    ▼                          ▼  │                            ▼
  //                  failed ◀──── watchdog (20 s) / onPublishError ──────────  idle
  //
  // Timeouts: 15 s on every network call (secrets read, create-mux-stream,
  // confirm-entitlement, playback-id update, secrets save), 20 s from
  // startPublishing to onPublishStarted. The LIVE timer only counts in 'live'.

  const setPhaseSafe = (next: BroadcastPhase) => {
    phaseRef.current = next;
    if (isMountedRef.current) setPhase(next);
  };

  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  const clearLiveFlip = () => {
    if (liveTimeoutRef.current) {
      clearTimeout(liveTimeoutRef.current);
      liveTimeoutRef.current = null;
    }
  };

  /** Stop the publisher without caring whether there was anything to stop. */
  const stopPublisherQuietly = () => {
    try {
      const p = publisherRef.current?.stopPublishing?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // Nothing to stop, or the native side already tore down.
    }
  };

  /** Anything reported about a failure must never carry the stream key. */
  const scrubKey = (text: string) => {
    const key = activeKeyRef.current;
    return key && text.includes(key) ? text.split(key).join('[stream key]') : text;
  };

  // Flip the class to 'live' for athletes a few seconds after the publisher
  // connects, so a stream that drops at once is never listed.
  const scheduleLiveFlip = (liveClassId: string) => {
    clearLiveFlip();
    liveTimeoutRef.current = setTimeout(async () => {
      liveTimeoutRef.current = null;
      // Guard: nothing to list if the coach left or the stream already died.
      if (!isMountedRef.current || phaseRef.current !== 'live') return;
      try {
        await updateLiveClass(liveClassId, { status: 'live' });
        broadcastBreadcrumb('studio: class marked live', { live_class_id: liveClassId });
      } catch (e: any) {
        // If this never lands the class stays 'scheduled' and no athlete can
        // find the stream — the coach is broadcasting to nobody.
        reportBroadcastFailure(e, { step: 'studio.liveFlip', live_class_id: liveClassId, phase: phaseRef.current });
        showAlert({
          type: 'error',
          title: 'Stream not listed',
          message: 'You are broadcasting, but the class could not be marked live so athletes may not see it. End and start again if nobody joins.',
        });
      }
    }, LIVE_FLIP_DELAY_MS);
  };

  /**
   * One exit for every way an attempt can die: a StreamSetupError while
   * preparing, a rejected startPublishing, onPublishError, the connect
   * watchdog, or a drop while live. Stops the publisher, lands in 'failed'
   * and offers a retry. Never shows a second alert for an attempt that has
   * already failed.
   */
  const failAttempt = (err: unknown, source: 'prepare' | 'publish_error' | 'watchdog' | 'stopped') => {
    const prev = phaseRef.current;
    const elapsed = attemptStartedAtRef.current ? Date.now() - attemptStartedAtRef.current : 0;
    const detail = scrubKey(err instanceof Error ? err.message : String(err));
    if (prev === 'idle' || prev === 'failed') {
      broadcastBreadcrumb('studio: publisher event outside an attempt', { source, phase: prev, detail });
      return;
    }
    const safeErr = err instanceof Error && err.message === detail ? err : new Error(detail);
    clearWatchdog();
    clearLiveFlip();
    setPhaseSafe('failed');
    stopPublisherQuietly();
    activeKeyRef.current = null;
    broadcastBreadcrumb('studio: attempt failed', { source, phase: prev, elapsed_ms: elapsed });
    if (source === 'watchdog') {
      reportBroadcastWarning('studio: connect watchdog expired', { phase: prev, elapsed_ms: elapsed, watchdog_ms: CONNECT_WATCHDOG_MS });
    } else if (source === 'stopped') {
      reportBroadcastWarning('studio: publisher stopped unexpectedly', { phase: prev, elapsed_ms: elapsed });
    } else {
      reportBroadcastFailure(safeErr, { step: `studio.${source}`, phase: prev, elapsed_ms: elapsed });
    }
    if (!isMountedRef.current) return;

    let title: string;
    let message: string;
    if (source === 'watchdog') {
      title = 'Stream did not connect';
      message = `The stream service did not answer within ${Math.round(CONNECT_WATCHDOG_MS / 1000)} seconds. Check your connection and try again.`;
    } else if (source === 'stopped') {
      title = 'Stream stopped';
      message = 'The stream stopped before you ended it. Try again to reconnect.';
    } else if (source === 'publish_error' || (prev === 'connecting' && !isStreamSetupError(err))) {
      title = prev === 'live' ? 'Stream dropped' : 'Stream could not connect';
      message = prev === 'live'
        ? 'The connection to the stream service was lost. Try again to reconnect.'
        : 'The stream service refused the connection. Try again in a moment.';
    } else {
      ({ title, message } = describeStreamSetupError(err));
    }
    showAlert({
      type: 'error',
      title,
      message,
      buttons: [
        { text: 'Not now', style: 'cancel' },
        { text: 'Try again', onPress: () => startRef.current() },
      ],
    });
  };

  const handlePublishStarted = () => {
    if (phaseRef.current !== 'connecting') {
      // A start arriving after the watchdog gave up: it was already told to stop.
      broadcastBreadcrumb('studio: publish started outside connecting', { phase: phaseRef.current });
      if (phaseRef.current === 'failed' || phaseRef.current === 'idle') stopPublisherQuietly();
      return;
    }
    clearWatchdog();
    const connectMs = Date.now() - attemptStartedAtRef.current;
    setPhaseSafe('live');
    // 'done' in the haptic vocabulary: the one success moment of the flow.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    broadcastBreadcrumb('studio: live', { elapsed_ms: connectMs, live_class_id: liveClass?.id ?? null });
    if (liveClass) scheduleLiveFlip(liveClass.id);
  };

  const handlePublishStopped = () => {
    broadcastBreadcrumb('studio: publish stopped', { phase: phaseRef.current, by_user: userStoppedRef.current });
    // A stop while live that the coach did not ask for is a drop. During
    // 'connecting' the watchdog and onPublishError already cover a failed
    // connect, and a late stop from the previous attempt must not kill a
    // retry, so nothing else is treated as a failure.
    if (phaseRef.current === 'live' && !userStoppedRef.current) {
      failAttempt(new Error('publisher stopped while live'), 'stopped');
    }
  };

  // ── Start broadcast ───────────────────────────────────────────────────────
  const handleStartBroadcast = async () => {
    if (!liveClass) return;
    const before = phaseRef.current;
    if (before === 'preparing' || before === 'connecting' || before === 'live') return;
    // 'start' in the haptic vocabulary (constants/motion.ts) is a medium impact.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const startedAt = Date.now();
    attemptStartedAtRef.current = startedAt;
    userStoppedRef.current = false;
    activeKeyRef.current = null;
    setElapsedSeconds(0);
    setPhaseSafe('preparing');
    broadcastBreadcrumb('studio: go live tapped', { live_class_id: liveClass.id, retry: before === 'failed' });

    try {
      // 1. Credentials (15 s). No row, or a placeholder key, means the class
      //    predates up-front stream creation or its stream was never saved.
      const secrets = await readStreamSecrets(liveClass.id);
      let activeKey = secrets?.stream_key ?? null;
      broadcastBreadcrumb('studio: secrets loaded', {
        has_row: !!secrets,
        placeholder: isPlaceholderStreamKey(activeKey),
        elapsed_ms: Date.now() - startedAt,
      });

      // 2. No real key: ask for a stream once. requestMuxStream applies the
      //    402 -> confirmEntitlement -> retry rule and times out at 15 s.
      if (isPlaceholderStreamKey(activeKey)) {
        const stream = await requestMuxStream();
        activeKey = stream.stream_key;
        // Athletes watch through mux_playback_id; without it the stream is
        // invisible, so this update is part of the attempt.
        await withTimeout(
          updateLiveClass(liveClass.id, { mux_playback_id: stream.playback_id }),
          NETWORK_TIMEOUT_MS,
          'live_classes playback update',
        );
        // The key is already in memory for THIS broadcast; a failed save
        // only costs the next one, so make it loud rather than fatal.
        const { error: persistError } = await persistStreamSecrets(liveClass.id, stream);
        if (persistError) {
          reportBroadcastWarning('studio: could not persist new stream key', { live_class_id: liveClass.id, detail: persistError });
        }
        broadcastBreadcrumb('studio: stream created', { elapsed_ms: Date.now() - startedAt, persisted: !persistError });
      }
      if (!activeKey || isPlaceholderStreamKey(activeKey)) {
        throw new StreamSetupError('mux_error', { detail: 'no usable key after setup' });
      }
      if (!publisherRef.current) {
        throw new StreamSetupError('mux_error', {
          message: 'The camera is not ready yet. Give it a moment and try again.',
          detail: 'publisher ref missing',
        });
      }

      // 3. Connect. 'live' is only declared by onPublishStarted; if that
      //    never comes the watchdog fails the attempt.
      activeKeyRef.current = activeKey;
      setPhaseSafe('connecting');
      broadcastBreadcrumb('studio: connecting', { elapsed_ms: Date.now() - startedAt });
      clearWatchdog();
      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        if (phaseRef.current !== 'connecting') return;
        failAttempt(new StreamSetupError('timeout', { detail: 'onPublishStarted never fired' }), 'watchdog');
      }, CONNECT_WATCHDOG_MS);
      await publisherRef.current.startPublishing(RTMP_INGEST_URL, activeKey, {
        videoWidth: 720, videoHeight: 1280, videoBitrate: 2500000, audioBitrate: 128000,
      });
      broadcastBreadcrumb('studio: startPublishing returned', { elapsed_ms: Date.now() - startedAt, phase: phaseRef.current });
    } catch (e) {
      if (phaseRef.current === 'live') {
        // startPublishing rejected after the publisher already reported a
        // start. The stream is up; record the oddity and keep it.
        reportBroadcastWarning('studio: startPublishing rejected after live', {
          detail: scrubKey(e instanceof Error ? e.message : String(e)),
        });
        return;
      }
      failAttempt(e, 'prepare');
    }
  };

  useEffect(() => {
    startRef.current = handleStartBroadcast;
  });

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
              userStoppedRef.current = true;
              clearWatchdog();
              // A pending flip to 'live' must not fire after the class is ended.
              clearLiveFlip();
              broadcastBreadcrumb('studio: end confirmed', { phase: phaseRef.current, elapsed_s: elapsedSeconds });
              // The camera stops no matter what the network does next.
              if (publisherRef.current) { try { await publisherRef.current.stopPublishing(); } catch {} }
              setPhaseSafe('idle');
              if (timerRef.current) clearInterval(timerRef.current);
              endedLocallyRef.current = true;
              if (liveClass) {
                const r = await endLiveClass(liveClass.id, updateLiveClass);
                if (!r.confirmed) {
                  showAlert({
                    type: 'info',
                    title: 'Stream stopped',
                    message: "Your camera is off and nobody can watch. We couldn't reach FitLink to close the class yet; it will close on its own within a couple of minutes, and Studio keeps trying.",
                  });
                }
              }
              setShowRecap(true);
            } catch (e: any) {
              reportBroadcastFailure(e, { step: 'studio.end', phase: phaseRef.current });
              showAlert({ type: 'error', title: 'Could not stop the stream', message: 'Try End again. If the camera light is off, the stream has already stopped.' });
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

  // The Go live button reads the phase: busy while preparing or connecting,
  // an End button while live, tappable again after a failure.
  const goLiveBusy = phase === 'preparing' || phase === 'connecting';
  const goLiveLabel =
    phase === 'live' ? 'End'
    : phase === 'preparing' ? 'Preparing'
    : phase === 'connecting' ? 'Connecting'
    : phase === 'failed' ? 'Try again'
    : 'Go live';
  const badgeLabel =
    phase === 'live' ? 'LIVE'
    : phase === 'connecting' ? 'CONNECTING'
    : phase === 'preparing' ? 'PREPARING'
    : 'READY';

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Camera */}
      <ExpoCameraRtmpPublisherView
        ref={publisherRef}
        style={[StyleSheet.absoluteFillObject, { bottom: PANEL_HEIGHT + 56 }]}
        cameraPosition={cameraPosition}
        muted={isMuted}
        onReady={() => { setCameraReady(true); broadcastBreadcrumb('studio: camera ready'); }}
        onPublishStarted={handlePublishStarted}
        onPublishStopped={handlePublishStopped}
        onPublishError={(err: unknown) => failAttempt(err, 'publish_error')}
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
                      userStoppedRef.current = true;
                      clearWatchdog();
                      clearLiveFlip();
                      broadcastBreadcrumb('studio: end and leave', { phase: phaseRef.current });
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
              } else {
                // Leaving mid-attempt: stop whatever the publisher is doing first.
                clearWatchdog();
                if (phaseRef.current === 'preparing' || phaseRef.current === 'connecting') {
                  userStoppedRef.current = true;
                  broadcastBreadcrumb('studio: left during attempt', { phase: phaseRef.current });
                  stopPublisherQuietly();
                }
                router.back();
              }
            }}
            style={s.iconBtn}
          >
            <Ionicons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={s.topBarCenter}>
            <View style={[s.liveBadge, isBroadcasting && s.liveBadgeActive]}>
              <View style={[s.liveDot, isBroadcasting && s.liveDotActive]} />
              <Text style={[s.liveBadgeText, isBroadcasting && s.liveBadgeTextActive]}>
                {badgeLabel}
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
              style={[s.goLiveDockBtn, isBroadcasting && s.goLiveDockBtnLive, goLiveBusy && s.goLiveDockBtnBusy]}
              onPress={isBroadcasting ? handleStopBroadcast : handleStartBroadcast}
              disabled={goLiveBusy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={isBroadcasting ? 'End stream' : goLiveLabel}
              accessibilityState={{ disabled: goLiveBusy, busy: goLiveBusy }}
            >
              {/* onAccent in both states: on the live (danger) fill white is only
                  3.27:1, while onAccent reaches 5.75:1 on danger and 14.53:1 on accent. */}
              {goLiveBusy ? (
                <ActivityIndicator size="small" color={CoachColors.onAccent} />
              ) : (
                <Ionicons name={isBroadcasting ? 'stop-circle' : 'radio-outline'} size={20} color={CoachColors.onAccent} />
              )}
              <Text style={s.goLiveDockBtnText}>{goLiveLabel}</Text>
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

      <InviteSheet
        visible={showLiveInvite}
        kind="live"
        liveClassId={liveClass?.id ?? null}
        liveTitle={liveClass?.title ?? null}
        coachName={trainer?.name}
        onClose={() => setShowLiveInvite(false)}
      />
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
  goLiveDockBtnBusy: { opacity: 0.75 },
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
