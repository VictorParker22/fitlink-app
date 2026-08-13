/**
 * THE DOSSIER — Coach Enrollment Experience
 *
 * Not a wizard. A single immersive brief.
 * Design: Editorial precision — magazine spread meets luxury concierge.
 *
 * Phase 1 (default): The Dossier — coach hero + identity + plan + commit CTA
 * Phase 2 (on commit): The VaultPull cinematic payoff
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  Alert,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useClient } from '../../../context/ClientContext';
import { ClientRoute } from '../../../types/routes';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { StepVaultPull } from './wizard/StepVaultPull';

import type { PlanItem } from './CoachPlansShowcase';

const { height: SCREEN_H } = Dimensions.get('window');
const HERO_H = Math.round(SCREEN_H * 0.38);

// ─── Types ──────────────────────────────────────────────────────────────────

interface Coach {
  id: string;
  name: string;
  role: string;
  avatar: string;
  specialty: string;
  bio: string;
}

interface PlanWizardModalProps {
  visible: boolean;
  plan: PlanItem | null;
  trainerPlans: PlanItem[];
  coach: Coach | null;
  onRequestClose: () => void;
}

// ─── Archetypes ──────────────────────────────────────────────────────────────

const ARCHETYPES = [
  {
    id: 'FORGE',
    label: 'Forge',
    sub: 'Strength & hypertrophy',
    accent: CoachColors.accent,
    icon: 'barbell' as const,
  },
  {
    id: 'VELOCITY',
    label: 'Velocity',
    sub: 'Speed & conditioning',
    accent: CoachColors.accent,
    icon: 'flash' as const,
  },
  {
    id: 'MERIDIAN',
    label: 'Meridian',
    sub: 'Recovery & balance',
    accent: CoachColors.accent,
    icon: 'leaf' as const,
  },
];

function getTierLabel(price: number) {
  if (price >= 200) return { label: 'Diamond', color: CoachColors.accent };
  if (price >= 100) return { label: 'Gold', color: CoachColors.accent };
  if (price >= 50) return { label: 'Silver', color: CoachColors.accent };
  return { label: 'Bronze', color: CoachColors.accent };
}

const DEFAULT_FEATURES = [
  'Custom weekly workout plan',
  'Direct coach messaging',
  'FitLink Pass track access',
];

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400';

// ─── Animated Archetype Row ──────────────────────────────────────────────────

function ArchetypeRow({
  arch,
  selected,
  onPress,
}: {
  arch: typeof ARCHETYPES[0];
  selected: boolean;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(selected ? 1 : 0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: selected ? 1.0 : 1.0,
        useNativeDriver: true,
        friction: 6,
      }),
      Animated.timing(opacityAnim, {
        toValue: selected ? 1 : 0.35,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [selected]);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Select ${arch.label} training identity`}
      style={s.archetypeRow}
    >
      {/* Left accent bar */}
      <View
        style={[
          s.archetypeBar,
          { backgroundColor: selected ? arch.accent : CoachColors.borderMuted },
        ]}
      />

      <Animated.View style={[s.archetypeContent, { opacity: opacityAnim }]}>
        <View style={s.archetypeTextGroup}>
          <Text style={s.archetypeLabel}>{arch.label}</Text>
          <Text style={s.archetypeSub}>{arch.sub}</Text>
        </View>
        <View
          style={[
            s.archetypeIconWrap,
            { backgroundColor: selected ? CoachColors.accentSoft : 'transparent' },
          ]}
        >
          <Ionicons
            name={arch.icon}
            size={18}
            color={selected ? arch.accent : CoachColors.textFaint}
          />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Tier Pill ───────────────────────────────────────────────────────────────

