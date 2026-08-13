import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = SCREEN_W - 32;
const CARD_H = 220;

// ─── COLLECTIONS DATA ────────────────────────────────────
const COLLECTIONS = [
  {
    id: 'built-for-her',
    title: 'Built for Her',
    image: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?w=600',
    classCount: 8,
    label: '8 classes & insights',
  },
  {
    id: 'power-endurance',
    title: 'Power &\nEndurance',
    image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600',
    classCount: 7,
    label: '7 classes & insights',
  },
  {
    id: 'trending-digital',
    title: 'Trending Digital\nClasses',
    image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600',
    classCount: 25,
    label: '25 classes',
    accent: CoachColors.surface,
    categories: [
      { name: 'Strength', color: CoachColors.textSecondary },
      { name: 'Meditation', color: CoachColors.textSecondary },
    ],
    moreCount: 8,
  },
  {
    id: 'marathon-ready',
    title: 'The Marathon\nReady Series',
    image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600',
    classCount: 6,
    label: '6 workouts',
  },
  {
    id: 'metabolic-reset',
    title: 'Metabolic\nConditioning',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600',
    classCount: 4,
    label: '4 workouts',
  },
  {
    id: 'recovery-mobility',
    title: 'Recovery &\nMobility',
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600',
    classCount: 5,
    label: '5 classes & insights',
  },
  {
    id: 'post-injury',
    title: 'Post-Injury\nReturn to Play',
    image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600',
    classCount: 5,
    label: '5 workouts',
  },
];

// ─── COMPONENT ───────────────────────────────────────────
export default function CollectionsScreen() {
  const router = useRouter();

  const handleCollectionPress = (collection: typeof COLLECTIONS[0]) => {
    // Navigate to explore-classes filtered for this collection
    router.push({
      pathname: ClientRoute.collectionDetail as any,
      params: { collectionId: collection.id },
    });
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={s.safeArea} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.push(ClientRoute.workouts)}
            style={s.backBtn}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={28} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Collections</Text>
          <View style={s.backBtn} />
        </View>

        {/* Cards */}
        <ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {COLLECTIONS.map((collection) => (
            <TouchableOpacity
              key={collection.id}
              style={s.card}
              activeOpacity={0.9}
              onPress={() => handleCollectionPress(collection)}
              accessibilityRole="button"
              accessibilityLabel={`View collection: ${collection.title.replace(/\n/g, ' ')}`}
            >
              {/* Background */}
              {collection.accent ? (
                <View style={[s.cardBg, { backgroundColor: collection.accent }]}>
                  <Image
                    source={{ uri: collection.image }}
                    style={s.cardAccentImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                    accessible={false}
                  />
                </View>
              ) : (
                <Image source={{ uri: collection.image }} style={s.cardBg} contentFit="cover" cachePolicy="memory-disk" transition={200} accessible={false} />
              )}
              <LinearGradient
                colors={collection.accent
                  ? ['transparent', 'transparent']
                  : ['rgba(0,0,0,0.45)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.55)']}
                style={StyleSheet.absoluteFill}
                accessible={false}
              />

              {/* Content */}
              <View style={s.cardContent}>
                <Text style={s.cardTitle}>{collection.title}</Text>

                {/* Categories (for trending card style) */}
                {collection.categories && (
                  <View style={s.categoryList}>
                    {collection.categories.map((cat) => (
                      <View key={cat.name} style={s.categoryRow}>
                        <View style={[s.categoryDot, { backgroundColor: cat.color }]} />
                        <Text style={s.categoryName}>{cat.name}</Text>
                      </View>
                    ))}
                    {collection.moreCount && (
                      <Text style={s.moreText}>+ {collection.moreCount} more</Text>
                    )}
                  </View>
                )}

                {/* Class count badge */}
                <Text style={s.cardLabel}>{collection.label}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Bottom spacing for tab bar */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 16,
  },

  // Card
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  cardBg: {
    ...StyleSheet.absoluteFillObject,
    width: CARD_W,
    height: CARD_H,
  },
  cardAccentImage: {
    position: 'absolute',
    right: -20,
    bottom: -20,
    width: CARD_W * 0.55,
    height: CARD_H * 0.85,
    opacity: 0.35,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 20,
  },
  cardTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
    lineHeight: 32,
  },
  cardLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    alignSelf: 'flex-end',
  },

  // Category dots (trending card)
  categoryList: {
    marginTop: -4,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  categoryName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    color: CoachColors.textPrimary,
  },
  moreText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    marginTop: 2,
  },
});
