/**
 * My messages — the athlete side of the coach thread (design 22e).
 *
 * Fixed dark/lime system (CoachColors/CoachFonts), mirroring the coach thread
 * at app/chat/[id].tsx from the athlete's seat. Adds the form-review pattern:
 * a video message with the coach's comment pinned to a timestamp
 * ([FORM_REVIEW:<seconds>:<comment>] + video attachment), tapping the chip
 * seeks the inline player to that second.
 *
 * Preserved from the previous version: realtime subscription, typing
 * indicator, image upload, read marking, unread increment RPC, and the
 * keyboard behavior (padding + inset-aware input bar).
 *
 * Policy: messaging is never paywalled on the athlete side — no premium gate
 * belongs in this thread.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, Image as RNImage,
  Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../../lib/supabase';
import { enqueueMessage, flushOutbox, isNetworkError, loadOutbox, makeTempId, type OutboxMessage } from '../../lib/outbox';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import { useTypingIndicator } from '../../hooks/useTypingIndicator';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import FormReviewMessage, { FORM_REVIEW_PREFIX, parseFormReview } from '../../components/chat/FormReviewMessage';
import { useSignedMediaUrl } from '../../lib/privateMedia';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'trainer' | 'client';
  content: string;
  created_at: string;
  attachment_url?: string;
  attachment_type?: string;
  /** Local-only: queued in the outbox, waiting for connectivity. Never shown as sent. */
  pending?: boolean;
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
}

// ── Private-bucket attachments ──────────────────────────────────────────────
// chat-attachments is a PRIVATE bucket: the stored attachment_url is not a
// fetchable URL any more, it has to be signed first. Signing is a hook, and
// hooks cannot run inside a .map(), so each attachment renders through its own
// component. `ready` separates "still signing" from "cannot show it" so we
// hold a same-size placeholder instead of flashing a broken image, and say so
// plainly when the signature genuinely fails.

const ATTACHMENT_W = 220;
const ATTACHMENT_H = 300;

function AttachmentImage({ storedUrl, isMine }: { storedUrl: string; isMine: boolean }) {
  const { url, ready, failed } = useSignedMediaUrl(storedUrl);
  const frame = {
    width: ATTACHMENT_W,
    height: ATTACHMENT_H,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: isMine ? 'rgba(16,18,16,0.2)' : 'rgba(255,255,255,0.06)',
  } as const;

  if (!ready) return <View style={frame} />;

  if (failed || !url) {
    return (
      <View style={[frame, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }]}>
        <Ionicons name="image-outline" size={22} color={CoachColors.textMuted} />
        <Text style={styles.attachmentUnavailable}>Attachment unavailable</Text>
      </View>
    );
  }

  return <RNImage source={{ uri: url }} style={frame} resizeMode="cover" />;
}

/**
 * FormReviewMessage renders the pinned comment with or without a video, so
 * while the signature is in flight (or if it fails) the comment still reads
 * correctly — we simply withhold the video rather than hand the player a URL
 * that cannot load.
 */
function SignedFormReviewMessage({
  storedUrl,
  seconds,
  comment,
  isMine,
}: {
  storedUrl?: string;
  seconds: number;
  comment: string;
  isMine: boolean;
}) {
  const { url, ready, failed } = useSignedMediaUrl(storedUrl);
  return (
    <View>
      <FormReviewMessage
        seconds={seconds}
        comment={comment}
        videoUrl={ready && !failed && url ? url : undefined}
        isMine={isMine}
      />
      {!!storedUrl && ready && (failed || !url) && (
        <Text style={styles.attachmentUnavailable}>Attachment unavailable</Text>
      )}
    </View>
  );
}

