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
import { FontFamily } from '../../constants/theme';
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
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={s.headerRight}>
            <TouchableOpacity
              style={s.headerBtn}
              activeOpacity={0.6}
              onPress={() => { setIsFavorite(!isFavorite); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={22} color={isFavorite ? '#FFCA28' : '#FFFFFF'} />
            </TouchableOpacity>
            <TouchableOpacity style={s.headerBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Share collection">
              <Ionicons name="share-outline" size={22} color="#FFFFFF" />
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
                  <View style={[s.categoryDot, { backgroundColor: CATEGORY_COLORS[cat] || '#5B7FFF' }]} />
                  <Text style={s.categoryName}>{cat}</Text>
                </View>
              ))}
            </View>
            <View style={s.categoryCol}>
              {rightCats.map(cat => (
                <View key={cat} style={s.categoryRow}>
                  <View style={[s.categoryDot, { backgroundColor: CATEGORY_COLORS[cat] || '#5B7FFF' }]} />
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
                  <Text style={{ color: CATEGORY_COLORS[cls.category] || '#5B7FFF' }}>{cls.category}</Text>
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
  container: { flex: 1, backgroundColor: '#000' },
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
    overflow: 'hidden', backgroundColor: '#1A1A1A',
  },
  coverImage: { width: '100%', height: '100%' },
  coverGradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: COVER_SIZE * 0.4,
  },

  // Text
  collectionLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2, marginBottom: 8,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 34, color: '#FFFFFF',
    lineHeight: 40, marginBottom: 20,
  },
  description: {
    fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.65)',
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
    fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.75)',
  },

  // Classes section header
  classesHeader: {
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
    marginBottom: 20, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)',
  },
  classesTitle: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 22, color: '#FFFFFF',
    paddingTop: 16,
  },
  classesCount: {
    fontFamily: FontFamily.body, fontSize: 17, color: 'rgba(255,255,255,0.35)',
    paddingTop: 16,
  },

  // Class card
  classCard: {
    flexDirection: 'row', marginBottom: 20, gap: 14,
  },
  classThumbWrap: {
    width: 100, height: 72, borderRadius: 6, overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  classThumb: { width: '100%', height: '100%' },
  classDuration: {
    position: 'absolute', bottom: 4, left: 5,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 3,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  classDurationText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: '#FFFFFF',
  },
  classMeta: { flex: 1, justifyContent: 'center' },
  classType: {
    fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.35)',
    marginBottom: 2,
  },
  className: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 15, color: '#FFFFFF',
    lineHeight: 20, marginBottom: 3,
  },
  classInfo: {
    fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },
  classInstructor: {
    fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.35)',
  },
});
