import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, Image, TouchableOpacity,
  ScrollView, StatusBar, Animated, Platform, Modal, TouchableWithoutFeedback,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Spacing, FontFamily } from '../../constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TOTAL_DATA_STEPS = 5;
const TOTAL_STEPS = 6;

const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// --- Data ---
const FITNESS_GOALS = [
  'Build muscle', 'Develop endurance', 'Get over an injury', 'Get stronger',
  'Improve overall health', 'Increase flexibility', 'Relieve stress', 'Tone up',
  'Lose weight', 'Improve posture',
];

const TRAINING_STYLES = [
  '1-on-1 with a coach', 'Solo workouts', 'Small group sessions',
  'Online / virtual', 'In-person at gym', 'Something else',
];

const ACTIVITIES = [
  'Strength', 'HIIT', 'Yoga', 'Pilates', 'Boxing', 'Running',
  'Swimming', 'Cycling', 'Golf', 'Meditation', 'Stretching',
  'CrossFit', 'Dance', 'Martial Arts', 'Walking', 'Rowing',
];

const GENDER_OPTIONS = ['Man', 'Woman', 'Non-binary', 'Prefer not to say'];
const WEEKLY_GOALS = [1, 2, 3, 4, 5, 6, 7];

// ===== Custom scroll wheel — renders initial value immediately (no blank state) =====
function ScrollWheel({ items, selectedIndex, onSelect, suffix }: {
  items: string[]; selectedIndex: number; onSelect: (index: number) => void; suffix?: string;
}) {
  const flatListRef = useRef<FlatList>(null);
  const currentIndex = useRef(selectedIndex);
  const hasScrolled = useRef(false);

  // Scroll to initial selection once mounted
  useEffect(() => {
    if (!hasScrolled.current) {
      hasScrolled.current = true;
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: selectedIndex * ITEM_HEIGHT, animated: false });
      }, 50);
    }
  }, []);

  const handleMomentumEnd = useCallback((e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    if (clamped !== currentIndex.current) {
      currentIndex.current = clamped;
      onSelect(clamped);
    }
  }, [items.length, onSelect]);

  const renderItem = useCallback(({ item, index }: { item: string; index: number }) => (
    <View style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{
        color: '#FFFFFF',
        fontSize: 22,
        fontFamily: FontFamily.body,
        opacity: Math.abs(index - currentIndex.current) === 0 ? 1 : 0.3,
      }}>
        {item}{suffix ? ` ${suffix}` : ''}
      </Text>
    </View>
  ), [suffix]);

  // Add padding items so the first/last items can be centered
  const paddingCount = Math.floor(VISIBLE_ITEMS / 2);

  return (
    <View style={{ flex: 1, height: PICKER_HEIGHT, overflow: 'hidden' }}>
      {/* Selection highlight bar */}
      <View pointerEvents="none" style={{
        position: 'absolute', top: ITEM_HEIGHT * paddingCount, left: 8, right: 8,
        height: ITEM_HEIGHT, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, zIndex: 1,
      }} />
      <FlatList
        ref={flatListRef}
        data={items}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumEnd}
        getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * paddingCount }}
        initialScrollIndex={selectedIndex}
      />
    </View>
  );
}

