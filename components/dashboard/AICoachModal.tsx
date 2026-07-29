import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { FontFamily } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

interface AICoachModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AICoachModal({ visible, onClose }: AICoachModalProps) {
  const { clients, activeClients, plans, sessions, getClientById } = useApp();
  
  const [coachPrompt, setCoachPrompt] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachResponse, setCoachResponse] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const handleClose = () => {
    setCoachResponse('');
    setCoachPrompt('');
    setSelectedClientId(null);
    onClose();
  };

  const handleCoachAsk = async () => {
    if (!coachPrompt.trim()) return;
    setCoachLoading(true);
    setCoachResponse('');
    try {
      // Build context
      const context: any = {
        activeClientCount: activeClients.length,
        trainerWorkouts: (plans || []).map((p: any) => p.name).slice(0, 10),
      };

      if (selectedClientId) {
        const client = getClientById(selectedClientId);
        if (client) {
          context.clientName = client.name;
          context.clientGoals = client.goals || 'Not specified';
          context.clientStatus = client.status;
          // Get recent sessions for this client
          const clientSessions = sessions
            .filter((s: any) => s.client_id === selectedClientId)
            .slice(0, 5)
            .map((s: any) => ({ date: s.date, type: s.type, status: s.status }));
          if (clientSessions.length > 0) context.recentSessions = clientSessions;
        }
      }

      const { data, error } = await supabase.functions.invoke('coach-assistant', {
        body: { prompt: coachPrompt.trim(), context }
      });

      if (error) throw new Error(error.message || 'AI Error');
      setCoachResponse(data?.response || 'No response received.');
    } catch (err: any) {
      setCoachResponse(`❌ Error: ${err.message || 'Failed to get response'}`);
    } finally {
      setCoachLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !coachLoading && handleClose()}>
      <View style={st.aiModalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={st.aiModalContent}>
            <View style={st.aiModalHandle} />

            {/* Header */}
            <View style={st.aiModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="sparkles" size={22} color="#FBBF24" />
                <Text style={st.aiModalTitle}>AI Coach</Text>
              </View>
              <TouchableOpacity onPress={handleClose}>
                <Ionicons name="close" size={22} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>

            {/* Client selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
              <TouchableOpacity
                style={[st.aiClientChip, !selectedClientId && st.aiClientChipActive]}
                onPress={() => setSelectedClientId(null)}
              >
                <Text style={[st.aiClientChipText, !selectedClientId && { color: '#000' }]}>General</Text>
              </TouchableOpacity>
              {clients.filter(c => c.status === 'active').slice(0, 8).map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[st.aiClientChip, selectedClientId === c.id && st.aiClientChipActive]}
                  onPress={() => setSelectedClientId(c.id)}
                >
                  <Text style={[st.aiClientChipText, selectedClientId === c.id && { color: '#000' }]} numberOfLines={1}>{c.name?.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Response area */}
            {(coachResponse || coachLoading) && (
              <ScrollView style={st.aiResponseArea} showsVerticalScrollIndicator={false}>
                {coachLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
                    <ActivityIndicator size="small" color="#FBBF24" />
                    <Text style={{ fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Thinking...</Text>
                  </View>
                ) : (
                  <Text style={st.aiResponseText}>{coachResponse}</Text>
                )}
              </ScrollView>
            )}

            {/* Quick prompts */}
            {!coachResponse && !coachLoading && (
              <View style={{ gap: 6, marginBottom: 12 }}>
                {[
                  selectedClientId ? `What should I program for ${getClientById(selectedClientId)?.name?.split(' ')[0] || 'this client'} next?` : 'How should I structure a push/pull/legs split?',
                  selectedClientId ? `Is ${getClientById(selectedClientId)?.name?.split(' ')[0] || 'this client'} on track with their goals?` : 'Give me a 4-week progressive overload plan',
                  'What are the best exercises for hypertrophy?',
                ].map(q => (
                  <TouchableOpacity key={q} style={st.aiQuickPrompt} onPress={() => setCoachPrompt(q)} activeOpacity={0.7}>
                    <Ionicons name="chatbubble-outline" size={14} color="rgba(255,255,255,0.2)" />
                    <Text style={st.aiQuickPromptText} numberOfLines={1}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Input */}
            <View style={st.aiInputRow}>
              <TextInput
                style={st.aiInput}
                placeholder={selectedClientId ? `Ask about ${getClientById(selectedClientId)?.name?.split(' ')[0] || 'client'}...` : 'Ask your AI coach...'}
                placeholderTextColor="rgba(255,255,255,0.15)"
                value={coachPrompt}
                onChangeText={setCoachPrompt}
                multiline
                editable={!coachLoading}
              />
              <TouchableOpacity
                style={[st.aiSendBtn, (!coachPrompt.trim() || coachLoading) && { opacity: 0.3 }]}
                onPress={() => { handleCoachAsk(); Keyboard.dismiss(); }}
                disabled={!coachPrompt.trim() || coachLoading}
              >
                <Ionicons name="send" size={18} color="#000" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  aiModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  aiModalContent: {
    backgroundColor: '#1C1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36, maxHeight: '85%',
  },
  aiModalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center', marginBottom: 16,
  },
  aiModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  aiModalTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 20, color: '#FFF' },
  aiClientChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginRight: 8,
  },
  aiClientChipActive: {
    backgroundColor: '#FBBF24', borderColor: '#FBBF24',
  },
  aiClientChipText: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  aiResponseArea: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14,
    padding: 16, marginBottom: 12, maxHeight: 280,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  aiResponseText: {
    fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 22,
  },
  aiQuickPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  aiQuickPromptText: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.3)', flex: 1 },
  aiInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  aiInput: {
    flex: 1, fontFamily: FontFamily.body, fontSize: 15, color: '#FFF',
    paddingVertical: 10, maxHeight: 80,
  },
  aiSendBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FBBF24',
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
});
