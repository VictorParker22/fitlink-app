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

// Deterministic accent colour per coach — based on name hash
function getCoachAccent(name: string): string {
  const ACCENTS = ['#5B7FFF', '#22C55E', '#A855F7', '#FF6B35', '#FFD700', '#F43F5E'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

export default function CoachDirectory({
  searchQuery,
  allCoaches,
  onCoachPress,
  onBookPress,
}: CoachDirectoryProps) {
  const router = useRouter();

  const filteredCoaches = allCoaches.filter(
    (c) =>
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.specialty || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={s.section}>
      {/* §1 Micro → hero — left aligned, not centred */}
      <Text style={s.tagHeader}>YOUR COACHES</Text>
      <Text style={s.coachesTitle}>Personal Coaching</Text>

      {filteredCoaches.length === 0 ? (
        // §8 Opinionated empty copy
        <View style={s.emptyState}>
          <Text style={s.emptyHero}>No matches.</Text>
          <Text style={s.emptySub}>Try a different search term.</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
          snapToInterval={240 + 12}
          decelerationRate="fast"
        >
          {filteredCoaches.map((coach) => {
            const accent = getCoachAccent(coach.name);
            const firstName = (coach.name || 'Coach').split(' ')[0];

            return (
              <TouchableOpacity
                key={coach.id}
                style={s.card}
                activeOpacity={0.88}
                onPress={() => onCoachPress(coach)}
                accessibilityRole="button"
                accessibilityLabel={`View coach profile: ${coach.name}`}
              >
                {/* §11 Colour accent top bar — unique per coach */}
                <View style={[s.accentBar, { backgroundColor: accent }]} />

                <View style={s.cardBody}>
                  {/* Avatar + name row — left aligned (§16 not centred) */}
                  <View style={s.avatarRow}>
                    <Image
                      source={{ uri: coach.avatar }}
                      style={[s.coachAvatar, { borderColor: accent }]}
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                    <View style={s.nameCol}>
                      <Text style={s.coachName} numberOfLines={1}>
                        {firstName.toUpperCase()}
                      </Text>
                      <Text style={[s.coachRole, { color: accent }]} numberOfLines={1}>
                        {coach.role}
                      </Text>
                    </View>
                  </View>

                  {/* §7 Specialty — the actual signal, editorial copy */}
                  <Text style={s.specialty} numberOfLines={2}>
                    {coach.specialty || 'Strength & Conditioning'}
                  </Text>

                  {/* Action row — §14 44pt buttons */}
                  <View style={s.actions}>
                    <TouchableOpacity
                      style={s.coachActionBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(ClientRoute.myMessages);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Message ${coach.name}`}
                    >
                      <Ionicons name="chatbubble-outline" size={14} color="#FFFFFF" />
                      <Text style={s.msgBtnText}>MSG</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[s.bookBtn, { backgroundColor: accent }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        onBookPress(coach);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Book session with ${coach.name}`}
                    >
                      <Ionicons name="calendar-outline" size={14} color="#000" />
                      <Text style={s.bookBtnText}>BOOK</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: 28 },

  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    paddingHorizontal: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  coachesTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    marginBottom: 14,
    letterSpacing: -0.5,
  },

  scrollContent: { paddingHorizontal: 20, gap: 12 },

  card: {
    width: 240,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 16,
    overflow: 'hidden',
  },

  accentBar: {
    height: 3,
    width: '100%',
  },

  cardBody: {
    padding: 16,
  },

  // Left-aligned avatar + name row
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  nameCol: {
    flex: 1,
    gap: 3,
  },

  coachAvatar: {
    width: 72,
    height: 72,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  coachName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  coachRole: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  specialty: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 17,
    marginBottom: 12,
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  coachActionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  msgBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  bookBtn: {
    height: 44,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    // backgroundColor set inline per accent
  },
  bookBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#000000',
    letterSpacing: 1,
  },

  // §8 Empty state
  emptyState: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyHero: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
});