export default function ClientMessagesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { conversation, trainer, clientData } = useClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const { isTyping, startTyping } = useTypingIndicator(conversation?.id, 'client', !!conversation);
  const insets = useSafeAreaInsets();

  const coachName = trainer?.name || 'Coach';
  const coachFirst = coachName.split(' ')[0];

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (!conversation) { setLoading(false); return; }

    async function load() {
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      // Re-attach any queued (unsent) messages so they survive re-entry and
      // restarts — shown as "Waiting to send".
      const queued = (await loadOutbox(user?.id)).filter((q) => q.conversationId === conversation.id);
      const pendingBubbles: Message[] = queued.map((q) => ({
        id: q.tempId,
        conversation_id: q.conversationId,
        sender_type: 'client',
        content: q.content,
        created_at: q.createdAt,
        pending: true,
      }));
      if (msgs || pendingBubbles.length) setMessages([...(msgs || []), ...pendingBubbles]);
      setLoading(false);

      // Mark trainer messages as read
      await supabase.from('messages')
        .update({ read: true })
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'trainer')
        .eq('read', false);
    }
    load();
  }, [conversation]);

  // Realtime
  useEffect(() => {
    if (!conversation) return;
    const channel = supabase
      .channel(`client-msgs:${conversation.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, (payload) => {
        const row = payload.new as Message;
        // Dedupe — a flushed outbox message may already be in state.
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversation]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  // Queue a message locally when offline: honest pending bubble now, real
  // send on reconnect. Never rendered as sent.
  const queueLocally = useCallback(async (content: string) => {
    if (!user || !conversation) return;
    const tempId = makeTempId();
    const createdAt = new Date().toISOString();
    await enqueueMessage(user.id, {
      tempId,
      conversationId: conversation.id,
      senderType: 'client',
      content,
      createdAt,
    });
    setMessages((prev) => [...prev, {
      id: tempId,
      conversation_id: conversation.id,
      sender_type: 'client',
      content,
      created_at: createdAt,
      pending: true,
    }]);
  }, [user, conversation]);

  // Replay the queue in order once connectivity returns.
  const flushQueued = useCallback(async () => {
    if (!user) return;
    const flushed = await flushOutbox(user.id, async (m: OutboxMessage) => {
      const { data, error } = await supabase.from('messages').insert({
        conversation_id: m.conversationId,
        sender_type: m.senderType,
        content: m.content,
      }).select().single();
      if (error || !data) return null;
      await supabase.rpc('increment_conversation_unread', {
        conv_id: m.conversationId,
        new_last_message: m.content,
      });
      return data;
    });
    if (flushed.length) {
      setMessages((prev) => prev
        .map((msg) => {
          const hit = flushed.find((f) => f.tempId === msg.id);
          return hit ? (hit.row as Message) : msg;
        })
        .filter((msg, i, arr) => arr.findIndex((m) => m.id === msg.id) === i));
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) flushQueued();
    });
    return () => unsubscribe();
  }, [flushQueued]);

  const handleSend = useCallback(async () => {
    const content = newMessage.trim();
    if (!content || sending || !conversation) return;
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
      const { error: insertError } = await supabase.from('messages').insert({ conversation_id: conversation.id, sender_type: 'client', content });
      if (insertError) throw insertError;
      // Update last_message preview AND atomically increment trainer's unread badge.
      // Using raw SQL increment via rpc avoids the stale-closure race where the
      // in-memory conversation.unread_count is boot-time stale and multiple sends
      // in the same session would always write unread_count=1 instead of +1.
      await supabase.rpc('increment_conversation_unread', {
        conv_id: conversation.id,
        new_last_message: content,
      });

      // Trigger push notification to trainer
      if (trainer?.expo_push_token) {
        const pushBody = content.startsWith('[WORKOUT_CARD:')
          ? 'Client sent an attachment'
          : content;

        supabase.functions.invoke('send-push-notification', {
          body: {
            pushToken: trainer.expo_push_token,
            title: `Message from ${clientData?.name || 'Client'}`,
            body: pushBody,
            data: { url: '/messages' }
          }
        }).catch(err => { if (__DEV__) console.log('[Messages] Push error:', err?.message); });
      } else {
        if (__DEV__) console.log('[Messages] Trainer has no push token — push skipped');
      }
    } catch (err) {
      if (isNetworkError(err)) {
        // Connectivity dropped mid-send — queue for the reconnect flush.
        await queueLocally(content);
      } else {
        setNewMessage(content);
      }
    }
    finally { setSending(false); }
  }, [newMessage, sending, conversation, trainer, clientData, queueLocally]);

  const handleImagePick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64 && conversation) {
        if (!user) throw new Error('You are signed out. Sign in and try again.');
        setSending(true);
        const base64 = result.assets[0].base64;
        const ext = result.assets[0].uri.split('.').pop() || 'jpg';
        // chat-attachments is private and only accepts writes under
        // `{auth uid}/…`; the uid segment is also what scopes the read policy.
        const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

        const { error } = await supabase.storage
          .from('chat-attachments')
          .upload(fileName, decode(base64), { contentType: `image/${ext}` });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(fileName);

        // The upload landing in storage is not the same as the message landing
        // in the thread — the insert resolves with an error, it never throws.
        const { error: msgError } = await supabase.from('messages').insert({
          conversation_id: conversation.id,
          sender_type: 'client',
          content: '[IMAGE]',
          attachment_url: publicUrlData.publicUrl,
          attachment_type: 'image'
        });
        if (msgError) throw msgError;

        const { error: convError } = await supabase.from('conversations').update({
          last_message: 'Sent an image',
          last_message_at: new Date().toISOString(),
        }).eq('id', conversation.id);
        if (convError && __DEV__) console.warn('[Messages] conversation preview update failed:', convError.message);

        if (trainer?.expo_push_token) {
          supabase.functions.invoke('send-push-notification', {
            body: {
              pushToken: trainer.expo_push_token,
              title: `Message from ${clientData?.name || 'Client'}`,
              body: 'Client sent an image',
              data: { url: '/messages' }
            }
          });
        }
      }
    } catch (err) {
      console.error('Image upload failed', err);
      Alert.alert('Image not sent', "We couldn't send your image. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

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
      return <AttachmentImage storedUrl={msg.attachment_url} isMine={isMine} />;
    }

    // Form review — coach comment pinned to a second of a video
    if (content.startsWith(FORM_REVIEW_PREFIX)) {
      const parsed = parseFormReview(content);
      if (parsed) {
        return (
          <SignedFormReviewMessage
            seconds={parsed.seconds}
            comment={parsed.comment}
            storedUrl={msg.attachment_type === 'video' ? msg.attachment_url : undefined}
            isMine={isMine}
          />
        );
      }
    }

    if (content.startsWith('[WORKOUT_CARD:')) {
      const parts = content.split(':');
      const wName = parts[2] || 'Attached routine';
      const count = parts[3] || '0';

      return (
        <View style={{ minWidth: 200, gap: 8 }}>
          <Text style={[styles.attachTag, { color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }]}>WORKOUT</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.attachIcon}>
              <Ionicons name="barbell-outline" size={20} color={CoachColors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 15, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary }} numberOfLines={1}>{wName}</Text>
              <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }}>{count} exercises</Text>
            </View>
          </View>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
            style={[styles.attachCta, { backgroundColor: isMine ? CoachColors.bg : CoachColors.accent }]}
            onPress={() => router.push(ClientRoute.workouts)}
            activeOpacity={0.8}
          >
            <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: isMine ? CoachColors.textPrimary : CoachColors.onAccent }}>Open workout</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (content.startsWith('[DIET_CARD:')) {
      const parts = content.split(':');
      const dName = parts[2] || 'Attached meal plan';
      const cal = parts[3] || '';
      return (
        <View style={{ minWidth: 200, gap: 8 }}>
          <Text style={[styles.attachTag, { color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }]}>MEAL PLAN</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.attachIcon}>
              <Ionicons name="nutrition-outline" size={20} color={CoachColors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 15, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary }} numberOfLines={1}>{dName}</Text>
              {!!cal && (
                <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }}>{cal} cal/day target</Text>
              )}
            </View>
          </View>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
            style={[styles.attachCta, { backgroundColor: isMine ? CoachColors.bg : CoachColors.accent }]}
            onPress={() => router.push(ClientRoute.myDiet)}
            activeOpacity={0.8}
          >
            <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: isMine ? CoachColors.textPrimary : CoachColors.onAccent }}>Open meal plan</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (content === '[CHECKIN_REQUEST]') {
      return (
        <View style={{ minWidth: 200, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="clipboard-outline" size={18} color={isMine ? CoachColors.onAccent : CoachColors.textPrimary} />
            <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary, flex: 1 }}>
              {coachFirst} asked for a check-in
            </Text>
          </View>
          {!isMine && (
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
              style={[styles.attachCta, { backgroundColor: CoachColors.accent }]}
              onPress={() => router.push(ClientRoute.myProgress)}
              activeOpacity={0.8}
            >
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.onAccent }}>Answer it</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    if (content.startsWith('[QUICK_NOTE:')) {
      const text = content.replace('[QUICK_NOTE:', '').replace(/\]$/, '');
      return (
        <View style={{ minWidth: 180, gap: 4 }}>
          <Text style={[styles.attachTag, { color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }]}>COACHING NOTE</Text>
          <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary, lineHeight: 22.5 }}>{text}</Text>
        </View>
      );
    }

    return (
      <Text style={[styles.bubbleText, isMine ? styles.bubbleTextSent : styles.bubbleTextReceived]}>
        {content}
      </Text>
    );
  };

  // Date dividers
  const messagesWithDividers = messages.reduce<Array<Message | { type: 'divider'; date: string }>>((acc, msg, i) => {
    const dateKey = new Date(msg.created_at).toDateString();
    const prevDateKey = i > 0 ? new Date(messages[i - 1].created_at).toDateString() : null;
    if (dateKey !== prevDateKey) acc.push({ type: 'divider', date: msg.created_at });
    acc.push(msg);
    return acc;
  }, []);

  if (!conversation) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }} style={styles.emptyBackBtn} onPress={() => router.push(ClientRoute.more)} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={29} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-outline" size={49} color={CoachColors.textFaint} />
          <Text style={styles.emptyTitle}>No conversation yet</Text>
          <Text style={styles.emptyText}>Your coach will start the thread with you</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity hitSlop={7} onPress={() => router.push(ClientRoute.more)} style={styles.backBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={25} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerAvatar}>
          {trainer?.avatar_url ? (
            <RNImage source={{ uri: trainer.avatar_url }} style={{ width: 34, height: 34, borderRadius: 17 }} />
          ) : (
            <Text style={styles.headerAvatarText}>{initials(coachName)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{coachName}</Text>
          <Text style={styles.headerSub}>Your coach · replies within a day</Text>
        </View>
      </View>

      {/* 'padding' is correct on iOS only — on Android the activity already
          resizes (windowSoftInputMode=adjustResize) and padding double-counts. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <View style={styles.emptyState}><ActivityIndicator size="large" color={CoachColors.accent} /></View>
        ) : (
          <FlatList keyboardShouldPersistTaps="handled"
            ref={flatListRef}
            data={messagesWithDividers}
            keyExtractor={(item, i) => 'id' in item ? item.id : `divider-${i}`}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
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
              const isMine = msg.sender_type === 'client';
              return (
                <View
                  style={[styles.bubbleRow, isMine && styles.bubbleRowRight]}
                  accessible={true}
                  accessibilityLabel={`${isMine ? 'You' : coachName} said: ${msg.content}, at ${formatTime(msg.created_at)}`}
                  accessibilityRole="text"
                >
                  <View style={[styles.bubble, msg.content === '[IMAGE]' ? { backgroundColor: 'transparent', padding: 0 } : msg.pending ? styles.bubblePending : isMine ? styles.bubbleSent : styles.bubbleReceived]}>
                    {renderMessageContent(msg, isMine && !msg.pending)}
                    {msg.pending ? (
                      <View style={styles.pendingRow}>
                        <Ionicons name="time-outline" size={11} color={CoachColors.textMuted} />
                        <Text style={styles.pendingText}>Waiting to send</Text>
                      </View>
                    ) : (
                      <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeSent : styles.bubbleTimeReceived]}>{formatTime(msg.created_at)}</Text>
                    )}
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Start the conversation</Text>
                <Text style={styles.emptyText}>Ask a question, send a clip, tell {coachFirst} how training went.</Text>
              </View>
            }
            ListFooterComponent={
              isTyping ? (
                <View style={styles.typingRow}>
                  <View style={styles.typingBubble}>
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
        )}

        {/* Input bar */}
        {/* The spacer below clears the tab bar, so the bar itself only needs
            its own breathing room — adding the safe-area inset here too was
            counting it twice. */}
        <View style={[styles.inputBar, { paddingBottom: 10 }]}>
          <TouchableOpacity hitSlop={5} onPress={handleImagePick} style={styles.attachBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Send a photo">
            <Ionicons name="image-outline" size={22} color={CoachColors.textSecondary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder={`Message ${coachFirst}…`}
            placeholderTextColor={CoachColors.textFaint}
            value={newMessage}
            onChangeText={(text) => { setNewMessage(text); startTyping(); }}
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            accessibilityLabel="Type a message to your coach"
            accessibilityRole="text"
          />
          <TouchableOpacity hitSlop={2}
            style={[styles.sendBtn, newMessage.trim() && styles.sendBtnActive]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
            accessibilityLabel="Send message"
            accessibilityRole="button"
          >
            <Ionicons name="send" size={17} color={newMessage.trim() ? CoachColors.onAccent : CoachColors.textFaint} />
          </TouchableOpacity>
        </View>
        {/* Clears the floating tab bar. Measured from the real bar in
            (client-tabs)/_layout.tsx: paddingTop 11 + button ~44 +
            max(insets.bottom, 14). The old value assumed a glass bar of
            BAR_H 84 that no longer exists, which left a large dead gap under
            the composer. Zero while the keyboard is up — the bar is behind it. */}
        <View
          style={{
            height: isKeyboardVisible ? 0 : Math.max(insets.bottom, 14) + 55,
            backgroundColor: CoachColors.surface,
          }}
        />
      </KeyboardAvoidingView>
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
  emptyBackBtn: { paddingHorizontal: 16, paddingVertical: 12, alignSelf: 'flex-start' },
  headerAvatar: {
    width: 34, height: 34, borderRadius: 17, borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSoft, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: CoachColors.accent },
  headerName: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary },
  headerSub: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textFaint, marginTop: 1 },

  messageList: { padding: 16, paddingBottom: 12, flexGrow: 1 },

  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  dateLine: { flex: 1, height: 1, backgroundColor: CoachColors.border },
  dateText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textFaint },

  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderCurve: 'continuous' },
  bubbleSent: { backgroundColor: CoachColors.accent, borderBottomRightRadius: 4 },
  bubbleReceived: { backgroundColor: 'rgba(255,255,255,0.07)', borderBottomLeftRadius: 4 },
  // Queued offline — deliberately NOT the lime sent style, so it never reads as delivered.
  bubblePending: { backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted, borderBottomRightRadius: 4 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 5 },
  pendingText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 10.5, color: CoachColors.textMuted },
  bubbleText: { fontFamily: CoachFonts.body, fontSize: 15.5, lineHeight: 23.5 },
  bubbleTextSent: { color: CoachColors.onAccent, fontFamily: CoachFonts.bodyMedium },
  bubbleTextReceived: { color: CoachColors.textPrimary },
  bubbleTime: { fontFamily: CoachFonts.bodySemiBold, fontSize: 10.5, marginTop: 5 },
  bubbleTimeSent: { color: 'rgba(16,18,16,0.5)', textAlign: 'right' },
  bubbleTimeReceived: { color: CoachColors.textFaint },

  attachTag: { fontFamily: CoachFonts.bodyBold, fontSize: 10, letterSpacing: 0.8 },
  attachmentUnavailable: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted,
    marginTop: 6, textAlign: 'center',
  },
  attachIcon: {
    width: 40, height: 40, borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  attachCta: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center', marginTop: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
  },
  attachBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1, backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 16, paddingVertical: 13,
    fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous',
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: CoachColors.accent },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 64, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary },
  emptyText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 21.5 },

  typingRow: { flexDirection: 'row', marginBottom: 8 },
  typingBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderCurve: 'continuous', borderBottomLeftRadius: 4, backgroundColor: 'rgba(255,255,255,0.07)' },
  typingDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, borderCurve: 'continuous', backgroundColor: CoachColors.textSecondary },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.85 },
});
