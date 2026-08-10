import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, StatusBar, Image as RNImage
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useTypingIndicator } from '../../hooks/useTypingIndicator';
import Avatar from '../../components/Avatar';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { getWorkoutEmblem } from '../../utils/workoutEmblems';

interface Message {
  id: string;
  conversation_id: string;
  sender_type: 'trainer' | 'client';
  content: string;
  created_at: string;
  attachment_url?: string;
  attachment_type?: string;
  read?: boolean;
}

interface ConversationDetail {
  id: string;
  trainer_id: string;
  client_id: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
  clients: { name: string; avatar_url?: string; expo_push_token?: string | null };
}

const Theme = {
  bg: '#0D0D12',
  bgSecondary: '#16161D',
  bgInput: '#1A1A24',
  border: '#2A2A35',
  accent: '#C8F135',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0AB',
  textTertiary: '#71717A',
  bubbleClient: 'rgba(255,255,255,0.07)',
};

export default function CoachChatScreen() {
  const router = useRouter();
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  
  const { isTyping, startTyping } = useTypingIndicator(conversationId, 'trainer', !!conversationId);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (!conversationId) return;

    async function loadData() {
      // 1. Fetch conversation details
      const { data: convData } = await supabase
        .from('conversations')
        .select('*, clients(name, avatar_url, expo_push_token)')
        .eq('id', conversationId)
        .single();
      
      if (convData) {
        setConversation(convData as any); // using any for clients array unnesting
      }

      // 2. Fetch messages
      const { data: msgs } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      
      if (msgs) {
        setMessages(msgs);
      }
      setLoading(false);

      // 3. Mark client messages as read
      await supabase
        .from('messages')
        .update({ read: true })
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'client')
        .eq('read', false);
    }
    loadData();
  }, [conversationId]);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`coach-msgs:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const content = newMessage.trim();
    if (!content || sending || !conversationId) return;
    
    setSending(true);
    setNewMessage('');
    
    try {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_type: 'trainer',
        content,
      });
      
      await supabase
        .from('conversations')
        .update({ last_message: content, last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
      
      // Send push notification to client
      const pushToken = Array.isArray(conversation?.clients) ? conversation?.clients[0]?.expo_push_token : (conversation?.clients as any)?.expo_push_token;
      
      if (pushToken) {
        const pushBody = content.startsWith('[WORKOUT_CARD:') ? 'Coach sent an attachment' : content;
        supabase.functions.invoke('send-push-notification', {
          body: {
            pushToken,
            title: 'Message from Coach',
            body: pushBody,
            data: { url: '/my-messages' }
          }
        }).catch((err) => console.log('Push error:', err));
      }
    } catch {
      setNewMessage(content);
    } finally {
      setSending(false);
    }
  }, [newMessage, sending, conversationId, conversation]);

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

        const pushToken = Array.isArray(conversation?.clients) ? conversation?.clients[0]?.expo_push_token : (conversation?.clients as any)?.expo_push_token;
        if (pushToken) {
          supabase.functions.invoke('send-push-notification', {
            body: {
              pushToken,
              title: 'Message from Coach',
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

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const renderMessageContent = (msg: Message, isMine: boolean) => {
    const { content } = msg;

    if (content === '[IMAGE]' && msg.attachment_url) {
      return (
        <RNImage 
          source={{ uri: msg.attachment_url }} 
          style={{ width: 220, height: 300, borderRadius: Radius.sm, backgroundColor: isMine ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)' }} 
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
              <Text style={{ fontFamily: FontFamily.heading, fontSize: 9, color: isMine ? '#000000' : Theme.textSecondary, letterSpacing: 0.8 }}>WORKOUT ATTACHMENT</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 2 }}>
            <RNImage source={emblem} style={{ width: 42, height: 42, borderRadius: Radius.xs }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FontFamily.bodyBold, fontSize: FontSize.sm, color: isMine ? '#000000' : '#FFFFFF' }} numberOfLines={1}>{wName}</Text>
              <Text style={{ fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: isMine ? 'rgba(0,0,0,0.6)' : Theme.textTertiary }}>{count} Exercises</Text>
            </View>
          </View>
          <View style={{
            backgroundColor: isMine ? '#000000' : '#FFFFFF',
            paddingVertical: 8, paddingHorizontal: 12,
            borderRadius: Radius.xs, alignItems: 'center', marginTop: 4
          }}>
            <Text style={{ fontFamily: FontFamily.heading, fontSize: 11, color: isMine ? '#FFFFFF' : '#000000', letterSpacing: 0.5 }}>CLIENT VIEW ONLY</Text>
          </View>
        </View>
      );
    }

    if (content.startsWith('[QUICK_NOTE:')) {
      const text = content.replace('[QUICK_NOTE:', '').replace(/\]$/, '');
      return (
        <View style={{ minWidth: 180, gap: 4 }}>
          <Text style={{ fontFamily: FontFamily.heading, fontSize: 9, color: isMine ? '#00000099' : Theme.textTertiary, letterSpacing: 0.8 }}>COACH DIRECT TIP</Text>
          <Text style={{ fontFamily: FontFamily.bodyBold, fontSize: FontSize.sm, color: isMine ? '#000000' : Theme.textPrimary, lineHeight: 20 }}>{text}</Text>
        </View>
      );
    }

    return (
      <Text style={[styles.bubbleText, isMine ? styles.bubbleTextSent : { color: Theme.textPrimary }]}>
        {content}
      </Text>
    );
  };

  const clientName = Array.isArray(conversation?.clients) ? conversation?.clients[0]?.name : (conversation?.clients as any)?.name;
  const clientAvatar = Array.isArray(conversation?.clients) ? conversation?.clients[0]?.avatar_url : (conversation?.clients as any)?.avatar_url;

  return (
    <View style={[styles.container, { backgroundColor: Theme.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: Theme.border, backgroundColor: Theme.bgSecondary }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.6}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <Avatar name={clientName || 'Client'} size="sm" imageUrl={clientAvatar} />
        <View>
          <Text style={[styles.headerName, { color: Theme.textPrimary }]}>{clientName || 'Client'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Theme.accent }} />
            <Text style={[styles.headerSub, { color: Theme.textTertiary }]}>Online</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : (StatusBar.currentHeight || 24)}>
        {loading ? (
          <View style={styles.emptyState}><ActivityIndicator size="large" color={Theme.accent} /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: msg }) => {
              const isMine = msg.sender_type === 'trainer';
              return (
                <View style={[styles.bubbleRow, isMine && styles.bubbleRowRight]}>
                  <View style={[
                    styles.bubble,
                    msg.content === '[IMAGE]' ? { backgroundColor: 'transparent', padding: 0 } : isMine ? [styles.bubbleSent, { backgroundColor: Theme.accent }] : [styles.bubbleReceived, { backgroundColor: Theme.bubbleClient }]
                  ]}>
                    {renderMessageContent(msg, isMine)}
                    <Text style={[styles.bubbleTime, isMine ? styles.bubbleTimeSent : { color: Theme.textTertiary }]}>{formatTime(msg.created_at)}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<View style={styles.emptyState}><Text style={[styles.emptyText, { color: Theme.textTertiary }]}>No messages yet</Text></View>}
            ListFooterComponent={
              isTyping ? (
                <View style={styles.typingRow}>
                  <View style={[styles.typingBubble, { backgroundColor: Theme.bubbleClient }]}>
                    <View style={styles.typingDots}>
                      <View style={[styles.dot, styles.dot1, { backgroundColor: Theme.textTertiary }]} />
                      <View style={[styles.dot, styles.dot2, { backgroundColor: Theme.textTertiary }]} />
                      <View style={[styles.dot, styles.dot3, { backgroundColor: Theme.textTertiary }]} />
                    </View>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        <View style={[styles.inputBar, { borderTopColor: Theme.border, backgroundColor: Theme.bgSecondary }]}>
          <TouchableOpacity onPress={handleImagePick} style={{ padding: Spacing.sm }} activeOpacity={0.7}>
            <Ionicons name="image-outline" size={24} color={Theme.textTertiary} />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { backgroundColor: Theme.bgInput, borderColor: Theme.border, color: Theme.textPrimary }]}
            placeholder="Message client..."
            placeholderTextColor={Theme.textTertiary}
            value={newMessage}
            onChangeText={(text) => { setNewMessage(text); startTyping(); }}
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity style={[styles.sendBtn, { backgroundColor: newMessage.trim() ? Theme.accent : Theme.bgInput }]} onPress={handleSend} disabled={!newMessage.trim() || sending}>
            <Ionicons name="send" size={18} color={newMessage.trim() ? '#000000' : Theme.textTertiary} />
          </TouchableOpacity>
        </View>
        {!isKeyboardVisible && <View style={{ height: Platform.OS === 'ios' ? 88 : (72 + insets.bottom), backgroundColor: Theme.bgSecondary }} />}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  bubbleTextSent: { color: '#000000' },
  bubbleTime: { fontFamily: FontFamily.body, fontSize: 9, marginTop: 4 },
  bubbleTimeSent: { color: 'rgba(0,0,0,0.5)', textAlign: 'right' as const },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderTopWidth: 1 },
  input: { flex: 1, borderWidth: 1, borderRadius: Radius.xl, paddingHorizontal: 16, paddingVertical: 10, fontFamily: FontFamily.body, fontSize: FontSize.base, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingTop: Spacing['4xl'] },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm },

  typingRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  typingBubble: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radius.lg, borderBottomLeftRadius: 4 },
  typingDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, opacity: 0.5 },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
});
