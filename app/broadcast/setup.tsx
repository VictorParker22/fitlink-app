import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useApp } from '../../context/AppContext';
import { useAlert } from '../../context/AlertContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { useReducedMotion } from '../../lib/useReducedMotion';

const CATEGORIES = [
  { label: 'Strength', icon: 'barbell-outline' },
  { label: 'HIIT', icon: 'flash-outline' },
  { label: 'Yoga', icon: 'leaf-outline' },
  { label: 'Mobility', icon: 'body-outline' },
  { label: 'Boxing', icon: 'hand-right-outline' },
  { label: 'Cardio', icon: 'heart-outline' },
  { label: 'Custom', icon: 'sparkles-outline' },
] as const;

type Category = typeof CATEGORIES[number]['label'];

export default function BroadcastSetupScreen() {
  const router = useRouter();
  const { existingClassId } = useLocalSearchParams<{ existingClassId?: string }>();
  const { createLiveClass, liveClasses } = useApp();
  const { showAlert } = useAlert();
  const reducedMotion = useReducedMotion();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('Strength');
  const [description, setDescription] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [isLaunching, setIsLaunching] = useState(false);

  // Pulsing animation for the LIVE badge preview
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion]);

  // If editing an existing class, pre-fill
  useEffect(() => {
    if (existingClassId) {
      const existing = liveClasses.find(c => c.id === existingClassId);
      if (existing) {
        setTitle(existing.title);
        setCategory((existing.category as Category) || 'Strength');
        setDescription(existing.description || '');
      }
    }
  }, [existingClassId, liveClasses]);

  const handleStartBroadcast = async () => {
    if (!title.trim()) {
      showAlert({ type: 'error', title: 'Title required', message: 'Give your stream a title before going live.' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsLaunching(true);

    try {
      let targetId = existingClassId;

      if (!targetId) {
        // Ad-hoc stream — auto-create the DB row
        const newClass = await createLiveClass({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          scheduled_for: new Date().toISOString(),
          duration_minutes: 60,
        });
        targetId = newClass.id;
      }

      // Navigate to live broadcast with setup params
      router.replace({
        pathname: `/broadcast/${targetId}` as any,
        params: {
          micEnabled: micEnabled ? '1' : '0',
          cameraFacing,
        },
      });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Setup error', message: err.message || 'Could not create stream.' });
      setIsLaunching(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close stream setup"
          >
            <Ionicons name="close" size={22} color={CoachColors.textSecondary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Stream setup</Text>
          <View style={s.liveBadgePreview}>
            <Animated.View style={[s.liveDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={s.liveBadgePreviewText}>Live</Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Stream title */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Stream title</Text>
            <View style={s.inputCard}>
              <TextInput
                style={s.titleInput}
                value={title}
                onChangeText={t => setTitle(t.slice(0, 140))}
                placeholder="What are you coaching today?"
                placeholderTextColor={CoachColors.textFaint}
                maxLength={140}
                autoFocus
                returnKeyType="done"
                accessibilityLabel="Stream title"
              />
              <Text style={[s.charCounter, title.length > 120 && s.charCounterWarn]}>
                {140 - title.length} remaining
              </Text>
            </View>
          </View>

          {/* Category picker */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.categoryRow}
            >
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.label}
                  style={[s.categoryChip, category === cat.label && s.categoryChipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setCategory(cat.label);
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Category ${cat.label}`}
                  accessibilityState={{ selected: category === cat.label }}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={14}
                    color={category === cat.label ? CoachColors.onAccent : CoachColors.textMuted}
                  />
                  <Text style={[s.categoryChipText, category === cat.label && s.categoryChipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Description */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>
              Description <Text style={s.optionalLabel}>(optional)</Text>
            </Text>
            <View style={s.inputCard}>
              <TextInput
                style={s.descInput}
                value={description}
                onChangeText={setDescription}
                placeholder="Tell your audience what to expect…"
                placeholderTextColor={CoachColors.textFaint}
                multiline
                numberOfLines={3}
                returnKeyType="done"
                accessibilityLabel="Stream description, optional"
              />
            </View>
          </View>

          {/* Hardware toggles */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Settings</Text>
            <View style={s.settingsCard}>

              <TouchableOpacity
                style={s.settingsRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMicEnabled(v => !v);
                }}
                activeOpacity={0.75}
                accessibilityRole="switch"
                accessibilityLabel="Microphone"
                accessibilityState={{ checked: micEnabled }}
              >
                <View style={s.settingsRowLeft}>
                  <View style={[s.settingsIcon, { backgroundColor: micEnabled ? CoachColors.accentSoft : CoachColors.surface }]}>
                    <Ionicons
                      name={micEnabled ? 'mic' : 'mic-off'}
                      size={18}
                      color={micEnabled ? CoachColors.accent : CoachColors.textFaint}
                    />
                  </View>
                  <View>
                    <Text style={s.settingsRowTitle}>Microphone</Text>
                    <Text style={s.settingsRowSub}>
                      {micEnabled ? 'On — your voice will be broadcast' : 'Muted — enable before going live'}
                    </Text>
                  </View>
                </View>
                <View style={[s.toggle, micEnabled && s.toggleOn]}>
                  <View style={[s.toggleKnob, micEnabled && s.toggleKnobOn]} />
                </View>
              </TouchableOpacity>

              <View style={s.settingsDivider} />

              <TouchableOpacity
                style={s.settingsRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCameraFacing(v => v === 'front' ? 'back' : 'front');
                }}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Camera, ${cameraFacing === 'front' ? 'front camera' : 'back camera'}. Double tap to switch`}
              >
                <View style={s.settingsRowLeft}>
                  <View style={[s.settingsIcon, { backgroundColor: CoachColors.accentSoft }]}>
                    <Ionicons name="camera-reverse-outline" size={18} color={CoachColors.accent} />
                  </View>
                  <View>
                    <Text style={s.settingsRowTitle}>Camera</Text>
                    <Text style={s.settingsRowSub}>
                      {cameraFacing === 'front' ? 'Front camera (selfie view)' : 'Back camera (landscape)'}
                    </Text>
                  </View>
                </View>
                <View style={[s.toggle, s.toggleOn]}>
                  <View style={[s.toggleKnob, s.toggleKnobOn]} />
                </View>
              </TouchableOpacity>

            </View>
          </View>

          {/* Tips */}
          <View style={s.tipsCard}>
            <Ionicons name="bulb-outline" size={14} color={CoachColors.warning} style={{ marginRight: 8, marginTop: 1 }} />
            <Text style={s.tipsText}>
              Turn off Silent Mode and enable Do Not Disturb before going live for the best streaming experience.
            </Text>
          </View>

        </ScrollView>

        {/* Go live CTA */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.goLiveBtn, (!title.trim() || isLaunching) && s.goLiveBtnDisabled]}
            onPress={handleStartBroadcast}
            disabled={!title.trim() || isLaunching}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Start broadcast"
            accessibilityState={{ disabled: !title.trim() || isLaunching, busy: isLaunching }}
          >
            {isLaunching ? (
              <ActivityIndicator color={CoachColors.onAccent} size="small" />
            ) : (
              <>
                <View style={s.goLiveDot} />
                <Text style={s.goLiveBtnText}>Start broadcast</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    letterSpacing: -0.3,
    color: CoachColors.textPrimary,
    marginLeft: 12,
  },
  liveBadgePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CoachColors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(224,92,92,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CoachColors.danger,
  },
  liveBadgePreviewText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.danger,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  optionalLabel: {
    color: CoachColors.textFaint,
    opacity: 0.6,
  },
  inputCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 14,
  },
  titleInput: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    letterSpacing: -0.3,
    color: CoachColors.textPrimary,
    minHeight: 28,
  },
  charCounter: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textFaint,
    textAlign: 'right',
    marginTop: 8,
  },
  charCounterWarn: {
    color: CoachColors.warning,
  },
  descInput: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textPrimary,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  categoryRow: {
    gap: 8,
    paddingBottom: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  categoryChipActive: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
  },
  categoryChipText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.textSecondary,
  },
  categoryChipTextActive: {
    color: CoachColors.onAccent,
  },
  settingsCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  settingsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingsIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsRowTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },
  settingsRowSub: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textMuted,
    marginTop: 2,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginHorizontal: 14,
  },
  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: CoachColors.borderMuted,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: {
    backgroundColor: CoachColors.accent,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: CoachColors.textFaint,
    alignSelf: 'flex-start',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
    backgroundColor: CoachColors.onAccent,
  },
  tipsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(224,184,78,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(224,184,78,0.2)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  tipsText: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textSecondary,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  goLiveBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 27,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  goLiveBtnDisabled: {
    opacity: 0.4,
  },
  goLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CoachColors.onAccent,
  },
  goLiveBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15,
    color: CoachColors.onAccent,
  },
});
