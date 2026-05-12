import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTypingIndicator } from '../../hooks/useTypingIndicator';
import Avatar from '../../components/Avatar';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'trainer' | 'client';
  content: string;
  created_at: string;
  read: boolean;
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

  // Load conversation + messages
  useEffect(() => {
    async function load() {
      const { data: conv } = await supabase
        .from('conversations')
        .select('*, clients(name, avatar_url)')
        .eq('id', conversationId)
        .single();
      if (conv) {
        setClientName(conv.clients?.name || 'Client');
        setClientAvatar(conv.clients?.avatar_url);
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
    }
    load();
  }, [conversationId]);

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
    } catch (err) {
      console.error('Send failed:', err);
      setNewMessage(content);
    } finally {
      setSending(false);
    }
  }, [newMessage, sending, conversationId]);

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Avatar name={clientName} size="sm" imageUrl={clientAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{clientName}</Text>
        </View>
        <TouchableOpacity
          style={styles.inviteBtn}
          onPress={() => Share.share({
            message: `Hey ${clientName}! Join me on FitLink to track your workouts, diet plans, and schedule sessions. Open the app and sign in as a client: https://fitlink.coach/client`,
            title: 'Join me on FitLink',
          })}
        >
          <Ionicons name="paper-plane-outline" size={18} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
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
            const isMine = msg.sender_type === 'trainer';

            return (
              <View style={[styles.bubbleRow, isMine && styles.bubbleRowRight]}>
                <View style={[styles.bubble, isMine ? styles.bubbleSent : styles.bubbleReceived]}>
                  <Text style={[styles.bubbleText, isMine ? styles.bubbleTextSent : styles.bubbleTextReceived]}>
                    {msg.content}
                  </Text>
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
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            value={newMessage}
            onChangeText={(text) => { setNewMessage(text); startTyping(); }}
            multiline
            maxLength={2000}
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
              size={18}
              color={newMessage.trim() ? Colors.white : colors.textTertiary}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  inviteBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: `${colors.accent}15`, alignItems: 'center', justifyContent: 'center' },
  headerName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },

  messageList: { padding: Spacing.lg, paddingBottom: Spacing.sm, flexGrow: 1 },

  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.lg },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dateText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary },

  bubbleRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.lg },
  bubbleSent: { backgroundColor: colors.accent, borderBottomRightRadius: 4 },
  bubbleReceived: { backgroundColor: colors.bgElevated, borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: FontFamily.body, fontSize: FontSize.base, lineHeight: 20 },
  bubbleTextSent: { color: Colors.white },
  bubbleTextReceived: { color: colors.textPrimary },
  bubbleTime: { fontFamily: FontFamily.body, fontSize: 9, marginTop: 4 },
  bubbleTimeSent: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  bubbleTimeReceived: { color: colors.textTertiary },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  input: {
    flex: 1, backgroundColor: colors.bgInput,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: Radius.xl,
    paddingHorizontal: 16, paddingVertical: 10,
    fontFamily: FontFamily.body, fontSize: FontSize.base, color: colors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: colors.accent },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: Spacing['4xl'] },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary },

  typingRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  typingBubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.lg, borderBottomLeftRadius: 4, backgroundColor: colors.bgElevated },
  typingDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textTertiary },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
});