// ===== Extracted bottom-sheet — defined at module scope so React
//       never remounts it when the parent's state changes. =====
function PickerSheet({ visible, onDone, title, leftToggle, children }: {
  visible: boolean; onDone: () => void; title: string;
  leftToggle?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide">
      <TouchableWithoutFeedback onPress={onDone}>
        <View style={sheetStyles.overlay} />
      </TouchableWithoutFeedback>
      <View style={sheetStyles.container}>
        <View style={sheetStyles.header}>
          <View style={sheetStyles.headerSide}>{leftToggle || <View />}</View>
          <Text style={sheetStyles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={onDone} style={sheetStyles.headerSide} accessibilityRole="button">
            <Text style={sheetStyles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </Modal>
  );
}

function CompletionBurst({ name }: { name: string }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      // Circle bursts in
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 12 }),
        Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]),
      // Text fades in
      Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <>
      <Animated.View style={[completionStyles.checkRing, { transform: [{ scale }], opacity }]}>
        <View style={completionStyles.checkInner}>
          <Ionicons name="checkmark" size={56} color="#FF6B35" />
        </View>
      </Animated.View>
      <Animated.Text style={[completionStyles.title, { opacity: textOpacity }]}>
        {name ? `You're all set,\n${name}!` : "You're all set!"}
      </Animated.Text>
      <Animated.Text style={[completionStyles.sub, { opacity: textOpacity }]}>
        Your profile is ready. Get matched with your coach and start your journey.
      </Animated.Text>
    </>
  );
}

