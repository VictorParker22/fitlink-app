import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { supabase } from '../../lib/supabase';
import { readClientGoalsText } from '../../lib/clientGoals';
import { hasAiConsent } from '../../lib/aiConsent';
import { layers } from '../../lib/layers';
import AiConsentSheet from '../solo/AiConsentSheet';

interface AICoachModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AICoachModal({ visible, onClose }: AICoachModalProps) {
  // A Modal inherits no safe area — the sheet supplies its own bottom clearance.
  const insets = useSafeAreaInsets();
  const { clients, activeClients, plans, sessions, getClientById } = useApp();
  const { user } = useAuth();

  const [coachPrompt, setCoachPrompt] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachResponse, setCoachResponse] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // AI consent (Apple 5.1.2(i)) — asked once, before the first call this
  // account ever makes to coach-assistant.
  const [consentVisible, setConsentVisible] = useState(false);
  const pendingAfterConsentRef = useRef<(() => void) | null>(null);
  const ensureConsent = useCallback((action: () => void) => {
    if (hasAiConsent(user)) { action(); return; }
    pendingAfterConsentRef.current = action;
    setConsentVisible(true);
  }, [user]);
  const handleConsentAgree = useCallback(() => {
    layers.track('ai_consent', { granted: true });
    setConsentVisible(false);
    const action = pendingAfterConsentRef.current;
    pendingAfterConsentRef.current = null;
    action?.();
  }, []);
  const handleConsentDecline = useCallback(() => {
    layers.track('ai_consent', { granted: false });
    setConsentVisible(false);
    pendingAfterConsentRef.current = null;
    setCoachResponse('The corner stays quiet until you agree.');
  }, []);

  const handleClose = () => {
    setCoachResponse('');
    setCoachPrompt('');
    setSelectedClientId(null);
    onClose();
  };

  const askCoach = async () => {
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
          // Read from assessment_data — `client.goals` has no column and always
          // came back undefined, so the assistant was told "Not specified" for
          // every athlete regardless of what they had actually recorded.
          context.clientGoals = readClientGoalsText(client) || 'Not specified';
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

  const handleCoachAsk = () => {
    if (!coachPrompt.trim()) return;
    ensureConsent(askCoach);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !coachLoading && handleClose()}>
      <View style={st.aiModalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[st.aiModalContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={st.aiModalHandle} />

            {/* Header */}
            <View style={st.aiModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="sparkles" size={25} color={CoachColors.accent} />
                <Text style={st.aiModalTitle}>AI coach</Text>
              </View>
              <TouchableOpacity hitSlop={12} onPress={handleClose}>
                <Ionicons name="close" size={25} color={CoachColors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Client selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 12 }}>
              <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
                style={[st.aiClientChip, !selectedClientId && st.aiClientChipActive]}
                onPress={() => setSelectedClientId(null)}
              >
                <Text style={[st.aiClientChipText, !selectedClientId && { color: CoachColors.onAccent }]}>General</Text>
              </TouchableOpacity>
              {clients.filter(c => c.status === 'active').slice(0, 8).map(c => (
                <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
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
              <ScrollView keyboardShouldPersistTaps="handled" style={st.aiResponseArea} showsVerticalScrollIndicator={false}>
                {coachLoading ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 12 }}>
                    <ActivityIndicator size="small" color={CoachColors.accent} />
                    <Text style={{ fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted }}>Thinking...</Text>
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
                  <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} key={q} style={st.aiQuickPrompt} onPress={() => setCoachPrompt(q)} activeOpacity={0.7}>
                    <Ionicons name="chatbubble-outline" size={16} color={CoachColors.textFaint} />
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
              <TouchableOpacity hitSlop={4}
                style={[st.aiSendBtn, (!coachPrompt.trim() || coachLoading) && { opacity: 0.3 }]}
                onPress={() => { handleCoachAsk(); Keyboard.dismiss(); }}
                disabled={!coachPrompt.trim() || coachLoading}
              >
                <Ionicons name="send" size={20} color={CoachColors.onAccent} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      <AiConsentSheet
        visible={consentVisible}
        onAgree={handleConsentAgree}
        onDecline={handleConsentDecline}
      />
    </Modal>
  );
}

const st = StyleSheet.create({
  aiModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  aiModalContent: {
    backgroundColor: CoachColors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '85%', // paddingBottom applied inline from the real bottom inset (Modal).
  },
  aiModalHandle: {
    width: 36, height: 4, borderRadius: 2, borderCurve: 'continuous', backgroundColor: CoachColors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  aiModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  aiModalTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 22.5, color: CoachColors.textPrimary },
  aiClientChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderCurve: 'continuous',
    backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    marginRight: 8,
  },
  aiClientChipActive: {
    backgroundColor: CoachColors.accent, borderColor: CoachColors.accent,
  },
  aiClientChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13.5, color: CoachColors.textSecondary },
  aiResponseArea: {
    backgroundColor: CoachColors.bg, borderRadius: 14, borderCurve: 'continuous',
    padding: 16, marginBottom: 12, maxHeight: 280,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  aiResponseText: {
    fontFamily: CoachFonts.body, fontSize: 15.5, color: CoachColors.textPrimary, lineHeight: 24.5,
  },
  aiQuickPrompt: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  aiQuickPromptText: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, flex: 1 },
  aiInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: CoachColors.bg, borderRadius: 16, borderCurve: 'continuous',
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  aiInput: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 17, color: CoachColors.textPrimary,
    paddingVertical: 12, maxHeight: 80,
  },
  aiSendBtn: {
    width: 36, height: 36, borderRadius: 18, borderCurve: 'continuous', backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
});
