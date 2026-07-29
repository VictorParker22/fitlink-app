import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';

export interface SessionItem {
  id: string;
  title: string;
  type: '1-on-1' | 'Group' | 'Virtual';
  duration: number; // minutes
  coachName: string;
  coachAvatar: string;
  price?: string;
  accentColor: string;
  image: string;
}



interface Coach {
  id: string;
  name: string;
  role: string;
  avatar: string;
  specialty: string;
  bio: string;
}

interface SessionSpotlightProps {
  allCoaches?: Coach[];
  onBookSessionPress: (session: SessionItem) => void;
}

export default function SessionSpotlight({ allCoaches = [], onBookSessionPress }: SessionSpotlightProps) {
  const [sessionsList, setSessionsList] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('sessions')
          .select('*, trainers(*)');

        if (data && data.length > 0) {
          const mapped: SessionItem[] = data.map((s: any) => ({
            id: s.id,
            title: s.group_name || `${s.type || '1-on-1'} Coaching Session`,
            type: s.type || '1-on-1',
            duration: s.duration || 60,
            coachName: s.trainers?.name || 'FitLink Coach',
            coachAvatar: s.trainers?.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            price: s.type === 'Virtual' ? '$25' : s.type === 'Group' ? '$35' : '$75',
            accentColor: s.type === 'Virtual' ? '#4D94FF' : s.type === 'Group' ? '#A78BFA' : '#FF6B35',
            image: s.type === 'Virtual'
              ? 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400'
              : 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=400',
          }));
          setSessionsList(mapped);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.log('Error fetching sessions:', err);
      }

      setSessionsList([]);
      setLoading(false);
    })();
  }, [allCoaches]);
  return (
    <View style={s.section}>
      <Text style={s.tagHeader}>BOOK A SESSION // TRY BEFORE YOU BUY</Text>
      <Text style={s.title}>Single Sessions & Passes</Text>

      {loading && sessionsList.length === 0 ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
        </View>
      ) : sessionsList.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={s.emptyCard}>
            <Ionicons name="calendar-outline" size={24} color="rgba(255,255,255,0.4)" style={{ marginBottom: 8 }} />
            <Text style={s.emptyCardText}>No sessions available yet. Coaches will publish bookable sessions soon.</Text>
          </View>
        </View>
      ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        snapToInterval={240 + 12}
        decelerationRate="fast"
      >
        {sessionsList.map((sess) => (
          <TouchableOpacity
            key={sess.id}
            style={s.card}
            activeOpacity={0.9}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onBookSessionPress(sess);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Book session: ${sess.title}`}
          >
            <Image source={{ uri: sess.image }} style={s.cardBg} cachePolicy="memory-disk" />
            <View style={s.cardOverlay} />

            <View style={s.cardTop}>
              <View style={[s.typeBadge, { borderColor: sess.accentColor }]}>
                <Ionicons name="calendar-outline" size={10} color={sess.accentColor} />
                <Text style={[s.typeText, { color: sess.accentColor }]}>{sess.type.toUpperCase()}</Text>
              </View>

              <View style={s.durationPill}>
                <Ionicons name="time-outline" size={10} color="rgba(255,255,255,0.7)" />
                <Text style={s.durationText}>{sess.duration} MIN</Text>
              </View>
            </View>

            <View style={s.cardBottom}>
              <Text style={s.sessionTitle} numberOfLines={2}>{sess.title}</Text>

              <View style={s.coachRow}>
                <Image source={{ uri: sess.coachAvatar }} style={s.coachAvatar} cachePolicy="memory-disk" />
                <Text style={s.coachName} numberOfLines={1}>{sess.coachName}</Text>
                {sess.price && <Text style={s.priceTag}>{sess.price}</Text>}
              </View>

              <View style={s.bookBtn}>
                <Text style={s.bookBtnText}>BOOK SESSION →</Text>
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
  section: { marginBottom: 24 },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  scrollContent: { paddingHorizontal: 16, gap: 12 },
  card: {
    width: 240,
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: 14,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: '#0C0C0E',
  },
  cardBg: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(12,12,14,0.9)',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    letterSpacing: 1,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(12,12,14,0.9)',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  durationText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#FFFFFF',
  },
  cardBottom: { zIndex: 1 },
  sessionTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  coachAvatar: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  coachName: {
    flex: 1,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
  priceTag: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 13,
    color: '#22C55E',
  },
  bookBtn: {
    height: 36,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  emptyCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyCardText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
  },
});
