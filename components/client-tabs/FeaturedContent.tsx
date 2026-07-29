import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { FontFamily } from '../../constants/theme';
import { FEATURED_CONTENT } from '../../data/workouts';
import { supabase } from '../../lib/supabase';

interface FeaturedContentProps {
  searchQuery: string;
}

export default function FeaturedContent({ searchQuery }: FeaturedContentProps) {
  const router = useRouter();

  const [articles, setArticles] = useState(FEATURED_CONTENT);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('articles').select('*');
        if (data && data.length > 0) {
          setArticles(data.map((a: any) => ({
            id: a.id,
            articleId: a.id,
            category: a.category || 'ARTICLE',
            title: a.title || 'Untitled',
            image: a.image_url || 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd',
          })));
        }
      } catch (err) {
        console.log('Error fetching articles:', err);
      }
    })();
  }, []);

  const filteredFeatured = articles.filter(a =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={s.featuredSection}>
      <Text style={s.tagHeader}>EDITORIAL // FEATURED READS</Text>
      <Text style={s.featuredTitle}>Curated Insights</Text>
      {filteredFeatured.length === 0 ? (
        <Text style={s.noResultsText}>No articles matching your search</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.articleScroll}
          snapToInterval={260 + 12}
          decelerationRate="fast"
        >
          {filteredFeatured.map(art => (
            <TouchableOpacity
              key={art.id}
              style={s.articleCard}
              activeOpacity={0.9}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: ClientRoute.articleDetail as any,
                  params: { articleId: art.articleId },
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Read article: ${art.title}`}
            >
              <Image source={{ uri: art.image }} style={s.articleCardBg} cachePolicy="memory-disk" transition={200} />
              <LinearGradient
                colors={['transparent', '#0C0C0E'] as const}
                style={s.articleCardGradient}
              />
              <View style={s.articleCardContent}>
                <View style={s.topBadgeRow}>
                  <View style={s.catBadge}>
                    <Text style={s.articleCat}>{art.category}</Text>
                  </View>
                  <View style={s.readTimeBadge}>
                    <Ionicons name="time-outline" size={10} color="rgba(255,255,255,0.7)" />
                    <Text style={s.readTimeText}>{Math.max(3, Math.min(12, Math.round(art.title.length / 5)))} MIN READ</Text>
                  </View>
                </View>
                <Text style={s.articleTitle} numberOfLines={2}>{art.title}</Text>
                <View style={s.articleReadRow}>
                  <Ionicons name="document-text-outline" size={12} color="#4D94FF" />
                  <Text style={s.articleReadLabel}>READ ESSAY →</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  featuredSection: { marginBottom: 24 },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  featuredTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  noResultsText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  articleScroll: { paddingHorizontal: 16, gap: 12 },
  articleCard: {
    width: 260,
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: '#0C0C0E',
  },
  articleCardBg: { ...StyleSheet.absoluteFillObject, opacity: 0.75 },
  articleCardGradient: { ...StyleSheet.absoluteFillObject },
  articleCardContent: { zIndex: 1 },
  catBadge: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 1,
    borderColor: '#27272A',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  articleCat: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.2,
  },
  articleTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 17,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 10,
  },
  articleReadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  articleReadLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#4D94FF',
    letterSpacing: 1.2,
  },
  topBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  readTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  readTimeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.8,
  },
});
