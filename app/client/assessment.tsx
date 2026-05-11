import { useState, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, ImageBackground, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
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
  {
    id: 'weight',
    title: 'What is your weight?',
    type: 'ruler',
    config: {
      kg: { min: 30, max: 200, default: 70 },
      lbs: { min: 66, max: 440, default: 154 }
    }
  },
  {
    id: 'age',
    title: 'What is your age?',
    type: 'wheel',
    min: 14,
    max: 100,
    default: 18,
  },
];

// --- Custom Ruler Component ---
const TICK_GAP = 10; // distance between short ticks
const TICKS_PER_UNIT = 5; // 5 gaps = 1 unit
const UNIT_WIDTH = TICK_GAP * TICKS_PER_UNIT; // 50px per integer unit

function RulerPicker({ min, max, value, onChange }: { min: number, max: number, value: number, onChange: (v: number) => void }) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const scrollViewRef = useRef<ScrollView>(null);
  const halfWidth = width / 2;
  const numUnits = max - min;
  const totalTicks = numUnits * TICKS_PER_UNIT;

  // Scroll to initial value on mount
  useEffect(() => {
    setTimeout(() => {
      if (scrollViewRef.current) {
        const offset = (value - min) * UNIT_WIDTH;
        scrollViewRef.current.scrollTo({ x: offset, animated: false });
      }
    }, 100); // small delay to ensure layout
  }, [min, max]); // re-run if units change

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    let val = min + Math.round(x / UNIT_WIDTH);
    if (val < min) val = min;
    if (val > max) val = max;
    if (val !== value) onChange(val);
  };

  return (
    <View style={styles.rulerContainer}>
      <View style={styles.rulerPointer} />
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        snapToInterval={UNIT_WIDTH}
        decelerationRate="fast"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: halfWidth,
          alignItems: 'flex-end',
          height: 100,
        }}
      >
        {Array.from({ length: totalTicks + 1 }).map((_, i) => {
          const isTall = i % TICKS_PER_UNIT === 0;
          const currentVal = min + (i / TICKS_PER_UNIT);
          
          return (
            <View key={i} style={[styles.tickWrapper, { width: TICK_GAP }]}>
              <View style={[styles.tick, isTall ? styles.tickTall : styles.tickShort]} />
              {isTall && (
                <Text style={styles.tickLabel}>{currentVal}</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// --- Custom Wheel Component ---
const WHEEL_ITEM_HEIGHT = 80;

function WheelPicker({ min, max, value, onChange }: { min: number, max: number, value: number, onChange: (v: number) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const scrollViewRef = useRef<ScrollView>(null);
  
  const numItems = max - min + 1;
  const items = Array.from({ length: numItems }).map((_, i) => min + i);

  useEffect(() => {
    setTimeout(() => {
      if (scrollViewRef.current) {
        const offset = (value - min) * WHEEL_ITEM_HEIGHT;
        scrollViewRef.current.scrollTo({ y: offset, animated: false });
      }
    }, 100);
  }, [min, max]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    let idx = Math.round(y / WHEEL_ITEM_HEIGHT);
    if (idx < 0) idx = 0;
    if (idx >= numItems) idx = numItems - 1;
    const val = min + idx;
    if (val !== value) onChange(val);
  };

  return (
    <View style={styles.wheelContainer}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        bounces={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingVertical: WHEEL_ITEM_HEIGHT * 2,
        }}
      >
        {items.map((item) => {
          const diff = Math.abs(item - value);
          const isActive = diff === 0;
          const isAdj1 = diff === 1;
          const isAdj2 = diff === 2;

          let fontSize = FontSize.lg;
          let opacity = 0.2;
          if (isActive) { fontSize = 80; opacity = 1; }
          else if (isAdj1) { fontSize = 56; opacity = 0.5; }
          else if (isAdj2) { fontSize = 32; opacity = 0.3; }

          return (
            <View key={item} style={[styles.wheelItem, isActive && styles.wheelItemActive]}>
              <Text style={[
                styles.wheelItemText,
                { fontSize, opacity, color: isActive ? '#FFF' : colors.textTertiary },
                isActive && { letterSpacing: -2 }
              ]}>
                {item}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

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
  
  // Ensure default state for specialized types
  if (question.type === 'ruler' && !answers[question.id]) {
    const unit = 'kg';
    const defVal = (question as any).config[unit].default;
    setAnswers(prev => ({ ...prev, [question.id]: { value: defVal, unit } }));
  } else if (question.type === 'wheel' && !answers[question.id]) {
    setAnswers(prev => ({ ...prev, [question.id]: (question as any).default }));
  }

  const currentAnswer = answers[question.id];
  const canContinue = question.type === 'single' ? !!currentAnswer : true; // Ruler & Wheel always have a value

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

        {question.type === 'ruler' && currentAnswer && (
          <View style={{ flex: 1, marginTop: Spacing.xl }}>
            {/* Unit Toggle */}
            <View style={styles.unitToggle}>
              {Object.keys((question as any).config).map((u) => {
                const isActive = currentAnswer.unit === u;
                return (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitBtn, isActive && styles.unitBtnActive]}
                    onPress={() => {
                      if (isActive) return;
                      // Convert roughly or just switch to default
                      const defVal = (question as any).config[u].default;
                      setAnswers(prev => ({ ...prev, [question.id]: { value: defVal, unit: u } }));
                    }}
                  >
                    <Text style={[styles.unitText, isActive && styles.unitTextActive]}>{u}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Display Value */}
            <View style={styles.valueDisplay}>
              <Text style={styles.valueNumber}>{currentAnswer.value}</Text>
              <Text style={styles.valueUnit}>{currentAnswer.unit}</Text>
            </View>

            {/* Ruler Picker */}
            <RulerPicker
              min={(question as any).config[currentAnswer.unit].min}
              max={(question as any).config[currentAnswer.unit].max}
              value={currentAnswer.value}
              onChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: { ...currentAnswer, value: val } }))}
            />
          </View>
        )}

        {question.type === 'wheel' && currentAnswer && (
          <View style={{ flex: 1, marginTop: Spacing.xl }}>
            <WheelPicker
              min={(question as any).min}
              max={(question as any).max}
              value={currentAnswer}
              onChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
            />
          </View>
        )}

        {(question.type !== 'ruler' && question.type !== 'wheel') && (
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
        )}
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

  // Ruler Styles
  unitToggle: {
    flexDirection: 'row', backgroundColor: colors.bgSecondary,
    borderRadius: Radius.full, padding: 4, marginBottom: Spacing['3xl'],
  },
  unitBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.full },
  unitBtnActive: { backgroundColor: colors.blue, shadowColor: colors.blue, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  unitText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: colors.textSecondary },
  unitTextActive: { color: '#FFF' },

  valueDisplay: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: Spacing['3xl'] },
  valueNumber: { fontFamily: FontFamily.headingExtraBold, fontSize: 80, letterSpacing: -3, color: colors.textPrimary, includeFontPadding: false },
  valueUnit: { fontFamily: FontFamily.bodySemiBold, fontSize: 32, color: colors.textTertiary, marginLeft: 8 },

  rulerContainer: { position: 'relative', height: 120, justifyContent: 'flex-end', marginTop: Spacing.xl },
  rulerPointer: {
    position: 'absolute', top: 0, bottom: 30, width: 8, backgroundColor: colors.accent,
    borderRadius: 4, left: '50%', transform: [{ translateX: -4 }], zIndex: 10,
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4
  },
  tickWrapper: { alignItems: 'flex-start', justifyContent: 'flex-end', height: 100 },
  tick: { backgroundColor: colors.border, borderRadius: 2, transform: [{ translateX: -1 }] }, // -1 to center the 2px tick over the gap start
  tickTall: { width: 2, height: 40, backgroundColor: colors.textTertiary },
  tickShort: { width: 2, height: 20 },
  tickLabel: { position: 'absolute', bottom: -24, width: 40, textAlign: 'center', transform: [{ translateX: -20 }], fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textTertiary },

  // Wheel Styles
  wheelContainer: { height: WHEEL_ITEM_HEIGHT * 5, overflow: 'hidden' },
  wheelItem: { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelItemActive: { backgroundColor: colors.accent, borderRadius: 40, marginHorizontal: Spacing.xl, shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  wheelItemText: { fontFamily: FontFamily.headingExtraBold, includeFontPadding: false },

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
