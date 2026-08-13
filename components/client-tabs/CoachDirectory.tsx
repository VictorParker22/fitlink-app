import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
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
      <Text style={s.tagHeader}>Your coaches</Text>
      <Text style={s.coachesTitle}>Personal coaching</Text>

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
                {/* §11 Colour accent top bar */}
                <View style={s.accentBar} />

                <View style={s.cardBody}>
                  {/* Avatar + name row — left aligned (§16 not centred) */}
                  <View style={s.avatarRow}>
                    <Image
                      source={{ uri: coach.avatar }}
                      style={s.coachAvatar}
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                    <View style={s.nameCol}>
                      <Text style={s.coachName} numberOfLines={1}>
                        {firstName}
                      </Text>
                      <Text style={s.coachRole} numberOfLines={1}>
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
                      <Ionicons name="chatbubble-outline" size={14} color={CoachColors.textPrimary} />
                      <Text style={s.msgBtnText}>Message</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={s.bookBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        onBookPress(coach);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Book session with ${coach.name}`}
                    >
                      <Ionicons name="calendar-outline" size={14} color={CoachColors.onAccent} />
                      <Text style={s.bookBtnText}>Book</Text>
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
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    paddingHorizontal: 16,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  coachesTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 14,
    letterSpacing: -0.5,
  },

  scrollContent: { paddingHorizontal: 20, gap: 12 },

  card: {
    width: 240,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    overflow: 'hidden',
  },

  accentBar: {
    height: 3,
    width: '100%',
    backgroundColor: CoachColors.accent,
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
    borderColor: CoachColors.border,
  },
  coachName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  coachRole: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.accent,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  specialty: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 12,
    color: CoachColors.textSecondary,
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
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  msgBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 11,
    color: CoachColors.textPrimary,
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
    backgroundColor: CoachColors.accent,
  },
  bookBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 11,
    color: CoachColors.onAccent,
    letterSpacing: 1,
  },

  // §8 Empty state
  emptyState: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyHero: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 13,
    color: CoachColors.textMuted,
  },
});
