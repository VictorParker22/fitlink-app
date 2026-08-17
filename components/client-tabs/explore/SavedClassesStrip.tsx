/**
 * SavedClassesStrip — the Library's "Saved" section.
 *
 * Source is unchanged: the athlete's real `class_favorites` rows joined to the
 * class. The old "no saved classes yet" card told the athlete how the heart
 * icon works before they had ever seen a class; the section now renders
 * nothing at all when there are no favourites, the same rule every other
 * chapter of the Library follows.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';

const C = CoachColors;
const F = CoachFonts;

/** Local twin of workouts.tsx SectionHead — see ExploreDashboard for why. */
function SectionHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionHeadLabel}>{label}</Text>
      {sub ? <Text style={s.sectionHeadSub}>{sub}</Text> : null}
    </View>
  );
}

export function SavedClassesStrip() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('class_favorites')
          .select('*, classes(*)')
          .eq('client_id', user.id);
        if (error) {
          console.log('[SavedClassesStrip] Error fetching favorites', error);
          return;
        }
        // A favourite whose class is gone (or no longer readable) is dropped
        // rather than rendered as a blank card.
        if (alive && data) setFavorites(data.filter((d) => d.classes));
      } catch (err) {
        console.log('[SavedClassesStrip] Exception fetching favorites', err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  if (favorites.length === 0) return null;

  const renderItem = ({ item }: { item: any }) => {
    const cls = item.classes;
    const meta = [cls.category, cls.duration_minutes ? `${cls.duration_minutes} min` : null]
      .filter(Boolean)
      .join(' · ');

    return (
      <Pressable
        style={s.card}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({
            pathname: ClientRoute.classDetail,
            params: {
              id: cls.id,
              title: cls.title || '',
              category: cls.category || '',
              level: cls.difficulty || '',
              durationMin: cls.duration_minutes != null ? String(cls.duration_minutes) : '',
              thumbnail: cls.thumbnail_url || '',
              description: cls.description || '',
              equipment: Array.isArray(cls.equipment) ? cls.equipment.join(', ') : '',
              video_url: cls.video_url || '',
              // class-detail gates its paywall on this exact string.
              is_free: cls.is_free ? 'true' : 'false',
            },
          } as any);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Saved: ${cls.title}${meta ? `, ${meta}` : ''}. Double tap to open the class`}
      >
        {cls.thumbnail_url ? (
          <Image
            source={{ uri: cls.thumbnail_url }}
            style={s.thumb}
            cachePolicy="memory-disk"
            transition={160}
          />
        ) : null}
        <View style={s.cardBody}>
          <Text style={s.name} numberOfLines={2}>
            {cls.title}
          </Text>
          {meta ? (
            <Text style={s.meta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View>
      <SectionHead label="Saved" sub="Classes you hearted, kept in one place." />
      <FlatList
        data={favorites}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.list}
        contentContainerStyle={s.listContent}
        accessibilityLabel="Your saved classes"
      />
    </View>
  );
}

const s = StyleSheet.create({
  sectionHead: {
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
    marginTop: 30,
    paddingTop: 18,
    marginBottom: 12,
  },
  sectionHeadLabel: {
    fontFamily: F.bodyBold,
    fontSize: 12.5,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionHeadSub: {
    fontFamily: F.body,
    fontSize: 13.5,
    color: C.textMuted,
    lineHeight: 19,
    marginTop: 4,
  },

  list: { marginHorizontal: -20 },
  listContent: { paddingHorizontal: 20, gap: 10 },

  card: {
    width: 180,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: 84, backgroundColor: C.borderMuted },
  cardBody: { paddingVertical: 11, paddingHorizontal: 12 },
  name: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  meta: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 2, lineHeight: 18 },
});
