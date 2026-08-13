import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, StatusBar, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { CATEGORY_COLORS } from '../../data/categoryColors';
import { CollectionClass, COLLECTIONS_DATA } from '../../data/collections';

const SCREEN_W = Dimensions.get('window').width;
const COVER_SIZE = SCREEN_W * 0.55;



// ─── COMPONENT ───────────────────────────────────────────
export default function CollectionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ collectionId: string }>();
  const [isFavorite, setIsFavorite] = useState(false);

  const collection = COLLECTIONS_DATA[params.collectionId || 'trending-digital'];
  if (!collection) return null;

  const handleClassPress = (cls: CollectionClass) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: ClientRoute.classDetail as any,
      params: {
        id: cls.id,
        title: cls.title,
        category: cls.category,
        level: cls.level,
        instructor: cls.instructor,
        durationMin: cls.durationMin,
        thumbnail: cls.thumbnail,
        tags: `${cls.category},On-Demand`,
      },
    });
  };

  // Split categories into two columns
  const leftCats = collection.categories.filter((_, i) => i % 2 === 0);
  const rightCats = collection.categories.filter((_, i) => i % 2 === 1);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={s.safeArea} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.push(ClientRoute.collections)}
            style={s.headerBtn}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={28} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={s.headerRight}>
            <TouchableOpacity
              style={s.headerBtn}
              activeOpacity={0.6}
              onPress={() => { setIsFavorite(!isFavorite); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={22} color={isFavorite ? CoachColors.accent : CoachColors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.headerBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Share collection">
              <Ionicons name="share-outline" size={22} color={CoachColors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Cover image */}
          <View style={s.coverWrap}>
            <View style={[s.coverCard, collection.coverAccent ? { backgroundColor: collection.coverAccent } : {}]}>
              <Image source={{ uri: collection.coverImage }} style={s.coverImage} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`Cover image for ${collection.title.replace(/\n/g, ' ')} collection`} />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)']}
                style={s.coverGradient}
              />
            </View>
          </View>

          {/* Collection label */}
          <Text style={s.collectionLabel}>COLLECTION</Text>

          {/* Title */}
          <Text style={s.title} accessibilityRole="header">{collection.title}</Text>

          {/* Description */}
          <Text style={s.description}>{collection.description}</Text>

          {/* Category grid */}
          <View style={s.categoryGrid}>
            <View style={s.categoryCol}>
              {leftCats.map(cat => (
                <View key={cat} style={s.categoryRow}>
                  <View style={[s.categoryDot, { backgroundColor: CATEGORY_COLORS[cat] || CoachColors.textSecondary }]} />
                  <Text style={s.categoryName}>{cat}</Text>
                </View>
              ))}
            </View>
            <View style={s.categoryCol}>
              {rightCats.map(cat => (
                <View key={cat} style={s.categoryRow}>
                  <View style={[s.categoryDot, { backgroundColor: CATEGORY_COLORS[cat] || CoachColors.textSecondary }]} />
                  <Text style={s.categoryName}>{cat}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Classes section */}
          <View style={s.classesHeader}>
            <Text style={s.classesTitle}>Classes</Text>
            <Text style={s.classesCount}>{collection.classes.length}</Text>
          </View>

          {/* Class list */}
          {collection.classes.map((cls) => (
            <TouchableOpacity
              key={cls.id}
              style={s.classCard}
              activeOpacity={0.85}
              onPress={() => handleClassPress(cls)}
              accessibilityRole="button"
              accessibilityLabel={`View class: ${cls.title}`}
            >
              <View style={s.classThumbWrap}>
                <Image source={{ uri: cls.thumbnail }} style={s.classThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                <View style={s.classDuration}>
                  <Text style={s.classDurationText}>{cls.durationMin}:00</Text>
                </View>
              </View>
              <View style={s.classMeta}>
                <Text style={s.classType}>On-demand</Text>
                <Text style={s.className} numberOfLines={2}>{cls.title}</Text>
                <Text style={s.classInfo}>
                  <Text style={{ color: CATEGORY_COLORS[cls.category] || CoachColors.textSecondary }}>{cls.category}</Text>
                  {'  •  '}{cls.level}
                </Text>
                <Text style={s.classInstructor}>{cls.instructor}  •  {cls.studio}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {/* Bottom spacing */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  safeArea: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  headerBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  headerRight: { flexDirection: 'row', gap: 4 },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  // Cover
  coverWrap: { alignItems: 'center', marginTop: 16, marginBottom: 24 },
  coverCard: {
    width: COVER_SIZE, height: COVER_SIZE, borderRadius: 12,
    overflow: 'hidden', backgroundColor: CoachColors.surface,
  },
  coverImage: { width: '100%', height: '100%' },
  coverGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: COVER_SIZE * 0.4,
  },

  // Text
  collectionLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textMuted,
    letterSpacing: 2, marginBottom: 8,
  },
  title: {
    fontFamily: CoachFonts.headingBold, fontSize: 34, color: CoachColors.textPrimary,
    lineHeight: 40, marginBottom: 20,
  },
  description: {
    fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textSecondary,
    lineHeight: 22, marginBottom: 24,
  },

  // Category grid
  categoryGrid: {
    flexDirection: 'row', gap: 40, marginBottom: 40,
  },
  categoryCol: { gap: 10 },
  categoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryName: {
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textPrimary,
  },

  // Classes section header
  classesHeader: {
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
    marginBottom: 20, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: CoachColors.borderMuted,
  },
  classesTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 22, color: CoachColors.textPrimary,
    paddingTop: 16,
  },
  classesCount: {
    fontFamily: CoachFonts.body, fontSize: 17, color: CoachColors.textMuted,
    paddingTop: 16,
  },

  // Class card
  classCard: {
    flexDirection: 'row', marginBottom: 20, gap: 14,
  },
  classThumbWrap: {
    width: 100, height: 72, borderRadius: 6, overflow: 'hidden',
    backgroundColor: CoachColors.surface,
  },
  classThumb: { width: '100%', height: '100%' },
  classDuration: {
    position: 'absolute', bottom: 4, left: 5,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 3,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  classDurationText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 10, color: CoachColors.textPrimary,
  },
  classMeta: { flex: 1, justifyContent: 'center' },
  classType: {
    fontFamily: CoachFonts.body, fontSize: 11, color: CoachColors.textMuted,
    marginBottom: 2,
  },
  className: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 15, color: CoachColors.textPrimary,
    lineHeight: 20, marginBottom: 3,
  },
  classInfo: {
    fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textSecondary,
    marginBottom: 2,
  },
  classInstructor: {
    fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted,
  },
});
