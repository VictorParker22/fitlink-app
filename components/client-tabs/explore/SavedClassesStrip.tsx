import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import { FontFamily, Radius } from '../../../constants/theme';
import { getCategoryColor } from '../../../data/categoryColors';
import { ClientRoute } from '../../../types/routes';

export function SavedClassesStrip() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    async function fetchFavorites() {
      try {
        const { data, error } = await supabase
          .from('class_favorites')
          .select('*, classes(*)')
          .eq('client_id', user!.id);
        
        if (error) {
          console.log('[SavedClassesStrip] Error fetching favorites', error);
          return;
        }
        if (data) {
          setFavorites(data.filter(d => d.classes));
        }
      } catch (err) {
        console.log('[SavedClassesStrip] Exception fetching favorites', err);
      }
    }
    fetchFavorites();
  }, [user]);

  if (favorites.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.tag}>SAVED // YOUR LIBRARY</Text>
          <Text style={styles.sectionTitle}>Saved Classes</Text>
        </View>
        <View style={styles.emptyCard}>
          <Ionicons name="heart-outline" size={28} color="rgba(255,255,255,0.2)" />
          <Text style={styles.emptyTitle}>No saved classes yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the ★ icon on any class to build your private library.
          </Text>
        </View>
      </View>
    );
  }

  const renderItem = ({ item }: { item: any }) => {
    const classData = item.classes;
    const color = getCategoryColor(classData.category);

    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push({ pathname: ClientRoute.classDetail, params: { id: classData.id, title: classData.title, category: classData.category, thumbnail: classData.thumbnail_url } } as any);
        }}
      >
        <Image source={{ uri: classData.thumbnail_url }} style={styles.thumbnail} />
        <View style={styles.gradientOverlay} />
        
        <View style={styles.topRow}>
          <View style={[styles.categoryBadge, { backgroundColor: color }]}>
            <Text style={styles.categoryText}>{classData.category}</Text>
          </View>
          <Ionicons name="heart" size={16} color="#FFD700" />
        </View>

        <View style={styles.bottomContent}>
          <Text style={styles.title} numberOfLines={2}>{classData.title}</Text>
          <Text style={styles.duration}>{classData.duration_minutes} MIN</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.tag}>SAVED // YOUR LIBRARY</Text>
        <Text style={styles.sectionTitle}>Saved Classes</Text>
      </View>
      <FlatList
        data={favorites}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFF',
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: 160,
    height: 110,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    zIndex: 1,
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  categoryText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
    color: '#FFF',
    textTransform: 'uppercase',
  },
  bottomContent: {
    padding: 8,
    zIndex: 1,
  },
  title: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFF',
    marginBottom: 2,
  },
  duration: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  emptyCard: {
    marginHorizontal: 16,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 16,
  },
});
