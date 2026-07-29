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
import { FontFamily } from '../../constants/theme';
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
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 100 }}>
          <Ionicons name="document-text-outline" size={48} color="rgba(255,255,255,0.2)" />
          <Text style={{ fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFFFFF', marginTop: 16 }}>Article Not Found</Text>
          <Text style={{ fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>This article may have been removed.</Text>
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
            <TouchableOpacity style={s.headerBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Share article">
              <Ionicons name="share-outline" size={22} color="#FFFFFF" />
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
              <Ionicons name="layers-outline" size={14} color="rgba(255,255,255,0.4)" />
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
  container: { flex: 1, backgroundColor: '#000' },
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
    fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
  },
  readDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)',
  },

  // Title
  title: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 32, color: '#FFFFFF',
    lineHeight: 38, marginBottom: 16,
  },

  // Author & date
  author: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
  },
  date: {
    fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.35)',
    marginBottom: 24,
  },

  // Hero image
  heroImage: {
    width: SCREEN_W, height: SCREEN_W * 0.6,
    marginLeft: -20,
    marginBottom: 28,
    backgroundColor: '#1A1A1A',
  },

  // Headline
  headline: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 24, color: '#FFFFFF',
    lineHeight: 32, marginBottom: 20,
  },

  // Intro (italic style)
  intro: {
    fontFamily: FontFamily.body, fontSize: 16, color: 'rgba(255,255,255,0.6)',
    lineHeight: 24, fontStyle: 'italic', marginBottom: 24,
    borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.15)',
    paddingLeft: 16,
  },

  // Body
  bodyText: {
    fontFamily: FontFamily.body, fontSize: 16, color: 'rgba(255,255,255,0.75)',
    lineHeight: 26, marginBottom: 20,
  },

  subheading: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFFFFF',
    marginBottom: 12, marginTop: 8,
  },

  bulletList: {
    marginBottom: 20, gap: 6,
  },
  bulletItem: {
    fontFamily: FontFamily.body, fontSize: 16, color: 'rgba(255,255,255,0.75)',
    lineHeight: 24, paddingLeft: 4,
  },

  // Series tag
  seriesTag: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 20,
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  seriesText: {
    fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.45)',
  },
});
