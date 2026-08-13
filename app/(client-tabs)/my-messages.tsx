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
  KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, StatusBar, Image as RNImage
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useTypingIndicator } from '../../hooks/useTypingIndicator';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import FormReviewMessage, { FORM_REVIEW_PREFIX, parseFormReview } from '../../components/chat/FormReviewMessage';
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
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
}

export default function ClientMessagesScreen() {
  const router = useRouter();
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
      if (msgs) setMessages(msgs);
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
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversation]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const content = newMessage.trim();
    if (!content || sending || !conversation) return;
    setSending(true);
    setNewMessage('');
    try {
      await supabase.from('messages').insert({ conversation_id: conversation.id, sender_type: 'client', content });
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
        }).catch(err => console.log('Push error:', err));
      } else {
        if (__DEV__) console.log('[Messages] Trainer has no push token — push skipped');
      }
    } catch { setNewMessage(content); }
    finally { setSending(false); }
  }, [newMessage, sending, conversation, trainer, clientData]);

  const handleImagePick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64 && conversation) {
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

        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          sender_type: 'client',
          content: '[IMAGE]',
          attachment_url: publicUrlData.publicUrl,
          attachment_type: 'image'
        });

        await supabase.from('conversations').update({
          last_message: 'Sent an image',
          last_message_at: new Date().toISOString(),
        }).eq('id', conversation.id);

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
      return (
        <RNImage
          source={{ uri: msg.attachment_url }}
          style={{ width: 220, height: 300, borderRadius: 12, backgroundColor: isMine ? 'rgba(16,18,16,0.2)' : 'rgba(255,255,255,0.06)' }}
          resizeMode="cover"
        />
      );
    }

    // Form review — coach comment pinned to a second of a video
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

    if (content.startsWith('[WORKOUT_CARD:')) {
      const parts = content.split(':');
      const wName = parts[2] || 'Attached routine';
      const count = parts[3] || '0';

      return (
        <View style={{ minWidth: 200, gap: 8 }}>
          <Text style={[styles.attachTag, { color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }]}>WORKOUT</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.attachIcon}>
              <Ionicons name="barbell-outline" size={18} color={CoachColors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary }} numberOfLines={1}>{wName}</Text>
              <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 11.5, color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }}>{count} exercises</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.attachCta, { backgroundColor: isMine ? CoachColors.bg : CoachColors.accent }]}
            onPress={() => router.push(ClientRoute.workouts)}
            activeOpacity={0.8}
          >
            <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 12, color: isMine ? CoachColors.textPrimary : CoachColors.onAccent }}>Open workout</Text>
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
              <Ionicons name="nutrition-outline" size={18} color={CoachColors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 13.5, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary }} numberOfLines={1}>{dName}</Text>
              {!!cal && (
                <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 11.5, color: isMine ? 'rgba(16,18,16,0.6)' : CoachColors.textMuted }}>{cal} cal/day target</Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.attachCta, { backgroundColor: isMine ? CoachColors.bg : CoachColors.accent }]}
            onPress={() => router.push(ClientRoute.myDiet)}
            activeOpacity={0.8}
          >
            <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 12, color: isMine ? CoachColors.textPrimary : CoachColors.onAccent }}>Open meal plan</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (content === '[CHECKIN_REQUEST]') {
      return (
        <View style={{ minWidth: 200, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="clipboard-outline" size={16} color={isMine ? CoachColors.onAccent : CoachColors.textPrimary} />
            <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: isMine ? CoachColors.onAccent : CoachColors.textPrimary, flex: 1 }}>
              {coachFirst} asked for a check-in
            </Text>
          </View>
          {!isMine && (
            <TouchableOpacity
              style={[styles.attachCta, { backgroundColor: CoachColors.accent }]}
              onPress={() => router.push(ClientRoute.myProgress)}
              activeOpacity={0.8}
            >
              <Text style={{ fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.onAccent }}>Answer it</Text>
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
        <TouchableOpacity style={styles.emptyBackBtn} onPress={() => router.push(ClientRoute.more)} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={26} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-outline" size={44} color={CoachColors.textFaint} />
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
        <TouchableOpacity onPress={() => router.push(ClientRoute.more)} style={styles.backBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={CoachColors.textPrimary} />
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight || 24)}>
        {loading ? (
          <View style={styles.emptyState}><ActivityIndicator size="large" color={CoachColors.accent} /></View>
        ) : (
          <FlatList
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
                  <View style={[styles.bubble, msg.content === '[IMAGE]' ? { backgroundColor: 'transparent', padding: 0 } : isMine ? styles.bubbleSent : styles.bubbleReceived]}>
                    {renderMessageContent(msg, isMine)}
                    <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeSent : styles.bubbleTimeReceived]}>{formatTime(msg.created_at)}</Text>
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
        <View style={[styles.inputBar, {
          paddingBottom: isKeyboardVisible ? 10 : Math.max(insets.bottom + 6, 22),
        }]}>
          <TouchableOpacity onPress={handleImagePick} style={styles.attachBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Send a photo">
            <Ionicons name="image-outline" size={20} color={CoachColors.textSecondary} />
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
          <TouchableOpacity
            style={[styles.sendBtn, newMessage.trim() && styles.sendBtnActive]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
            accessibilityLabel="Send message"
            accessibilityRole="button"
          >
            <Ionicons name="send" size={15} color={newMessage.trim() ? CoachColors.onAccent : CoachColors.textFaint} />
          </TouchableOpacity>
        </View>
        {/* Spacer to clear the floating glass tab bar (BAR_H=84 + MARGIN=14 + device inset) */}
        <View style={{ height: insets.bottom + 100, backgroundColor: CoachColors.surface }} />
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
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: CoachColors.accentSoft, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarText: { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.accent },
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
  bubbleText: { fontFamily: CoachFonts.body, fontSize: 14, lineHeight: 21 },
  bubbleTextSent: { color: CoachColors.onAccent, fontFamily: CoachFonts.bodyMedium },
  bubbleTextReceived: { color: CoachColors.textPrimary },
  bubbleTime: { fontFamily: CoachFonts.bodySemiBold, fontSize: 9.5, marginTop: 5 },
  bubbleTimeSent: { color: 'rgba(16,18,16,0.5)', textAlign: 'right' },
  bubbleTimeReceived: { color: CoachColors.textFaint },

  attachTag: { fontFamily: CoachFonts.bodyBold, fontSize: 9, letterSpacing: 0.8 },
  attachIcon: {
    width: 40, height: 40, borderRadius: 8,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  attachCta: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', marginTop: 4 },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
  },
  attachBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
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

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 64, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 16, color: CoachColors.textPrimary },
  emptyText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, textAlign: 'center', lineHeight: 19 },

  typingRow: { flexDirection: 'row', marginBottom: 8 },
  typingBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderBottomLeftRadius: 4, backgroundColor: 'rgba(255,255,255,0.07)' },
  typingDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CoachColors.textSecondary },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.85 },
});
