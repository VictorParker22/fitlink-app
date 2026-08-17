import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ImageBackground, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent, Image, PanResponder, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
// react-native's own SafeAreaView is an iOS-only no-op on Android, which left
// this header under the Android status bar. Use the context version instead.
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useClient } from '../../context/ClientContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

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
      { id: 'try_app', label: 'Just trying out the app!', icon: 'phone-portrait-outline' as any },
    ]
  },
  {
    id: 'gender',
    title: 'What is your gender?',
    type: 'single',
    skippable: true,
    options: [
      { id: 'male', label: 'Male', icon: 'male', image: require('../../assets/images/male_runner.jpg') },
      { id: 'female', label: 'Female', icon: 'female', image: require('../../assets/images/female_runner.jpg') },
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
  {
    id: 'previous_experience',
    title: 'Do you have previous fitness experience?',
    type: 'yes_no',
    image: require('../../assets/images/fitness_experience.jpg'),
  },
  {
    id: 'fitness_level',
    title: 'How would you rate your fitness level?',
    type: 'arc_slider',
    min: 1,
    max: 5,
    default: 3,
    labels: {
      1: 'Beginner',
      2: 'Novice',
      3: 'Somewhat athletic',
      4: 'Athletic',
      5: 'Advanced'
    }
  },
  {
    id: 'physical_limitations',
    title: 'Do you have any physical limitations?',
    type: 'tags',
    image: require('../../assets/images/walker.jpg'),
    suggestions: ['Knee pain', 'Muscle pain', 'Arthritis', 'Back pain', 'Asthma', 'Obesity'],
    maxTags: 10,
  },
  {
    id: 'diet_preference',
    title: 'Do you have a specific diet preference?',
    type: 'single',
    layout: 'grid',
    options: [
      { id: 'plant_based', label: 'Plant based', description: 'Vegan', icon: 'leaf' as any },
      { id: 'carbo_diet', label: 'Carbo diet', description: 'Bread, etc', icon: 'fast-food' as any },
      { id: 'specialized', label: 'Specialized', description: 'Paleo, keto, etc', icon: 'restaurant' as any },
      { id: 'traditional', label: 'Traditional', description: 'Fruit diet', icon: 'nutrition' as any },
    ]
  },
  {
    id: 'exercise_preference',
    title: 'Do you have a specific exercise preference?',
    type: 'single',
    layout: 'grid-3',
    options: [
      { id: 'jogging', label: 'Jogging', icon: 'walk-outline' as any },
      { id: 'walking', label: 'Walking', icon: 'accessibility-outline' as any },
      { id: 'hiking', label: 'Hiking', icon: 'trail-sign-outline' as any },
      { id: 'skating', label: 'Skating', icon: 'snow-outline' as any },
      { id: 'biking', label: 'Biking', icon: 'bicycle-outline' as any },
      { id: 'weightlift', label: 'Weightlift', icon: 'barbell-outline' as any },
      { id: 'cardio', label: 'Cardio', icon: 'pulse-outline' as any },
      { id: 'yoga', label: 'Yoga', icon: 'body-outline' as any },
      { id: 'other', label: 'Other', icon: 'ellipsis-horizontal-circle-outline' as any },
    ]
  },
  {
    id: 'commit_days',
    title: 'How many days/wk will you commit?',
    type: 'segmented_number',
    min: 1,
    max: 7,
    default: 5,
  },
  {
    id: 'taking_supplements',
    title: 'Are you taking any supplements?',
    type: 'yes_no',
    image: require('../../assets/images/supplements.jpg'),
  },
  {
    id: 'supplements_list',
    title: 'Specify supplement',
    subtitle: 'Please specify your supplement.',
    type: 'multi',
    layout: 'pill_cloud',
    condition: (answers: Record<string, any>) => answers['taking_supplements'] === true,
    options: [
      { id: 'protein', label: 'Protein' },
      { id: 'whey', label: 'Whey' },
      { id: 'bcaas', label: 'BCAAs' },
      { id: 'vitamin_d', label: 'Vitamin D' },
      { id: 'beta_alanine', label: 'Beta-Alanine' },
      { id: 'tumeric', label: 'Tumeric' },
      { id: 'curcumin', label: 'Curcumin' },
      { id: 'magnesium', label: 'Magnesium' },
      { id: 'iron', label: 'Iron' },
      { id: 'omega_3', label: 'Omega-3' },
      { id: 'omega_6', label: 'Omega-6' },
      { id: 'vitamin_a', label: 'Vitamin A' },
      { id: 'vitamin_b', label: 'Vitamin B' },
      { id: 'vitamin_c', label: 'Vitamin C' },
      { id: 'fiber', label: 'Fiber' },
      { id: 'omega_9', label: 'Omega-9' },
      { id: 'creatine', label: 'Creatine' },
    ]
  },
  {
    id: 'calorie_goal',
    title: "What's your calorie goal per day?",
    type: 'counter',
    config: {
      'Kcal': { min: 500, max: 5000, default: 1550, step: 50, label: 'calories daily' },
      'Joules': { min: 2000, max: 21000, default: 6490, step: 200, label: 'joules daily' },
    }
  },
  {
    id: 'sleep_quality',
    title: "What's your sleep quality like?",
    type: 'single',
    layout: 'badge_list',
    options: [
      { id: 'excellent', label: 'Excellent', badge: '>8 hours' },
      { id: 'great', label: 'Great', badge: '7-8 hours' },
      { id: 'normal', label: 'Normal', badge: '6-7 hours' },
      { id: 'bad', label: 'Bad', badge: '3-4 hours' },
      { id: 'insomniac', label: 'Insomniac', badge: '<2 hours' },
    ]
  },
];

// --- Custom Ruler Component ---
const TICK_GAP = 10; // distance between short ticks
const TICKS_PER_UNIT = 5; // 5 gaps = 1 unit
const UNIT_WIDTH = TICK_GAP * TICKS_PER_UNIT; // 50px per integer unit

function RulerPicker({ min, max, value, onChange }: { min: number, max: number, value: number, onChange: (v: number) => void }) {
  const { width } = useWindowDimensions();
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
      <ScrollView keyboardShouldPersistTaps="handled"
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

          let fontSize = 22;
          let opacity = 0.2;
          if (isActive) { fontSize = 80; opacity = 1; }
          else if (isAdj1) { fontSize = 56; opacity = 0.5; }
          else if (isAdj2) { fontSize = 32; opacity = 0.3; }

          return (
            <View key={item} style={[styles.wheelItem, isActive && styles.wheelItemActive]}>
              <Text style={[
                styles.wheelItemText,
                { fontSize, opacity, color: isActive ? CoachColors.onAccent : CoachColors.textMuted },
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

// --- Custom Arc Slider Component ---
const ARC_HEIGHT = 400;
const ARC_WIDTH = 120;
const P1_X = ARC_WIDTH * 2.2; // pull control point to the right
const THUMB_SIZE = 56;

function ArcSliderPicker({ min, max, value, onChange, labels }: any) {
  const range = max - min;
  
  const [t, setT] = useState((value - min) / range);
  const tRef = useRef(t);
  const startTRef = useRef(t);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startTRef.current = tRef.current;
      },
      onPanResponderMove: (e, gestureState) => {
        let newT = startTRef.current - (gestureState.dy / ARC_HEIGHT);
        if (newT < 0) newT = 0;
        if (newT > 1) newT = 1;
        tRef.current = newT;
        setT(newT);
        
        const val = min + Math.round(newT * range);
        if (val !== value) onChange(val);
      },
      onPanResponderRelease: () => {
        const val = min + Math.round(tRef.current * range);
        const snappedT = (val - min) / range;
        tRef.current = snappedT;
        setT(snappedT);
        onChange(val);
      }
    })
  ).current;

  useEffect(() => {
    const targetT = (value - min) / range;
    tRef.current = targetT;
    setT(targetT);
  }, [value, min, max, range]);

  // Thumb position
  const x = 2 * (1 - t) * t * P1_X;
  const y = ARC_HEIGHT * (1 - t);

  // Ticks path
  let ticksPath = "";
  for (let i = min; i <= max; i++) {
    const tickT = (i - min) / range;
    const tx = 2 * (1 - tickT) * tickT * P1_X;
    const ty = ARC_HEIGHT * (1 - tickT);
    const dx = 2 * P1_X * (1 - 2 * tickT);
    const dy = -ARC_HEIGHT;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = dy / len;
    const ny = -dx / len;
    
    const tickLen = 8;
    ticksPath += ` M ${tx + nx * tickLen} ${ty + ny * tickLen} L ${tx - nx * tickLen} ${ty - ny * tickLen}`;
  }

  const arcPath = `M 0 ${ARC_HEIGHT} Q ${P1_X} ${ARC_HEIGHT / 2} 0 0`;
  const filledHeight = Math.max(0, t * ARC_HEIGHT);

  return (
    <View style={styles.arcContainer}>
      {/* Left side: The Arc Slider */}
      <View style={{ width: ARC_WIDTH, height: ARC_HEIGHT, position: 'relative' }}>
        {/* Background Arc */}
        <Svg width={ARC_WIDTH} height={ARC_HEIGHT} style={{ position: 'absolute' }}>
          <Path d={arcPath} stroke={CoachColors.border} strokeWidth={6} fill="none" strokeLinecap="round" />
          <Path d={ticksPath} stroke={CoachColors.textMuted} strokeWidth={2} />
        </Svg>
        
        {/* Filled Arc */}
        <View style={{ position: 'absolute', bottom: 0, width: ARC_WIDTH, height: filledHeight, overflow: 'hidden' }}>
          <Svg width={ARC_WIDTH} height={ARC_HEIGHT} style={{ position: 'absolute', bottom: 0 }}>
            <Path d={arcPath} stroke={CoachColors.accent} strokeWidth={6} fill="none" strokeLinecap="round" />
          </Svg>
        </View>

        {/* Thumb */}
        <View
          {...panResponder.panHandlers}
          style={[styles.arcThumb, { left: x - THUMB_SIZE / 2, top: y - THUMB_SIZE / 2 }]}
        >
          <View style={styles.arcThumbInner} />
        </View>
      </View>

      {/* Right side: The Value Display */}
      <View style={styles.arcValueDisplay}>
        <Text style={styles.arcValueNumber}>{value}</Text>
        <Text style={styles.arcValueLabel}>{labels[value]}</Text>
      </View>

      {/* Hint */}
      <View style={styles.arcHint}>
        <Ionicons name="help-circle" size={18} color={CoachColors.textMuted} />
        <Text style={styles.arcHintText}>Drag to adjust</Text>
      </View>
    </View>
  );
}

// --- Custom Tags Picker Component ---
function TagsPicker({ question, value, onChange }: any) {
  const [inputText, setInputText] = useState('');
  const tags = value || [];

  const handleAddTag = (tag: string) => {
    if (tag.trim() && tags.length < (question.maxTags || 10) && !tags.includes(tag.trim())) {
      onChange([...tags, tag.trim()]);
    }
    setInputText('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange(tags.filter((t: string) => t !== tagToRemove));
  };

  return (
    <View style={styles.tagsContainer}>
      <View style={styles.tagsInputBox}>
        <View style={styles.tagsList}>
          {tags.map((tag: string) => (
            <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }} key={tag} style={styles.tagItem} onPress={() => handleRemoveTag(tag)}>
              <Text style={styles.tagText}>{tag}</Text>
            </TouchableOpacity>
          ))}
          {tags.length < (question.maxTags || 10) && (
            <TextInput
              style={styles.tagInput}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => handleAddTag(inputText)}
              placeholder={tags.length === 0 ? "Type a limitation..." : ""}
              placeholderTextColor={CoachColors.textMuted}
              returnKeyType="done"
            />
          )}
        </View>
        <View style={styles.tagsFooterBox}>
           <Ionicons name="document-text" size={16} color={CoachColors.textMuted} />
           <Text style={styles.tagsCount}>{tags.length}/{question.maxTags || 10}</Text>
        </View>
      </View>

      {question.suggestions && question.suggestions.length > 0 && (
        <View style={styles.suggestionsRow}>
          <Text style={styles.suggestionsLabel}>Most common:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
             {question.suggestions.filter((s: string) => !tags.includes(s)).map((s: string) => (
               <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }} key={s} style={styles.suggestionItem} onPress={() => handleAddTag(s)}>
                 <Text style={styles.suggestionText}>{s}</Text>
                 <Ionicons name="add" size={16} color={CoachColors.accent} />
               </TouchableOpacity>
             ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

export default function AssessmentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { updateAssessment } = useClient();
  const { width: windowWidth } = useWindowDimensions();

  // Calculate precise grid widths to prevent overlapping
  const containerPadding = 20 * 2;
  const gap = 10;
  const availableWidth = windowWidth - containerPadding;
  const grid2Width = Math.floor((availableWidth - gap) / 2);
  const grid3Width = Math.floor((availableWidth - gap * 2) / 3);

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const question = ASSESSMENT_QUESTIONS[currentStep];
  
  // Find next valid step to determine if this is the last step
  let nextValidStep = -1;
  for (let i = currentStep + 1; i < ASSESSMENT_QUESTIONS.length; i++) {
    if (!(ASSESSMENT_QUESTIONS[i] as any).condition || (ASSESSMENT_QUESTIONS[i] as any).condition(answers)) {
      nextValidStep = i;
      break;
    }
  }
  const isLastValidStep = nextValidStep === -1;
  
  // Ensure default state for specialized types
  if (question.type === 'ruler' && !answers[question.id]) {
    const unit = 'kg';
    const defVal = (question as any).config[unit].default;
    setAnswers(prev => ({ ...prev, [question.id]: { value: defVal, unit } }));
  } else if ((question.type === 'counter') && !answers[question.id]) {
    const firstUnit = Object.keys((question as any).config)[0];
    const defVal = (question as any).config[firstUnit].default;
    setAnswers(prev => ({ ...prev, [question.id]: { value: defVal, unit: firstUnit } }));
  } else if ((question.type === 'wheel' || question.type === 'arc_slider' || question.type === 'segmented_number') && !answers[question.id]) {
    setAnswers(prev => ({ ...prev, [question.id]: (question as any).default }));
  } else if (question.type === 'tags' && !answers[question.id]) {
    setAnswers(prev => ({ ...prev, [question.id]: [] }));
  }

  const currentAnswer = answers[question.id];
  const canContinue = question.type === 'single' ? !!currentAnswer : true; // Custom types always have a value

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

  const handleSelectAndNext = async (val: any) => {
    const newAnswers = { ...answers, [question.id]: val };
    setAnswers(newAnswers);

    // Re-evaluate if the newly answered question makes this the last step
    let nextStepAfterSelect = -1;
    for (let i = currentStep + 1; i < ASSESSMENT_QUESTIONS.length; i++) {
      if (!(ASSESSMENT_QUESTIONS[i] as any).condition || (ASSESSMENT_QUESTIONS[i] as any).condition(newAnswers)) {
        nextStepAfterSelect = i;
        break;
      }
    }

    if (nextStepAfterSelect === -1) {
      setSaving(true);
      try {
        await updateAssessment(newAnswers);
        router.replace('/(client-tabs)' as any);
      } catch (error) {
        console.error('Failed to save assessment', error);
      } finally {
        setSaving(false);
      }
    } else {
      setCurrentStep(nextStepAfterSelect);
    }
  };

  const handleNext = async () => {
    if (!canContinue) return;

    if (isLastValidStep) {
      setSaving(true);
      try {
        await updateAssessment(answers);
        // After finishing, go to home
        router.replace('/(client-tabs)' as any);
      } catch (error) {
        console.error('Failed to save assessment', error);
      } finally {
        setSaving(false);
      }
    } else {
      setCurrentStep(nextValidStep);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      let prevStep = currentStep - 1;
      while (prevStep >= 0) {
        const prevQ = ASSESSMENT_QUESTIONS[prevStep];
        if (!(prevQ as any).condition || (prevQ as any).condition(answers)) {
          break;
        }
        prevStep--;
      }
      
      if (prevStep >= 0) {
        setCurrentStep(prevStep);
      } else {
        router.back();
      }
    } else {
      router.back();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity hitSlop={2} onPress={handleBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={27} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Assessment</Text>
        <View style={styles.progressBadge}>
          <Text style={styles.progressText}>{currentStep + 1} of {ASSESSMENT_QUESTIONS.length}</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.questionTitle}>{question.title}</Text>
        {(question as any).subtitle && (
          <Text style={styles.questionSubtitle}>{(question as any).subtitle}</Text>
        )}

        {question.type === 'ruler' && currentAnswer && (
          <View style={{ flex: 1, marginTop: 20 }}>
            {/* Unit Toggle */}
            <View style={styles.unitToggle}>
              {Object.keys((question as any).config).map((u) => {
                const isActive = currentAnswer.unit === u;
                return (
                  <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
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
          <View style={{ flex: 1, marginTop: 20 }}>
            <WheelPicker
              min={(question as any).min}
              max={(question as any).max}
              value={currentAnswer}
              onChange={(val) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
            />
          </View>
        )}

        {question.type === 'yes_no' && (question as any).image && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
            <Image 
              source={(question as any).image} 
              style={{ width: '100%', height: 350 }} 
              resizeMode="contain" 
            />
          </View>
        )}

        {question.type === 'arc_slider' && currentAnswer && (
          <View style={{ flex: 1, marginTop: 20 }}>
            <ArcSliderPicker
              min={(question as any).min}
              max={(question as any).max}
              value={currentAnswer}
              onChange={(val: number) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
              labels={(question as any).labels}
            />
          </View>
        )}

        {question.type === 'tags' && currentAnswer && (
          <View style={{ flex: 1, marginTop: 10 }}>
            {question.image && (
              <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Image 
                  source={(question as any).image} 
                  style={{ width: '100%', height: 220 }} 
                  resizeMode="contain" 
                />
              </View>
            )}
            <TagsPicker
              question={question}
              value={currentAnswer}
              onChange={(val: string[]) => setAnswers(prev => ({ ...prev, [question.id]: val }))}
            />
          </View>
        )}

        {question.type === 'segmented_number' && currentAnswer && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 40 }}>
            <Text style={styles.massiveSegmentedNumber}>{currentAnswer}x</Text>
            
            <View style={styles.segmentedContainer}>
               <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentedScroll}>
                  {Array.from({ length: (question as any).max - (question as any).min + 1 }).map((_, i) => {
                     const val = (question as any).min + i;
                     const isSelected = val === currentAnswer;
                     return (
                       <TouchableOpacity 
                         key={val} 
                         onPress={() => setAnswers(prev => ({ ...prev, [question.id]: val }))} 
                         style={[styles.segmentedItemBox, isSelected && styles.segmentedItemBoxActive]}
                         activeOpacity={0.8}
                       >
                          <View style={[styles.segmentedItem, isSelected && styles.segmentedItemActive]}>
                            <Text style={[styles.segmentedItemText, isSelected && styles.segmentedItemTextActive]}>{val}</Text>
                          </View>
                       </TouchableOpacity>
                     );
                  })}
               </ScrollView>
            </View>
            
            <Text style={styles.segmentedFooterText}>
               I'm commited to exercising <Text style={{ fontFamily: CoachFonts.bodySemiBold, color: CoachColors.textPrimary }}>{currentAnswer}x</Text> weekly
            </Text>
          </View>
        )}

        {question.type === 'counter' && currentAnswer && (() => {
          const cfg = (question as any).config[currentAnswer.unit];
          return (
            <View style={{ flex: 1, alignItems: 'center', marginTop: 20 }}>
              {/* Unit Toggle */}
              <View style={styles.unitToggle}>
                {Object.keys((question as any).config).map((u) => {
                  const isActive = currentAnswer.unit === u;
                  return (
                    <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                      key={u}
                      style={[styles.unitBtn, isActive && styles.unitBtnActive]}
                      onPress={() => {
                        if (isActive) return;
                        const defVal = (question as any).config[u].default;
                        setAnswers(prev => ({ ...prev, [question.id]: { value: defVal, unit: u } }));
                      }}
                    >
                      <Text style={[styles.unitText, isActive && styles.unitTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Massive Value */}
              <Text style={styles.counterValue}>
                {currentAnswer.value.toLocaleString()}
              </Text>
              <Text style={styles.counterLabel}>{cfg.label}</Text>

              {/* +/- Buttons */}
              <View style={styles.counterBtnRow}>
                <TouchableOpacity
                  style={[styles.counterBtn, styles.counterBtnMinus]}
                  onPress={() => {
                    const newVal = Math.max(cfg.min, currentAnswer.value - cfg.step);
                    setAnswers(prev => ({ ...prev, [question.id]: { ...currentAnswer, value: newVal } }));
                  }}
                  disabled={currentAnswer.value <= cfg.min}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={31} color={CoachColors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.counterBtn, styles.counterBtnPlus]}
                  onPress={() => {
                    const newVal = Math.min(cfg.max, currentAnswer.value + cfg.step);
                    setAnswers(prev => ({ ...prev, [question.id]: { ...currentAnswer, value: newVal } }));
                  }}
                  disabled={currentAnswer.value >= cfg.max}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={31} color={CoachColors.onAccent} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* --- GRID LAYOUT (2-col and 3-col) --- */}
        {(question.type === 'single' || question.type === 'multi') && ((question as any).layout === 'grid' || (question as any).layout === 'grid-3') && (
          <View style={[styles.optionsContainer, styles.optionsGrid]}>
            {(question as any).options.map((option: any) => {
              const isSelected = question.type === 'single'
                ? currentAnswer === option.id
                : (currentAnswer || []).includes(option.id);
              const isGrid3 = (question as any).layout === 'grid-3';

              return (
                <TouchableOpacity
                  key={option.id}
                  style={[
                    styles.gridOption,
                    isGrid3 ? { width: grid3Width, padding: 10 } : { width: grid2Width },
                    isSelected && styles.gridOptionActive
                  ]}
                  onPress={() => handleSelect(option.id)}
                  activeOpacity={0.7}
                >
                  {isGrid3 ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {option.icon && (
                        <Ionicons name={option.icon as any} size={36} color={isSelected ? CoachColors.onAccent : CoachColors.textMuted} />
                      )}
                      <Text style={[styles.gridOptionLabel3, isSelected && { color: CoachColors.onAccent }]}>{option.label}</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.gridOptionLabel, isSelected && { color: CoachColors.onAccent }]}>{option.label}</Text>
                      {option.description && (
                        <Text style={[styles.gridOptionDesc, isSelected && { color: CoachColors.onAccent }]}>{option.description}</Text>
                      )}
                      {option.icon && (
                        <View style={styles.gridOptionIconWrapper}>
                          <Ionicons name={option.icon as any} size={27} color={isSelected ? CoachColors.onAccent : CoachColors.textMuted} />
                        </View>
                      )}
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* --- BADGE LIST LAYOUT --- */}
        {(question.type === 'single' || question.type === 'multi') && (question as any).layout === 'badge_list' && (
          <View style={styles.optionsContainer}>
            {(question as any).options.map((option: any) => {
              const isSelected = question.type === 'single'
                ? currentAnswer === option.id
                : (currentAnswer || []).includes(option.id);
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.badgeListItem, isSelected && styles.badgeListItemActive]}
                  onPress={() => handleSelect(option.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.badgeListLabel, isSelected && { color: CoachColors.onAccent }]}>{option.label}</Text>
                  <View style={{ flex: 1 }} />
                  <View style={[styles.badgePill, isSelected && styles.badgePillActive]}>
                    <Ionicons name="time-outline" size={16} color={isSelected ? CoachColors.onAccent : CoachColors.textMuted} />
                    <Text style={[styles.badgePillText, isSelected && { color: CoachColors.accent }]}>{(option as any).badge}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* --- PILL CLOUD LAYOUT --- */}
        {(question.type === 'single' || question.type === 'multi') && (question as any).layout === 'pill_cloud' && (
          <View style={[styles.optionsContainer, { marginTop: 10 }]}>
            <View style={styles.cloudHeaderRow}>
              <Text style={styles.cloudHeaderTitle}>Most common</Text>
              <TouchableOpacity>
                <Text style={styles.cloudHeaderLink}>See all supplements</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pillCloud}>
              {(question as any).options.map((option: any) => {
                const isSelected = (currentAnswer || []).includes(option.id);
                return (
                  <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                    key={option.id}
                    style={[styles.cloudPill, isSelected && styles.cloudPillActive]}
                    onPress={() => handleSelect(option.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cloudPillText, isSelected && styles.cloudPillTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {currentAnswer && currentAnswer.length > 0 && (
              <View style={styles.cloudSelectedContainer}>
                <Text style={styles.cloudSelectedLabel}>Selected</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }}>
                  {currentAnswer.map((id: string) => {
                    const opt = (question as any).options.find((o: any) => o.id === id);
                    return (
                      <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }} key={id} style={styles.cloudSelectedChip} onPress={() => handleSelect(id)}>
                        <Text style={styles.cloudSelectedChipText}>{opt?.label}</Text>
                        <Ionicons name="close" size={16} color={CoachColors.accent} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* --- DEFAULT LIST LAYOUT (radio buttons) --- */}
        {(question.type === 'single' || question.type === 'multi') && !(question as any).layout && (
          <View style={styles.optionsContainer}>
            {(question as any).options.map((option: any) => {
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
                        color={isImageOption ? CoachColors.onAccent : (isSelected ? CoachColors.onAccent : CoachColors.textMuted)}
                        style={isImageOption ? { marginRight: 8 } : undefined}
                      />
                    )}
                    <Text style={[
                      styles.optionLabel,
                      isSelected && !isImageOption && styles.optionLabelActive,
                      isImageOption && { fontSize: 24.5, color: CoachColors.onAccent }
                    ]}>
                      {option.label}
                    </Text>
                  </View>

                  <View style={[
                    styles.radioOuter,
                    isSelected && !isImageOption && styles.radioOuterActive,
                    isImageOption && isSelected && { borderColor: CoachColors.onAccent },
                    isImageOption && !isSelected && { borderColor: CoachColors.onAccent },
                    isImageOption && { position: 'absolute', bottom: 10, left: 10 }
                  ]}>
                    {isSelected && <View style={[styles.radioInner, isImageOption && { backgroundColor: CoachColors.onAccent }]} />}
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
                    <ImageBackground source={option.image} style={styles.imageOptionBg} imageStyle={{ borderRadius: 20, opacity: 0.9 }}>
                      {content}
                    </ImageBackground>
                  </TouchableOpacity>
                );
              }

              return (
                <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
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
                        color={isSelected ? CoachColors.onAccent : CoachColors.textMuted}
                      />
                    </View>
                  )}
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                    {option.label}
                  </Text>
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
        {question.type === 'yes_no' ? (
          <View style={styles.yesNoFooter}>
            <TouchableOpacity 
              style={[styles.yesNoBtn, { backgroundColor: CoachColors.surface }]}
              onPress={() => handleSelectAndNext(false)}
              disabled={saving}
            >
              <Text style={[styles.yesNoBtnText, { color: CoachColors.textSecondary }]}>No</Text>
              <Ionicons name="close" size={22} color={CoachColors.textSecondary} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.yesNoBtn, { backgroundColor: CoachColors.accent }]}
              onPress={() => handleSelectAndNext(true)}
              disabled={saving}
            >
              <Text style={[styles.yesNoBtnText, { color: CoachColors.onAccent }]}>Yes</Text>
              <Ionicons name="checkmark" size={22} color={CoachColors.onAccent} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {(question as any).skippable && (
              <TouchableOpacity style={styles.skipBtn} onPress={() => handleNext()} activeOpacity={0.7}>
                <Text style={styles.skipBtnText}>Prefer to skip, thanks!</Text>
                <Ionicons name="close" size={20} color={CoachColors.accent} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.continueBtn, (!canContinue || saving) && { opacity: 0.5 }]}
              onPress={handleNext}
              disabled={!canContinue || saving}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={isLastValidStep ? 'Finish assessment' : 'Continue'}
            >
              <Text style={styles.continueBtnText}>
                {isLastValidStep ? (saving ? 'Saving...' : 'Finish') : 'Continue'}
              </Text>
              {!isLastValidStep && <Ionicons name="arrow-forward" size={20} color={CoachColors.onAccent} />}
            </TouchableOpacity>
          </>
        )}
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 999,
    backgroundColor: CoachColors.surface, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textPrimary },
  progressBadge: { backgroundColor: CoachColors.accentSoft, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  progressText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.accent },
  content: { padding: 20, paddingBottom: 100 },
  questionTitle: { fontFamily: CoachFonts.headingBold, fontSize: 31.5, color: CoachColors.textPrimary, textAlign: 'center', marginBottom: 4 },
  questionSubtitle: { fontFamily: CoachFonts.body, fontSize: 19, color: CoachColors.textMuted, textAlign: 'center', marginBottom: 28 },

  optionsContainer: { gap: 10, marginTop: 20 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: CoachColors.surface,
    padding: 10, borderRadius: 20,
    borderWidth: 2, borderColor: 'transparent',
  },
  optionBtnActive: {
    backgroundColor: CoachColors.accent, borderColor: CoachColors.accent,
    shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  
  imageOptionWrapper: {
    height: 140, borderRadius: 20, overflow: 'hidden',
    backgroundColor: CoachColors.surface, borderWidth: 2, borderColor: 'transparent',
  },
  imageOptionActive: { borderColor: CoachColors.accent },
  imageOptionBg: { flex: 1, padding: 10, justifyContent: 'space-between' },
  
  optionContentLeft: { flexDirection: 'row', alignItems: 'center' },
  optionContentLeftImage: { position: 'absolute', top: 10, left: 10 },

  iconContainer: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: CoachColors.borderMuted, alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  iconContainerActive: { backgroundColor: CoachColors.onAccent },
  optionLabel: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 19, color: CoachColors.textPrimary },
  optionLabelActive: { color: CoachColors.onAccent },
  radioOuter: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  radioOuterActive: { borderColor: CoachColors.onAccent },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: CoachColors.onAccent },
  
  // Grid Layout Styles
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridOption: {
    aspectRatio: 1, // square
    backgroundColor: CoachColors.surface,
    borderRadius: 20,
    padding: 20,
    position: 'relative'
  },
  gridOptionActive: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
    borderWidth: 4,
  },
  gridOptionLabel: { fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary, marginBottom: 4 },
  gridOptionLabel3: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textSecondary, textAlign: 'center' },
  gridOptionDesc: { fontFamily: CoachFonts.body, fontSize: 17, color: CoachColors.textMuted },
  gridOptionIconWrapper: { position: 'absolute', bottom: 20, right: 20 },

  // Pill Cloud Styles
  cloudHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 },
  cloudHeaderTitle: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.textPrimary },
  cloudHeaderLink: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.accent },
  pillCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 4 },
  cloudPill: { backgroundColor: CoachColors.surface, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  cloudPillActive: { backgroundColor: CoachColors.accent, shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  cloudPillText: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.textSecondary },
  cloudPillTextActive: { color: CoachColors.onAccent },
  cloudSelectedContainer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 40 },
  cloudSelectedLabel: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textPrimary },
  cloudSelectedChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: CoachColors.accentSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  cloudSelectedChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.accent },

  // Ruler Styles
  unitToggle: {
    flexDirection: 'row', backgroundColor: CoachColors.surface,
    borderRadius: 999, padding: 4, marginBottom: 40,
  },
  unitBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 999 },
  unitBtnActive: { backgroundColor: CoachColors.accent, shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2 },
  unitText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 19, color: CoachColors.textSecondary },
  unitTextActive: { color: CoachColors.onAccent },

  valueDisplay: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 40 },
  valueNumber: { fontFamily: CoachFonts.headingBold, fontSize: 89.5, letterSpacing: -3, color: CoachColors.textPrimary, includeFontPadding: false },
  valueUnit: { fontFamily: CoachFonts.bodySemiBold, fontSize: 36, color: CoachColors.textMuted, marginLeft: 8 },

  rulerContainer: { position: 'relative', height: 120, justifyContent: 'flex-end', marginTop: 20 },
  rulerPointer: {
    position: 'absolute', top: 0, bottom: 30, width: 8, backgroundColor: CoachColors.accent,
    borderRadius: 4, left: '50%', transform: [{ translateX: -4 }], zIndex: 10,
    shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4
  },
  tickWrapper: { alignItems: 'flex-start', justifyContent: 'flex-end', height: 100 },
  tick: { backgroundColor: CoachColors.border, borderRadius: 2, transform: [{ translateX: -1 }] }, // -1 to center the 2px tick over the gap start
  tickTall: { width: 2, height: 40, backgroundColor: CoachColors.textMuted },
  tickShort: { width: 2, height: 20 },
  tickLabel: { position: 'absolute', bottom: -24, width: 40, textAlign: 'center', transform: [{ translateX: -20 }], fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textMuted },

  // Wheel Styles
  wheelContainer: { height: WHEEL_ITEM_HEIGHT * 5, overflow: 'hidden' },
  wheelItem: { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelItemActive: { backgroundColor: CoachColors.accent, borderRadius: 40, marginHorizontal: 20, shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  wheelItemText: { fontFamily: CoachFonts.headingBold, includeFontPadding: false },

  // Arc Slider Styles
  arcContainer: { flexDirection: 'row', alignItems: 'center', height: ARC_HEIGHT, position: 'relative' },
  arcThumb: {
    width: THUMB_SIZE, height: THUMB_SIZE, backgroundColor: CoachColors.accent,
    borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 6
  },
  arcThumbInner: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: CoachColors.onAccent },
  arcValueDisplay: { flex: 1, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 10 },
  arcValueNumber: { fontFamily: CoachFonts.headingBold, fontSize: 157, lineHeight: 168, letterSpacing: -8, color: CoachColors.textPrimary, includeFontPadding: false },
  arcValueLabel: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textSecondary, textAlign: 'right', marginTop: -10 },
  arcHint: { position: 'absolute', top: -40, left: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  arcHintText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textMuted },

  // Tags Styles
  tagsContainer: { flex: 1 },
  tagsInputBox: { borderWidth: 2, borderColor: CoachColors.accent, borderRadius: 20, padding: 16, minHeight: 168 },
  tagsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagItem: { backgroundColor: CoachColors.accentSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  tagText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.accent },
  tagInput: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17, color: CoachColors.textPrimary, minWidth: 100, paddingVertical: 10 },
  tagsFooterBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 'auto', paddingTop: 10 },
  tagsCount: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textMuted },
  suggestionsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 10 },
  suggestionsLabel: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textSecondary },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CoachColors.accentSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  suggestionText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.accent },

  // Segmented Number Styles
  massiveSegmentedNumber: { fontFamily: CoachFonts.headingBold, fontSize: 179, lineHeight: 179, letterSpacing: -10, color: CoachColors.textPrimary, includeFontPadding: false },
  segmentedContainer: { backgroundColor: CoachColors.surface, borderRadius: 100, marginTop: 40, marginBottom: 28 },
  segmentedScroll: { padding: 4, alignItems: 'center' },
  segmentedItemBox: { padding: 4, borderRadius: 100 },
  segmentedItemBoxActive: { backgroundColor: CoachColors.accentSoft },
  segmentedItem: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  segmentedItemActive: { backgroundColor: CoachColors.accent, shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
  segmentedItemText: { fontFamily: CoachFonts.headingBold, fontSize: 24.5, color: CoachColors.textMuted },
  segmentedItemTextActive: { color: CoachColors.onAccent },
  segmentedFooterText: { fontFamily: CoachFonts.body, fontSize: 20, color: CoachColors.textSecondary },

  // Counter Styles
  counterValue: { fontFamily: CoachFonts.headingBold, fontSize: 89.5, letterSpacing: -3, color: CoachColors.textPrimary, includeFontPadding: false, marginTop: 40 },
  counterLabel: { fontFamily: CoachFonts.body, fontSize: 20, color: CoachColors.textSecondary, marginTop: 4 },
  counterBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 40 },
  counterBtn: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  counterBtnMinus: { backgroundColor: CoachColors.surface },
  counterBtnPlus: { backgroundColor: CoachColors.accent, shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },

  // Badge List Styles
  badgeListItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: CoachColors.surface, borderRadius: 20,
    paddingVertical: 16, paddingHorizontal: 20,
  },
  badgeListItemActive: {
    backgroundColor: CoachColors.accent,
    shadowColor: CoachColors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  badgeListLabel: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textPrimary },
  badgePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CoachColors.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgePillActive: { backgroundColor: CoachColors.onAccent },
  badgePillText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textMuted },

  footer: {
    // edges={['bottom']} on the SafeAreaView already supplies the home-indicator
    // inset — this is breathing room only (was 28, which stacked on top of it).
    padding: 20, paddingBottom: 12,
    backgroundColor: CoachColors.bg,
    borderTopWidth: 1, borderTopColor: CoachColors.border,
  },
  yesNoFooter: { flexDirection: 'row', gap: 10 },
  yesNoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    paddingVertical: 18, borderRadius: 20,
  },
  yesNoBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 24.5 },

  skipBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: CoachColors.accentSoft,
    paddingVertical: 16, borderRadius: 20,
    marginBottom: 10,
  },
  skipBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 19, color: CoachColors.accent },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CoachColors.accent,
    borderRadius: 20,
    paddingVertical: 18,
  },
  continueBtnText: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.onAccent }
});
