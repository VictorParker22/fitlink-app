import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { FontFamily } from '../../constants/theme';
import { ClientRoute } from '../../types/routes';

interface Coach {
  id: string;
  name: string;
  role: string;
  avatar: string;
  specialty: string;
  bio: string;
}

interface CoachDirectoryProps {
  searchQuery: string;
  allCoaches: Coach[];
  onCoachPress: (coach: Coach) => void;
  onBookPress: (coach: Coach) => void;
}

export default function CoachDirectory({ searchQuery, allCoaches, onCoachPress, onBookPress }: CoachDirectoryProps) {
  const router = useRouter();

  const filteredCoaches = allCoaches.filter(c =>
    (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.specialty || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={s.coachesSection}>
      <Text style={s.tagHeader}>COACHING ROSTER // ELITE TRAINERS</Text>
      <Text style={s.coachesTitle}>Personal Coaching</Text>
      {filteredCoaches.length === 0 ? (
        <Text style={s.noResultsText}>No coaches matching your search</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.coachScroll}
        >
          {filteredCoaches.map(coach => (
            <TouchableOpacity
              key={coach.id}
              style={s.coachCard}
              activeOpacity={0.9}
              onPress={() => onCoachPress(coach)}
              accessibilityRole="button"
              accessibilityLabel={`View coach profile: ${coach.name}`}
            >
              <Image source={{ uri: coach.avatar }} style={s.coachAvatar} cachePolicy="memory-disk" transition={200} />
              <Text style={s.coachName} numberOfLines={1}>{coach.name}</Text>
              <Text style={s.coachRole} numberOfLines={1}>{coach.role}</Text>
              <Text style={s.coachSpecialty} numberOfLines={2}>{coach.specialty}</Text>

              <View style={s.coachActions}>
                <TouchableOpacity
                  style={s.coachActionBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(ClientRoute.myMessages);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${coach.name}`}
                >
                  <Ionicons name="chatbubble-outline" size={13} color="#FFF" />
                  <Text style={s.coachActionText}>MESSAGE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.coachActionBtn, s.bookBtn]}
                  onPress={() => onBookPress(coach)}
                  accessibilityRole="button"
                  accessibilityLabel={`Book session with ${coach.name}`}
                >
                  <Ionicons name="calendar-outline" size={13} color="#000" />
                  <Text style={[s.coachActionText, { color: '#000' }]}>BOOK</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  coachesSection: { marginBottom: 24 },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  coachesTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  noResultsText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  coachScroll: { paddingHorizontal: 16, gap: 12 },
  coachCard: {
    width: 220,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
  },
  coachAvatar: {
    width: 72,
    height: 72,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  coachName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  coachRole: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#4D94FF',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  coachSpecialty: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    height: 32,
    marginBottom: 14,
    lineHeight: 15,
  },
  coachActions: { flexDirection: 'row', gap: 8, width: '100%' },
  coachActionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  bookBtn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  coachActionText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#FFF',
    letterSpacing: 0.8,
  },
});
