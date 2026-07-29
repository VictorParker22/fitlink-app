import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
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

interface CoachDetailModalProps {
  coach: Coach | null;
  onRequestClose: () => void;
  onBookPress: () => void;
}

export default function CoachDetailModal({ coach, onRequestClose, onBookPress }: CoachDetailModalProps) {
  return (
    <Modal visible={!!coach} transparent animationType="slide" onRequestClose={onRequestClose}>
      <View style={s.modalBg}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={s.modalHeader}>
            <Text style={s.modalHeaderTitle}>Coach Bio</Text>
            <TouchableOpacity onPress={onRequestClose} style={s.modalCloseBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>
          {coach && (
            <ScrollView contentContainerStyle={s.modalScroll}>
              <Image source={{ uri: coach.avatar }} style={s.coachDetailAvatar} cachePolicy="memory-disk" transition={200} />
              <Text style={s.coachDetailName}>{coach.name}</Text>
              <Text style={s.coachDetailRole}>{coach.role}</Text>
              
              <View style={s.specialtyContainer}>
                <Text style={s.specialtyHeader}>SPECIALIZATION</Text>
                <Text style={s.specialtyText}>{coach.specialty}</Text>
              </View>

              <View style={s.specialtyContainer}>
                <Text style={s.specialtyHeader}>BIOGRAPHY</Text>
                <Text style={s.specialtyText}>{coach.bio}</Text>
              </View>

              <TouchableOpacity
                style={s.coachBookBtn}
                onPress={onBookPress}
                accessibilityRole="button"
                accessibilityLabel="Book private session"
              >
                <Ionicons name="calendar-outline" size={20} color="#000" />
                <Text style={s.coachBookBtnText}>Book Private Session</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalHeaderTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFFFFF' },
  modalCloseBtn: { padding: 4 },
  modalScroll: { padding: 20 },
  coachDetailAvatar: { width: 140, height: 140, borderRadius: 70, alignSelf: 'center', marginBottom: 20 },
  coachDetailName: { fontFamily: FontFamily.headingExtraBold, fontSize: 24, color: '#FFFFFF', textAlign: 'center', marginBottom: 4 },
  coachDetailRole: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, color: '#FF6B35', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 28 },
  specialtyContainer: { marginBottom: 24 },
  specialtyHeader: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, marginBottom: 8 },
  specialtyText: { fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.7)', lineHeight: 22 },
  coachBookBtn: { backgroundColor: '#FFFFFF', paddingVertical: 14, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: Spacing.xl },
  coachBookBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: '#000' },
});