export default function ClientOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState('');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const [showCompletion, setShowCompletion] = useState(false);

  useEffect(() => {
    if (!showCompletion) return;
    const timer = setTimeout(() => {
      router.replace('/(client-tabs)');
    }, 2000);
    return () => clearTimeout(timer);
  }, [showCompletion]);

  // Step 1: About You
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [tempDate, setTempDate] = useState(new Date(2000, 0, 1));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [weightLbs, setWeightLbs] = useState(175);
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
  const [weightSet, setWeightSet] = useState(false);
  const [showWeightPicker, setShowWeightPicker] = useState(false);

  const [heightFt, setHeightFt] = useState(5);
  const [heightIn, setHeightIn] = useState(8);
  const [heightUnit, setHeightUnit] = useState<'ft' | 'cm'>('ft');
  const [heightSet, setHeightSet] = useState(false);
  const [showHeightPicker, setShowHeightPicker] = useState(false);

  const [gender, setGender] = useState('');
  const [tempGender, setTempGender] = useState('Prefer not to say');
  const [showGenderPicker, setShowGenderPicker] = useState(false);



  // Step 2-4
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);

  // Step 5
  const [weeklyGoal, setWeeklyGoal] = useState(3);
  const goalScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.user_metadata?.name) setUserName(user.user_metadata.name.split(' ')[0]);
    })();
  }, []);

  const animateTransition = (cb: () => void) => {
    Animated.timing(slideAnim, { toValue: -SCREEN_WIDTH, duration: 250, useNativeDriver: true }).start(() => {
      cb();
      slideAnim.setValue(SCREEN_WIDTH);
      Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    });
  };

  const nextStep = () => {
    if (step < TOTAL_STEPS) animateTransition(() => setStep(step + 1));
    else completeOnboarding();
  };

  const prevStep = () => {
    if (step > 1) animateTransition(() => setStep(step - 1));
  };

  const editSection = (targetStep: number) => {
    animateTransition(() => setStep(targetStep));
  };

  const skipOnboarding = () => completeOnboarding();

  const [saving, setSaving] = useState(false);
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const dot4 = useRef(new Animated.Value(0)).current;

  const startDotAnimation = () => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -12, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      );
    animate(dot1, 0).start();
    animate(dot2, 150).start();
    animate(dot3, 300).start();
    animate(dot4, 450).start();
  };

  const weightDisplay = weightSet ? (weightUnit === 'lbs' ? `${weightLbs} lbs` : `${Math.round(weightLbs * 0.453592)} kg`) : '';
  const heightDisplay = heightSet ? `${heightFt}'${heightIn}"` : '';

  const completeOnboarding = async () => {
    // Save all data to Supabase
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      setSaving(true);
      // Find the user's client row and update with all collected data
      const updatePayload: Record<string, any> = {};
      
      if (selectedGoals.length > 0) updatePayload.goals = selectedGoals.join(', ');
      if (selectedActivities.length > 0) updatePayload.preferred_activities = selectedActivities;
      if (birthday) updatePayload.birthday = birthday.toISOString().split('T')[0];
      if (weightSet) updatePayload.weight_lbs = weightUnit === 'lbs' ? weightLbs : Math.round(weightLbs * 2.20462);
      if (heightSet) updatePayload.height_inches = heightUnit === 'ft' ? (heightFt * 12 + heightIn) : Math.round(heightIn / 2.54);
      if (gender) updatePayload.gender = gender;
      updatePayload.weekly_goal = weeklyGoal;
      updatePayload.fitness_goals = selectedGoals;
      updatePayload.training_preferences = selectedStyles;

      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from('clients')
          .update(updatePayload)
          .eq('user_id', user.id);
      }
    } catch (e) {
      // Non-critical — proceed to completion anyway
      console.warn('[ClientOnboarding] Failed to save profile data:', e);
    } finally {
      setSaving(false);
    }

    // Mark onboarded
    await SecureStore.setItemAsync('fitlink_client_onboarded', 'true');
    try {
      await supabase.auth.updateUser({ data: { client_onboarded: true } });
    } catch (e) {
      // Non-critical
    }

    // Show completion screen, then navigate
    setShowCompletion(true);
  };

  const toggleArrayItem = (arr: string[], setArr: (v: string[]) => void, item: string, max?: number) => {
    if (arr.includes(item)) setArr(arr.filter(i => i !== item));
    else if (!max || arr.length < max) setArr([...arr, item]);
  };

  const formatDate = (d: Date) => {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m} / ${day} / ${d.getFullYear()}`;
  };

  const formatDateLong = (d: Date) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  const progressWidth = step === 0 ? 0 : (Math.min(step, TOTAL_DATA_STEPS) / TOTAL_DATA_STEPS) * 100;

  // ===== SAVING / LOADING SCREEN =====
  if (saving) {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {[dot1, dot2, dot3, dot4].map((dot, i) => (
            <Animated.View
              key={i}
              style={{
                width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF',
                transform: [{ translateY: dot }],
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  // ===== WELCOME SCREEN =====
  if (step === 0) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <Image source={require('../../assets/images/client-onboarding-bg.png')} style={s.welcomeBg} resizeMode="cover" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,0.95)']} locations={[0, 0.35, 0.65, 1]} style={s.welcomeOverlay} />
        <Animated.View style={[s.welcomeContent, { opacity: fadeAnim }]}>
          <View style={s.welcomeTop} />
          <View style={s.welcomeBottom}>
            <Text style={s.welcomeGreeting}>Welcome {userName || 'there'}!</Text>
            <Text style={s.welcomeTitle}>Realize Your{'\n'}Potential</Text>
            <Text style={s.welcomeDesc}>Share some background on your goals and interests to help your coach customize your training experience.</Text>
            <View style={s.timeRow}>
              <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.6)" />
              <Text style={s.timeText}>Total time: less than 1 minute</Text>
            </View>
            <Text style={s.privacyText}>We value your privacy. Please see our <Text style={s.privacyLink}>Privacy Policy</Text> for details on how we use your personal information.</Text>
            <TouchableOpacity style={s.whiteBtn} activeOpacity={0.85} onPress={nextStep} accessibilityRole="button"><Text style={s.whiteBtnText}>Let's go</Text></TouchableOpacity>
            <TouchableOpacity onPress={skipOnboarding} style={s.skipRow} accessibilityRole="button"><Text style={s.skipText}>Skip for now</Text></TouchableOpacity>
            <View style={{ height: insets.bottom }} />
          </View>
        </Animated.View>
      </View>
    );
  }

  // ===== STEP 6: REVIEW =====
  if (step === 6) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <Image source={require('../../assets/images/client-onboarding-bg.png')} style={rv.bg} resizeMode="cover" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)', '#000']} locations={[0, 0.25, 0.45, 0.65]} style={rv.overlay} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={rv.scroll} showsVerticalScrollIndicator={false} bounces={false}>
          <View style={rv.header}>
            <TouchableOpacity onPress={() => setStep(5)} style={s.backBtn} accessibilityRole="button"><Ionicons name="chevron-back" size={24} color="#FFF" /></TouchableOpacity>
            <Text style={rv.logo}>FITLINK</Text>
          </View>
          <View style={rv.titleSection}>
            <Text style={rv.greeting}>You're almost done, {userName || 'there'}.</Text>
            <Text style={rv.title}>Thanks for helping{'\n'}us get to know you.</Text>
          </View>
          <View style={rv.profileRow}>
            <Text style={rv.profileTitle}>Your FitLink profile</Text>
            <TouchableOpacity onPress={() => editSection(1)} accessibilityRole="button"><Text style={rv.editLink}>Edit</Text></TouchableOpacity>
          </View>
          <Text style={rv.profileDesc}>You can review and edit your responses at any time in Profile, under the Personal Info and Fitness Profile tabs.</Text>

          <View style={rv.card}>
            <Text style={rv.label}>About</Text>
            <View style={rv.content}>
              <View style={rv.row}><Text style={rv.rowKey}>DOB</Text><Text style={rv.rowVal}>{birthday ? formatDateLong(birthday) : '–'}</Text></View>
              <View style={rv.row}><Text style={rv.rowKey}>Height</Text><Text style={rv.rowVal}>{heightDisplay || '–'}</Text></View>
              <View style={rv.row}><Text style={rv.rowKey}>Weight</Text><Text style={rv.rowVal}>{weightDisplay || '–'}</Text></View>
              <View style={rv.row}><Text style={rv.rowKey}>Gender</Text><Text style={rv.rowVal}>{gender || 'Prefer not to say'}</Text></View>
            </View>
            <TouchableOpacity onPress={() => editSection(1)} style={rv.editBtn}><Ionicons name="pencil" size={14} color="rgba(255,255,255,0.5)" /></TouchableOpacity>
          </View>

          <View style={rv.card}>
            <Text style={rv.label}>Fitness{'\n'}Goals</Text>
            <View style={rv.content}><Text style={rv.rowVal}>{selectedGoals.join(', ') || '–'}</Text></View>
            <TouchableOpacity onPress={() => editSection(2)} style={rv.editBtn}><Ionicons name="pencil" size={14} color="rgba(255,255,255,0.5)" /></TouchableOpacity>
          </View>

          <View style={rv.card}>
            <Text style={rv.label}>Training{'\n'}Styles</Text>
            <View style={rv.content}><Text style={rv.rowVal}>{selectedStyles.join(', ') || '–'}</Text></View>
            <TouchableOpacity onPress={() => editSection(3)} style={rv.editBtn}><Ionicons name="pencil" size={14} color="rgba(255,255,255,0.5)" /></TouchableOpacity>
          </View>

          <View style={rv.card}>
            <Text style={rv.label}>Favorite{'\n'}Activities</Text>
            <View style={rv.content}><Text style={rv.rowVal}>{selectedActivities.join(', ') || '–'}</Text></View>
            <TouchableOpacity onPress={() => editSection(4)} style={rv.editBtn}><Ionicons name="pencil" size={14} color="rgba(255,255,255,0.5)" /></TouchableOpacity>
          </View>

          <View style={rv.card}>
            <Text style={rv.label}>Weekly{'\n'}Goal</Text>
            <View style={rv.content}><Text style={rv.rowVal}>{weeklyGoal} workouts per week</Text></View>
            <TouchableOpacity onPress={() => editSection(5)} style={rv.editBtn}><Ionicons name="pencil" size={14} color="rgba(255,255,255,0.5)" /></TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
        <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={s.whiteBtn} activeOpacity={0.85} onPress={completeOnboarding} accessibilityRole="button">
            <Text style={s.whiteBtnText}>Save and continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ===== STEPS 1-5 =====
  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={s.stepHeader}>
        <TouchableOpacity onPress={prevStep} style={s.backBtn} accessibilityRole="button"><Ionicons name="chevron-back" size={24} color="#FFF" /></TouchableOpacity>
        <TouchableOpacity onPress={skipOnboarding} accessibilityRole="button"><Text style={s.skipBtnText}>Skip</Text></TouchableOpacity>
      </View>

      <View style={s.progressSection}>
        <Text style={s.progressLabel}>{Math.min(step, TOTAL_DATA_STEPS)} of {TOTAL_DATA_STEPS}</Text>
        <View style={s.progressBar}><Animated.View style={[s.progressFill, { width: `${progressWidth}%` }]} /></View>
      </View>

      <Animated.View style={[s.stepContent, { transform: [{ translateX: slideAnim }] }]}>
        <ScrollView contentContainerStyle={s.stepScroll} showsVerticalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled">

          {/* ===== STEP 1: About You ===== */}
          {step === 1 && (
            <>
              <Text style={s.stepTitle}>First, please tell us a little more about yourself.</Text>
              <Text style={s.stepDesc}>This information will be used to accurately track your performance metrics.</Text>

              <TouchableOpacity style={s.fieldBox} onPress={() => setShowDatePicker(true)}>
                <Text style={s.fieldLabel}>Birthday</Text>
                <Text style={s.fieldValue}>{birthday ? formatDate(birthday) : '– –'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.fieldBox} onPress={() => setShowWeightPicker(true)}>
                <Text style={s.fieldLabel}>Weight</Text>
                <Text style={s.fieldValue}>{weightSet ? (weightUnit === 'lbs' ? `${weightLbs} lbs` : `${Math.round(weightLbs * 0.453592)} kg`) : '– –'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.fieldBox} onPress={() => setShowHeightPicker(true)}>
                <Text style={s.fieldLabel}>Height</Text>
                <Text style={s.fieldValue}>{heightSet ? `${heightFt}'${heightIn}"` : '– –'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.fieldBox} onPress={() => { setTempGender(gender || 'Prefer not to say'); setShowGenderPicker(true); }}>
                <Text style={s.fieldLabel}>Gender identity</Text>
                <Text style={s.fieldValue}>{gender || 'Prefer not to say'}</Text>
              </TouchableOpacity>

              {/* Birthday sheet — simple month / day / year scroll wheels */}
              <PickerSheet visible={showDatePicker} onDone={() => { setShowDatePicker(false); setBirthday(tempDate); }} title="Birthday">
                <View style={{ flexDirection: 'row', height: 220 }}>
                  <ScrollWheel
                    items={MONTHS}
                    selectedIndex={tempDate.getMonth()}
                    onSelect={(i) => { const d = new Date(tempDate); d.setMonth(i); setTempDate(d); }}
                  />
                  <ScrollWheel
                    items={Array.from({ length: 31 }, (_, i) => `${i + 1}`)}
                    selectedIndex={tempDate.getDate() - 1}
                    onSelect={(i) => { const d = new Date(tempDate); d.setDate(i + 1); setTempDate(d); }}
                  />
                  <ScrollWheel
                    items={Array.from({ length: 80 }, (_, i) => `${new Date().getFullYear() - 79 + i}`)}
                    selectedIndex={tempDate.getFullYear() - (new Date().getFullYear() - 79)}
                    onSelect={(i) => { const d = new Date(tempDate); d.setFullYear(new Date().getFullYear() - 79 + i); setTempDate(d); }}
                  />
                </View>
              </PickerSheet>

              {/* Weight sheet */}
              <PickerSheet visible={showWeightPicker} onDone={() => { setShowWeightPicker(false); setWeightSet(true); }} title="Weight"
                leftToggle={
                  <View style={sheetStyles.toggleRow}>
                    <TouchableOpacity onPress={() => setWeightUnit('lbs')}><Text style={[sheetStyles.toggleText, weightUnit === 'lbs' && sheetStyles.toggleActive]}>lbs</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setWeightUnit('kg')}><Text style={[sheetStyles.toggleText, weightUnit === 'kg' && sheetStyles.toggleActive]}>kg</Text></TouchableOpacity>
                  </View>
                }>
                <View style={{ height: 220 }}>
                  <ScrollWheel
                    items={Array.from({ length: 301 }, (_, i) => weightUnit === 'lbs' ? `${i + 80}` : `${Math.round((i + 80) * 0.453592)}`)}
                    selectedIndex={weightLbs - 80}
                    onSelect={(i) => setWeightLbs(i + 80)}
                    suffix={weightUnit}
                  />
                </View>
              </PickerSheet>

              {/* Height sheet */}
              <PickerSheet visible={showHeightPicker} onDone={() => { setShowHeightPicker(false); setHeightSet(true); }} title="Height"
                leftToggle={
                  <View style={sheetStyles.toggleRow}>
                    <TouchableOpacity onPress={() => setHeightUnit('ft')}><Text style={[sheetStyles.toggleText, heightUnit === 'ft' && sheetStyles.toggleActive]}>ft</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => setHeightUnit('cm')}><Text style={[sheetStyles.toggleText, heightUnit === 'cm' && sheetStyles.toggleActive]}>cm</Text></TouchableOpacity>
                  </View>
                }>
                <View style={{ flexDirection: 'row', height: 220 }}>
                  <ScrollWheel
                    items={["3'", "4'", "5'", "6'", "7'"]}
                    selectedIndex={heightFt - 3}
                    onSelect={(i) => setHeightFt(i + 3)}
                  />
                  <ScrollWheel
                    items={Array.from({ length: 12 }, (_, i) => `${i}"`)}
                    selectedIndex={heightIn}
                    onSelect={(i) => setHeightIn(i)}
                  />
                </View>
              </PickerSheet>

              {/* Gender sheet */}
              <PickerSheet visible={showGenderPicker} onDone={() => { setShowGenderPicker(false); setGender(GENDER_OPTIONS[GENDER_OPTIONS.indexOf(tempGender)] || tempGender); }} title="Gender">
                <View style={{ height: 220 }}>
                  <ScrollWheel
                    items={GENDER_OPTIONS}
                    selectedIndex={Math.max(0, GENDER_OPTIONS.indexOf(tempGender))}
                    onSelect={(i) => setTempGender(GENDER_OPTIONS[i])}
                  />
                </View>
              </PickerSheet>
            </>
          )}

          {/* ===== STEP 2: Fitness Goals ===== */}
          {step === 2 && (
            <>
              <Text style={s.stepTitle}>What are your main health and fitness goals?</Text>
              <Text style={s.stepDesc}>We'll help your coach tailor your program. Select up to 3.</Text>
              <View style={s.chipGrid}>
                {FITNESS_GOALS.map(g => (
                  <TouchableOpacity key={g} style={[s.chip, selectedGoals.includes(g) && s.chipActive]} onPress={() => toggleArrayItem(selectedGoals, setSelectedGoals, g, 3)} accessibilityRole="button">
                    <Text style={[s.chipText, selectedGoals.includes(g) && s.chipTextActive]}>{g}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ===== STEP 3: Training Style ===== */}
          {step === 3 && (
            <>
              <Text style={s.stepTitle}>How do you like to work out?</Text>
              <Text style={s.stepDesc}>Select all that apply.</Text>
              <View style={s.chipGrid}>
                {TRAINING_STYLES.map(t => (
                  <TouchableOpacity key={t} style={[s.chip, selectedStyles.includes(t) && s.chipActive]} onPress={() => toggleArrayItem(selectedStyles, setSelectedStyles, t)} accessibilityRole="button">
                    <Text style={[s.chipText, selectedStyles.includes(t) && s.chipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ===== STEP 4: Activities ===== */}
          {step === 4 && (
            <>
              <Text style={s.stepTitle}>What types of activities do you enjoy or want to try?</Text>
              <Text style={s.stepDesc}>Select all that apply.</Text>
              <View style={s.chipGrid}>
                {ACTIVITIES.map(a => (
                  <TouchableOpacity key={a} style={[s.chip, selectedActivities.includes(a) && s.chipActive]} onPress={() => toggleArrayItem(selectedActivities, setSelectedActivities, a)} accessibilityRole="button">
                    <Text style={[s.chipText, selectedActivities.includes(a) && s.chipTextActive]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ===== STEP 5: Weekly Workout Goal ===== */}
          {step === 5 && (
            <>
              <Text style={s.stepTitle}>Finally, set a weekly workout goal.</Text>
              <Text style={s.stepDesc}>We'll help you stay accountable by tracking your progress each week.</Text>

              <Text style={{ fontFamily: FontFamily.headingExtraBold, fontSize: 72, color: '#FFF', textAlign: 'center', marginTop: 32, marginBottom: 8 }}>
                {weeklyGoal}
              </Text>
              <Text style={{ fontFamily: FontFamily.body, fontSize: 16, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 32 }}>
                {weeklyGoal === 1 ? 'workout per week' : 'workouts per week'}
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap', paddingHorizontal: 16 }}>
                {WEEKLY_GOALS.map(n => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setWeeklyGoal(n)}
                    style={{
                      width: 52, height: 52, borderRadius: 26,
                      backgroundColor: weeklyGoal === n ? '#FFF' : 'rgba(255,255,255,0.08)',
                      borderWidth: weeklyGoal === n ? 0 : 1,
                      borderColor: 'rgba(255,255,255,0.15)',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} workouts per week`}
                  >
                    <Text style={{
                      fontFamily: FontFamily.headingSemiBold,
                      fontSize: 20,
                      color: weeklyGoal === n ? '#000' : 'rgba(255,255,255,0.6)',
                    }}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

        </ScrollView>
      </Animated.View>

      {/* Bottom Button */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity style={step === 5 ? s.whiteBtn : s.nextBtn} activeOpacity={0.85} onPress={nextStep} accessibilityRole="button">
          <Text style={step === 5 ? s.whiteBtnText : s.nextBtnText}>{step < 5 ? 'Next Step' : 'Next'}</Text>
        </TouchableOpacity>
      </View>

      {/* ══════════════════════════════════════════════════════
          COMPLETION OVERLAY — slides up over everything after step 5
      ═══════════════════════════════════════════════════════ */}
      {showCompletion && (
        <View style={[StyleSheet.absoluteFill, completionStyles.container]}>
          {/* Animated checkmark circle */}
          <CompletionBurst name={userName} />
        </View>
      )}
    </View>
  );
}

// ===== MAIN STYLES =====
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  welcomeBg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
  welcomeOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  welcomeContent: { flex: 1, justifyContent: 'space-between' },
  welcomeTop: { flex: 1 },
  welcomeBottom: { paddingHorizontal: Spacing.xl, paddingBottom: SCREEN_HEIGHT * 0.04 },
  welcomeGreeting: { fontFamily: FontFamily.body, fontSize: 16, color: 'rgba(255,255,255,0.8)', marginBottom: 6 },
  welcomeTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 42, color: '#FFF', lineHeight: 48, letterSpacing: -0.5, marginBottom: 16 },
  welcomeDesc: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 20, marginBottom: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  timeText: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  privacyText: { fontFamily: FontFamily.body, fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 16, marginBottom: 24 },
  privacyLink: { textDecorationLine: 'underline', color: 'rgba(255,255,255,0.6)' },
  whiteBtn: { backgroundColor: '#FFF', borderRadius: 4, paddingVertical: 16, alignItems: 'center', marginBottom: 14 },
  whiteBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, color: '#000', letterSpacing: 0.5 },
  skipRow: { alignItems: 'center' },
  skipText: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: '#FFF' },

  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SCREEN_HEIGHT * 0.06, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.sm },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, color: '#FFF' },

  progressSection: { paddingHorizontal: Spacing.xl, marginBottom: Spacing.xl },
  progressLabel: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 },
  progressBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#FFF', borderRadius: 2 },

  stepContent: { flex: 1 },
  stepScroll: { paddingHorizontal: Spacing.xl, paddingBottom: 120 },
  stepTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 28, color: '#FFF', lineHeight: 34, marginBottom: 12 },
  stepDesc: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 20, marginBottom: 28 },

  fieldBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 16, paddingVertical: 18, marginBottom: 14 },
  fieldLabel: { fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.6)' },
  fieldValue: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, color: 'rgba(255,255,255,0.6)' },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 4, paddingHorizontal: 18, paddingVertical: 16, width: (SCREEN_WIDTH - Spacing.xl * 2 - 12) / 2 },
  chipActive: { borderColor: '#FFF', backgroundColor: 'rgba(255,255,255,0.1)' },
  chipText: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  chipTextActive: { color: '#FFF', fontFamily: FontFamily.bodySemiBold },

  bottomBar: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, backgroundColor: '#000' },
  nextBtn: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4, paddingVertical: 16, alignItems: 'center' },
  nextBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, color: '#FFF', letterSpacing: 0.5 },
});

// ===== BOTTOM SHEET STYLES =====
const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  container: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1C1C1E', borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingBottom: 34 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerSide: { flex: 1 },
  headerTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 17, color: '#FFF', textAlign: 'center', flex: 2 },
  doneText: { fontFamily: FontFamily.bodySemiBold, fontSize: 17, color: '#FFF', textAlign: 'right' },
  toggleRow: { flexDirection: 'row', gap: 14 },
  toggleText: { fontFamily: FontFamily.body, fontSize: 15, color: 'rgba(255,255,255,0.4)' },
  toggleActive: { color: '#FFF', fontFamily: FontFamily.bodySemiBold, textDecorationLine: 'underline' },
});

// ===== WEEKLY GOAL STYLES =====
const wg = StyleSheet.create({
  wrapper: { alignItems: 'center', marginTop: Spacing.md },
});

// ===== REVIEW STYLES =====
const rv = StyleSheet.create({
  bg: { position: 'absolute', top: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.45 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, height: SCREEN_HEIGHT * 0.75 },
  scroll: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: SCREEN_HEIGHT * 0.06, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md },
  logo: { fontFamily: FontFamily.headingExtraBold, fontSize: 16, color: 'rgba(255,255,255,0.6)', letterSpacing: 4 },
  titleSection: { paddingHorizontal: Spacing.xl, marginBottom: Spacing['2xl'] },
  greeting: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: 34, color: '#FFF', lineHeight: 40 },
  profileRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, marginBottom: 8 },
  profileTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 17, color: '#FFF' },
  editLink: { fontFamily: FontFamily.body, fontSize: 15, color: '#FFF' },
  profileDesc: { fontFamily: FontFamily.body, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 17, paddingHorizontal: Spacing.xl, marginBottom: Spacing.xl },
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, marginHorizontal: Spacing.xl, marginBottom: 12, padding: 18, gap: 14 },
  label: { fontFamily: FontFamily.body, fontSize: 13, color: 'rgba(255,255,255,0.45)', width: 70, lineHeight: 18 },
  content: { flex: 1 },
  editBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  rowKey: { fontFamily: FontFamily.body, fontSize: 14, color: 'rgba(255,255,255,0.5)', width: 55 },
  rowVal: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, color: '#FFF', flex: 1 },
});

const completionStyles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 20,
    zIndex: 200,
  },
  checkRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#FF6B35',
    backgroundColor: 'rgba(255,107,53,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  checkInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,107,53,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 22,
  },
});
