import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Share, RefreshControl, Keyboard, StatusBar, Modal, Image as RNImage, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import { enqueueMessage, flushOutbox, isNetworkError, loadOutbox, makeTempId, type OutboxMessage } from '../../lib/outbox';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useTypingIndicator } from '../../hooks/useTypingIndicator';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { useVideoPlayer, VideoView } from 'expo-video';
import FormReviewMessage, { FORM_REVIEW_PREFIX, parseFormReview } from '../../components/chat/FormReviewMessage';

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'trainer' | 'client';
  content: string;
  created_at: string;
  read: boolean;
  attachment_url?: string;
  attachment_type?: string;
  /** Local-only: queued in the outbox, waiting for connectivity. Never shown as sent. */
  pending?: boolean;
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
}

function fmtClock(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Athlete video bubble — inline player plus the entry point into the form-review composer
function VideoBubble({ url, onReview }: { url: string; onReview?: () => void }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.videoBubbleWrap}>
        <VideoView player={player} style={styles.videoBubble} contentFit="cover" nativeControls />
      </View>
      {onReview && (
        <TouchableOpacity
          style={styles.reviewAffordance}
          onPress={onReview}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Review form on this video"
        >
          <Ionicons name="videocam-outline" size={13} color={CoachColors.accent} />
          <Text style={styles.reviewAffordanceText}>Review form</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// In-screen composer overlay — pin a coaching comment to a second of the athlete's video
function FormReviewComposer({
  videoUrl,
  sending,
  onClose,
  onSend,
}: {
  videoUrl: string;
  sending: boolean;
  onClose: () => void;
  onSend: (seconds: number, comment: string) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [comment, setComment] = useState('');
  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
  });

  const adjustSeconds = (delta: number) => {
    const next = Math.max(0, seconds + delta);
    setSeconds(next);
    player.currentTime = next;
  };

  const captureFromPlayer = () => {
    const next = Math.max(0, Math.round(player.currentTime || 0));
    setSeconds(next);
  };

  const canSend = comment.trim().length > 0 && !sending;

  return (
    <View style={styles.reviewOverlay}>
      <TouchableOpacity style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close form review" />
      <KeyboardAvoidingView behavior="padding">
        <View style={styles.reviewCard}>
          <View style={styles.modalHeaderRow}>
            <Text style={styles.modalSheetTitle}>Review form</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={CoachColors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.reviewVideoWrap}>
            <VideoView player={player} style={styles.reviewVideo} contentFit="contain" nativeControls />
          </View>

          {/* Timestamp controls */}
          <View style={styles.timestampRow}>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => adjustSeconds(-1)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Back one second"
            >
              <Text style={styles.stepBtnText}>−1s</Text>
            </TouchableOpacity>
            <View style={styles.timestampDisplay}>
              <Text style={styles.timestampText}>{fmtClock(seconds)}</Text>
              <Text style={styles.timestampLabel}>pinned at</Text>
            </View>
            <TouchableOpacity
              style={styles.stepBtn}
              onPress={() => adjustSeconds(1)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Forward one second"
            >
              <Text style={styles.stepBtnText}>+1s</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.playheadBtn}
              onPress={captureFromPlayer}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Use current playback time"
            >
              <Text style={styles.playheadBtnText}>Use playhead</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.reviewInput}
            placeholder="What should they fix at this moment?"
            placeholderTextColor={CoachColors.textFaint}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
          />

          <TouchableOpacity
            style={[styles.reviewSendBtn, !canSend && { opacity: 0.4 }]}
            onPress={() => onSend(seconds, comment.trim())}
            disabled={!canSend}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Send form review"
          >
            <Text style={styles.reviewSendText}>{sending ? 'Sending…' : 'Send review'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function ChatScreen() {
  const { id: conversationId, draft } = useLocalSearchParams<{ id: string, draft?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState(draft || '');
  const [sending, setSending] = useState(false);
  const [clientName, setClientName] = useState('Client');
  const [clientAvatar, setClientAvatar] = useState<string | undefined>();
  const flatListRef = useRef<FlatList>(null);
  const { isTyping, startTyping } = useTypingIndicator(conversationId, 'trainer');
  const [refreshing, setRefreshing] = useState(false);
  const [clientPushToken, setClientPushToken] = useState<string | null>(null);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const insets = useSafeAreaInsets();

  // ?draft= support — pre-fills the input, never auto-sends. The initial
  // value is seeded via useState above; this effect covers re-navigation to
  // an already-mounted thread with a new draft. It only overwrites an empty
  // input, so it can never clobber a message the coach is mid-typing.
  const lastAppliedDraft = useRef<string | undefined>(typeof draft === 'string' ? draft : undefined);
  useEffect(() => {
    if (typeof draft !== 'string' || !draft || draft === lastAppliedDraft.current) return;
    lastAppliedDraft.current = draft;
    setNewMessage((current) => (current.trim().length === 0 ? draft : current));
  }, [draft]);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const loadMessages = async () => {
    const { data: conv } = await supabase
      .from('conversations')
      .select('*, clients(name, avatar_url, expo_push_token)')
      .eq('id', conversationId)
      .single();
    if (conv) {
      setClientName(conv.clients?.name || 'Client');
      setClientAvatar(conv.clients?.avatar_url);
      setClientPushToken(conv.clients?.expo_push_token || null);
    }

    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    // Re-attach any queued (unsent) messages for this thread so they survive
    // screen re-entry and app restarts — shown as "Waiting to send".
    const queued = (await loadOutbox(user?.id)).filter((q) => q.conversationId === conversationId);
    const pendingBubbles: Message[] = queued.map((q) => ({
      id: q.tempId,
      conversation_id: q.conversationId,
      sender_type: 'trainer',
      content: q.content,
      created_at: q.createdAt,
      read: false,
      pending: true,
    }));
    if (msgs || pendingBubbles.length) setMessages([...(msgs || []), ...pendingBubbles]);

    // Mark as read — cosmetic (badge counts), safe to fail, but surface it in dev.
    const { error: unreadErr } = await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversationId);
    const { error: readErr } = await supabase.from('messages')
      .update({ read: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'client')
      .eq('read', false);
    if (__DEV__ && (unreadErr || readErr)) console.warn('[Chat] mark-as-read failed:', unreadErr || readErr);
  };

  // Load conversation + messages
  useEffect(() => {
    loadMessages();
  }, [conversationId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
    setRefreshing(false);
  };

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const row = payload.new as Message;
        // Dedupe — a flushed outbox message may already be in state.
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const { workouts, diets } = useApp();
  const [showWorkoutPickerModal, setShowWorkoutPickerModal] = useState(false);
  const [showDietPickerModal, setShowDietPickerModal] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Message | null>(null);

  const sendFormReview = useCallback(async (seconds: number, comment: string) => {
    if (!reviewTarget?.attachment_url || sending) return;
    setSending(true);
    try {
      const { error: insertError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'trainer',
        content: `[FORM_REVIEW:${seconds}:${comment}]`,
        attachment_url: reviewTarget.attachment_url,
        attachment_type: reviewTarget.attachment_type,
      });
      // The insert RESOLVES with { error } — it does not throw. Without this the
      // composer closed on failure and the coach believed the review was sent.
      if (insertError) {
        Alert.alert('Review not sent', insertError.message || 'Your form review could not be sent. Please try again.');
        return; // keep reviewTarget open so the typed comment is not lost
      }
      const previewText = `Form review at ${fmtClock(seconds)}: ${comment}`;
      const { error: convError } = await supabase.from('conversations').update({
        last_message: previewText,
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId);
      if (__DEV__ && convError) console.warn('[Chat] conversation preview update failed:', convError);

      if (clientPushToken) {
        supabase.functions.invoke('send-push-notification', {
          body: {
            pushToken: clientPushToken,
            title: `Message from your Coach`,
            body: previewText,
            data: { url: '/my-messages' }
          }
        }).catch(err => console.log('Push error:', err));
      }
      setReviewTarget(null);
    } catch (err) {
      console.error('Send form review failed:', err);
    } finally {
      setSending(false);
    }
  }, [reviewTarget, sending, conversationId, clientPushToken]);

  const sendCustomContent = useCallback(async (content: string) => {
    if (sending) return;
    setSending(true);
    try {
      const { error: insertError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'trainer',
        content,
      });
      // Resolves with { error }; it does not throw. Previously the picker modal
      // closed either way and the attachment silently never reached the athlete.
      if (insertError) {
        Alert.alert('Not sent', insertError.message || 'That could not be sent. Please try again.');
        return;
      }
      let previewText = content;
      if (content.startsWith('[WORKOUT_CARD:')) {
        const parts = content.split(':');
        previewText = `Attached a workout: ${parts[2] || 'Untitled'}`;
      } else if (content.startsWith('[DIET_CARD:')) {
        const parts = content.split(':');
        previewText = `Attached a meal plan: ${parts[2] || 'Untitled'}`;
      } else if (content === '[CHECKIN_REQUEST]') {
        previewText = 'Asked for a check-in';
      } else if (content.startsWith('[QUICK_NOTE:')) {
        previewText = `Note: ${content.replace('[QUICK_NOTE:', '').replace(']', '')}`;
      }
      const { error: convError } = await supabase.from('conversations').update({
        last_message: previewText,
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId);
      if (__DEV__ && convError) console.warn('[Chat] conversation preview update failed:', convError);

      if (clientPushToken) {
        supabase.functions.invoke('send-push-notification', {
          body: {
            pushToken: clientPushToken,
            title: `Message from your Coach`,
            body: previewText,
            data: { url: content === '[CHECKIN_REQUEST]' ? '/my-progress' : '/my-messages' }
          }
        }).catch(err => console.log('Push error:', err));
      }
    } catch (err) {
      console.error('Send custom failed:', err);
    } finally {
      setSending(false);
      setShowWorkoutPickerModal(false);
      setShowDietPickerModal(false);
    }
  }, [sending, conversationId, clientPushToken]);

  // Queue a message locally when the device is offline: honest pending bubble
  // now, real send when connectivity returns. Never rendered as a sent tick.
  const queueLocally = useCallback(async (content: string) => {
    if (!user || !conversationId) return;
    const tempId = makeTempId();
    const createdAt = new Date().toISOString();
    await enqueueMessage(user.id, {
      tempId,
      conversationId,
      senderType: 'trainer',
      content,
      createdAt,
    });
    setMessages((prev) => [...prev, {
      id: tempId,
      conversation_id: conversationId,
      sender_type: 'trainer',
      content,
      created_at: createdAt,
      read: false,
      pending: true,
    }]);
  }, [user, conversationId]);

  // Replay queued messages in order once we are back online. Each success
  // swaps the pending bubble for the real server row (deduped by tempId).
  const flushQueued = useCallback(async () => {
    if (!user) return;
    const flushed = await flushOutbox(user.id, async (m: OutboxMessage) => {
      const { data, error } = await supabase.from('messages').insert({
        conversation_id: m.conversationId,
        sender_type: m.senderType,
        content: m.content,
      }).select().single();
      if (error || !data) return null;
      await supabase.from('conversations').update({
        last_message: m.content,
        last_message_at: new Date().toISOString(),
      }).eq('id', m.conversationId);
      return data;
    });
    if (flushed.length) {
      setMessages((prev) => prev
        .map((msg) => {
          const hit = flushed.find((f) => f.tempId === msg.id);
          return hit ? (hit.row as Message) : msg;
        })
        // If realtime already delivered the row, drop the duplicate.
        .filter((msg, i, arr) => arr.findIndex((m) => m.id === msg.id) === i));
    }
  }, [user]);

  // Flush on reconnect (fires once on mount with current state too, which
  // clears any leftover queue from a previous session).
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) flushQueued();
    });
    return () => unsubscribe();
  }, [flushQueued]);

  const handleSend = useCallback(async () => {
    const content = newMessage.trim();
    if (!content || sending) return;

    setSending(true);
    setNewMessage('');

    // Known-offline: skip the doomed request and queue immediately.
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      await queueLocally(content);
      setSending(false);
      return;
    }

    try {
      const { error: insertError } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'trainer',
        content,
      });
      if (insertError) throw insertError;
      // Cosmetic (inbox preview) — the message itself already landed.
      const { error: convError } = await supabase.from('conversations').update({
        last_message: content,
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId);
      if (__DEV__ && convError) console.warn('[Chat] conversation preview update failed:', convError);

      if (clientPushToken) {
        console.log('Sending push to client:', clientPushToken);
        const pushBody = content.startsWith('[WORKOUT_CARD:')
          ? 'Coach attached a workout'
          : content.startsWith('[QUICK_NOTE:')
            ? 'Coach sent a note'
            : content;

        supabase.functions.invoke('send-push-notification', {
          body: {
            pushToken: clientPushToken,
            title: `Message from your Coach`,
            body: pushBody,
            data: { url: '/my-messages' }
          }
        }).catch(err => console.log('Push error:', err));
      } else {
        console.log('Client has NO push token saved!');
      }
    } catch (err) {
      if (isNetworkError(err)) {
        // Connectivity dropped mid-send — queue it for the reconnect flush.
        await queueLocally(content);
      } else {
        console.error('Send failed:', err);
        setNewMessage(content);
        Alert.alert('Message not sent', (err as any)?.message || 'Your message could not be sent. It has been put back in the box — please try again.');
      }
    } finally {
      setSending(false);
    }
  }, [newMessage, sending, conversationId, clientPushToken, queueLocally]);

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const handleImagePick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64 && conversationId) {
        setSending(true);
        const base64 = result.assets[0].base64;
        const ext = result.assets[0].uri.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

        const { error } = await supabase.storage
          .from('chat-attachments')
          .upload(fileName, decode(base64), { contentType: `image/${ext}` });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(fileName);

        const { error: insertError } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'trainer',
          content: '[IMAGE]',
          attachment_url: publicUrlData.publicUrl,
          attachment_type: 'image'
        });
        // The upload succeeding does not mean the message row landed — this
        // insert resolves with { error } rather than throwing.
        if (insertError) {
          Alert.alert('Image not sent', insertError.message || 'The image uploaded but the message could not be sent. Please try again.');
          return;
        }

        const { error: convError } = await supabase.from('conversations').update({
          last_message: 'Sent an image 📸',
          last_message_at: new Date().toISOString(),
        }).eq('id', conversationId);
        if (__DEV__ && convError) console.warn('[Chat] conversation preview update failed:', convError);

        if (clientPushToken) {
          supabase.functions.invoke('send-push-notification', {
            body: {
              pushToken: clientPushToken,
              title: `Message from your Coach`,
              body: 'Coach sent an image',
              data: { url: '/my-messages' }
            }
          });
        }
      }
    } catch (err: any) {
      console.error('Image upload failed', err);
      Alert.alert('Image not sent', err?.message || 'The image could not be uploaded. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const formatDateDivider = (ts: string) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const renderMessageContent = (msg: Message, isMine: boolean) => {
    const { content } = msg;

    if (content === '[IMAGE]' && msg.attachment_url) {
      return (
        <RNImage
          source={{ uri: msg.attachment_url }}
          style={{ width: 220, height: 300, borderRadius: 12, backgroundColor: isMine ? 'rgba(16,18,16,0.2)' : 'rgba(255,255,255,0.06)' }}
          resizeMode="cover"
        />
      );
    }

    // Form review — a comment pinned to a second of the video under review
    if (content.startsWith(FORM_REVIEW_PREFIX)) {
      const parsed = parseFormReview(content);
      if (parsed) {
        return (
          <FormReviewMessage
            seconds={parsed.seconds}
            comment={parsed.comment}
            videoUrl={msg.attachment_type === 'video' ? msg.attachment_url : undefined}
            isMine={isMine}
          />
        );
      }
    }

    // Athlete video message — playable inline, with an entry point into form review
    if (msg.attachment_type === 'video' && msg.attachment_url) {
      return (
        <VideoBubble
          url={msg.attachment_url}
          onReview={!isMine ? () => setReviewTarget(msg) : undefined}
        />
      );
    }

    if (content.startsWith('[WORKOUT_CARD:')) {
      const parts = content.split(':');
      const wId = parts[1];
      const wName = parts[2] || 'Attached Routine';
      const count = parts[3] || '0';

      return (
        <View style={{ minWidth: 200, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: isMine ? 'rgba(16,18,16,0.13)' : 'rgba(255,255,255,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 9, letterSpacing: 0.6, color: isMine ? CoachColors.onAccent : CoachColors.textSecondary }}>WORKOUT ATTACHMENT</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 }}>
            <View style={{ width: 42, height: 42, borderRadius: 6, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="barbell-outline" size={20} color={CoachColors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary }} numberOfLines={1}>{wName}</Text>
              <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 11.5, color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }}>{count} exercises</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: isMine ? CoachColors.bg : CoachColors.accent,
              paddingVertical: 8, paddingHorizontal: 12,
              borderRadius: 8, alignItems: 'center', marginTop: 4
            }}
            onPress={() => router.push(`/workout/${wId}` as any)}
            activeOpacity={0.8}
          >
            <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 12, color: isMine ? CoachColors.textPrimary : CoachColors.onAccent }}>Open workout</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (content.startsWith('[DIET_CARD:')) {
      const parts = content.split(':');
      const dId = parts[1];
      const dName = parts[2] || 'Attached meal plan';
      const cal = parts[3] || '';

      return (
        <View style={{ minWidth: 200, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: isMine ? 'rgba(16,18,16,0.13)' : 'rgba(255,255,255,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 9, letterSpacing: 0.6, color: isMine ? CoachColors.onAccent : CoachColors.textSecondary }}>MEAL PLAN ATTACHMENT</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 }}>
            <View style={{
              width: 42, height: 42, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
              backgroundColor: isMine ? 'rgba(16,18,16,0.13)' : 'rgba(255,255,255,0.08)',
            }}>
              <Ionicons name="nutrition-outline" size={20} color={isMine ? CoachColors.onAccent : CoachColors.textPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary }} numberOfLines={1}>{dName}</Text>
              {!!cal && (
                <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 11.5, color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }}>{cal} cal/day target</Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: isMine ? CoachColors.bg : CoachColors.accent,
              paddingVertical: 8, paddingHorizontal: 12,
              borderRadius: 8, alignItems: 'center', marginTop: 4
            }}
            onPress={() => router.push(`/diet/${dId}` as any)}
            activeOpacity={0.8}
          >
            <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 12, color: isMine ? CoachColors.textPrimary : CoachColors.onAccent }}>Open meal plan</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (content === '[CHECKIN_REQUEST]') {
      return (
        <View style={{ minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="clipboard-outline" size={16} color={isMine ? CoachColors.onAccent : CoachColors.textPrimary} />
          <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary, flex: 1 }}>
            Asked for a check-in
          </Text>
        </View>
      );
    }

    if (content.startsWith('[QUICK_NOTE:')) {
      const text = content.replace('[QUICK_NOTE:', '').replace(/\]$/, '');
      return (
        <View style={{ minWidth: 180, gap: 4 }}>
          <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 9, letterSpacing: 0.6, color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }}>COACHING NOTE</Text>
          <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary, lineHeight: 20 }}>{text}</Text>
        </View>
      );
    }

    return (
      <Text style={[styles.bubbleText, isMine ? styles.bubbleTextSent : styles.bubbleTextReceived]}>
        {content}
      </Text>
    );
  };

  // Add date dividers
  const messagesWithDividers = messages.reduce<Array<Message | { type: 'divider'; date: string }>>((acc, msg, i) => {
    const dateKey = new Date(msg.created_at).toDateString();
    const prevDateKey = i > 0 ? new Date(messages[i - 1].created_at).toDateString() : null;
    if (dateKey !== prevDateKey) {
      acc.push({ type: 'divider', date: msg.created_at });
    }
    acc.push(msg);
    return acc;
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Back to messages">
          <Ionicons name="chevron-back" size={22} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          {clientAvatar ? (
            <RNImage source={{ uri: clientAvatar }} style={{ width: 34, height: 34, borderRadius: 17 }} />
          ) : (
            <Text style={styles.headerAvatarText}>{initials(clientName)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{clientName}</Text>
          <Text style={styles.headerSub}>Athlete conversation</Text>
        </View>
        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={() => Share.share({
            message: `Hey ${clientName}! Join me on FitLink to track your workouts, diet plans, and schedule sessions. Open the app and sign in as a client: https://fitlink.coach/client${user?.id ? `?ref=${user.id}` : ''}`,
            title: 'Join me on FitLink',
          })}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel="Invite client to app"
        >
          <Ionicons name="paper-plane-outline" size={15} color={CoachColors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight || 24)}
      >
        <FlatList
          ref={flatListRef}
          data={messagesWithDividers}
          keyExtractor={(item, i) => 'id' in item ? item.id : `divider-${i}`}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} />}
          renderItem={({ item }) => {
            if ('type' in item && item.type === 'divider') {
              return (
                <View style={styles.dateDivider}>
                  <View style={styles.dateLine} />
                  <Text style={styles.dateText}>{formatDateDivider(item.date)}</Text>
                  <View style={styles.dateLine} />
                </View>
              );
            }

            const msg = item as Message;
            const isMine = msg.sender_type === 'trainer';
            const isPlainVideo = msg.attachment_type === 'video' && !!msg.attachment_url && !msg.content.startsWith(FORM_REVIEW_PREFIX);
            const canReview = isPlainVideo && !isMine;

            return (
              <View style={[styles.bubbleRow, isMine && styles.bubbleRowRight]}>
                <TouchableOpacity
                  activeOpacity={canReview ? 0.85 : 1}
                  disabled={!canReview}
                  onLongPress={canReview ? () => setReviewTarget(msg) : undefined}
                  style={[styles.bubble, (msg.content === '[IMAGE]' || isPlainVideo) ? { backgroundColor: 'transparent', padding: 0 } : msg.pending ? styles.bubblePending : isMine ? styles.bubbleSent : styles.bubbleReceived]}
                >
                  {renderMessageContent(msg, isMine && !msg.pending)}
                  {msg.pending ? (
                    <View style={styles.pendingRow}>
                      <Ionicons name="time-outline" size={10} color={CoachColors.textMuted} />
                      <Text style={styles.pendingText}>Waiting to send</Text>
                    </View>
                  ) : (
                    <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeSent : styles.bubbleTimeReceived]}>
                      {formatTime(msg.created_at)}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Start the conversation</Text>
              <Text style={styles.emptyText}>Send a message, a workout, or a quick note to get things going.</Text>
            </View>
          }
          ListFooterComponent={
            isTyping ? (
              <View style={styles.typingRow}>
                <View
                  style={styles.typingBubble}
                  accessible={true}
                  accessibilityLabel={`${clientName} is typing`}
                >
                  <View style={styles.typingDots}>
                    <View style={[styles.dot, styles.dot1]} />
                    <View style={[styles.dot, styles.dot2]} />
                    <View style={[styles.dot, styles.dot3]} />
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        {/* Quick actions — attach a workout, share a meal plan, ask for a check-in */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => setShowWorkoutPickerModal(true)}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Attach a workout"
          >
            <Text style={styles.quickActionText}>Attach a workout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => setShowDietPickerModal(true)}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Share meal plan"
          >
            <Text style={styles.quickActionText}>Share meal plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => sendCustomContent('[CHECKIN_REQUEST]')}
            activeOpacity={0.8}
            disabled={sending}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Ask for check-in"
          >
            <Text style={styles.quickActionText}>Ask for check-in</Text>
          </TouchableOpacity>
        </View>

        {/* Input Bar */}
        <View style={[styles.inputBar, { paddingBottom: isKeyboardVisible ? 10 : Math.max(insets.bottom + 6, 22) }]}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={handleImagePick}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Send a photo"
          >
            <Ionicons name="image-outline" size={20} color={CoachColors.textSecondary} />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Message athlete…"
            placeholderTextColor={CoachColors.textFaint}
            value={newMessage}
            onChangeText={(text) => { setNewMessage(text); startTyping(); }}
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            accessibilityLabel="Message athlete"
          />
          <TouchableOpacity
            style={[styles.sendBtn, newMessage.trim() && styles.sendBtnActive]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            accessibilityState={{ disabled: !newMessage.trim() || sending }}
          >
            <Ionicons
              name="send"
              size={15}
              color={newMessage.trim() ? CoachColors.onAccent : CoachColors.textFaint}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Workout Picker Modal */}
      <Modal visible={showWorkoutPickerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowWorkoutPickerModal(false)} />
          <View style={styles.workoutPickerContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalSheetTitle}>Select a workout</Text>
              <TouchableOpacity onPress={() => setShowWorkoutPickerModal(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={workouts}
              keyExtractor={(w) => w.id}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 380 }}
              renderItem={({ item: w }) => {
                const count = w.workout_exercises?.length || 0;
                return (
                  <TouchableOpacity
                    style={styles.workoutPickerRow}
                    onPress={() => sendCustomContent(`[WORKOUT_CARD:${w.id}:${w.name}:${count}]`)}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="barbell-outline" size={18} color={CoachColors.textSecondary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.workoutPickerTitle} numberOfLines={1}>{w.name}</Text>
                      <Text style={styles.workoutPickerSub}>{count} exercises · on demand</Text>
                    </View>
                    <View style={styles.attachBadge}>
                      <Text style={styles.attachBadgeText}>Attach</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Text style={{ fontFamily: CoachFonts.body, color: CoachColors.textMuted, fontSize: 13 }}>No workouts created in your library yet.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Diet Picker Modal */}
      <Modal visible={showDietPickerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowDietPickerModal(false)} />
          <View style={styles.workoutPickerContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalSheetTitle}>Select a meal plan</Text>
              <TouchableOpacity onPress={() => setShowDietPickerModal(false)} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={CoachColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={diets}
              keyExtractor={(d) => d.id}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 380 }}
              renderItem={({ item: d }) => (
                <TouchableOpacity
                  style={styles.workoutPickerRow}
                  onPress={() => sendCustomContent(`[DIET_CARD:${d.id}:${d.name}:${d.target_calories || ''}]`)}
                >
                  <View style={{
                    width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                  }}>
                    <Ionicons name="nutrition-outline" size={18} color={CoachColors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workoutPickerTitle} numberOfLines={1}>{d.name}</Text>
                    <Text style={styles.workoutPickerSub}>
                      {d.target_calories ? `${d.target_calories} cal/day` : d.category || 'Meal plan'}
                    </Text>
                  </View>
                  <View style={styles.attachBadge}>
                    <Text style={styles.attachBadgeText}>Attach</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Text style={{ fontFamily: CoachFonts.body, color: CoachColors.textMuted, fontSize: 13 }}>No meal plans created in your library yet.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      {/* Form review composer — in-screen overlay, pins a comment to a second of the athlete's video */}
      {reviewTarget?.attachment_url && (
        <FormReviewComposer
          videoUrl={reviewTarget.attachment_url}
          sending={sending}
          onClose={() => setReviewTarget(null)}
          onSend={sendFormReview}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
  },
  backBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  headerAvatar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.textSecondary },
  inviteBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center'
  },
  headerName: { fontFamily: CoachFonts.headingSemiBold, fontSize: 16, color: CoachColors.textPrimary },
  headerSub: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textFaint, marginTop: 1 },

  messageList: { padding: 16, paddingBottom: 12, flexGrow: 1 },

  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dateLine: { flex: 1, height: 1, backgroundColor: CoachColors.border },
  dateText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textFaint },

  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleSent: { backgroundColor: CoachColors.accent, borderBottomRightRadius: 4 },
  bubbleReceived: { backgroundColor: 'rgba(255,255,255,0.07)', borderBottomLeftRadius: 4 },
  // Queued offline — deliberately NOT the lime sent style, so it never reads as delivered.
  bubblePending: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, borderBottomRightRadius: 4 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 5 },
  pendingText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 9.5, color: CoachColors.textMuted },
  bubbleText: { fontFamily: CoachFonts.body, fontSize: 14, lineHeight: 21 },
  bubbleTextSent: { color: CoachColors.onAccent, fontFamily: CoachFonts.bodyMedium },
  bubbleTextReceived: { color: CoachColors.textPrimary },
  bubbleTime: { fontFamily: CoachFonts.bodySemiBold, fontSize: 9.5, marginTop: 5 },
  bubbleTimeSent: { color: 'rgba(16,18,16,0.5)', textAlign: 'right' },
  bubbleTimeReceived: { color: CoachColors.textFaint },

  quickActionsRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
  },
  quickActionBtn: {
    flex: 1,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
    paddingVertical: 9, alignItems: 'center',
  },
  quickActionText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11.5, color: CoachColors.textSecondary,
  },
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: CoachColors.surface,
  },
  input: {
    flex: 1, backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 11,
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: CoachColors.accent },

  attachBtn: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
  },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 64, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 16, color: CoachColors.textPrimary },
  emptyText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 19 },

  typingRow: { flexDirection: 'row', marginBottom: 8 },
  typingBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderBottomLeftRadius: 4, backgroundColor: 'rgba(255,255,255,0.07)' },
  typingDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CoachColors.textSecondary },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.85 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  workoutPickerContent: {
    backgroundColor: CoachColors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: CoachColors.border, padding: 20, paddingBottom: 36, gap: 12
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalSheetTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary },

  workoutPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: CoachColors.bg, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 12, padding: 14, marginBottom: 10
  },
  workoutPickerTitle: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.textPrimary },
  workoutPickerSub: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted, marginTop: 1 },
  attachBadge: {
    backgroundColor: CoachColors.accent, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999
  },
  attachBadgeText: { fontFamily: CoachFonts.bodyBold, fontSize: 11.5, color: CoachColors.onAccent },

  videoBubbleWrap: { borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.35)' },
  videoBubble: { width: 220, height: 280 },
  reviewAffordance: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.4)', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(16,18,16,0.55)',
  },
  reviewAffordanceText: { fontFamily: CoachFonts.bodyBold, fontSize: 11.5, color: CoachColors.accent },

  reviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  reviewCard: {
    backgroundColor: CoachColors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: CoachColors.border,
    padding: 20, paddingBottom: 30, gap: 14,
  },
  reviewVideoWrap: { borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.4)' },
  reviewVideo: { width: '100%', height: 210 },
  timestampRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 48, height: 38, borderRadius: 10,
    borderWidth: 1, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.bg,
  },
  stepBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 12.5, color: CoachColors.textPrimary },
  timestampDisplay: { flex: 1, alignItems: 'center' },
  timestampText: { fontFamily: CoachFonts.headingBold, fontSize: 18, color: CoachColors.accent },
  timestampLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 10, color: CoachColors.textMuted, marginTop: 1 },
  playheadBtn: {
    height: 38, borderRadius: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.4)',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(16,18,16,0.55)',
  },
  playheadBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 11.5, color: CoachColors.accent },
  reviewInput: {
    backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textPrimary,
    minHeight: 72, maxHeight: 140, textAlignVertical: 'top',
  },
  reviewSendBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  reviewSendText: { fontFamily: CoachFonts.bodyBold, fontSize: 14, color: CoachColors.onAccent },
});
