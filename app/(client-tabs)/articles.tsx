import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

const SCREEN_W = Dimensions.get('window').width;

import { ArticleData, ARTICLES } from '../../data/articles';

// ─── ARTICLES LIST SCREEN ────────────────────────────────
export default function ArticlesScreen() {
  const router = useRouter();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const handleArticlePress = (article: ArticleData) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: ClientRoute.articleDetail as any,
      params: { articleId: article.id },
    });
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={s.safeArea} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.headerBtn}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={s.headerRight}>
            <TouchableOpacity
              style={s.headerBtn}
              activeOpacity={0.6}
              onPress={() => { 
                const next = new Set(favoriteIds);
                if (favoriteIds.size === 0) next.add('all'); // placeholder toggle
                setFavoriteIds(next);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
              }}
              accessibilityRole="button"
              accessibilityLabel="Favorites"
            >
              <Ionicons name={favoriteIds.size > 0 ? 'star' : 'star-outline'} size={22} color={favoriteIds.size > 0 ? CoachColors.accent : CoachColors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={s.headerBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Share articles">
              <Ionicons name="share-outline" size={22} color={CoachColors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Editorial hero header */}
          <View style={s.editorialHero}>
            <Text style={s.editorialTagLabel}>FITLINK EDITORIAL</Text>
            <Text style={s.editorialTitle} accessibilityRole="header">Articles{`\n`}&amp; insights</Text>
            <View style={s.editorialMeta}>
              <Text style={s.editorialCount}>{ARTICLES.length} ARTICLES</Text>
              <View style={s.editorialDot} />
              <Text style={s.editorialSubLabel}>Expert-curated content</Text>
            </View>
          </View>

          <View style={s.divider} />

          {/* Article list */}
          {ARTICLES.map((article) => (
            <TouchableOpacity
              key={article.id}
              style={s.articleRow}
              activeOpacity={0.85}
              onPress={() => handleArticlePress(article)}
              accessibilityRole="button"
              accessibilityLabel={`Read article: ${article.title}`}
            >
              <View style={s.articleContent}>
                {/* Type label */}
                <View style={s.typeRow}>
                  <Text style={s.typeLabel}>READ</Text>
                  <Text style={s.typeDot}>·</Text>
                  <Text style={s.readTime}>{article.readMin} MIN</Text>
                </View>

                {/* Title */}
                <Text style={s.articleTitle} numberOfLines={3}>{article.title}</Text>
              </View>

              {/* Thumbnail */}
              <Image source={{ uri: article.thumbnail }} style={s.articleThumb} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`Thumbnail for ${article.title}`} />
            </TouchableOpacity>
          ))}

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: { flexDirection: 'row', gap: 0 },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  // Editorial hero
  editorialHero: {
    paddingTop: 20,
    paddingBottom: 4,
  },
  editorialTagLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  editorialTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 38,
    color: CoachColors.textPrimary,
    letterSpacing: -1.2,
    lineHeight: 42,
    marginBottom: 14,
  },
  editorialMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editorialCount: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 1.5,
  },
  editorialDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: CoachColors.textFaint,
  },
  editorialSubLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginBottom: 4,
    marginTop: 20,
  },

  // Article row
  articleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CoachColors.borderMuted,
  },
  articleContent: { flex: 1 },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  typeLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  typeDot: {
    fontFamily: CoachFonts.body,
    fontSize: 9,
    color: CoachColors.textFaint,
  },
  articleTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
    lineHeight: 23,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  readTime: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  articleThumb: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: CoachColors.surface,
    flexShrink: 0,
  },
});
