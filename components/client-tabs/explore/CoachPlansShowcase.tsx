import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
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
        snapToInterval={280 + 12}
        decelerationRate="fast"
      >
        {plans.map((plan) => {
          const tier = getTierBadge(plan.price);
          const perSession = Math.round(plan.price / 16); // Assuming ~16 sessions per month (4x/week)

          return (
            <TouchableOpacity
              key={plan.id}
              style={[s.planCard, plan.isPopular && s.planCardPopular]}
              activeOpacity={0.9}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onPlanSelect(plan);
              }}
              accessibilityRole="button"
              accessibilityLabel={`View plan: ${plan.name} by ${plan.coachName}`}
            >
              {plan.isPopular && (
                <View style={s.popularRibbon}>
                  <Ionicons name="star" size={10} color="#000000" />
                  <Text style={s.popularRibbonText}>MOST POPULAR</Text>
                </View>
              )}

              {/* Tier badge */}
              <View style={[s.tierBadge, { borderColor: tier.color }]}>
                <Text style={[s.tierBadgeText, { color: tier.color }]}>{tier.label}</Text>
              </View>

              {/* Plan Title & Price */}
              <Text style={s.planName} numberOfLines={1}>{plan.name}</Text>

              <View style={s.priceRow}>
                <Text style={s.priceAmount}>${plan.price}</Text>
                <Text style={s.pricePeriod}>/month</Text>
              </View>
              <Text style={s.perSessionText}>~${perSession}/session (4x weekly)</Text>

              {/* Coach Avatar Row */}
              <View style={s.coachRow}>
                <Image source={{ uri: plan.coachAvatar }} style={s.coachAvatar} cachePolicy="memory-disk" />
                <View style={{ flex: 1 }}>
                  <Text style={s.coachName} numberOfLines={1}>{plan.coachName}</Text>
                  <Text style={s.coachRole} numberOfLines={1}>{plan.coachRole}</Text>
                </View>
              </View>

              {/* Features List */}
              <View style={s.featuresList}>
                {plan.features?.map((feat, i) => (
                  <View key={i} style={s.featRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                    <Text style={s.featText} numberOfLines={1}>{feat}</Text>
                  </View>
                ))}
              </View>

              {/* CTA Button */}
              <View style={[s.ctaBtn, plan.isPopular && s.ctaBtnPopular]}>
                <Text style={[s.ctaBtnText, plan.isPopular && { color: '#000000' }]}>
                  GET STARTED →
                </Text>
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
  planCard: {
    width: 280,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
  },
  planCardPopular: {
    borderColor: '#FFD700',
    backgroundColor: '#101014',
  },
  popularRibbon: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  popularRibbonText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#000000',
    letterSpacing: 1,
  },
  tierBadge: {
    borderWidth: 1,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 10,
  },
  tierBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  planName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 17,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  priceAmount: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  pricePeriod: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  perSessionText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#4D94FF',
    marginBottom: 12,
  },
  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1C1C1E',
    marginBottom: 12,
  },
  coachAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  coachName: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  coachRole: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  featuresList: {
    gap: 6,
    marginBottom: 16,
  },
  featRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  featText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },
  ctaBtn: {
    height: 40,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaBtnPopular: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  ctaBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
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
