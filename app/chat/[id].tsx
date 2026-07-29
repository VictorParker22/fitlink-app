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
import Avatar from '../../components/Avatar';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { getWorkoutEmblem } from '../../utils/workoutEmblems';
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

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [clientName, setClientName] = useState('Client');
  const [clientAvatar, setClientAvatar] = useState<string | undefined>();
  const flatListRef = useRef<FlatList>(null);
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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

  const { workouts } = useApp();
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showWorkoutPickerModal, setShowWorkoutPickerModal] = useState(false);

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
        previewText = `🏋️ Workout Routine: ${parts[2] || 'Attached Workout'}`;
      } else if (content.startsWith('[QUICK_NOTE:')) {
        previewText = `📋 Note: ${content.replace('[QUICK_NOTE:', '').replace(']', '')}`;
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
            data: { url: '/my-messages' }
          }
        }).catch(err => console.log('Push error:', err));
      }
    } catch (err) {
      console.error('Send custom failed:', err);
    } finally {
      setSending(false);
      setShowAttachModal(false);
      setShowWorkoutPickerModal(false);
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
      setShowAttachModal(false);
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
          style={{ width: 220, height: 300, borderRadius: Radius.sm, backgroundColor: isMine ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)' }} 
          resizeMode="cover"
        />
      );
    }

    if (content.startsWith('[WORKOUT_CARD:')) {
      const parts = content.split(':');
      const wId = parts[1];
      const wName = parts[2] || 'Attached Routine';
      const count = parts[3] || '0';
      const emblem = getWorkoutEmblem(wId, wName, []);

      return (
        <View style={{ minWidth: 200, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: isMine ? '#00000022' : '#FFFFFF22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.xs }}>
              <Text style={{ fontFamily: FontFamily.heading, fontSize: 9, color: isMine ? '#000000' : colors.textSecondary, letterSpacing: 0.8 }}>WORKOUT ATTACHMENT</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 }}>
            <RNImage source={emblem} style={{ width: 42, height: 42, borderRadius: Radius.xs }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FontFamily.bodyBold, fontSize: FontSize.sm, color: isMine ? '#000000' : '#FFFFFF' }} numberOfLines={1}>{wName}</Text>
              <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: isMine ? 'rgba(0,0,0,0.6)' : colors.textTertiary }}>{count} Exercises</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: isMine ? '#000000' : '#FFFFFF',
              paddingVertical: 8, paddingHorizontal: 12,
              borderRadius: Radius.xs, alignItems: 'center', marginTop: 4
            }}
            onPress={() => router.push(`/workout/${wId}` as any)}
            activeOpacity={0.8}
          >
            <Text style={{ fontFamily: FontFamily.heading, fontSize: 11, color: isMine ? '#FFFFFF' : '#000000', letterSpacing: 0.5 }}>OPEN WORKOUT ➔</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (content.startsWith('[QUICK_NOTE:')) {
      const text = content.replace('[QUICK_NOTE:', '').replace(/\]$/, '');
      return (
        <View style={{ minWidth: 180, gap: 4 }}>
          <Text style={{ fontFamily: FontFamily.heading, fontSize: 9, color: isMine ? '#00000099' : colors.textTertiary, letterSpacing: 0.8 }}>COACH DIRECT TIP</Text>
          <Text style={{ fontFamily: FontFamily.bodyBold, fontSize: FontSize.sm, color: isMine ? '#000000' : colors.textPrimary, lineHeight: 20 }}>{text}</Text>
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Avatar name={clientName} size="sm" imageUrl={clientAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{clientName}</Text>
          <Text style={styles.headerSub}>DIRECT CLIENT CHANNEL</Text>
        </View>
        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={() => Share.share({
            message: `Hey ${clientName}! Join me on FitLink to track your workouts, diet plans, and schedule sessions. Open the app and sign in as a client: https://fitlink.coach/client`,
            title: 'Join me on FitLink',
          })}
        >
          <Ionicons name="paper-plane-outline" size={16} color={colors.textPrimary} />
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
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
              <Ionicons name="chatbubble-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>Start the conversation!</Text>
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

        {/* Input Bar */}
        <View style={[styles.inputBar, { paddingBottom: isKeyboardVisible ? 10 : Math.max(insets.bottom + 6, 22) }]}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() => setShowAttachModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
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
          >
            <Ionicons
              name="send"
              size={16}
              color={newMessage.trim() ? '#000000' : colors.textTertiary}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Attachment Action Sheet Modal */}
      <Modal visible={showAttachModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowAttachModal(false)} />
          <View style={styles.actionSheetContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalSheetTitle}>ATTACHMENT ACTIONS</Text>
              <TouchableOpacity onPress={() => setShowAttachModal(false)}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => { setShowAttachModal(false); setShowWorkoutPickerModal(true); }}
            >
              <View style={styles.actionIconBox}>
                <Ionicons name="barbell-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>ATTACH WORKOUT ROUTINE</Text>
                <Text style={styles.actionSub}>Send a program card directly to this client</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleImagePick}
            >
              <View style={styles.actionIconBox}>
                <Ionicons name="image-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>SEND PHOTO ATTACHMENT</Text>
                <Text style={styles.actionSub}>Upload an image from your library</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => sendCustomContent('[QUICK_NOTE:🎙️ Voice Feedback: Form looks great on set 3! Keep chest up and drive through heels.]')}
            >
              <View style={styles.actionIconBox}>
                <Ionicons name="mic-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>SEND VOICE FEEDBACK NOTE</Text>
                <Text style={styles.actionSub}>Instant audio assessment feedback</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => sendCustomContent('[QUICK_NOTE:⚡ Form Tip: Increase working weight by 5% on next week\'s primary lifts.]')}
            >
              <View style={styles.actionIconBox}>
                <Ionicons name="flash-outline" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>SEND PROGRESSION TIP</Text>
                <Text style={styles.actionSub}>Send direct training load advice</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Workout Picker Modal */}
      <Modal visible={showWorkoutPickerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowWorkoutPickerModal(false)} />
          <View style={styles.workoutPickerContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalSheetTitle}>SELECT WORKOUT ROUTINE</Text>
              <TouchableOpacity onPress={() => setShowWorkoutPickerModal(false)}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={workouts}
              keyExtractor={(w) => w.id}
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 380 }}
              renderItem={({ item: w }) => {
                const count = w.workout_exercises?.length || 0;
                const emblem = getWorkoutEmblem(w.id, w.name, w.workout_exercises?.map((we: any) => we.exercises?.muscle_group).filter(Boolean));
                return (
                  <TouchableOpacity
                    style={styles.workoutPickerRow}
                    onPress={() => sendCustomContent(`[WORKOUT_CARD:${w.id}:${w.name}:${count}]`)}
                  >
                    <RNImage source={emblem} style={{ width: 40, height: 40, borderRadius: Radius.xs }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.workoutPickerTitle} numberOfLines={1}>{w.name}</Text>
                      <Text style={styles.workoutPickerSub}>{count} Exercises • On Demand</Text>
                    </View>
                    <View style={styles.attachBadge}>
                      <Text style={styles.attachBadgeText}>ATTACH</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Text style={{ fontFamily: FontFamily.body, color: colors.textTertiary, fontSize: FontSize.sm }}>No workouts created in library yet.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: '#000000',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: Radius.xs,
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center'
  },
  inviteBtn: {
    width: 36, height: 36, borderRadius: Radius.xs,
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center'
  },
  headerName: { fontFamily: FontFamily.heading, fontSize: FontSize.md, color: colors.textPrimary, letterSpacing: -0.2 },
  headerSub: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.8, marginTop: 1 },

  messageList: { padding: Spacing.lg, paddingBottom: Spacing.md, flexGrow: 1 },

  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.lg },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dateText: { fontFamily: FontFamily.heading, fontSize: FontSize.xs, color: colors.textSecondary, letterSpacing: 1, textTransform: 'uppercase' },

  bubbleRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.xs },
  bubbleSent: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FFFFFF' },
  bubbleReceived: { backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: colors.borderStrong },
  bubbleText: { fontFamily: FontFamily.body, fontSize: FontSize.base, lineHeight: 21 },
  bubbleTextSent: { color: '#000000', fontFamily: FontFamily.bodyMedium },
  bubbleTextReceived: { color: colors.textPrimary },
  bubbleTime: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, marginTop: 5, letterSpacing: 0.5 },
  bubbleTimeSent: { color: 'rgba(0,0,0,0.5)', textAlign: 'right' },
  bubbleTimeReceived: { color: colors.textTertiary },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm + 4,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: '#000000',
  },
  input: {
    flex: 1, backgroundColor: colors.bgInput,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: Radius.xs,
    paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 42, borderRadius: Radius.xs,
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },

  attachBtn: {
    width: 44, height: 42, borderRadius: Radius.xs,
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: Spacing['4xl'] },
  emptyText: { fontFamily: FontFamily.heading, fontSize: FontSize.xs, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase' },

  typingRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  typingBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.xs, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: '#0A0A0A' },
  typingDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 1, backgroundColor: colors.textSecondary },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },

  // Phase 2 Attachment Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  actionSheetContent: {
    backgroundColor: '#0A0A0A', borderTopLeftRadius: Radius.md, borderTopRightRadius: Radius.md,
    borderWidth: 1, borderColor: colors.borderStrong, padding: Spacing.lg, paddingBottom: 36, gap: Spacing.md
  },
  workoutPickerContent: {
    backgroundColor: '#0A0A0A', borderTopLeftRadius: Radius.md, borderTopRightRadius: Radius.md,
    borderWidth: 1, borderColor: colors.borderStrong, padding: Spacing.lg, paddingBottom: 36, gap: Spacing.md
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  modalSheetTitle: { fontFamily: FontFamily.heading, fontSize: FontSize.xs, color: colors.textSecondary, letterSpacing: 1 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: '#111111', borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: Radius.xs, padding: Spacing.md
  },
  actionIconBox: {
    width: 38, height: 38, borderRadius: Radius.xs,
    backgroundColor: '#000000', borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center'
  },
  actionTitle: { fontFamily: FontFamily.heading, fontSize: FontSize.xs, color: colors.textPrimary, letterSpacing: 0.5 },
  actionSub: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 1 },

  workoutPickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: '#111111', borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: Radius.xs, padding: Spacing.md, marginBottom: Spacing.sm
  },
  workoutPickerTitle: { fontFamily: FontFamily.bodyBold, fontSize: FontSize.sm, color: colors.textPrimary },
  workoutPickerSub: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 1 },
  attachBadge: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.xs
  },
  attachBadgeText: { fontFamily: FontFamily.heading, fontSize: 10, color: '#000000', letterSpacing: 0.8 },
});
