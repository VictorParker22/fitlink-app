import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
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
      <Text style={s.tagHeader}>Featured reads</Text>
      <Text style={s.featuredTitle}>Curated insights</Text>
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
                colors={['transparent', CoachColors.surface] as const}
                style={s.articleCardGradient}
              />
              <View style={s.articleCardContent}>
                <View style={s.catBadge}>
                  <Text style={s.articleCat}>{art.category}</Text>
                </View>
                <Text style={s.articleTitle} numberOfLines={2}>{art.title}</Text>
                <View style={s.articleReadRow}>
                  <Ionicons name="document-text-outline" size={12} color={CoachColors.accent} />
                  <Text style={s.articleReadLabel}>Read essay</Text>
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
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  featuredTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  noResultsText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
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
    borderColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.surface,
  },
  articleCardBg: { ...StyleSheet.absoluteFillObject, opacity: 0.75 },
  articleCardGradient: { ...StyleSheet.absoluteFillObject },
  articleCardContent: { zIndex: 1 },
  catBadge: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 8,
  },
  articleCat: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  articleTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    color: CoachColors.textPrimary,
    lineHeight: 27,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  articleReadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  articleReadLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
