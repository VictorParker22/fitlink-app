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

const MSG_VISIBLE_MS = 7000;   // how long a message stays fully visible
const MAX_VISIBLE     = 5;     // max bubbles shown at once

type ChatMsg = {
  id: string;
  sender: string;
  content: string;
  isPinned?: boolean;
  arrivedAt: number;           // Date.now() when received
};

// Per-message animated opacity — stored outside component so it survives re-renders
const opacityMap = new Map<string, Animated.Value>();


export default function BroadcastStudioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { liveClasses, updateLiveClass, createClass, classes, deleteClass } = useApp();
  const { showAlert } = useAlert();

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('front');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [liveClass, setLiveClass] = useState<LiveClassItem | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Chat overlay state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [pinnedMessage, setPinnedMessage] = useState<ChatMsg | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const publisherRef = useRef<any>(null);

  // ── TikTok-style message lifecycle ──────────────────────────────────────────
  // When a message arrives: fade in → hold → fade out → remove from state
  const addMessage = useCallback((msg: Omit<ChatMsg, 'arrivedAt'>) => {
    const now = Date.now();
    const full: ChatMsg = { ...msg, arrivedAt: now };

    // Create animated opacity for this message
    const opacity = new Animated.Value(0);
    opacityMap.set(full.id, opacity);

    setChatMessages(prev => {
      // Evict oldest if already at cap
      const capped = prev.length >= MAX_VISIBLE ? prev.slice(1) : prev;
      return [...capped, full];
    });

    // Fade in
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // After hold period, fade out then remove
    const fadeOutTimer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start(() => {
        setChatMessages(prev => prev.filter(m => m.id !== full.id));
        opacityMap.delete(full.id);
      });
    }, MSG_VISIBLE_MS);

    return () => clearTimeout(fadeOutTimer);
  }, []);

  // ─── Permissions ───────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const camPerm = await requestCameraPermissionsAsync();
        const micPerm = await requestMicrophonePermissionsAsync();
        setHasPermission(camPerm.granted && micPerm.granted);
      } catch (e) {
        console.warn('[Broadcast] Error requesting permissions:', e);
        setHasPermission(true); // Fallback for dev mode / simulator
      }
    })();
  }, []);

  // ─── Load class ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function loadClass() {
      if (!id) return;
      const found = liveClasses?.find(c => c.id === id);
      if (found) { setLiveClass(found); return; }
      try {
        const { data, error } = await supabase
          .from('live_classes')
          .select('*')
          .eq('id', id)
          .single();
        if (data && !error) setLiveClass(data);
      } catch (err) {
        console.error('[Broadcast Studio] Fetch class error:', err);
      }
    }
    loadClass();
  }, [id, liveClasses]);

  // ─── Realtime: client chat via Broadcast + viewer count via postgres_changes ──
  // We use Broadcast (not postgres_changes) for chat because:
  // - postgres_changes respects RLS: trainer has no SELECT policy on live_class_messages
  // - Broadcast is pure pub/sub WebSocket — bypasses RLS entirely
  // - Much lower latency (~50ms vs ~200ms for postgres_changes)
  useEffect(() => {
    if (!liveClass?.id) return;

    const channel = supabase
      .channel(`live-class-${liveClass.id}`)
      // Listen for chat messages broadcast by clients
      .on('broadcast', { event: 'chat_message' }, (payload) => {
        const msg = payload.payload as any;
        if (!msg?.content) return;
        console.log('[Broadcast Studio] Chat received:', msg.sender, ':', msg.content);
        addMessage({
          id: msg.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          sender: msg.sender,
          content: msg.content,
        });
      })
      // Viewer count updates from live_classes row (trainer owns this — RLS allows it)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_classes', filter: `id=eq.${liveClass.id}` },
        (payload) => {
          if (typeof payload.new.viewer_count === 'number') {
            setViewerCount(payload.new.viewer_count);
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Broadcast Studio] Channel status: ${status}`);
      });

    return () => { supabase.removeChannel(channel); };
  }, [liveClass?.id]);

  // ─── Pin a message — moves it to the permanent pinned slot ───────────────────
  // Coach taps any floating bubble → it locks to the top banner and stays there.
  // Pinned messages never auto-expire. Tap ✕ on the banner to unpin.
  const handlePinMessage = useCallback(async (msg: ChatMsg) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Remove from the scrolling chat so it doesn't duplicate
    setChatMessages(prev => prev.filter(m => m.id !== msg.id));
    // Cancel its fade-out timer by stopping the animation (opacity goes to 1)
    const opacity = opacityMap.get(msg.id);
    if (opacity) {
      opacity.stopAnimation();
      opacityMap.delete(msg.id);
    }
    setPinnedMessage({ ...msg, isPinned: true });
    // Persist to DB (best-effort)
    supabase.from('live_class_messages').update({ is_pinned: true }).eq('id', msg.id).then(() => {});
  }, []);

  const handleUnpinMessage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPinnedMessage(null);
  }, []);

  // ─── Controls ──────────────────────────────────────────────────────────────
  const toggleCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCameraPosition(prev => (prev === 'front' ? 'back' : 'front'));
  };

  const toggleMute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsMuted(prev => !prev);
  };

  // ─── Start broadcast ───────────────────────────────────────────────────────
  const handleStartBroadcast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!liveClass) return;

    const { data: secrets, error: secretsError } = await supabase
      .from('live_class_secrets')
      .select('mux_stream_key, mux_stream_id')
      .eq('live_class_id', liveClass.id)
      .single();

    if (secretsError || !secrets?.mux_stream_key) {
      console.error('[Broadcast Studio] Failed to load stream credentials:', secretsError);
      showAlert({ type: 'error', title: 'Broadcast Error', message: 'Could not load stream credentials.' });
      return;
    }

    let activeStreamKey = secrets.mux_stream_key;

    if (!activeStreamKey || activeStreamKey.startsWith('key_')) {
      try {
        console.log('[Broadcast Studio] Triggering create-mux-stream Edge Function...');
        const { data: muxData, error: muxError } = await supabase.functions.invoke('create-mux-stream');
        if (!muxError && muxData?.stream_key) {
          activeStreamKey = muxData.stream_key;
          await updateLiveClass(liveClass.id, { mux_playback_id: muxData.playback_id });
          await supabase.from('live_class_secrets').update({
            mux_stream_id: muxData.stream_id,
            mux_stream_key: muxData.stream_key,
          }).eq('live_class_id', liveClass.id);
        } else if (muxError) {
          console.error('[Broadcast Studio] Edge Function error:', muxError);
        }
      } catch (err: any) {
        console.error('[Broadcast Studio] Exception calling Edge Function:', err);
        showAlert({ type: 'error', title: 'Mux Setup Error', message: err.message || 'Could not reach Mux Edge Function.' });
      }
    }

    if (!activeStreamKey || activeStreamKey.startsWith('key_')) {
      showAlert({ type: 'error', title: 'Invalid Stream Key', message: 'A valid Mux stream key is required.' });
      return;
    }

    try {
      setIsBroadcasting(true);

      if (publisherRef.current) {
        const rtmpUrl = 'rtmp://global-live.mux.com:5222/app';
        await publisherRef.current.startPublishing(rtmpUrl, activeStreamKey, {
          videoWidth: 720,
          videoHeight: 1280,
          videoBitrate: 2500000,
          audioBitrate: 128000,
        });
      }

      // Wait for Mux to process (~8s) before telling clients to load the URL
      setTimeout(async () => {
        try {
          await updateLiveClass(liveClass.id, { status: 'live' });
          console.log('[Broadcast Studio] Stream is now fully LIVE for clients');
        } catch (e) {
          console.warn('[Broadcast Studio] Failed to update live status:', e);
        }
      }, 8000);
    } catch (e: any) {
      console.warn('[Broadcast] Streaming start warning:', e);
    }
  };

  // ─── Stop broadcast ────────────────────────────────────────────────────────
  const handleStopBroadcast = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('End Stream?', 'Are you sure you want to end this live class broadcast?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Broadcast',
        style: 'destructive',
        onPress: async () => {
          try {
            if (publisherRef.current) await publisherRef.current.stopPublishing();
            setIsBroadcasting(false);
            if (liveClass) await updateLiveClass(liveClass.id, { status: 'ended' });
            setShowRecap(true);
          } catch (e: any) {
            showAlert({ type: 'error', title: 'Error', message: e.message || 'Could not stop stream.' });
          }
        },
      },
    ]);
  };

  // ─── Save to VOD ───────────────────────────────────────────────────────────
  const handleSaveToOnDemand = async () => {
    if (!liveClass) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSaving(true);

    try {
      const vodPlaybackUrl =
        liveClass.mux_playback_id && !liveClass.mux_playback_id.startsWith('playback_')
          ? `https://stream.mux.com/${liveClass.mux_playback_id}.m3u8`
          : '';

      // Enforce 3-Draft Limit for Live Stream VODs
      const muxDrafts = classes
        .filter(c => c.status === 'draft' && c.video_url?.includes('stream.mux.com'))
        .sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());

      if (muxDrafts.length >= 3) {
        try {
          await deleteClass(muxDrafts[0].id);
        } catch (e) {
          console.warn('[Broadcast Studio] Failed to delete oldest draft:', e);
        }
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

      showAlert({
        type: 'success',
        title: 'Saved to Library!',
        message: 'Your stream recording has been saved as a Draft.',
      });

      router.back();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Save Failed', message: err.message || 'Could not save class.' });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Guards ────────────────────────────────────────────────────────────────
  if (Platform.OS !== 'ios' || !ExpoCameraRtmpPublisherView) {
    return (
      <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.xl }]}>
        <View style={s.recapCard}>
          <Ionicons name="radio" size={48} color="#FFD700" style={{ marginBottom: 12 }} />
          <Text style={s.recapTag}>IOS BROADCAST STUDIO</Text>
          <Text style={s.recapTitle}>Camera Streaming</Text>
          <Text style={s.recapSub}>
            Mobile camera live broadcasting via RTMP is supported on iOS devices. Android support is coming soon!
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
        <ActivityIndicator color="#EF4444" size="large" />
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={s.errorText}>No access to camera or microphone.</Text>
        <TouchableOpacity style={s.backBtnAlt} onPress={() => router.back()}>
          <Text style={s.backBtnAltText}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── Recap overlay ─────────────────────────────────────────────────────────
  if (showRecap) {
    return (
      <SafeAreaView style={s.recapContainer}>
        <View style={s.recapCard}>
          <View style={{ marginBottom: Spacing.md }}>
            <Ionicons name="checkmark-circle" size={48} color="#FFD700" />
          </View>
          <Text style={s.recapTag}>STREAM COMPLETED</Text>
          <Text style={s.recapTitle}>{liveClass.title}</Text>
          <Text style={s.recapSub}>Awesome session! Here is your quick broadcast summary.</Text>

          <View style={s.recapStatsRow}>
            <View style={s.recapStatBox}>
              <Text style={s.recapStatLabel}>PEAK VIEWERS</Text>
              <Text style={s.recapStatVal}>{viewerCount || 0}</Text>
            </View>
            <View style={s.recapStatDivider} />
            <View style={s.recapStatBox}>
              <Text style={s.recapStatLabel}>DURATION</Text>
              <Text style={s.recapStatVal}>{liveClass.duration_minutes || 45}m</Text>
            </View>
            <View style={s.recapStatDivider} />
            <View style={s.recapStatBox}>
              <Text style={s.recapStatLabel}>MESSAGES</Text>
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

  // ─── Main broadcast view ───────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Background Camera Layer */}
      <ExpoCameraRtmpPublisherView
        ref={publisherRef}
        style={StyleSheet.absoluteFillObject}
        cameraPosition={cameraPosition}
        muted={isMuted}
        onReady={() => setCameraReady(true)}
        onPublishStarted={() => setIsBroadcasting(true)}
        onPublishStopped={() => setIsBroadcasting(false)}
        onPublishError={(err: any) => {
          console.error('[Broadcast Studio] Publish error:', err);
          showAlert({ type: 'error', title: 'Publish Error', message: String(err) });
        }}
      />

      {/* Foreground UI Layer */}
      <SafeAreaView style={s.overlay} pointerEvents="box-none">

        {/* Top Bar */}
        <View style={s.topBar}>
          <TouchableOpacity
            onPress={() => {
              if (isBroadcasting) {
                Alert.alert('Leave Studio?', 'This will end your current broadcast.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'End & Leave',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        if (publisherRef.current) await publisherRef.current.stopPublishing();
                        if (liveClass) await updateLiveClass(liveClass.id, { status: 'ended' });
                      } catch (e) {}
                      router.back();
                    },
                  },
                ]);
              } else {
                router.back();
              }
            }}
            style={s.iconBtn}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          {/* LIVE badge + viewer count */}
          <View style={s.statusBadge}>
            <View style={[s.statusDot, isBroadcasting && { backgroundColor: '#EF4444' }]} />
            <Text style={s.statusText}>{isBroadcasting ? 'LIVE' : 'READY'}</Text>
            {isBroadcasting && viewerCount > 0 && (
              <Text style={s.viewerCountText}>· {viewerCount} watching</Text>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              onPress={toggleMute}
              style={[s.iconBtn, isMuted && { backgroundColor: 'rgba(239, 68, 68, 0.8)' }]}
            >
              <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={toggleCamera} style={s.iconBtn}>
              <Ionicons name="camera-reverse-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Pinned message banner \u2014 stays until coach taps ✕ ────────────── */}
        {pinnedMessage && (
          <View style={s.pinnedBanner} pointerEvents="box-none">
            <Ionicons name="pin" size={11} color="#FFD700" style={{ marginRight: 6, marginTop: 1 }} />
            <View style={{ flex: 1 }}>
              <Text style={s.pinnedSender}>{pinnedMessage.sender}</Text>
              <Text style={s.pinnedContent} numberOfLines={2}>{pinnedMessage.content}</Text>
            </View>
            <TouchableOpacity onPress={handleUnpinMessage} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Scrolling chat bubbles \u2014 TikTok style ─────────────────────── */}
        {/* Tap any bubble to pin it to the banner above.                   */}
        {chatMessages.length > 0 && (
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

        {/* Bottom Bar */}
        <View style={s.bottomBar}>
          <View style={s.classInfo}>
            <Text style={s.classTitle}>{liveClass.title}</Text>
          </View>

          {!isBroadcasting ? (
            <TouchableOpacity style={s.startBtn} onPress={handleStartBroadcast}>
              <Ionicons name="radio-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={s.startBtnText}>GO LIVE</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.stopBtn} onPress={handleStopBroadcast}>
              <Ionicons name="square" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={s.startBtnText}>END LIVE</Text>
            </TouchableOpacity>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  statusText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  viewerCountText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },

  // Pinned message banner — permanent slot, sits in middle of overlay
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderLeftWidth: 3,
    borderLeftColor: '#FFD700',
    borderRadius: Radius.xs,
    marginHorizontal: Spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  pinnedSender: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFD700',
    marginBottom: 2,
  },
  pinnedContent: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 16,
  },

  // Chat overlay — TikTok style: bottom-anchored, no scroll
  chatOverlay: {
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  chatOverlayBubble: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 4,
    alignSelf: 'flex-start',
    maxWidth: '75%',
  },
  chatOverlayBubblePinned: {
    backgroundColor: 'rgba(255,215,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
  },
  chatOverlaySender: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFD700',
  },
  chatOverlayContent: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: '#FFFFFF',
    flexShrink: 1,
  },

  // Bottom bar
  bottomBar: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  classInfo: {
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  classTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  startBtn: {
    backgroundColor: '#EF4444',
    paddingVertical: 18,
    borderRadius: Radius.xs,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  stopBtn: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 18,
    borderRadius: Radius.xs,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  startBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  // Error / permission screens
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 20,
  },
  backBtnAlt: {
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.xs,
  },
  backBtnAltText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
  },

  // Recap screen
  recapContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  recapCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xs,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  recapTag: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 4,
  },
  recapTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  recapSub: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  recapStatsRow: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    borderRadius: Radius.xs,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: Spacing.xl,
    width: '100%',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  recapStatBox: {
    alignItems: 'center',
  },
  recapStatLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 8,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 2,
  },
  recapStatVal: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  recapStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  saveVodBtn: {
    backgroundColor: '#FFD700',
    width: '100%',
    paddingVertical: 16,
    borderRadius: Radius.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  saveVodBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#000000',
    letterSpacing: 1,
  },
  discardBtn: {
    paddingVertical: 10,
  },
  discardBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
});
