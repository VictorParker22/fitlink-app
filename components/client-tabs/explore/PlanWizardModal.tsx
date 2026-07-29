import React, { useState, useCallback, useMemo } from 'react';
import { View, Modal, StyleSheet, SafeAreaView, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useClient } from '../../../context/ClientContext';
import { ClientRoute } from '../../../types/routes';

import WizardProgressBar from './wizard/WizardProgressBar';
import StepArchetype from './wizard/StepArchetype';
import { StepCoachProfile } from './wizard/StepCoachProfile';
import { StepPassJourney } from './wizard/StepPassJourney';
import { StepTierSelect } from './wizard/StepTierSelect';
import { StepVaultPull } from './wizard/StepVaultPull';

import type { PlanItem } from './CoachPlansShowcase';

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
  /** All plans from the same trainer (for tier selection step) */
  trainerPlans: PlanItem[];
  coach: Coach | null;
  onRequestClose: () => void;
}

const TOTAL_STEPS = 5;

export default function PlanWizardModal({
  visible,
  plan,
  trainerPlans,
  coach,
  onRequestClose,
}: PlanWizardModalProps) {
  const { requestPlanUpgrade } = useClient();
  const router = useRouter();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0);
  const [archetype, setArchetype] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plan?.id || '');

  // Reset wizard state when modal opens
  React.useEffect(() => {
    if (visible && plan) {
      setCurrentStep(0);
      setArchetype(null);
      setSelectedPlanId(plan.id);
    }
  }, [visible, plan]);

  const goNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  }, []);

  const goBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleArchetypeSelect = useCallback((arch: string) => {
    setArchetype(arch);
  }, []);

  const handlePlanSelect = useCallback((planId: string) => {
    setSelectedPlanId(planId);
  }, []);

  const handleVaultComplete = useCallback(async () => {
    try {
      await requestPlanUpgrade(selectedPlanId);
    } catch (e) {
      if (__DEV__) console.warn('[PlanWizardModal] Plan upgrade error:', e);
    }
    onRequestClose();
    // Navigate to the Pass page after a short delay to let the modal dismiss
    setTimeout(() => {
      router.push(ClientRoute.myPass);
    }, 350);
  }, [selectedPlanId, requestPlanUpgrade, onRequestClose, router]);

  // Prepare coach profile data
  const coachProfileData = useMemo(() => {
    if (!coach) return null;
    return {
      id: coach.id,
      name: coach.name,
      role: coach.role,
      avatar: coach.avatar,
      specialty: coach.specialty,
      bio: coach.bio,
    };
  }, [coach]);

  // Prepare plan data for coach profile step
  const planData = useMemo(() => {
    if (!plan) return { id: '', name: '', price: 0 };
    return {
      id: plan.id,
      name: plan.name,
      price: plan.price,
      period: plan.period,
      features: plan.features,
      color: plan.color,
    };
  }, [plan]);

  // Get the selected plan for vault pull
  const vaultPlan = useMemo(() => {
    const found = trainerPlans.find((p) => p.id === selectedPlanId);
    return found || plan;
  }, [trainerPlans, selectedPlanId, plan]);

  // Build track from plan (if it has one) — fallback to empty
  const track = useMemo(() => {
    // The plan from the CoachPlansShowcase doesn't include track data
    // StepPassJourney has its own default track fallback
    return [];
  }, []);

  if (!plan || !visible) return null;

  const showBackButton = currentStep > 0 && currentStep < 4; // No back on first step or vault pull

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={s.keyboardView}
      >
        <SafeAreaView style={s.safe}>
          <View style={s.container}>
            {/* Header — progress bar + close */}
            {currentStep < 4 && (
              <View style={s.header}>
                {showBackButton ? (
                  <TouchableOpacity onPress={goBack} style={s.headerBtn}>
                    <Ionicons name="chevron-back" size={22} color="#FFF" />
                  </TouchableOpacity>
                ) : (
                  <View style={s.headerBtn} />
                )}

                <View style={s.progressContainer}>
                  <WizardProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS} />
                </View>

                <TouchableOpacity onPress={onRequestClose} style={s.headerBtn}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>
            )}

            {/* Step content */}
            <ScrollView
              style={s.content}
              contentContainerStyle={s.contentContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={currentStep !== 4}
              scrollEnabled={currentStep !== 4}
            >
              {currentStep === 0 && (
                <StepArchetype
                  selectedArchetype={archetype}
                  onSelect={handleArchetypeSelect}
                  onContinue={goNext}
                />
              )}

              {currentStep === 1 && (
                <StepCoachProfile
                  coach={coachProfileData}
                  plan={planData}
                  archetype={archetype}
                  onContinue={goNext}
                />
              )}

              {currentStep === 2 && (
                <StepPassJourney
                  track={track}
                  onContinue={goNext}
                />
              )}

              {currentStep === 3 && (
                <StepTierSelect
                  plans={trainerPlans}
                  selectedPlanId={selectedPlanId}
                  archetype={archetype}
                  onSelectPlan={handlePlanSelect}
                  onContinue={goNext}
                />
              )}

              {currentStep === 4 && vaultPlan && (
                <StepVaultPull
                  plan={{
                    id: vaultPlan.id,
                    name: vaultPlan.name,
                    price: vaultPlan.price,
                    period: vaultPlan.period,
                    color: vaultPlan.color,
                  }}
                  coachName={vaultPlan.coachName || coach?.name || ''}
                  coachAvatar={vaultPlan.coachAvatar || coach?.avatar || ''}
                  archetype={archetype}
                  onComplete={handleVaultComplete}
                />
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
});
