import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../../constants/theme';
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
  if (price >= 200) return { label: 'DIAMOND TIER', color: '#B9F2FF' };
  if (price >= 100) return { label: 'GOLD TIER', color: '#FFD700' };
  if (price >= 50) return { label: 'SILVER TIER', color: '#C0C0C0' };
  return { label: 'BRONZE TIER', color: '#CD7F32' };
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
              name: p.name || 'Coaching Plan',
              price: typeof p.price === 'number' ? p.price : parseFloat(p.price) || 99,
              period: p.period || 'month',
              features: p.features || [
                'Custom weekly workout plan',
                'Direct coach messaging',
                'Unlock FitLink Pass track',
              ],
              isPopular: p.is_popular || false,
              coachName: coach?.name || 'FitLink Coach',
              coachRole: coach?.role || 'Elite Trainer',
              coachAvatar: coach?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
              color: p.color || '#FFD700',
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
      <Text style={s.tagHeader}>MARKETPLACE // COACH PLANS</Text>
      <Text style={s.title}>Coaching Programs</Text>

      {loading && plans.length === 0 ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
        </View>
      ) : plans.length === 0 ? (
        <View style={{ paddingHorizontal: 16 }}>
          <View style={s.emptyCard}>
            <Ionicons name="barbell-outline" size={24} color="rgba(255,255,255,0.4)" style={{ marginBottom: 8 }} />
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
                    <Ionicons name="star" size={8} color="#000000" />
                    <Text style={s.popularRibbonText}>POPULAR</Text>
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
                  colors={plan.isPopular ? ['#FFD700', '#FF9500'] : ['#1A1A1E', '#1A1A1E']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.ctaBtn}
                >
                  <Text style={[s.ctaBtnText, plan.isPopular && { color: '#000000' }]}>
                    VIEW DOSSIER →
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 26,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  scrollContent: { paddingHorizontal: 16, gap: 12 },

  // ── Card ──────────────────────────────────────────────────────────────────
  planCard: {
    width: 240,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 16,
    overflow: 'hidden',
  },
  planCardPopular: {
    borderColor: '#FFD700',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  coachRole: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
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
    backgroundColor: '#FFD700',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 5,
  },
  popularRibbonText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
    color: '#000000',
    letterSpacing: 1,
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
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
    letterSpacing: 1.2,
  },

  // Card body
  cardBody: {
    padding: 14,
  },
  planName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: -1.5,
    lineHeight: 34,
  },
  priceSuffix: {
    paddingBottom: 4,
    gap: 1,
  },
  pricePeriod: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  perSessionText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#5B7FFF',
    letterSpacing: 0.3,
  },
  ctaBtn: {
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
  },

  // Empty state
  emptyCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 14,
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
