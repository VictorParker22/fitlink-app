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
import { FontFamily } from '../../constants/theme';

const SCREEN_W = Dimensions.get('window').width;

import { ArticleData, ARTICLES } from '../../data/articles';

// ─── ARTICLES LIST SCREEN ────────────────────────────────
export default function ArticlesScreen() {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(false);

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
            onPress={() => router.push(ClientRoute.workouts)}
            style={s.headerBtn}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Articles & Insights</Text>
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
            <TouchableOpacity style={s.headerBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Share articles">
              <Ionicons name="share-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Section header */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle} accessibilityRole="header">Articles & Insights</Text>
            <Text style={s.sectionCount}>{ARTICLES.length}</Text>
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
                  <Ionicons name="document-text-outline" size={14} color="rgba(255,255,255,0.4)" />
                  <Text style={s.typeLabel}>READ</Text>
                </View>

                {/* Title */}
                <Text style={s.articleTitle} numberOfLines={2}>{article.title}</Text>

                {/* Read time */}
                <Text style={s.readTime}>{article.readMin} mins</Text>
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
  container: { flex: 1, backgroundColor: '#000' },
  safeArea: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: 17, color: '#FFFFFF' },
  headerRight: { flexDirection: 'row', gap: 4 },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  // Section header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
    marginTop: 12, marginBottom: 16,
  },
  sectionTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 22, color: '#FFFFFF' },
  sectionCount: { fontFamily: FontFamily.body, fontSize: 17, color: 'rgba(255,255,255,0.35)' },

  divider: {
    height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 8,
  },

  // Article row
  articleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  articleContent: { flex: 1, paddingRight: 16 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  typeLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
  },
  articleTitle: {
    fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: '#FFFFFF',
    lineHeight: 22, marginBottom: 6,
  },
  readTime: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.35)' },
  articleThumb: {
    width: 72, height: 72, borderRadius: 4, backgroundColor: '#1A1A1A',
  },
});