function TierPill({
  plan,
  selected,
  onPress,
}: {
  plan: PlanItem;
  selected: boolean;
  onPress: () => void;
}) {
  const tier = getTierLabel(plan.price);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        s.tierPill,
        selected && { borderColor: tier.color, backgroundColor: CoachColors.accentSoft },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Select ${plan.name} tier at $${plan.price}/month`}
    >
      <Text style={[s.tierPillTier, { color: selected ? tier.color : CoachColors.textMuted }]}>
        {tier.label}
      </Text>
      <Text style={[s.tierPillPrice, { color: selected ? CoachColors.textPrimary : CoachColors.textMuted }]}>
        ${plan.price}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PlanWizardModal({
  visible,
  plan,
  trainerPlans,
  coach,
  onRequestClose,
}: PlanWizardModalProps) {
  const { requestPlanUpgrade } = useClient();
  const router = useRouter();

  // State
  const [archetype, setArchetype] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plan?.id || '');
  const [saving, setSaving] = useState(false);
  const [showVault, setShowVault] = useState(false);

  // Slide-up animation for bottom sheet
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      setArchetype(null);
      setSelectedPlanId(plan?.id || '');
      setSaving(false);
      setShowVault(false);
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 20,
        tension: 120,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H,
        duration: 260,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const selectedPlan = useMemo(() => {
    if (!plan) return null;
    return trainerPlans.find((p) => p.id === selectedPlanId) || plan;
  }, [plan, trainerPlans, selectedPlanId]);

  const features =
    selectedPlan?.features && selectedPlan.features.length > 0
      ? selectedPlan.features
      : DEFAULT_FEATURES;

  const tier = selectedPlan ? getTierLabel(selectedPlan.price) : getTierLabel(0);
  const perSession = selectedPlan ? Math.round(selectedPlan.price / 16) : 0;
  const coachFirstName = (coach?.name || plan?.coachName || 'Coach')
    .split(' ')[0];
  const coachAvatar = coach?.avatar || plan?.coachAvatar || DEFAULT_AVATAR;
  const coachName = coach?.name || plan?.coachName || 'Your Coach';
  const coachRole = coach?.role || plan?.coachRole || 'Elite Trainer';

  // Commit handler — shows Vault animation then saves
  const handleCommit = useCallback(async () => {
    if (saving || !selectedPlan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setShowVault(true);
  }, [saving, selectedPlan]);

  const handleVaultComplete = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await requestPlanUpgrade(selectedPlanId);
      onRequestClose();
      setTimeout(() => {
        router.push(ClientRoute.myPass);
      }, 350);
    } catch (e: any) {
      if (__DEV__) console.warn('[Dossier] Plan upgrade error:', e);
      setShowVault(false);
      Alert.alert(
        'Something went wrong',
        e?.message || 'Failed to activate plan. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setSaving(false);
    }
  }, [saving, selectedPlanId, requestPlanUpgrade, onRequestClose, router]);

  if (!plan || !visible) return null;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onRequestClose}>
      {/* Backdrop */}
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onRequestClose} />

      {/* Animated bottom sheet */}
      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>
        <SafeAreaView style={s.sheetSafe} edges={['bottom']}>
          {/* HIG drag handle — 44pt grab area, 36×5pt pill */}
          <View style={s.dragArea} accessibilityElementsHidden={true}>
            <View style={s.dragHandle} />
          </View>

          {/* ── Vault Phase ─────────────────────────────────────────────── */}
          {showVault && selectedPlan && (
            <View style={StyleSheet.absoluteFill}>
              <StepVaultPull
                plan={{
                  id: selectedPlan.id,
                  name: selectedPlan.name,
                  price: selectedPlan.price,
                  period: selectedPlan.period,
                  color: selectedPlan.color,
                }}
                coachName={coach?.name || selectedPlan.coachName || ''}
                coachAvatar={coachAvatar}
                archetype={archetype}
                saving={saving}
                onComplete={handleVaultComplete}
              />
            </View>
          )}

          {/* ── Dossier Phase ────────────────────────────────────────────── */}
          {!showVault && (
            <>
              <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces
              >
                {/* ── §1 HERO ─────────────────────────────────────────── */}
                <View style={s.hero}>
                  <Image
                    source={{ uri: coachAvatar }}
                    style={s.heroImg}
                    contentFit="cover"
                    transition={300}
                    accessibilityLabel={`${coachName} profile photo`}
                  />
                  <LinearGradient
                    colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)', CoachColors.bg]}
                    locations={[0, 0.5, 1]}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* Close */}
                  <TouchableOpacity
                    style={s.closeBtn}
                    onPress={onRequestClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={20} color={CoachColors.textPrimary} />
                  </TouchableOpacity>

                  {/* Tier badge top-left */}
                  <View style={[s.heroBadge, { borderColor: tier.color }]}>
                    <Text style={[s.heroBadgeText, { color: tier.color }]}>{tier.label}</Text>
                  </View>

                  {/* Coach identity bottom */}
                  <View style={s.heroBottom}>
                    <Text style={s.heroName}>{coachName}</Text>
                    <Text style={s.heroRole}>{coachRole}</Text>
                  </View>
                </View>

                {/* ── §2 IDENTITY ─────────────────────────────────────── */}
                <View style={s.section}>
                  <Text style={s.sectionTag}>01 — Training identity</Text>
                  <Text style={s.sectionHint}>
                    Choose your archetype. Your coach will tailor the program accordingly.
                  </Text>
                </View>

                <View style={s.archetypeList}>
                  {ARCHETYPES.map((arch) => (
                    <ArchetypeRow
                      key={arch.id}
                      arch={arch}
                      selected={archetype === arch.id}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setArchetype(arch.id);
                      }}
                    />
                  ))}
                </View>

                <View style={s.divider} />

                {/* ── §3 PLAN ─────────────────────────────────────────── */}
                <View style={s.section}>
                  <Text style={s.sectionTag}>02 — Your plan</Text>
                </View>

                <View style={s.planBlock}>
                  {/* Plan name */}
                  <Text style={s.planName}>{selectedPlan?.name || plan.name}</Text>

                  {/* Price row */}
                  <View style={s.priceRow}>
                    <Text style={s.priceAmount}>${selectedPlan?.price ?? plan.price}</Text>
                    <View style={s.priceMeta}>
                      <Text style={s.pricePeriod}>/month</Text>
                      <Text style={s.priceSession}>≈ ${perSession}/session</Text>
                    </View>
                  </View>

                  {/* Tier switcher — only shown if multiple plans */}
                  {trainerPlans.length > 1 && (
                    <View style={s.tierRow}>
                      {trainerPlans.map((p) => (
                        <TierPill
                          key={p.id}
                          plan={p}
                          selected={selectedPlanId === p.id}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSelectedPlanId(p.id);
                          }}
                        />
                      ))}
                    </View>
                  )}

                  {/* Divider */}
                  <View style={s.planDivider} />

                  {/* Features */}
                  <View style={s.featuresList}>
                    {features.map((feat, i) => (
                      <View key={i} style={s.featureRow}>
                        <View style={s.featureCheck}>
                          <Ionicons name="checkmark" size={12} color={CoachColors.accent} />
                        </View>
                        <Text style={s.featureText}>{feat}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Bottom padding for sticky CTA */}
                <View style={{ height: 120 }} />
              </ScrollView>

              {/* ── Sticky CTA ──────────────────────────────────────────── */}
              <View style={s.ctaWrap}>
                <View style={s.ctaFade} pointerEvents="none" />
                <TouchableOpacity
                  onPress={handleCommit}
                  activeOpacity={0.88}
                  disabled={saving}
                  style={s.ctaTouchable}
                  accessibilityRole="button"
                  accessibilityLabel={`Commit to ${coachFirstName}'s coaching plan`}
                >
                  <LinearGradient
                    colors={[CoachColors.accent, CoachColors.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s.ctaBtn}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={CoachColors.onAccent} />
                    ) : (
                      <>
                        <Text style={s.ctaText}>Commit to {coachFirstName}</Text>
                        <Ionicons name="arrow-forward" size={18} color={CoachColors.onAccent} />
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                <Text style={s.ctaDisclaimer}>No commitment · cancel anytime</Text>
              </View>
            </>
          )}

        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Backdrop
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.92,
    backgroundColor: CoachColors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheetSafe: {
    flex: 1,
  },
  // HIG drag handle — 44pt tall grab area, 36×5pt centered pill
  dragArea: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: CoachColors.border,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },

  // ── Hero ──
  hero: {
    height: HERO_H,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  heroBadge: {
    position: 'absolute',
    top: 16,
    left: 20,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    zIndex: 10,
  },
  heroBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heroBottom: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 2,
  },
  heroName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 34,
    color: CoachColors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 38,
    marginBottom: 2,
  },
  heroRole: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textSecondary,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },

  // ── Section headers ──
  section: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  sectionTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sectionHint: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
    lineHeight: 17,
  },

  // ── Archetype rows ──
  archetypeList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CoachColors.borderMuted,
  },
  archetypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 68,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CoachColors.borderMuted,
  },
  archetypeBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  archetypeContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  archetypeTextGroup: { gap: 2 },
  archetypeLabel: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  archetypeSub: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textSecondary,
  },
  archetypeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Divider ──
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginTop: 8,
  },

  // ── Plan block ──
  planBlock: {
    marginHorizontal: 20,
    marginTop: 4,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 16,
    padding: 20,
  },
  planName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 14,
  },
  priceAmount: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 48,
    color: CoachColors.textPrimary,
    letterSpacing: -2,
    lineHeight: 52,
  },
  priceMeta: { gap: 2, paddingBottom: 6 },
  pricePeriod: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.textSecondary,
  },
  priceSession: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.accent,
    letterSpacing: 0.3,
  },

  // Tier switcher
  tierRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  tierPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CoachColors.border,
    backgroundColor: CoachColors.surface,
  },
  tierPillTier: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 8,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tierPillPrice: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    letterSpacing: -0.3,
  },

  // Features
  planDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginBottom: 16,
  },
  featuresList: { gap: 10 },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: CoachColors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textPrimary,
    flex: 1,
  },

  // ── Sticky CTA ──
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 8 : 20,
    paddingTop: 12,
    backgroundColor: CoachColors.bg,
  },
  ctaFade: {
    position: 'absolute',
    top: -32,
    left: 0,
    right: 0,
    height: 32,
    backgroundColor: 'transparent',
  },
  ctaTouchable: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
  },
  ctaBtn: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
  ctaDisclaimer: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textFaint,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
