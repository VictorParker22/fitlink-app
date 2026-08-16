import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, TextInput, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { Radius, Spacing } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { LiveClassItem } from '../../context/AppContext';

interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  isSystem?: boolean;
}

export default function LivePlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clientData } = useClient();

  const [liveClass, setLiveClass] = useState<LiveClassItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'sys-welcome', sender: 'system', content: 'Welcome to the live session!', isSystem: true },
  ]);
  const [channelStatus, setChannelStatus] = useState<'connected' | 'reconnecting'>('connected');
  // Auth readiness gate — prevents insert before auth.uid() is resolved (race condition fix)
  const [authReady, setAuthReady] = useState(false);

  const chatListRef = useRef<FlatList>(null);
  // Store the Supabase channel in a ref so handleSendChat can broadcast on it
  const channelRef = useRef<any>(null);
  // Maps optimisticId → client-side timestamp for clock-skew-safe dedup
  const optimisticTimestamps = useRef<Map<string, number>>(new Map());
  // Auth user ID (auth.uid()) — distinct from clientData.id (clients table PK)
  const authUserRef = useRef<string | null>(null);

  useEffect(() => {
    // Resolve auth.uid() early — guards handleSendChat from inserting before auth resolves
    supabase.auth.getUser().then(({ data }) => {
      authUserRef.current = data.user?.id ?? null;
      setAuthReady(true);
    });

    async function fetchClass() {
      try {
        const { data, error } = await supabase
          .from('live_classes')
          .select('*')
          .eq('id', id)
          .single();
        if (data && !error) setLiveClass(data);
      } catch (err) {
        console.error('Error fetching live class:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchClass();

    // Load message history — hydrates chat for reconnecting users
    supabase
      .from('live_class_messages')
      .select('*')
      .eq('live_class_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (!data?.length) return;
        setChatMessages(prev => {
          const existing = new Set(prev.map(m => m.id));
          const hydrated = data
            .filter(r => !existing.has(r.id))
            .map(r => ({
              id: r.id,
              sender: r.sender_name,
              content: r.content,
              isSystem: false,
            }));
          return [...prev, ...hydrated];
        });
      });

    const channel = supabase
      .channel(`live-class-${id}`)  // MUST match broadcast screen: live-class-{id}
      // Status updates on live_classes (unchanged)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_classes', filter: `id=eq.${id}` },
        (payload) => {
          if (payload.new) {
            setLiveClass(prev => prev ? { ...prev, ...payload.new } : (payload.new as LiveClassItem));
          }
        }
      )
      // Chat messages via postgres_changes INSERT (replaces broadcast — RLS-enforced)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_class_messages', filter: `live_class_id=eq.${id}` },
        (payload) => {
          setChatMessages(prev => {
            // Find optimistic match by sender + content (clock-skew-safe dedup)
            const optimisticMatch = prev.find(m =>
              !m.isSystem &&
              m.sender === payload.new.sender_name &&
              m.content === payload.new.content
            );

            if (optimisticMatch) {
              const sentAt = optimisticTimestamps.current.get(optimisticMatch.id);
              if (sentAt && Date.now() - sentAt < 10000) {
                // Replace optimistic bubble with real DB row (preserves order, gets real ID)
                optimisticTimestamps.current.delete(optimisticMatch.id);
                return prev.map(m =>
                  m.id === optimisticMatch.id
                    ? { id: payload.new.id, sender: payload.new.sender_name, content: payload.new.content, isSystem: false }
                    : m
                );
              }
            }

            // New message from another viewer — append with FIFO cap
            const next = [...prev, {
              id: payload.new.id,
              sender: payload.new.sender_name,
              content: payload.new.content,
              isSystem: false,
            }];
            return next.length > 200 ? next.slice(-200) : next;
          });
        }
      )
      // subscribe() callback is the correct Supabase v2 API for channel status
      .subscribe((status) => {
        if (status === 'CLOSED') return; // normal unmount — don't flash reconnecting
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setChannelStatus('reconnecting');
        }
        if (status === 'SUBSCRIBED') {
          setChannelStatus('connected');
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Polling fallback: In local development, if Supabase Realtime is not yet enabled for the `live_classes` table,
  // the client would be stuck in the waiting room forever or never see the stream end.
  // This checks the DB every 3s while waiting, and every 8s while live.
  useEffect(() => {
    // Stop polling if the stream is officially over
    if (!liveClass || liveClass.status === 'ended' || liveClass.status === 'cancelled') return;

    // Check more frequently while waiting, less frequently while watching
    const intervalMs = liveClass.status === 'live' ? 8000 : 3000;

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase.from('live_classes').select('status').eq('id', id).single();
        if (data && data.status !== liveClass.status) {
          console.log('[Live Player] Polling detected status change:', data.status);
          setLiveClass(prev => prev ? { ...prev, status: data.status } : null);
        }
      } catch (err) {}
    }, intervalMs);

    return () => clearInterval(interval);
  }, [liveClass?.status, id]);

  // Viewer count: increment on enter, decrement on leave (best-effort)
  // Stale counts on crashed sessions are reconciled by a 5-min cron job
  useEffect(() => {
    if (!id || !liveClass) return;
    supabase.rpc('increment_viewer_count', { class_id: id });
    return () => {
      supabase.rpc('decrement_viewer_count', { class_id: id });
    };
  }, [id, liveClass]);

  // System message when stream status changes
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!liveClass?.status) return;
    if (liveClass.status === prevStatus.current) return;
    prevStatus.current = liveClass.status;
    if (liveClass.status === 'live') {
      setChatMessages((prev) => [
        ...prev,
        { id: 'sys-live', sender: 'system', content: 'Stream is now live — let’s go!', isSystem: true },
      ]);
    }
    if (liveClass.status === 'ended') {
      setChatMessages((prev) => [
        ...prev,
        { id: 'sys-ended', sender: 'system', content: 'Broadcast ended by your coach. Great session!', isSystem: true },
      ]);
    }
  }, [liveClass?.status]);

  // Auto-scroll: only scroll to bottom if the user is already near the bottom (~100px)
  // Prevents scroll hijacking when 50+ viewers are chatting and user is reading up
  const isNearBottom = useRef(true);
  const lastSentAt = useRef(0); // moved above early returns — hooks must not follow conditional returns

  useEffect(() => {
    if (chatMessages.length > 0 && isNearBottom.current) {
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [chatMessages.length]);

  const handleSendChat = useCallback(async () => {
    const content = chatMessage.trim();
    if (!content || liveClass?.status === 'ended') return;

    // Rate limit: 1 message per second (client-side gate — server trigger is the real enforcer)
    const now = Date.now();
    if (now - lastSentAt.current < 1000) return;
    lastSentAt.current = now;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Optimistic add — replaced by real DB row when postgres_changes fires
    // crypto.randomUUID() is not available in Hermes — use a timestamp+random ID instead
    const optimisticId = `opt_${now}_${Math.random().toString(36).slice(2, 9)}`;
    optimisticTimestamps.current.set(optimisticId, now);

    setChatMessages(prev => {
      const next = [...prev, {
        id: optimisticId,
        sender: clientData?.name || 'Viewer',
        content,
        isSystem: false,
      }];
      return next.length > 200 ? next.slice(-200) : next;
    });
    setChatMessage('');

    // stream_offset_ms uses went_live_at — not created_at (which is schedule time)
    const streamOffset = liveClass?.went_live_at
      ? now - new Date((liveClass as any).went_live_at).getTime()
      : null;

    const { error } = await supabase.from('live_class_messages').insert({
      live_class_id: id,
      sender_id: authUserRef.current,
      sender_name: clientData?.name || 'Viewer',
      content,
      stream_offset_ms: streamOffset,
    });

    if (error) {
      // Rollback optimistic on RLS rejection, rate-limit trigger, or network
      // error, and say so — a bubble that silently disappears reads as a bug.
      // Nothing is broadcast either: the coach must not see a message that was
      // never stored.
      if (__DEV__) console.warn('[live-player] chat insert failed:', error.message);
      setChatMessages(prev => prev
        .filter(m => m.id !== optimisticId)
        .concat({
          id: `failed-${optimisticId}`,
          sender: 'System',
          content: "Your message didn't send. Try again.",
          isSystem: true,
        }));
      optimisticTimestamps.current.delete(optimisticId);
      return;
    }

    // Also broadcast on the shared channel so the coach sees it instantly
    // (postgres_changes SELECT is blocked by RLS for the trainer)
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'chat_message',
        payload: {
          id: optimisticId,
          sender: clientData?.name || 'Viewer',
          content,
        },
      });
    }
  }, [chatMessage, liveClass?.status, liveClass?.went_live_at, clientData, id]);


  const playbackUrl = liveClass?.mux_playback_id
    ? `https://stream.mux.com/${liveClass.mux_playback_id}.m3u8`
    : null;

  const player = useVideoPlayer(playbackUrl, (p) => {
    p.loop = false;
    p.play();
  });

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={CoachColors.accent} size="large" />
      </View>
    );
  }

  if (!liveClass) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={styles.errorText}>Class not found.</Text>
        <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={styles.backBtnAlt} onPress={() => router.back()}>
          <Text style={styles.backBtnAltText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isStreamEnded = liveClass.status === 'ended';
  const isStreamStarting = (liveClass.status as string) === 'scheduled' || (liveClass.status as string) === 'starting';
  const hasFakeMuxId = !!liveClass?.mux_playback_id?.startsWith('playback_');


  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="chevron-down" size={28} color={CoachColors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.title}>{liveClass.title}</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.liveBadge, isStreamEnded && { backgroundColor: CoachColors.surface }, isStreamStarting && { backgroundColor: CoachColors.warningSoft }]}>
              <Text style={[styles.liveBadgeText, isStreamEnded && { color: CoachColors.textMuted }, isStreamStarting && { color: CoachColors.warning }]}>
                {isStreamEnded ? 'ENDED' : isStreamStarting ? 'STARTING' : 'LIVE'}
              </Text>
            </View>
            <View style={styles.viewersBadge}>
              <Ionicons name="eye" size={12} color={CoachColors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.viewersText}>{liveClass.viewer_count ?? '—'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Video Container / Ended Fallback */}
      <View style={styles.videoContainer}>
        {isStreamEnded ? (
          <View style={styles.endedBanner}>
            <Ionicons name="sparkles" size={32} color={CoachColors.accent} style={{ marginBottom: 8 }} />
            <Text style={styles.endedTitle}>Broadcast has concluded</Text>
            <Text style={styles.endedSub}>Your coach has wrapped up this live class. Thanks for training live!</Text>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} style={styles.backToExploreBtn} onPress={() => router.back()}>
              <Text style={styles.backToExploreText}>Explore more classes</Text>
            </TouchableOpacity>
          </View>
        ) : isStreamStarting ? (
          <View style={styles.endedBanner}>
            <ActivityIndicator color={CoachColors.accent} size="large" style={{ marginBottom: 16 }} />
            <Text style={styles.endedTitle}>Waiting for coach</Text>
            <Text style={styles.endedSub}>Your coach is connecting to the stream. Hang tight, the broadcast will begin automatically in just a moment!</Text>
          </View>
        ) : playbackUrl ? (
          <VideoView
            style={styles.videoView}
            player={player}
            allowsPictureInPicture
            contentFit="contain"
          />
        ) : hasFakeMuxId ? (
          <View style={styles.endedBanner}>
            <Ionicons name="warning-outline" size={32} color={CoachColors.warning} style={{ marginBottom: 8 }} />
            <Text style={styles.endedTitle}>Stream not configured</Text>
            <Text style={styles.endedSub}>Coach may still be setting up. Try again in a moment.</Text>
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
              style={styles.backToExploreBtn}
              onPress={async () => {
                setLoading(true);
                try {
                  const { data } = await supabase.from('live_classes').select('*').eq('id', id).single();
                  if (data) setLiveClass(data);
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Text style={styles.backToExploreText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.placeholderVideo}>
            <ActivityIndicator color={CoachColors.accent} size="small" style={{ marginBottom: 8 }} />
            <Text style={styles.placeholderText}>Coach will be right back...</Text>
          </View>
        )}
      </View>

      {/* Chat Section */}
      <View style={styles.chatContainer}>
        {/* Reconnect banner — shown when broadcast channel is degraded */}
        {channelStatus === 'reconnecting' && (
          <View style={styles.reconnectBanner}>
            <ActivityIndicator size="small" color={CoachColors.warning} style={{ marginRight: 8 }} />
            <Text style={styles.reconnectText}>Reconnecting…</Text>
          </View>
        )}
        <FlatList keyboardShouldPersistTaps="handled"
          ref={chatListRef}
          data={chatMessages}
          keyExtractor={(item) => item.id}
          style={styles.chatList}
          contentContainerStyle={{ padding: 12, paddingBottom: 4, justifyContent: 'flex-end' }}
          showsVerticalScrollIndicator={false}
          onScroll={({ nativeEvent }) => {
            const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
            const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            isNearBottom.current = distanceFromBottom < 100;
          }}
          scrollEventThrottle={100}
          renderItem={({ item }) => {
            if (item.isSystem) {
              return (
                <Text style={styles.systemMessage}>{item.content}</Text>
              );
            }
            const isMe = item.sender === (clientData?.name || 'Viewer');
            return (
              <View style={[styles.chatBubbleRow, isMe && styles.chatBubbleRowRight]}>
                {!isMe && (
                  <Text style={styles.chatSender}>{item.sender}</Text>
                )}
                <View style={[styles.chatBubble, isMe && styles.chatBubbleMe]}>
                  <Text style={[styles.chatBubbleText, isMe && styles.chatBubbleTextMe]}>
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View style={[styles.chatInputRow, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <TextInput
            style={styles.chatInput}
            placeholder={isStreamEnded ? "Chat disabled (stream ended)" : "Say something..."}
            placeholderTextColor={CoachColors.textMuted}
            value={chatMessage}
            onChangeText={setChatMessage}
            editable={!isStreamEnded}
            selectionColor={CoachColors.accent}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!authReady || !chatMessage.trim() || isStreamEnded) && { opacity: 0.5 }]}
            onPress={handleSendChat}
            disabled={!authReady || !chatMessage.trim() || isStreamEnded}
          >
            <Ionicons name="send" size={18} color={CoachColors.onAccent} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: CoachColors.bg,
    zIndex: 10,
  },
  closeBtn: {
    padding: 8,
  },
  headerInfo: {
    marginLeft: 12,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveBadge: {
    backgroundColor: CoachColors.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  liveBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    // White on the solid danger fill is 3.27:1 — fails body text. onAccent is 5.75:1.
    color: CoachColors.onAccent,
    letterSpacing: 1,
  },
  viewersBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  viewersText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textSecondary,
  },
  videoContainer: {
    aspectRatio: 16 / 9,
    width: '100%',
    backgroundColor: '#000000', // letterbox area behind live footage stays black
  },
  videoView: {
    flex: 1,
  },
  placeholderVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  placeholderText: {
    fontFamily: CoachFonts.body,
    color: CoachColors.textSecondary,
    fontSize: 14,
  },
  endedBanner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: CoachColors.surface,
  },
  endedTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  endedSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  backToExploreBtn: {
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.xs,
  },
  backToExploreText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textPrimary,
    letterSpacing: 1,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  chatList: {
    flex: 1,
  },

  systemMessage: {
    fontFamily: CoachFonts.body,
    fontStyle: 'italic',
    fontSize: 12,
    color: CoachColors.textMuted,
    textAlign: 'center',
    marginBottom: 8,
  },
  chatInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  chatInput: {
    flex: 1,
    backgroundColor: CoachColors.surface,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CoachColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  errorText: {
    fontFamily: CoachFonts.body,
    fontSize: 16,
    color: CoachColors.textPrimary,
    marginBottom: 20,
  },
  backBtnAlt: {
    backgroundColor: CoachColors.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.xs,
  },
  backBtnAltText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    color: CoachColors.textPrimary,
  },
  chatBubbleRow: {
    marginBottom: 6,
    maxWidth: '80%',
  },
  chatBubbleRowRight: {
    alignSelf: 'flex-end',
  },
  chatSender: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    marginBottom: 2,
    marginLeft: 4,
  },
  chatBubble: {
    backgroundColor: CoachColors.surface,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chatBubbleMe: {
    backgroundColor: CoachColors.accent,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 4,
  },
  chatBubbleText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textPrimary,
    lineHeight: 18,
  },
  chatBubbleTextMe: {
    color: CoachColors.onAccent,
  },
  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    backgroundColor: CoachColors.warningSoft,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.warning,
  },
  reconnectText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.warning,
  },
});
