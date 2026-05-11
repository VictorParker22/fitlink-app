import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../constants/theme';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import Button from '../../components/Button';

// Dynamic Question Engine Configuration
const ASSESSMENT_QUESTIONS = [
  {
    id: 'goal',
    title: "What's your fitness goal/target?",
    type: 'single',
    options: [
      { id: 'lose_weight', label: 'I wanna lose weight', icon: 'scale-outline' as any },
      { id: 'ai_coach', label: 'I wanna try AI Coach', icon: 'hardware-chip-outline' as any },
      { id: 'bulk', label: 'I wanna get bulks', icon: 'barbell-outline' as any },
      { id: 'endurance', label: 'I wanna gain endurance', icon: 'pulse-outline' as any },
      { id: 'try_app', label: 'Just trying out the app! 👍', icon: 'phone-portrait-outline' as any },
    ]
  },
  {
    id: 'gender',
    title: 'What is your gender?',
    type: 'single',
    skippable: true,
    options: [
      { id: 'male', label: 'Male', icon: 'male', image: require('../../assets/images/male_runner.png') },
      { id: 'female', label: 'Female', icon: 'female', image: require('../../assets/images/female_runner.png') },
    ]
  },
];

export default function AssessmentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { updateClientAssessment } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const question = ASSESSMENT_QUESTIONS[currentStep];
  const isLastStep = currentStep === ASSESSMENT_QUESTIONS.length - 1;
  const currentAnswer = answers[question.id];
  const canContinue = question.type === 'single' ? !!currentAnswer : (currentAnswer && currentAnswer.length > 0);

  const handleSelect = (optionId: string) => {
    if (question.type === 'single') {
      setAnswers(prev => ({ ...prev, [question.id]: optionId }));
    } else {
      // Handle multi-choice if needed in the future
      const current = answers[question.id] || [];
      if (current.includes(optionId)) {
        setAnswers(prev => ({ ...prev, [question.id]: current.filter((id: string) => id !== optionId) }));
      } else {
        setAnswers(prev => ({ ...prev, [question.id]: [...current, optionId] }));
      }
    }
  };

  const handleNext = async () => {
    if (!canContinue) return;

    if (isLastStep) {
      setSaving(true);
      try {
        await updateClientAssessment(user!.id, answers);
        // After finishing, go to home
        router.replace('/(client-tabs)' as any);
      } catch (error) {
        console.error('Failed to save assessment', error);
      } finally {
        setSaving(false);
      }
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Assessment</Text>
        <View style={styles.progressBadge}>
          <Text style={styles.progressText}>{currentStep + 1} of {ASSESSMENT_QUESTIONS.length}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.questionTitle}>{question.title}</Text>

        <View style={styles.optionsContainer}>
          {question.options.map((option) => {
            const isSelected = question.type === 'single' 
              ? currentAnswer === option.id 
              : (currentAnswer || []).includes(option.id);

            const isImageOption = !!option.image;

            const content = (
              <>
                <View style={[styles.optionContentLeft, isImageOption && styles.optionContentLeftImage]}>
                  {option.icon && (
                    <Ionicons 
                      name={option.icon as any} 
                      size={20} 
                      color={isImageOption ? '#111114' : (isSelected ? '#FFF' : colors.textTertiary)} 
                      style={isImageOption ? { marginRight: 8 } : undefined}
                    />
                  )}
                  <Text style={[
                    styles.optionLabel, 
                    isSelected && !isImageOption && styles.optionLabelActive,
                    isImageOption && { fontSize: FontSize.lg, color: '#111114' }
                  ]}>
                    {option.label}
                  </Text>
                </View>

                {/* Radio Button matching screenshot */}
                <View style={[
                  styles.radioOuter, 
                  isSelected && !isImageOption && styles.radioOuterActive,
                  isImageOption && isSelected && { borderColor: '#111114' },
                  isImageOption && !isSelected && { borderColor: '#666' },
                  isImageOption && { position: 'absolute', bottom: Spacing.md, left: Spacing.md }
                ]}>
                  {isSelected && <View style={[styles.radioInner, isImageOption && { backgroundColor: '#111114' }]} />}
                </View>
              </>
            );

            if (isImageOption) {
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.imageOptionWrapper, isSelected && styles.imageOptionActive]}
                  activeOpacity={0.8}
                  onPress={() => handleSelect(option.id)}
                >
                  <ImageBackground source={option.image} style={styles.imageOptionBg} imageStyle={{ borderRadius: Radius.xl, opacity: 0.9 }}>
                    {content}
                  </ImageBackground>
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.optionBtn, isSelected && styles.optionBtnActive]}
                activeOpacity={0.7}
                onPress={() => handleSelect(option.id)}
              >
                {!isImageOption && option.icon && (
                  <View style={[styles.iconContainer, isSelected && styles.iconContainerActive]}>
                    <Ionicons 
                      name={option.icon as any} 
                      size={20} 
                      color={isSelected ? '#FFF' : colors.textTertiary} 
                    />
                  </View>
                )}
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                  {option.label}
                </Text>
                
                {/* Radio Button */}
                <View style={[styles.radioOuter, isSelected && styles.radioOuterActive]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {(question as any).skippable && (
          <TouchableOpacity style={styles.skipBtn} onPress={() => handleNext()} activeOpacity={0.7}>
            <Text style={styles.skipBtnText}>Prefer to skip, thanks!</Text>
            <Ionicons name="close" size={18} color={colors.accent} />
          </TouchableOpacity>
        )}

        <Button
          title={isLastStep ? (saving ? "Saving..." : "Finish") : "Continue"}
          onPress={handleNext}
          disabled={!canContinue || saving}
          full
          icon={!isLastStep ? <Ionicons name="arrow-forward" size={18} color="#FFF" /> : undefined}
          iconPosition="right"
          style={styles.continueBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: Radius.full,
    backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, color: colors.textPrimary },
  progressBadge: {
    backgroundColor: `${colors.accent}20`, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full,
  },
  progressText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.accent },
  
  content: { padding: Spacing.xl, paddingBottom: 100 },
  questionTitle: {
    fontFamily: FontFamily.headingExtraBold, fontSize: 32, lineHeight: 38,
    color: colors.textPrimary, textAlign: 'center', marginBottom: Spacing['3xl'],
  },

  optionsContainer: { gap: Spacing.md },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgSecondary,
    padding: Spacing.md, borderRadius: Radius.xl,
    borderWidth: 2, borderColor: 'transparent',
  },
  optionBtnActive: {
    backgroundColor: colors.accent, borderColor: colors.accent,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  
  imageOptionWrapper: {
    height: 140, borderRadius: Radius.xl, overflow: 'hidden',
    backgroundColor: '#f5f5f5', borderWidth: 2, borderColor: 'transparent',
  },
  imageOptionActive: { borderColor: colors.accent },
  imageOptionBg: { flex: 1, padding: Spacing.md, justifyContent: 'space-between' },
  
  optionContentLeft: { flexDirection: 'row', alignItems: 'center' },
  optionContentLeftImage: { position: 'absolute', top: Spacing.md, left: Spacing.md },

  iconContainer: {
    width: 36, height: 36, borderRadius: Radius.md,
    backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.md,
  },
  iconContainerActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  optionLabel: { flex: 1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary },
  optionLabelActive: { color: '#FFF' },
  
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.textTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: '#FFF' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFF' },

  footer: {
    padding: Spacing.xl, paddingBottom: Spacing['2xl'],
    backgroundColor: colors.bgPrimary,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: `${colors.accent}15`,
    paddingVertical: 16, borderRadius: Radius.xl,
    marginBottom: Spacing.md,
  },
  skipBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.accent },
  continueBtn: {
    borderRadius: Radius.xl,
    paddingVertical: 18,
  }
});
