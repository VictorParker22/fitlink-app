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
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ARTICLES } from '../../data/articles';

const SCREEN_W = Dimensions.get('window').width;

export default function ArticleDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ articleId: string }>();
  const [isFavorite, setIsFavorite] = useState(false);

  const article = ARTICLES.find(a => a.id === params.articleId);
  if (!article) return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={s.safeArea} edges={['top']}>
        <TouchableOpacity onPress={() => router.push(ClientRoute.articles)} style={{ paddingHorizontal: 16, paddingVertical: 12 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={28} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 }}>
          <Ionicons name="document-text-outline" size={48} color={CoachColors.textFaint} />
          <Text style={{ fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary, marginTop: 16 }}>Article not found</Text>
          <Text style={{ fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 8 }}>This article may have been removed.</Text>
        </View>
      </SafeAreaView>
    </View>
  );

  // Split body into paragraphs
  const paragraphs = article.body.split('\n\n').filter(Boolean);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={s.safeArea} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.push(ClientRoute.articles)}
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
            <TouchableOpacity style={s.headerBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Share article">
              <Ionicons name="share-outline" size={22} color={CoachColors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Read time label */}
          <View style={s.readLabel}>
            <Text style={s.readLabelText}>READ</Text>
            <View style={s.readDot} />
            <Text style={s.readLabelText}>{article.readMin} MIN</Text>
          </View>

          {/* Title */}
          <Text style={s.title} accessibilityRole="header">{article.title}</Text>

          {/* Author & date */}
          <Text style={s.author}>By {article.author}</Text>
          <Text style={s.date}>{article.date}</Text>

          {/* Hero image */}
          <Image source={{ uri: article.heroImage }} style={s.heroImage} contentFit="cover" cachePolicy="memory-disk" transition={200} accessibilityLabel={`Hero image for article: ${article.title}`} />

          {/* Headline */}
          <Text style={s.headline}>{article.headline}</Text>

          {/* Intro (italic) */}
          <Text style={s.intro}>{article.intro}</Text>

          {/* Body paragraphs */}
          {paragraphs.map((p, i) => {
            // Check if paragraph starts with bullet points
            if (p.startsWith('•')) {
              const bullets = p.split('\n').filter(Boolean);
              return (
                <View key={i} style={s.bulletList}>
                  {bullets.map((b, j) => (
                    <Text key={j} style={s.bulletItem}>{b}</Text>
                  ))}
                </View>
              );
            }
            // Check if it's a section header (short, no period, title-case)
            if (p.length < 50 && !p.includes('.') && p.split(' ').length <= 6) {
              return <Text key={i} style={s.subheading}>{p}</Text>;
            }
            return <Text key={i} style={s.bodyText}>{p}</Text>;
          })}

          {/* Series tag */}
          {article.series && (
            <View style={s.seriesTag}>
              <Ionicons name="layers-outline" size={14} color={CoachColors.textMuted} />
              <Text style={s.seriesText}>Part of the {article.series} series</Text>
            </View>
          )}

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
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row', gap: 4 },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  // Read label
  readLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 4, marginBottom: 12,
  },
  readLabelText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11, color: CoachColors.textMuted,
    letterSpacing: 1.5,
  },
  readDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: CoachColors.textMuted,
  },

  // Title
  title: {
    fontFamily: CoachFonts.headingBold, fontSize: 32, color: CoachColors.textPrimary,
    lineHeight: 38, marginBottom: 16,
  },

  // Author & date
  author: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary,
    marginBottom: 4,
  },
  date: {
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted,
    marginBottom: 24,
  },

  // Hero image
  heroImage: {
    width: SCREEN_W, height: SCREEN_W * 0.6,
    marginLeft: -20,
    marginBottom: 28,
    backgroundColor: CoachColors.surface,
  },

  // Headline
  headline: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 24, color: CoachColors.textPrimary,
    lineHeight: 32, marginBottom: 20,
  },

  // Intro (italic style)
  intro: {
    fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textSecondary,
    lineHeight: 24, fontStyle: 'italic', marginBottom: 24,
    borderLeftWidth: 2, borderLeftColor: CoachColors.border,
    paddingLeft: 16,
  },

  // Body
  bodyText: {
    fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textPrimary,
    lineHeight: 26, marginBottom: 20,
  },

  subheading: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textPrimary,
    marginBottom: 12, marginTop: 8,
  },

  bulletList: {
    marginBottom: 20, gap: 6,
  },
  bulletItem: {
    fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textPrimary,
    lineHeight: 24, paddingLeft: 4,
  },

  // Series tag
  seriesTag: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 20,
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: CoachColors.surface,
    borderRadius: 8, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  seriesText: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary,
  },
});
