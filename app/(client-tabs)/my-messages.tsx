import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import { useTypingIndicator } from '../../hooks/useTypingIndicator';
import Avatar from '../../components/Avatar';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'trainer' | 'client';
  content: string;
  created_at: string;
}

export default function ClientMessagesScreen() {
  const { conversation, trainer, clientData } = useClient();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const { isTyping, startTyping } = useTypingIndicator(conversation?.id, 'client', !!conversation);

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
      await supabase.from('conversations').update({ last_message: content, last_message_at: new Date().toISOString() }).eq('id', conversation.id);
    } catch { setNewMessage(content); }
    finally { setSending(false); }
  }, [newMessage, sending, conversation]);

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (!conversation) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Messages</Text>
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-outline" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No conversation yet</Text>
          <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Your trainer will start a conversation with you</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bgSecondary }]}>
        <Avatar name={trainer?.name || 'Coach'} size="sm" imageUrl={trainer?.avatar_url} />
        <View>
          <Text style={[styles.headerName, { color: colors.textPrimary }]}>Coach {trainer?.name?.split(' ')[0] || 'Trainer'}</Text>
          <Text style={[styles.headerSub, { color: colors.textTertiary }]}>Your Trainer</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <View style={styles.emptyState}><ActivityIndicator size="large" color={colors.accent} /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: msg }) => {
              const isMine = msg.sender_type === 'client';
              return (
                <View style={[styles.bubbleRow, isMine && styles.bubbleRowRight]}>
                  <View style={[styles.bubble, isMine ? [styles.bubbleSent, { backgroundColor: colors.accent }] : [styles.bubbleReceived, { backgroundColor: colors.bgElevated }]]}>
                    <Text style={[styles.bubbleText, isMine ? styles.bubbleTextSent : { color: colors.textPrimary }]}>{msg.content}</Text>
                    <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeSent : { color: colors.textTertiary }]}>{formatTime(msg.created_at)}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<View style={styles.emptyState}><Text style={[styles.emptyText, { color: colors.textTertiary }]}>Say hi to your trainer! 👋</Text></View>}
            ListFooterComponent={
              isTyping ? (
                <View style={styles.typingRow}>
                  <View style={[styles.typingBubble, { backgroundColor: colors.bgElevated }]}>
                    <View style={styles.typingDots}>
                      <View style={[styles.dot, styles.dot1, { backgroundColor: colors.textTertiary }]} />
                      <View style={[styles.dot, styles.dot2, { backgroundColor: colors.textTertiary }]} />
                      <View style={[styles.dot, styles.dot3, { backgroundColor: colors.textTertiary }]} />
                    </View>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.bgSecondary }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.borderStrong, color: colors.textPrimary }]}
            placeholder="Type a message..."
            placeholderTextColor={colors.textTertiary}
            value={newMessage}
            onChangeText={(text) => { setNewMessage(text); startTyping(); }}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={[styles.sendBtn, { backgroundColor: newMessage.trim() ? colors.accent : colors.bgElevated }]} onPress={handleSend} disabled={!newMessage.trim() || sending}>
            <Ionicons name="send" size={18} color={newMessage.trim() ? Colors.white : colors.textTertiary} />
          </TouchableOpacity>
        </View>
        {/* Spacer for floating tab bar */}
        <View style={{ height: Platform.OS === 'ios' ? 88 : 72, backgroundColor: colors.bgSecondary }} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  headerName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md },
  headerSub: { fontFamily: FontFamily.body, fontSize: FontSize.xs },

  messageList: { padding: Spacing.lg, paddingBottom: Spacing.sm, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.lg },
  bubbleSent: { borderBottomRightRadius: 4 },
  bubbleReceived: { borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: FontFamily.body, fontSize: FontSize.base, lineHeight: 20 },
  bubbleTextSent: { color: Colors.white },
  bubbleTime: { fontFamily: FontFamily.body, fontSize: 9, marginTop: 4 },
  bubbleTimeSent: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' as const },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: Radius.xl, paddingHorizontal: 16, paddingVertical: 10, fontFamily: FontFamily.body, fontSize: FontSize.base, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: Spacing['4xl'] },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm },

  typingRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  typingBubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.lg, borderBottomLeftRadius: 4 },
  typingDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, opacity: 0.5 },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
});
