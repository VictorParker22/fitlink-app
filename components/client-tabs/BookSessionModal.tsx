import React, { useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontFamily, Radius, Spacing } from '../../constants/theme';

interface Coach {
  id: string;
  name: string;
  role: string;
  avatar: string;
  specialty: string;
  bio: string;
}

interface BookSessionModalProps {
  visible: boolean;
  coach: Coach | null;
  onRequestClose: () => void;
  accentColor: string;
}

export default function BookSessionModal({ visible, coach, onRequestClose, accentColor }: BookSessionModalProps) {
  const [selectedDuration, setSelectedDuration] = useState('60 MIN');
  const [notes, setNotes] = useState('');

  if (!coach) return null;

  const handleSubmit = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Request Sent", 
      `Your booking request for ${coach.name} has been received. They will message you shortly to confirm.`
    );
    setNotes('');
    onRequestClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={s.modalBg}>
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            <View style={s.modalHeader}>
              <Text style={s.modalHeaderTitle}>Schedule Session</Text>
              <TouchableOpacity onPress={onRequestClose} style={s.modalCloseBtn}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={s.bookingCard}>
                <Image source={{ uri: coach.avatar }} style={s.bookingAvatar} cachePolicy="memory-disk" transition={200} />
                <View>
                  <Text style={s.bookingCoachName}>{coach.name}</Text>
                  <Text style={[s.bookingCoachRole, { color: accentColor }]}>{coach.role}</Text>
                </View>
              </View>

              <Text style={s.bookingLabel}>CHOOSE DURATION</Text>
              <View style={s.durationRow}>
                {['30 MIN', '45 MIN', '60 MIN'].map(dur => (
                  <TouchableOpacity 
                    key={dur} 
                    style={[s.durationPill, dur === selectedDuration && { backgroundColor: accentColor }]}
                    onPress={() => setSelectedDuration(dur)}
                  >
                    <Text style={[s.durationText, dur === selectedDuration && s.durationTextActive]}>{dur}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.bookingLabel}>ADDITIONAL NOTES FOR COACH</Text>
              <TextInput
                style={s.bookingInput}
                placeholder="Specify your goals, fitness focus, or schedule requests..."
                placeholderTextColor="rgba(255,255,255,0.2)"
                multiline
                numberOfLines={4}
                value={notes}
                onChangeText={setNotes}
              />

              <TouchableOpacity
                style={[s.bookingSubmitBtn, { backgroundColor: accentColor }]}
                onPress={handleSubmit}
                accessibilityRole="button"
                accessibilityLabel="Submit booking request"
              >
                <Text style={s.bookingSubmitText}>Submit Request</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalHeaderTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFFFFF' },
  modalCloseBtn: { padding: 4 },
  modalScroll: { padding: 20 },
  bookingCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.xl },
  bookingAvatar: { width: 50, height: 50, borderRadius: 25 },
  bookingCoachName: { fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: '#FFFFFF' },
  bookingCoachRole: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  bookingLabel: { fontFamily: FontFamily.headingSemiBold, fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginBottom: Spacing.md },
  durationRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.xl },
  durationPill: { flex: 1, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  durationText: { fontFamily: FontFamily.bodyBold, fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  durationTextActive: { color: '#FFFFFF' },
  bookingInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Radius.lg, color: '#FFFFFF', fontFamily: FontFamily.body, fontSize: 15, padding: Spacing.md, minHeight: 100, textAlignVertical: 'top', marginBottom: Spacing.xl },
  bookingSubmitBtn: { paddingVertical: 16, borderRadius: Radius.lg, alignItems: 'center' },
  bookingSubmitText: { fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: '#FFFFFF' },
});
