import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert,
  Platform, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ClientRoute } from '../../types/routes';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useWorkout, ClassInfo } from '../../context/WorkoutContext';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { CATEGORY_COLORS } from '../../data/categoryColors';
import React from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useRevenueCat } from '../../context/RevenueCatContext';
import ClientPaywall from '../../components/paywalls/ClientPaywall';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_HEIGHT = 380;



// ─── COMPONENT ───────────────────────────────────────────
export default function ClassDetailScreen() {
  const insets = useSafeAreaInsets();
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
    description?: string;
    equipment?: string;
    is_free?: string;
    video_url?: string;
    videoUrl?: string;
    // Season-track context — present only when opened from a track class
    // node (WeekSection). Route params arrive as strings.
    enrollmentId?: string;
    trackIndex?: string;
  }>();

  const { user } = useAuth();
  const { activeSession, startWorkout, getSavedProgress, resumeSavedWorkout, getClassHistory, getClassTakeCount } = useWorkout();
  const { isClientPremium } = useRevenueCat();
  const [isFavorite, setIsFavorite] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const requiresPass = params.is_free === 'false';

  React.useEffect(() => {
    async function checkFavorite() {
      if (!user) return;
      const { data, error } = await supabase
        .from('class_favorites')
        .select('id')
        .eq('client_id', user.id)
        .eq('class_id', params.id)
        .maybeSingle();
      if (error) {
        if (__DEV__) console.warn('[class-detail] favorite check failed:', error.message);
        return;
      }
      if (data) setIsFavorite(true);
    }
    checkFavorite();
  }, [user, params.id]);

  const toggleFavorite = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!user) return;
    const wasFavorite = isFavorite;
    setIsFavorite(!wasFavorite);

    const { error } = wasFavorite
      ? await supabase
          .from('class_favorites')
          .delete()
          .eq('client_id', user.id)
          .eq('class_id', params.id)
      : await supabase
          .from('class_favorites')
          .insert({ client_id: user.id, class_id: params.id });

    if (error) {
      // The heart is a claim that the save landed — put it back if it didn't.
      setIsFavorite(wasFavorite);
      if (__DEV__) console.warn('[class-detail] favorite toggle failed:', error.message);
      Alert.alert('Not saved', "We couldn't update your saved classes. Please try again.");
    }
  };

  const catColor = CATEGORY_COLORS[params.category || ''] || '#FFFFFF';
  const tags = params.tags ? params.tags.split(',').filter(Boolean) : [];
  // Real row data only — sections with nothing behind them are omitted.
  const description = (params.description || '').trim();
  const equipment = (params.equipment || '').trim();

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
    // Season-track context: carried in the session (survives resume via
    // SecureStore) so the player's completion screen can advance the track.
    enrollmentId: params.enrollmentId || undefined,
    trackIndex:
      params.trackIndex != null && params.trackIndex !== '' && Number.isFinite(Number(params.trackIndex))
        ? Number(params.trackIndex)
        : undefined,
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

    // ── Paywall gate: non-premium clients can't start PASS-required classes ──
    if (requiresPass && !isClientPremium) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setPaywallVisible(true);
      return;
    }

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

  return (
    <>
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 130 }]}>

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
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={() => router.push(ClientRoute.exploreClasses)} style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Go back to explore classes">
              <Ionicons name="chevron-back" size={31} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <View style={s.navRight}>
              <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} onPress={handleShare} style={s.navBtn} activeOpacity={0.6} accessibilityRole="button" accessibilityLabel="Share this class">
                <Ionicons name="share-outline" size={25} color={CoachColors.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
                onPress={toggleFavorite}
                style={s.navBtn}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={25} color={isFavorite ? CoachColors.accent : CoachColors.textPrimary} />
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
              <Ionicons name="layers-outline" size={22} color={CoachColors.textSecondary} />
              <Text style={s.metaText}>
                <Text style={{ color: catColor }}>{params.category}</Text>
                {tags.map((tag, i) => (
                  <Text key={i} style={s.metaDot}>  •  {tag}</Text>
                ))}
              </Text>
            </View>
            <View style={s.metaRow}>
              <Ionicons name="time-outline" size={22} color={CoachColors.textSecondary} />
              <Text style={s.metaText}>{params.durationMin} minutes</Text>
            </View>
            <View style={s.metaRow}>
              <Ionicons name="bar-chart-outline" size={22} color={CoachColors.textSecondary} />
              <Text style={s.metaText}>{params.level}</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={s.actionRow}>
            <TouchableOpacity style={[s.beginBtn, isThisClassActive && { borderColor: CoachColors.textPrimary }]} onPress={handleBeginClass} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={isThisClassActive ? 'Return to class' : savedProgress ? 'Resume class' : 'Begin class'}>
              <Text style={s.beginBtnText}>
                {isThisClassActive ? 'Return to class' : savedProgress ? 'Resume class' : 'Begin class'}
              </Text>
              <Ionicons name={isThisClassActive ? 'arrow-forward' : savedProgress ? 'refresh' : 'play'} size={16} color={CoachColors.onAccent} />
            </TouchableOpacity>
            <TouchableOpacity style={s.calBtn} onPress={handleAddToCal} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Add to calendar">
              <Text style={s.calBtnText}>Add to cal</Text>
            </TouchableOpacity>
          </View>

          {/* One billing rail only: this opens the same RevenueCat paywall
              as the Begin-class gate. A Stripe path used to live here — wrong
              rail (in-app digital content must use IAP) and it never actually
              collected payment. Hidden once the pass is held. */}
          {requiresPass && !isClientPremium && (
            <View style={s.premiumBanner}>
              <Ionicons name="lock-closed" size={18} color={CoachColors.warning} />
              <Text style={s.premiumText}>Requires the athlete pass</Text>
              <TouchableOpacity
                hitSlop={6}
                style={s.premiumBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPaywallVisible(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Get the athlete pass"
              >
                <Text style={s.premiumBtnText}>Get the pass</Text>
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
              <Ionicons name="bookmark" size={13} color={CoachColors.textSecondary} />
              <Text style={s.inProgressText}>Saved progress available</Text>
            </View>
          )}

          {/* Description — only when the class actually has one */}
          {description ? <Text style={s.description}>{description}</Text> : null}

          {/* Class history card */}
          {takeCount > 0 && !isThisClassActive && (
            <View style={s.historyCard}>
              <View style={s.historyCardRow}>
                <Ionicons name="checkmark-circle" size={18} color={CoachColors.accent} />
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

          {/* Equipment — only when the class actually lists any */}
          {equipment ? (
            <>
              <View style={s.sectionDivider} />
              <Text style={s.sectionTitle}>Equipment</Text>
              <Text style={s.sectionBody}>{equipment}</Text>
            </>
          ) : null}

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

        </View>
      </ScrollView>
    </View>

    {/* The athlete-pass paywall, carrying the class that triggered it. */}
    <ClientPaywall
      visible={paywallVisible}
      onDismiss={() => setPaywallVisible(false)}
      blockedClass={{
        title: String(params.title || 'This class'),
        coachName: params.instructor ? String(params.instructor) : null,
        thumbnailUrl: params.thumbnail ? String(params.thumbnail) : null,
      }}
      onPurchased={() => {
        setPaywallVisible(false);
        // Modal must fully dismiss before navigation (iOS freeze otherwise).
        // The entitlement is already active, so handleBeginClass passes the
        // gate and starts the class they just paid to watch.
        setTimeout(() => handleBeginClass(), 350);
      }}
    />
  </>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  // paddingBottom is applied inline from the real bottom inset + tab-bar height.
  scrollContent: {},

  // Hero
  heroWrap: {
    width: SCREEN_W,
    height: HERO_HEIGHT,
    backgroundColor: CoachColors.surface,
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
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    marginBottom: 0,
  },
  passBadge: {
    backgroundColor: CoachColors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
  },
  passBadgeText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textSecondary,
    letterSpacing: 1,
  },

  // Title
  classTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 36,
    color: CoachColors.textPrimary,
    lineHeight: 38,
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
    borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
  },
  instructorName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
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
    fontFamily: CoachFonts.body,
    fontSize: 17,
    color: CoachColors.textSecondary,
  },
  metaDot: {
    color: CoachColors.textMuted,
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
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accent,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  beginBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.onAccent,
  },
  calBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  calBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  
  // Premium Gate
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    padding: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: CoachColors.warning,
    borderColor: CoachColors.border,
    marginBottom: 32,
    marginTop: -20,
  },
  premiumText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
    marginLeft: 8,
    flex: 1,
  },
  premiumBtn: {
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 12,
    height: 32,
    paddingVertical: 0,
    justifyContent: 'center',
    borderRadius: 8,
    borderCurve: 'continuous',
  },
  premiumBtnText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 13.5,
    color: CoachColors.onAccent,
  },

  // Description
  description: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    lineHeight: 24.5,
    marginBottom: 8,
  },

  // Section
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginVertical: 24,
  },
  sectionTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginBottom: 12,
    letterSpacing: 1.2,
  },
  sectionBody: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    lineHeight: 24.5,
    color: CoachColors.textSecondary,
  },

  // Instructor card
  instructorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 14,
  },
  instructorAvatarLg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.borderMuted,
  },
  instructorCardName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
  },
  viewBioLink: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5,
    color: CoachColors.textSecondary,
    textDecorationLine: 'underline',
    marginTop: 2,
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
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  inProgressText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
  },

  // History card
  historyCard: {
    backgroundColor: CoachColors.surface,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
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
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  historyCardSub: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
    marginTop: 4,
    marginLeft: 24,
  },
});
