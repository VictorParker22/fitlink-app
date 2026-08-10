import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Animated,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useApp, LiveClassItem } from '../../context/AppContext';
import { FontFamily, Radius, Spacing } from '../../constants/theme';
import { useAlert } from '../../context/AlertContext';
import { supabase } from '../../lib/supabase';

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
    console.warn('[Broadcast Studio] Native RTMP module load error:', e);
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
  { id: 'marker', icon: 'bookmark-outline',      label: 'Add Marker',   color: '#9B59B6', bg: 'rgba(155,89,182,0.15)' },
  { id: 'mute',   icon: 'mic-outline',            label: 'Mute Mic',     color: '#FFFFFF', bg: 'rgba(255,255,255,0.07)' },
  { id: 'flip',   icon: 'camera-reverse-outline', label: 'Flip Camera',  color: '#FFFFFF', bg: 'rgba(255,255,255,0.07)' },
  { id: 'share',  icon: 'share-outline',          label: 'Share Stream', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  { id: 'edit',   icon: 'create-outline',         label: 'Edit Title',   color: '#FF6B35', bg: 'rgba(255,107,53,0.15)' },
  { id: 'end',    icon: 'stop-circle-outline',    label: 'End Stream',   color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
] as const;

export default function BroadcastStudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const params = useLocalSearchParams<{ micEnabled?: string; cameraFacing?: string }>();
  const router = useRouter();
  const { liveClasses, updateLiveClass, createClass, classes, deleteClass } = useApp();
  const { showAlert } = useAlert();

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

  // Marker toast
  const [markerToast, setMarkerToast] = useState<string | null>(null);
  const markerToastAnim = useRef(new Animated.Value(0)).current;

  const publisherRef = useRef<any>(null);

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

    Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    const fadeOutTimer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => {
        setChatMessages(prev => prev.filter(m => m.id !== full.id));
        opacityMap.delete(full.id);
      });
    }, MSG_VISIBLE_MS);

    return () => clearTimeout(fadeOutTimer);
  }, []);

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
    supabase.from('live_class_messages').update({ is_pinned: true }).eq('id', msg.id).then(() => {});
  }, []);

  const handleUnpinMessage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPinnedMessage(null);
  }, []);

  // ── Marker toast ──────────────────────────────────────────────────────────
  const showMarkerToast = useCallback((timestamp: string) => {
    setMarkerToast(`Marker added at ${timestamp}`);
    Animated.sequence([
      Animated.timing(markerToastAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(markerToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setMarkerToast(null));
  }, [markerToastAnim]);

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
        showAlert({ type: 'info', title: 'Share Stream', message: 'Stream link copied to clipboard!' });
        break;
      case 'edit':
        showAlert({ type: 'info', title: 'Edit Title', message: 'Title editing coming soon.' });
        break;
      case 'end':
        handleStopBroadcast();
        break;
    }
  }, [elapsedSeconds, showMarkerToast, addActivity]);

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
        const { data: muxData, error: muxError } = await supabase.functions.invoke('create-mux-stream');
        if (!muxError && muxData?.stream_key) {
          activeStreamKey = muxData.stream_key;
          await updateLiveClass(liveClass.id, { mux_playback_id: muxData.playback_id });
          await supabase.from('live_class_secrets').update({
            mux_stream_id: muxData.stream_id,
            mux_stream_key: muxData.stream_key,
          }).eq('live_class_id', liveClass.id);
        }
      } catch (err: any) {
        showAlert({ type: 'error', title: 'Mux Setup Error', message: err.message || 'Could not reach Mux Edge Function.' });
      }
    }

    if (!activeStreamKey || activeStreamKey.startsWith('key_')) {
      showAlert({ type: 'error', title: 'Invalid Stream Key', message: 'A valid Mux stream key is required.' });
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

      setTimeout(async () => {
        try { await updateLiveClass(liveClass.id, { status: 'live' }); } catch (e) {}
      }, 8000);
    } catch (e: any) {
      console.warn('[Broadcast] Streaming start warning:', e);
    }
  };

  // ── Stop broadcast ────────────────────────────────────────────────────────
  const handleStopBroadcast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('End Stream?', 'Are you sure you want to end this live class broadcast?', [
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
    ]);
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
        try { await deleteClass(muxDrafts[0].id); } catch (e) {}
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
  if (Platform.OS !== 'ios' || !ExpoCameraRtmpPublisherView) {
    return (
      <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xl }]}>
        <View style={s.recapCard}>
          <Ionicons name="radio" size={48} color="#C8F135" style={{ marginBottom: 12 }} />
          <Text style={s.recapTag}>IOS BROADCAST STUDIO</Text>
          <Text style={s.recapTitle}>Camera Streaming</Text>
          <Text style={s.recapSub}>
            Mobile camera live broadcasting via RTMP is supported on iOS devices. Android support coming soon!
          </Text>
          <TouchableOpacity style={s.saveVodBtn} onPress={() => router.back()}>
            <Text style={s.saveVodBtnText}>RETURN TO STUDIO</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (hasPermission === null || !liveClass) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color="#C8F135" size="large" />
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontFamily: FontFamily.body, fontSize: 12, marginTop: 12 }}>
          Loading broadcast studio…
        </Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="mic-off" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={s.errorText}>No access to camera or microphone.</Text>
        <TouchableOpacity style={s.backBtnAlt} onPress={() => router.back()}>
          <Text style={s.backBtnAltText}>GO BACK</Text>
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
            <Ionicons name="checkmark-circle" size={56} color="#C8F135" />
          </View>
          <Text style={s.recapTag}>STREAM COMPLETED</Text>
          <Text style={s.recapTitle}>{liveClass.title}</Text>
          <Text style={s.recapSub}>Great session! Here is your broadcast summary.</Text>

          <View style={s.recapStatsRow}>
            <View style={s.recapStatBox}>
              <Text style={s.recapStatLabel}>DURATION</Text>
              <Text style={s.recapStatVal}>{formatTimer(elapsedSeconds)}</Text>
            </View>
            <View style={s.recapStatDivider} />
            <View style={s.recapStatBox}>
              <Text style={s.recapStatLabel}>PEAK VIEWERS</Text>
              <Text style={s.recapStatVal}>{viewerCount || 0}</Text>
            </View>
            <View style={s.recapStatDivider} />
            <View style={s.recapStatBox}>
              <Text style={s.recapStatLabel}>CHAT MSGS</Text>
              <Text style={s.recapStatVal}>{chatMessages.length}</Text>
            </View>
          </View>

          <TouchableOpacity style={s.saveVodBtn} onPress={handleSaveToOnDemand} disabled={isSaving} activeOpacity={0.85}>
            {isSaving ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <>
                <Ionicons name="library" size={18} color="#000000" />
                <Text style={s.saveVodBtnText}>SAVE TO ON-DEMAND LIBRARY</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.discardBtn} onPress={() => router.back()} disabled={isSaving}>
            <Text style={s.discardBtnText}>RETURN TO STUDIO</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Panels ────────────────────────────────────────────────────────────────
  const renderActivityFeed = () => (
    <View style={s.panelContainer}>
      <View style={s.panelHeader}>
        <Text style={s.panelTitle}>ACTIVITY FEED</Text>
        <View style={s.panelHeaderRight}>
          <View style={[s.liveDotSmall, isBroadcasting && s.liveDotSmallActive]} />
          <Text style={s.panelSubtitle}>{isBroadcasting ? 'LIVE' : 'OFFLINE'}</Text>
        </View>
      </View>
      {activityEvents.length === 0 ? (
        <View style={s.emptyPanel}>
          <Ionicons name="volume-mute-outline" size={32} color="rgba(255,255,255,0.12)" />
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
                  event.type === 'join' ? '#C8F135' :
                  event.type === 'follow' ? '#FF6B35' : '#9B59B6',
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
                color="rgba(255,255,255,0.2)"
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
        <Text style={s.panelTitle}>LIVE CHAT</Text>
        <Text style={s.panelSubtitle}>{chatMessages.length} MESSAGES</Text>
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
            <Ionicons name="chatbubbles-outline" size={28} color="rgba(255,255,255,0.12)" />
            <Text style={s.emptyPanelTitle}>No messages yet</Text>
            <Text style={s.emptyPanelSub}>Chat messages from your viewers will appear here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
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
        <Text style={s.panelTitle}>QUICK ACTIONS</Text>
        <Text style={s.panelSubtitle}>TAP TO EXECUTE</Text>
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
                color={action.id === 'mute' && isMuted ? '#EF4444' : action.color}
              />
            </View>
            <Text style={[s.quickActionLabel, { color: action.color }]}>
              {action.id === 'mute' ? (isMuted ? 'Unmute Mic' : 'Mute Mic') : action.label}
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
      <View style={[StyleSheet.absoluteFillObject, { top: SCREEN_H - PANEL_HEIGHT - 56, backgroundColor: '#0D0D12' }]} />

      <SafeAreaView style={s.overlay} pointerEvents="box-none">

        {/* Top Bar */}
        <View style={s.topBar}>
          <TouchableOpacity
            onPress={() => {
              if (isBroadcasting) {
                Alert.alert('Leave Studio?', 'This will end your current broadcast.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'End & Leave', style: 'destructive', onPress: async () => {
                    try {
                      if (publisherRef.current) await publisherRef.current.stopPublishing();
                      if (liveClass) await updateLiveClass(liveClass.id, { status: 'ended' });
                    } catch (e) {}
                    router.back();
                  }},
                ]);
              } else { router.back(); }
            }}
            style={s.iconBtn}
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
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
                <Ionicons name="eye" size={12} color="rgba(255,255,255,0.6)" />
                <Text style={s.viewerPillText}>{viewerCount}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsMuted(v => !v); }}
              style={[s.iconBtn, isMuted && { backgroundColor: 'rgba(239,68,68,0.85)' }]}
            >
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCameraPosition(v => v === 'front' ? 'back' : 'front'); }}
              style={s.iconBtn}
            >
              <Ionicons name="camera-reverse-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pinned banner */}
        {pinnedMessage && (
          <View style={s.pinnedBanner} pointerEvents="box-none">
            <Ionicons name="pin" size={11} color="#FF6B35" style={{ marginRight: 6, marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.pinnedSender}>{pinnedMessage.sender}</Text>
              <Text style={s.pinnedContent} numberOfLines={2}>{pinnedMessage.content}</Text>
            </View>
            <TouchableOpacity onPress={handleUnpinMessage} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
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
                  <TouchableOpacity
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
            <Ionicons name="bookmark" size={12} color="#9B59B6" />
            <Text style={s.markerToastText}>{markerToast}</Text>
          </Animated.View>
        )}

        {/* Command Center */}
        <View style={s.commandCenter}>
          <View style={[s.panel, { height: PANEL_HEIGHT }]}>{renderPanel()}</View>

          {/* Dock */}
          <View style={s.dock}>
            <TouchableOpacity style={s.dockTab} onPress={() => { Haptics.selectionAsync(); setActiveDockTab('activity'); }}>
              <Ionicons name="pulse-outline" size={22} color={activeDockTab === 'activity' ? '#C8F135' : 'rgba(255,255,255,0.35)'} />
              <Text style={[s.dockLabel, activeDockTab === 'activity' && s.dockLabelActive]}>Activity</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.dockTab} onPress={() => { Haptics.selectionAsync(); setActiveDockTab('chat'); }}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={activeDockTab === 'chat' ? '#C8F135' : 'rgba(255,255,255,0.35)'} />
              <Text style={[s.dockLabel, activeDockTab === 'chat' && s.dockLabelActive]}>Chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.dockTab} onPress={() => { Haptics.selectionAsync(); setActiveDockTab('actions'); }}>
              <Ionicons name="grid-outline" size={22} color={activeDockTab === 'actions' ? '#C8F135' : 'rgba(255,255,255,0.35)'} />
              <Text style={[s.dockLabel, activeDockTab === 'actions' && s.dockLabelActive]}>Actions</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.goLiveDockBtn, isBroadcasting && s.goLiveDockBtnLive]}
              onPress={isBroadcasting ? handleStopBroadcast : handleStartBroadcast}
              activeOpacity={0.85}
            >
              <Ionicons name={isBroadcasting ? 'stop-circle' : 'radio-outline'} size={18} color={isBroadcasting ? '#FFFFFF' : '#000000'} />
              <Text style={[s.goLiveDockBtnText, isBroadcasting && { color: '#FFFFFF' }]}>
                {isBroadcasting ? 'END' : 'GO LIVE'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </SafeAreaView>
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
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: Radius.full,
  },
  liveBadgeActive: { backgroundColor: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.5)' },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: 'rgba(255,255,255,0.4)' },
  liveDotActive: { backgroundColor: '#EF4444' },
  liveBadgeText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 },
  liveBadgeTextActive: { color: '#EF4444' },
  timerText: { fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5 },
  viewerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full,
  },
  viewerPillText: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: 'rgba(255,255,255,0.7)' },

  pinnedBanner: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.72)', borderLeftWidth: 3, borderLeftColor: '#FF6B35',
    borderRadius: Radius.xs, marginHorizontal: Spacing.md,
    paddingHorizontal: 10, paddingVertical: 8, gap: 4,
  },
  pinnedSender: { fontFamily: FontFamily.headingExtraBold, fontSize: 11, color: '#FF6B35', marginBottom: 2 },
  pinnedContent: { fontFamily: FontFamily.body, fontSize: 12, color: '#FFFFFF', lineHeight: 16 },

  chatOverlay: { justifyContent: 'flex-end', paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  chatOverlayBubble: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: Radius.xs,
    paddingHorizontal: 8, paddingVertical: 5, marginBottom: 4,
    alignSelf: 'flex-start', maxWidth: '75%',
  },
  chatOverlaySender: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#C8F135' },
  chatOverlayContent: { fontFamily: FontFamily.body, fontSize: 12, color: '#FFFFFF', flexShrink: 1 },

  markerToast: {
    position: 'absolute', top: 80, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(22,11,35,0.95)', borderRadius: Radius.full,
    paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(155,89,182,0.5)',
  },
  markerToastText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#FFFFFF' },

  commandCenter: { backgroundColor: '#0D0D12', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  panel: { overflow: 'hidden' },
  panelContainer: { flex: 1 },
  panelHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  panelTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 2 },
  panelHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  panelSubtitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5 },
  liveDotSmall: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  liveDotSmallActive: { backgroundColor: '#EF4444' },
  panelScroll: { flex: 1 },

  emptyPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl, gap: 8 },
  emptyPanelTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 14, color: 'rgba(255,255,255,0.3)', textAlign: 'center' },
  emptyPanelSub: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 18 },

  activityRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)', gap: 10,
  },
  activityDot: { width: 6, height: 6, borderRadius: 3 },
  activityLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: '#FFFFFF' },
  activityTime: { fontFamily: FontFamily.body, fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 },

  chatPanelList: { flex: 1, paddingHorizontal: Spacing.md },
  chatPanelBubble: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  chatPanelSender: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#C8F135', marginBottom: 2 },
  chatPanelContent: { fontFamily: FontFamily.body, fontSize: 13, color: '#FFFFFF', lineHeight: 18 },

  quickActionsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: Spacing.sm, gap: 8 },
  quickActionTile: {
    width: '30%', flexGrow: 1, borderRadius: Radius.sm,
    padding: Spacing.sm, alignItems: 'center', gap: 6, minHeight: 72,
    justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  quickActionIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  quickActionLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 9, letterSpacing: 0.5, textAlign: 'center' },

  dock: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.sm, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', gap: 4,
  },
  dockTab: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4 },
  dockLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 0.5 },
  dockLabelActive: { color: '#C8F135' },
  goLiveDockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#C8F135', paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: Radius.full,
    shadowColor: '#C8F135', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  goLiveDockBtnLive: { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
  goLiveDockBtnText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#000000', letterSpacing: 0.8 },

  errorText: { fontFamily: FontFamily.body, fontSize: 16, color: '#FFFFFF', marginBottom: 20, marginTop: 12, textAlign: 'center' },
  backBtnAlt: { backgroundColor: '#1C1C1E', paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.xs },
  backBtnAltText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#FFFFFF' },

  recapContainer: { flex: 1, backgroundColor: '#0D0D12', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  recapCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', borderRadius: Radius.md,
    padding: Spacing.xl, alignItems: 'center',
  },
  recapTag: { fontFamily: FontFamily.headingExtraBold, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: 4 },
  recapTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 22, color: '#FFFFFF', textAlign: 'center', marginBottom: 8 },
  recapSub: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: Spacing.xl },
  recapStatsRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.sm, paddingVertical: 14, paddingHorizontal: 16,
    marginBottom: Spacing.xl, width: '100%', justifyContent: 'space-around', alignItems: 'center',
  },
  recapStatBox: { alignItems: 'center' },
  recapStatLabel: { fontFamily: FontFamily.headingExtraBold, fontSize: 8, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 4 },
  recapStatVal: { fontFamily: FontFamily.headingExtraBold, fontSize: 18, color: '#FFFFFF' },
  recapStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.1)' },
  saveVodBtn: {
    backgroundColor: '#C8F135', width: '100%', paddingVertical: 16,
    borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, marginBottom: 12,
    shadowColor: '#C8F135', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4,
  },
  saveVodBtnText: { fontFamily: FontFamily.headingExtraBold, fontSize: 12, color: '#000000', letterSpacing: 1 },
  discardBtn: { paddingVertical: 10 },
  discardBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 },
});
