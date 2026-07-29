import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { FontFamily } from '../../constants/theme';
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
      <Text style={s.tagHeader}>CONTENT // ON-DEMAND LIBRARY</Text>
      <Text style={s.sectionTitle}>Content Catalog</Text>

      <View style={s.gridRow}>
        {/* On-Demand Classes */}
        <TouchableOpacity
          style={s.gridCard}
          activeOpacity={0.85}
          onPress={() => handlePress(() => router.push(ClientRoute.exploreClasses))}
          accessibilityRole="button"
          accessibilityLabel="View On-Demand Classes"
        >
          <Image source={{ uri: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300' }} style={s.gridCardBg} cachePolicy="memory-disk" transition={200} />
          <View style={s.gridCardOverlay} />
          <View style={s.cardBadge}>
            <Ionicons name="play" size={10} color="#4D94FF" />
            <Text style={s.cardBadgeText}>CLASSES</Text>
          </View>
          <Text style={s.gridCardTitle}>On-Demand</Text>
        </TouchableOpacity>
        
        {/* Collections */}
        <TouchableOpacity
          style={s.gridCard}
          activeOpacity={0.85}
          onPress={() => handlePress(() => router.push(ClientRoute.collections))}
          accessibilityRole="button"
          accessibilityLabel="View Curated Collections"
        >
          <Image source={{ uri: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?w=300' }} style={s.gridCardBg} cachePolicy="memory-disk" transition={200} />
          <View style={s.gridCardOverlay} />
          <View style={s.cardBadge}>
            <Ionicons name="layers" size={10} color="#22C55E" />
            <Text style={[s.cardBadgeText, { color: '#22C55E' }]}>SERIES</Text>
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
          accessibilityLabel="View Signature Guided Programs"
        >
          <Image source={{ uri: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=300' }} style={s.gridCardBg} cachePolicy="memory-disk" transition={200} />
          <View style={s.gridCardOverlay} />
          <View style={s.cardBadge}>
            <Ionicons name="trophy" size={10} color="#FFD700" />
            <Text style={[s.cardBadgeText, { color: '#FFD700' }]}>PLANS</Text>
          </View>
          <Text style={s.gridCardTitle}>Programs</Text>
        </TouchableOpacity>

        {/* Articles */}
        <TouchableOpacity
          style={s.gridCard}
          activeOpacity={0.85}
          onPress={() => handlePress(() => router.push(ClientRoute.articles))}
          accessibilityRole="button"
          accessibilityLabel="Read Articles & Insights"
        >
          <Image source={{ uri: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=300' }} style={s.gridCardBg} cachePolicy="memory-disk" transition={200} />
          <View style={s.gridCardOverlay} />
          <View style={s.cardBadge}>
            <Ionicons name="document-text" size={10} color="#A78BFA" />
            <Text style={[s.cardBadgeText, { color: '#A78BFA' }]}>READS</Text>
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  gridRow: { flexDirection: 'row', gap: 12 },
  gridCard: {
    flex: 1,
    height: 120,
    borderRadius: 14,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 14,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: '#0C0C0E',
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
    backgroundColor: '#0C0C0E',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#27272A',
    marginBottom: 6,
  },
  cardBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#4D94FF',
    letterSpacing: 1.2,
  },
  gridCardTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
});
