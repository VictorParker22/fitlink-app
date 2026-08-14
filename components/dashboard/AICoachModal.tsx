import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
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
      setCoachResponse(`Error: ${err.message || 'Failed to get response'}`);
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
                <Ionicons name="sparkles" size={22} color={CoachColors.accent} />
                <Text style={st.aiModalTitle}>AI coach</Text>
              </View>
              <TouchableOpacity onPress={handleClose}>
                <Ionicons name="close" size={22} color={CoachColors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Client selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
              <TouchableOpacity
                style={[st.aiClientChip, !selectedClientId && st.aiClientChipActive]}
                onPress={() => setSelectedClientId(null)}
              >
                <Text style={[st.aiClientChipText, !selectedClientId && { color: CoachColors.onAccent }]}>General</Text>
              </TouchableOpacity>
              {clients.filter(c => c.status === 'active').slice(0, 8).map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[st.aiClientChip, selectedClientId === c.id && st.aiClientChipActive]}
                  onPress={() => setSelectedClientId(c.id)}
                >
                  <Text style={[st.aiClientChipText, selectedClientId === c.id && { color: CoachColors.onAccent }]} numberOfLines={1}>{c.name?.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Response area */}
            {(coachResponse || coachLoading) && (
              <ScrollView style={st.aiResponseArea} showsVerticalScrollIndicator={false}>
                {coachLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
                    <ActivityIndicator size="small" color={CoachColors.accent} />
                    <Text style={{ fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted }}>Thinking...</Text>
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
                    <Ionicons name="chatbubble-outline" size={14} color={CoachColors.textFaint} />
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
                placeholderTextColor={CoachColors.textFaint}
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
                <Ionicons name="send" size={18} color={CoachColors.onAccent} />
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
    backgroundColor: CoachColors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 36, maxHeight: '85%',
  },
  aiModalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: CoachColors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  aiModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  aiModalTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 20, color: CoachColors.textPrimary },
  aiClientChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    marginRight: 8,
  },
  aiClientChipActive: {
    backgroundColor: CoachColors.accent, borderColor: CoachColors.accent,
  },
  aiClientChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textSecondary },
  aiResponseArea: {
    backgroundColor: CoachColors.bg, borderRadius: 14,
    padding: 16, marginBottom: 12, maxHeight: 280,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  aiResponseText: {
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textPrimary, lineHeight: 22,
  },
  aiQuickPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
    backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  aiQuickPromptText: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, flex: 1 },
  aiInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: CoachColors.bg, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  aiInput: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textPrimary,
    paddingVertical: 10, maxHeight: 80,
  },
  aiSendBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
});
