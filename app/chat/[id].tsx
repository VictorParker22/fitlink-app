import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Share, RefreshControl, Keyboard, StatusBar, Modal, Image as RNImage
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useTypingIndicator } from '../../hooks/useTypingIndicator';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'trainer' | 'client';
  content: string;
  created_at: string;
  read: boolean;
  attachment_url?: string;
  attachment_type?: string;
}

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).filter(Boolean).join('').toUpperCase().slice(0, 2);
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
    if (msgs) setMessages(msgs);

    // Mark as read
    await supabase.from('conversations').update({ unread_count: 0 }).eq('id', conversationId);
    await supabase.from('messages')
      .update({ read: true })
      .eq('conversation_id', conversationId)
      .eq('sender_type', 'client')
      .eq('read', false);
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
        setMessages((prev) => [...prev, payload.new as Message]);
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

  const sendCustomContent = useCallback(async (content: string) => {
    if (sending) return;
    setSending(true);
    try {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'trainer',
        content,
      });
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
      await supabase.from('conversations').update({
        last_message: previewText,
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId);

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

  const handleSend = useCallback(async () => {
    const content = newMessage.trim();
    if (!content || sending) return;

    setSending(true);
    setNewMessage('');

    try {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'trainer',
        content,
      });
      await supabase.from('conversations').update({
        last_message: content,
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId);

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
      console.error('Send failed:', err);
      setNewMessage(content);
    } finally {
      setSending(false);
    }
  }, [newMessage, sending, conversationId, clientPushToken]);

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

        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_type: 'trainer',
          content: '[IMAGE]',
          attachment_url: publicUrlData.publicUrl,
          attachment_type: 'image'
        });

        await supabase.from('conversations').update({
          last_message: 'Sent an image 📸',
          last_message_at: new Date().toISOString(),
        }).eq('id', conversationId);

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
    } catch (err) {
      console.error('Image upload failed', err);
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back to messages">
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
            message: `Hey ${clientName}! Join me on FitLink to track your workouts, diet plans, and schedule sessions. Open the app and sign in as a client: https://fitlink.coach/client`,
            title: 'Join me on FitLink',
          })}
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

            return (
              <View style={[styles.bubbleRow, isMine && styles.bubbleRowRight]}>
                <View style={[styles.bubble, msg.content === '[IMAGE]' ? { backgroundColor: 'transparent', padding: 0 } : isMine ? styles.bubbleSent : styles.bubbleReceived]}>
                  {renderMessageContent(msg, isMine)}
                  <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeSent : styles.bubbleTimeReceived]}>
                    {formatTime(msg.created_at)}
                  </Text>
                </View>
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

        {/* Quick actions — attach a workout, share a meal plan, ask for a check-in */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => setShowWorkoutPickerModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionText}>Attach a workout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => setShowDietPickerModal(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionText}>Share meal plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => sendCustomContent('[CHECKIN_REQUEST]')}
            activeOpacity={0.8}
            disabled={sending}
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
          />
          <TouchableOpacity
            style={[styles.sendBtn, newMessage.trim() && styles.sendBtnActive]}
            onPress={handleSend}
            disabled={!newMessage.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
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
});
