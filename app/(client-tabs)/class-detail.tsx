import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert,
  Platform, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWorkout, ClassInfo } from '../../context/WorkoutContext';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../constants/theme';
import { CATEGORY_COLORS } from '../../data/categoryColors';
import { CLASS_DESCRIPTIONS, CLASS_EQUIPMENT, RELATED_CLASSES } from '../../data/classDetails';
import React from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_HEIGHT = 380;



// ─── COMPONENT ───────────────────────────────────────────
export default function ClassDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    title: string;
    category: string;
    tags: string;
    level: string;
    instructor: string;
    brand: string;
    durationMin: string;
    thumbnail: string;
    instructorAvatar: string;
    is_free?: string;
    video_url?: string;
    videoUrl?: string;
  }>();

  const { user } = useAuth();
  const { activeSession, startWorkout, getSavedProgress, resumeSavedWorkout, getClassHistory, getClassTakeCount } = useWorkout();
  const [isFavorite, setIsFavorite] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const requiresPass = params.is_free === 'false';

  React.useEffect(() => {
    async function checkFavorite() {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('class_favorites')
          .select('id')
          .eq('client_id', user.id)
          .eq('class_id', params.id)
          .single();
        if (data) setIsFavorite(true);
      } catch (err) {}
    }
    checkFavorite();
  }, [user, params.id]);

  const toggleFavorite = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsFavorite(!isFavorite);
    if (!user) return;
    try {
      if (isFavorite) {
        await supabase
          .from('class_favorites')
          .delete()
          .eq('client_id', user.id)
          .eq('class_id', params.id);
      } else {
        await supabase
          .from('class_favorites')
          .insert({ client_id: user.id, class_id: params.id });
      }
    } catch (err) {}
  };

  const catColor = CATEGORY_COLORS[params.category || ''] || '#FFFFFF';
  const tags = params.tags ? params.tags.split(',').filter(Boolean) : [];
  const description = CLASS_DESCRIPTIONS[params.id || ''] || 'Discover a premium workout experience designed to challenge your body and elevate your mind.';
  const equipment = CLASS_EQUIPMENT[params.id || ''] || 'None (bodyweight)';

  // Check workout state for this class
  const isThisClassActive = activeSession?.isActive && activeSession.classInfo.id === params.id;
  const savedProgress = getSavedProgress(params.id || '');
  const takeCount = getClassTakeCount(params.id || '');
  const classHistory = getClassHistory(params.id || '');

  const classInfo: ClassInfo = {
    id: params.id || '',
    title: params.title || '',
    category: params.category || '',
    tags: params.tags || '',
    level: params.level || '',
    instructor: params.instructor || '',
    durationMin: params.durationMin || '30',
    thumbnail: params.thumbnail || '',
    instructorAvatar: params.instructorAvatar,
    videoUrl: params.videoUrl || params.video_url,
    video_url: params.video_url || params.videoUrl,
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out "${params.title}" on FitLink! A ${params.durationMin}-minute ${params.category} class by ${params.instructor}.`,
      });
    } catch (e) {}
  };

  const handleBeginClass = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isThisClassActive) {
      // Already playing — just navigate to the player
      router.push(ClientRoute.classPlayer);
      return;
    }
    if (savedProgress) {
      // Resume saved session
      resumeSavedWorkout(classInfo);
    } else {
      // Start fresh
      startWorkout(classInfo);
    }
    router.push({
      pathname: ClientRoute.classPlayer as any,
      params: {
        title: params.title,
        category: params.category,
        tags: params.tags,
        level: params.level,
        instructor: params.instructor,
        durationMin: params.durationMin,
        thumbnail: params.thumbnail,
        videoUrl: params.videoUrl || params.video_url,
        video_url: params.video_url || params.videoUrl,
      },
    });
  };

  const handleAddToCal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Added to Calendar', `"${params.title}" has been added to your calendar.`);
  };

  const handleSubscribe = async () => {
    if (!user) return;
    setSubscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-class-subscription', {
        body: { clientId: user.id },
      });
      if (error) throw error;
      // In a real implementation, this would open Stripe PaymentSheet
      // For now, show success alert
      Alert.alert(
        'On-Demand Pass',
        'Subscription initiated! Complete payment to unlock all classes.',
        [{ text: 'OK' }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start subscription');
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {/* ── HERO IMAGE ── */}
        <View style={s.heroWrap}>
          <Image source={{ uri: params.thumbnail }} style={s.heroImage} cachePolicy="memory-disk" transition={200} accessibilityLabel={`${params.title} class thumbnail`} />
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.85)']}
            style={s.heroGradient}
            accessible={false}
          />

          {/* Overlay nav */}
          <SafeAreaView style={s.heroNav} edges={['top']}>
            <TouchableOpacity onPress={() => router.push(ClientRoute.exploreClasses)} style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Go back to explore classes">
              <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={s.navRight}>
              <TouchableOpacity onPress={handleShare} style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Share this class">
                <Ionicons name="share-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={toggleFavorite}
                style={s.navBtn}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={22} color={isFavorite ? '#FFD700' : '#FFFFFF'} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>

        {/* ── CONTENT ── */}
        <View style={s.content}>

          {/* Label */}
          <View style={s.labelRow}>
            <Text style={s.onDemandLabel}>ON-DEMAND</Text>
            {requiresPass && (
              <View style={s.passBadge}>
                <Text style={s.passBadgeText}>ON-DEMAND PASS</Text>
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={s.classTitle} accessibilityRole="header">{params.title}</Text>

          {/* Instructor row */}
          <View style={s.instructorRow}>
            <Image
              source={{ uri: params.instructorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100' }}
              style={s.instructorAvatarSmall}
              cachePolicy="memory-disk"
              transition={200}
              accessibilityLabel={`${params.instructor} avatar`}
            />
            <Text style={s.instructorName}>{params.instructor}</Text>
          </View>

          {/* Meta rows */}
          <View style={s.metaSection}>
            <View style={s.metaRow}>
              <Ionicons name="layers-outline" size={20} color="rgba(255,255,255,0.5)" />
              <Text style={s.metaText}>
                <Text style={{ color: catColor }}>{params.category}</Text>
                {tags.map((tag, i) => (
                  <Text key={i} style={s.metaDot}>  •  {tag}</Text>
                ))}
              </Text>
            </View>
            <View style={s.metaRow}>
              <Ionicons name="time-outline" size={20} color="rgba(255,255,255,0.5)" />
              <Text style={s.metaText}>{params.durationMin} minutes</Text>
            </View>
            <View style={s.metaRow}>
              <Ionicons name="bar-chart-outline" size={20} color="rgba(255,255,255,0.5)" />
              <Text style={s.metaText}>{params.level}</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={s.actionRow}>
            <TouchableOpacity style={[s.beginBtn, isThisClassActive && { borderColor: '#66BB6A' }]} onPress={handleBeginClass} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={isThisClassActive ? 'Return to class' : savedProgress ? 'Resume class' : 'Begin class'}>
              <Text style={s.beginBtnText}>
                {isThisClassActive ? 'Return to Class' : savedProgress ? 'Resume Class' : 'Begin Class'}
              </Text>
              <Ionicons name={isThisClassActive ? 'arrow-forward' : savedProgress ? 'refresh' : 'play'} size={14} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={s.calBtn} onPress={handleAddToCal} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Add to calendar">
              <Text style={s.calBtnText}>Add to Cal</Text>
            </TouchableOpacity>
          </View>

          {/* Premium gate placeholder */}
          {requiresPass && (
            <View style={s.premiumBanner}>
              <Ionicons name="lock-closed" size={16} color="#FFD700" />
              <Text style={s.premiumText}>Requires ON-DEMAND PASS</Text>
              <TouchableOpacity style={s.premiumBtn} onPress={handleSubscribe} disabled={subscribing}>
                <Text style={s.premiumBtnText}>{subscribing ? 'UPGRADING...' : 'UPGRADE'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* In-progress badge */}
          {isThisClassActive && (
            <View style={s.inProgressBadge}>
              <View style={s.inProgressDot} />
              <Text style={s.inProgressText}>Workout in progress</Text>
            </View>
          )}
          {savedProgress && !isThisClassActive && (
            <View style={s.inProgressBadge}>
              <Ionicons name="bookmark" size={12} color="rgba(255,255,255,0.5)" />
              <Text style={s.inProgressText}>Saved progress available</Text>
            </View>
          )}

          {/* Description */}
          <Text style={s.description}>{description}</Text>

          {/* Class history card */}
          {takeCount > 0 && !isThisClassActive && (
            <View style={s.historyCard}>
              <View style={s.historyCardRow}>
                <Ionicons name="checkmark-circle" size={16} color="#66BB6A" />
                <Text style={s.historyCardTitle}>
                  Taken {takeCount} time{takeCount > 1 ? 's' : ''}
                </Text>
              </View>
              {classHistory[0] && (
                <Text style={s.historyCardSub}>
                  Last completed {new Date(classHistory[0].completedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {classHistory[0].completed ? ' · 100%' : ` · ${Math.round((classHistory[0].durationSec / classHistory[0].targetDurationSec) * 100)}%`}
                </Text>
              )}
            </View>
          )}

          {/* Divider */}
          <View style={s.sectionDivider} />

          {/* Equipment */}
          <Text style={s.sectionTitle}>Equipment</Text>
          <Text style={s.sectionBody}>{equipment}</Text>

          {/* Divider */}
          <View style={s.sectionDivider} />

          {/* Instructor */}
          <Text style={s.sectionTitle}>Instructor</Text>
          <View style={s.instructorCard}>
            <Image
              source={{ uri: params.instructorAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100' }}
              style={s.instructorAvatarLg}
              cachePolicy="memory-disk"
              transition={200}
              accessibilityLabel={`${params.instructor} profile photo`}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.instructorCardName}>{params.instructor}</Text>
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => router.push(ClientRoute.exploreClasses)}
                accessibilityRole="button"
                accessibilityLabel={`Find more classes by ${params.instructor}`}
              >
                <Text style={s.viewBioLink}>More classes →</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Divider */}
          <View style={s.sectionDivider} />

          {/* Related classes */}
          <Text style={s.sectionTitle}>Related On-demand Classes</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.relatedScroll} contentContainerStyle={s.relatedContent}>
            {RELATED_CLASSES.map(rc => (
              <TouchableOpacity
                key={rc.id}
                style={s.relatedCard}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({
                    pathname: ClientRoute.classDetail as any,
                    params: {
                      id: rc.id,
                      title: rc.title,
                      category: params.category,
                      durationMin: rc.duration,
                      thumbnail: rc.image,
                      instructor: params.instructor,
                      level: params.level,
                      tags: params.tags,
                    },
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={`View related class: ${rc.title}, ${rc.duration}`}
              >
                <Image source={{ uri: rc.image }} style={s.relatedImage} cachePolicy="memory-disk" transition={200} accessibilityLabel={`${rc.title} class thumbnail`} />
                <View style={s.relatedDuration}>
                  <Text style={s.relatedDurationText}>{rc.duration}</Text>
                </View>
                <Text style={s.relatedTitle} numberOfLines={1}>{rc.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ height: 60 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Hero
  heroWrap: {
    width: SCREEN_W,
    height: HERO_HEIGHT,
    backgroundColor: '#111',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  heroNav: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  navBtn: {
    padding: 8,
  },
  navRight: {
    flexDirection: 'row',
    gap: 4,
  },

  // Content
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },

  // On-demand label
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  onDemandLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    marginBottom: 0,
  },
  passBadge: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  passBadgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#FFD700',
    letterSpacing: 1,
  },

  // Title
  classTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    lineHeight: 34,
    marginBottom: 16,
    letterSpacing: -0.8,
  },

  // Instructor row (small)
  instructorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  instructorAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#222',
  },
  instructorName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },

  // Meta section
  metaSection: {
    gap: 14,
    marginBottom: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
  },
  metaDot: {
    color: 'rgba(255,255,255,0.4)',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  beginBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
  },
  beginBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  calBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#1C1C1E',
    backgroundColor: '#111113',
    borderRadius: 14,
  },
  calBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  
  // Premium Gate
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111113',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: '#FFD700',
    borderColor: '#1C1C1E',
    marginBottom: 32,
    marginTop: -20,
  },
  premiumText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFFFFF',
    marginLeft: 8,
    flex: 1,
  },
  premiumBtn: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    height: 32,
    paddingVertical: 0,
    justifyContent: 'center',
    borderRadius: 8,
  },
  premiumBtnText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 12,
    color: '#000000',
  },

  // Description
  description: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 22,
    marginBottom: 8,
  },

  // Section
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 24,
  },
  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: 1.2,
  },
  sectionBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.55)',
  },

  // Instructor card
  instructorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
  },
  instructorAvatarLg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#222',
  },
  instructorCardName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  viewBioLink: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textDecorationLine: 'underline',
    marginTop: 2,
  },

  // Related classes
  relatedScroll: {
    marginHorizontal: -20,
  },
  relatedContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  relatedCard: {
    width: 170,
  },
  relatedImage: {
    width: 170,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
  },
  relatedDuration: {
    position: 'absolute',
    bottom: 30,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  relatedDurationText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  relatedTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#FFFFFF',
    marginTop: 6,
  },

  // In-progress badge
  inProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 0,
  },
  inProgressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#66BB6A',
  },
  inProgressText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },

  // History card
  historyCard: {
    backgroundColor: '#0C0C0E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  historyCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyCardTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  historyCardSub: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 4,
    marginLeft: 24,
  },
});
