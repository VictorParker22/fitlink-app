import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

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
      <SafeAreaView style={styles.container} edges={['top']}>
        <Text style={styles.title}>Messages</Text>
        <View style={styles.emptyState}>
          <Ionicons name="chatbubble-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No conversation yet</Text>
          <Text style={styles.emptyText}>Your trainer will start a conversation with you</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Avatar name={trainer?.name || 'Coach'} size="sm" imageUrl={trainer?.avatar_url} />
        <View>
          <Text style={styles.headerName}>Coach {trainer?.name?.split(' ')[0] || 'Trainer'}</Text>
          <Text style={styles.headerSub}>Your Trainer</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <View style={styles.emptyState}><ActivityIndicator size="large" color={Colors.accent} /></View>
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
                  <View style={[styles.bubble, isMine ? styles.bubbleSent : styles.bubbleReceived]}>
                    <Text style={[styles.bubbleText, isMine ? styles.bubbleTextSent : styles.bubbleTextReceived]}>{msg.content}</Text>
                    <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeSent : styles.bubbleTimeReceived]}>{formatTime(msg.created_at)}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyText}>Say hi to your trainer! 👋</Text></View>}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput style={styles.input} placeholder="Type a message..." placeholderTextColor={Colors.textTertiary} value={newMessage} onChangeText={setNewMessage} multiline maxLength={2000} />
          <TouchableOpacity style={[styles.sendBtn, newMessage.trim() && styles.sendBtnActive]} onPress={handleSend} disabled={!newMessage.trim() || sending}>
            <Ionicons name="send" size={18} color={newMessage.trim() ? Colors.white : Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: Colors.textPrimary, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.bgSecondary },
  headerName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  headerSub: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: Colors.textTertiary },

  messageList: { padding: Spacing.lg, paddingBottom: Spacing.sm, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.lg },
  bubbleSent: { backgroundColor: Colors.accent, borderBottomRightRadius: 4 },
  bubbleReceived: { backgroundColor: Colors.bgElevated, borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: FontFamily.body, fontSize: FontSize.base, lineHeight: 20 },
  bubbleTextSent: { color: Colors.white },
  bubbleTextReceived: { color: Colors.textPrimary },
  bubbleTime: { fontFamily: FontFamily.body, fontSize: 9, marginTop: 4 },
  bubbleTimeSent: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  bubbleTimeReceived: { color: Colors.textTertiary },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bgSecondary },
  input: { flex: 1, backgroundColor: Colors.bgInput, borderWidth: 1, borderColor: Colors.borderStrong, borderRadius: Radius.xl, paddingHorizontal: 16, paddingVertical: 10, fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textPrimary, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: Colors.accent },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: Spacing['4xl'] },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: Colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
