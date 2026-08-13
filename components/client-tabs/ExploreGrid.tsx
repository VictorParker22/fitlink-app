import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function ExploreGrid() {
  const router = useRouter();

  const handlePress = (action: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    action();
  };

  return (
    <View style={s.gridContainer}>
      <Text style={s.tagHeader}>On-demand library</Text>
      <Text style={s.sectionTitle}>Content catalog</Text>

      <View style={s.gridRow}>
        {/* On-demand classes */}
        <TouchableOpacity
          style={s.gridCard}
          activeOpacity={0.85}
          onPress={() => handlePress(() => router.push(ClientRoute.exploreClasses))}
          accessibilityRole="button"
          accessibilityLabel="View on-demand classes"
        >
          <Image source={{ uri: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300' }} style={s.gridCardBg} cachePolicy="memory-disk" transition={200} />
          <View style={s.gridCardOverlay} />
          <View style={s.cardBadge}>
            <Ionicons name="play" size={10} color={CoachColors.accent} />
            <Text style={s.cardBadgeText}>Classes</Text>
          </View>
          <Text style={s.gridCardTitle}>On-demand</Text>
        </TouchableOpacity>

        {/* Collections */}
        <TouchableOpacity
          style={s.gridCard}
          activeOpacity={0.85}
          onPress={() => handlePress(() => router.push(ClientRoute.collections))}
          accessibilityRole="button"
          accessibilityLabel="View curated collections"
        >
          <Image source={{ uri: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?w=300' }} style={s.gridCardBg} cachePolicy="memory-disk" transition={200} />
          <View style={s.gridCardOverlay} />
          <View style={s.cardBadge}>
            <Ionicons name="layers" size={10} color={CoachColors.accent} />
            <Text style={s.cardBadgeText}>Series</Text>
          </View>
          <Text style={s.gridCardTitle}>Collections</Text>
        </TouchableOpacity>
      </View>

      <View style={s.gridRow}>
        {/* Programs */}
        <TouchableOpacity
          style={s.gridCard}
          activeOpacity={0.85}
          onPress={() => handlePress(() => router.push(ClientRoute.programs))}
          accessibilityRole="button"
          accessibilityLabel="View signature guided programs"
        >
          <Image source={{ uri: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=300' }} style={s.gridCardBg} cachePolicy="memory-disk" transition={200} />
          <View style={s.gridCardOverlay} />
          <View style={s.cardBadge}>
            <Ionicons name="trophy" size={10} color={CoachColors.accent} />
            <Text style={s.cardBadgeText}>Plans</Text>
          </View>
          <Text style={s.gridCardTitle}>Programs</Text>
        </TouchableOpacity>

        {/* Articles */}
        <TouchableOpacity
          style={s.gridCard}
          activeOpacity={0.85}
          onPress={() => handlePress(() => router.push(ClientRoute.articles))}
          accessibilityRole="button"
          accessibilityLabel="Read articles and insights"
        >
          <Image source={{ uri: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=300' }} style={s.gridCardBg} cachePolicy="memory-disk" transition={200} />
          <View style={s.gridCardOverlay} />
          <View style={s.cardBadge}>
            <Ionicons name="document-text" size={10} color={CoachColors.accent} />
            <Text style={s.cardBadgeText}>Reads</Text>
          </View>
          <Text style={s.gridCardTitle}>Articles</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  gridContainer: { paddingHorizontal: 16, gap: 12, marginBottom: 20 },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  gridRow: { flexDirection: 'row', gap: 12 },
  gridCard: {
    flex: 1,
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 14,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.surface,
  },
  gridCardBg: { ...StyleSheet.absoluteFillObject, opacity: 0.6 },
  gridCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.surface,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    marginBottom: 6,
  },
  cardBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  gridCardTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
  },
});
