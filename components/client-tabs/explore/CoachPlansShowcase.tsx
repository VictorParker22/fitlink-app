import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { supabase } from '../../../lib/supabase';

export interface PlanItem {
  id: string;
  name: string;
  price: number;
  period?: string;
  features?: string[];
  isPopular?: boolean;
  coachName: string;
  coachRole: string;
  coachAvatar: string;
  color?: string;
}


function getTierBadge(price: number): { label: string; color: string } {
  if (price >= 200) return { label: 'Diamond tier', color: CoachColors.accent };
  if (price >= 100) return { label: 'Gold tier', color: CoachColors.accent };
  if (price >= 50) return { label: 'Silver tier', color: CoachColors.textSecondary };
  return { label: 'Bronze tier', color: CoachColors.textSecondary };
}

interface Coach {
  id: string;
  name: string;
  role: string;
  avatar: string;
  specialty: string;
  bio: string;
}

interface CoachPlansShowcaseProps {
  allCoaches?: Coach[];
  onPlanSelect: (plan: PlanItem) => void;
  onPlansLoaded?: (plans: PlanItem[]) => void;
}

export default function CoachPlansShowcase({ allCoaches = [], onPlanSelect, onPlansLoaded }: CoachPlansShowcaseProps) {
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Fetch ALL plans across all trainers (marketplace view, no trainer filter)
        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .order('price', { ascending: false });



        if (data && data.length > 0) {
          const mapped: PlanItem[] = data.map((p: any) => {
            // Resolve coach info from allCoaches by matching trainer_id
            const coach = allCoaches.find(c => c.id === p.trainer_id) || null;

            return {
              id: p.id,
              name: p.name || 'Coaching plan',
              price: typeof p.price === 'number' ? p.price : parseFloat(p.price) || 99,
              period: p.period || 'month',
              features: p.features || [
                'Custom weekly workout plan',
                'Direct coach messaging',
                'Unlock FitLink Pass track',
              ],
              isPopular: p.is_popular || false,
              coachName: coach?.name || 'FitLink Coach',
              coachRole: coach?.role || 'Elite trainer',
              coachAvatar: coach?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
              color: p.color || CoachColors.accent,
            };
          });
          setPlans(mapped);
          onPlansLoaded?.(mapped);
        }
      } catch (err) {
        console.log('Error fetching plans:', err);
      }
      setLoading(false);
    })();
  }, [allCoaches]);
  return (
    <View style={s.section}>
      <Text style={s.tagHeader}>Marketplace // coach plans</Text>
      <Text style={s.title}>Coaching programs</Text>

      {loading && plans.length === 0 ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={CoachColors.textMuted} />
        </View>
      ) : plans.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={s.emptyCard}>
            <Ionicons name="barbell-outline" size={24} color={CoachColors.textMuted} style={{ marginBottom: 8 }} />
            <Text style={s.emptyCardText}>No coaching plans available yet. Check back soon as coaches publish their programs.</Text>
          </View>
        </View>
      ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        snapToInterval={260 + 12}
        decelerationRate="fast"
      >
        {plans.map((plan) => {
          const tier = getTierBadge(plan.price);
          const perSession = Math.round(plan.price / 16);

          return (
            <TouchableOpacity
              key={plan.id}
              style={[s.planCard, plan.isPopular && s.planCardPopular]}
              activeOpacity={0.88}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onPlanSelect(plan);
              }}
              accessibilityRole="button"
              accessibilityLabel={`View ${plan.name} by ${plan.coachName}, $${plan.price}/month`}
            >
              {/* Coach photo hero */}
              <View style={s.cardHero}>
                <Image
                  source={{ uri: plan.coachAvatar }}
                  style={s.cardHeroImg}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.85)']}
                  style={StyleSheet.absoluteFill}
                />

                {/* Tier badge */}
                <View style={[s.tierBadge, { borderColor: tier.color }]}>
                  <Text style={[s.tierBadgeText, { color: tier.color }]}>{tier.label}</Text>
                </View>

                {/* Popular ribbon */}
                {plan.isPopular && (
                  <View style={s.popularRibbon}>
                    <Ionicons name="star" size={8} color={CoachColors.onAccent} />
                    <Text style={s.popularRibbonText}>Popular</Text>
                  </View>
                )}

                {/* Coach name over photo */}
                <View style={s.cardHeroBottom}>
                  <Text style={s.coachName} numberOfLines={1}>{plan.coachName}</Text>
                  <Text style={s.coachRole} numberOfLines={1}>{plan.coachRole}</Text>
                </View>
              </View>

              {/* Plan body */}
              <View style={s.cardBody}>
                {/* Plan name */}
                <Text style={s.planName} numberOfLines={1}>{plan.name}</Text>

                {/* Price */}
                <View style={s.priceRow}>
                  <Text style={s.priceAmount}>${plan.price}</Text>
                  <View style={s.priceSuffix}>
                    <Text style={s.pricePeriod}>/month</Text>
                    <Text style={s.perSessionText}>≈ ${perSession}/session</Text>
                  </View>
                </View>

                {/* CTA */}
                <LinearGradient
                  colors={plan.isPopular ? [CoachColors.accent, CoachColors.accent] : [CoachColors.surfaceRaised, CoachColors.surfaceRaised]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.ctaBtn}
                >
                  <Text style={[s.ctaBtnText, plan.isPopular && { color: CoachColors.onAccent }]}>
                    View dossier →
                  </Text>
                </LinearGradient>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: 24 },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 26,
    color: CoachColors.textPrimary,
    paddingHorizontal: 16,
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  scrollContent: { paddingHorizontal: 16, gap: 12 },

  // ── Card ──────────────────────────────────────────────────────────────────
  planCard: {
    width: 240,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    overflow: 'hidden',
  },
  planCardPopular: {
    borderColor: CoachColors.accent,
  },

  // Coach photo hero
  cardHero: {
    height: 120,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  cardHeroImg: {
    ...StyleSheet.absoluteFillObject,
  },
  cardHeroBottom: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    zIndex: 2,
  },
  coachName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    letterSpacing: -0.2,
  },
  coachRole: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textSecondary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 1,
  },

  // Badges on hero
  popularRibbon: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 5,
  },
  popularRibbonText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 8,
    color: CoachColors.onAccent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tierBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 5,
  },
  tierBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Card body
  cardBody: {
    padding: 14,
  },
  planName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 16,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 14,
  },
  priceAmount: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -1.5,
    lineHeight: 34,
  },
  priceSuffix: {
    paddingBottom: 4,
    gap: 1,
  },
  pricePeriod: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textMuted,
  },
  perSessionText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.accent,
    letterSpacing: 0.3,
  },
  ctaBtn: {
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12,
    color: CoachColors.textPrimary,
    letterSpacing: 1,
  },

  // Empty state
  emptyCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  emptyCardText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
