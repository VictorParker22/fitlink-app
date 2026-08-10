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
import { FontFamily, Radius, Spacing } from '../../constants/theme';

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

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<Category>('Strength');
  const [description, setDescription] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [isLaunching, setIsLaunching] = useState(false);

  // Pulsing animation for the LIVE badge preview
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

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
      showAlert({ type: 'error', title: 'Title Required', message: 'Give your stream a title before going live.' });
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
      showAlert({ type: 'error', title: 'Setup Error', message: err.message || 'Could not create stream.' });
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
          >
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Stream Setup</Text>
          <View style={s.liveBadgePreview}>
            <Animated.View style={[s.liveDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={s.liveBadgePreviewText}>LIVE</Text>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Stream Title */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>STREAM TITLE</Text>
            <View style={s.inputCard}>
              <TextInput
                style={s.titleInput}
                value={title}
                onChangeText={t => setTitle(t.slice(0, 140))}
                placeholder="What are you coaching today?"
                placeholderTextColor="rgba(255,255,255,0.25)"
                maxLength={140}
                autoFocus
                returnKeyType="done"
              />
              <Text style={[s.charCounter, title.length > 120 && s.charCounterWarn]}>
                {140 - title.length} remaining
              </Text>
            </View>
          </View>

          {/* Category Picker */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>CATEGORY</Text>
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
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={14}
                    color={category === cat.label ? '#000000' : 'rgba(255,255,255,0.5)'}
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
              DESCRIPTION <Text style={s.optionalLabel}>(OPTIONAL)</Text>
            </Text>
            <View style={s.inputCard}>
              <TextInput
                style={s.descInput}
                value={description}
                onChangeText={setDescription}
                placeholder="Tell your audience what to expect…"
                placeholderTextColor="rgba(255,255,255,0.25)"
                multiline
                numberOfLines={3}
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Hardware Toggles */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>SETTINGS</Text>
            <View style={s.settingsCard}>

              <TouchableOpacity
                style={s.settingsRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMicEnabled(v => !v);
                }}
                activeOpacity={0.75}
              >
                <View style={s.settingsRowLeft}>
                  <View style={[s.settingsIcon, { backgroundColor: micEnabled ? 'rgba(200,241,53,0.15)' : 'rgba(255,255,255,0.06)' }]}>
                    <Ionicons
                      name={micEnabled ? 'mic' : 'mic-off'}
                      size={18}
                      color={micEnabled ? '#C8F135' : 'rgba(255,255,255,0.4)'}
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
              >
                <View style={s.settingsRowLeft}>
                  <View style={[s.settingsIcon, { backgroundColor: 'rgba(200,241,53,0.15)' }]}>
                    <Ionicons name="camera-reverse-outline" size={18} color="#C8F135" />
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
            <Ionicons name="bulb-outline" size={14} color="#FF6B35" style={{ marginRight: 8, marginTop: 1 }} />
            <Text style={s.tipsText}>
              Turn off Silent Mode and enable Do Not Disturb before going live for the best streaming experience.
            </Text>
          </View>

        </ScrollView>

        {/* Go Live CTA */}
        <View style={s.footer}>
          <TouchableOpacity
            style={[s.goLiveBtn, (!title.trim() || isLaunching) && s.goLiveBtnDisabled]}
            onPress={handleStartBroadcast}
            disabled={!title.trim() || isLaunching}
            activeOpacity={0.85}
          >
            {isLaunching ? (
              <ActivityIndicator color="#000000" size="small" />
            ) : (
              <>
                <View style={s.goLiveDot} />
                <Text style={s.goLiveBtnText}>START BROADCAST</Text>
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
    backgroundColor: '#0D0D12',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    marginLeft: Spacing.md,
  },
  liveBadgePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  liveBadgePreviewText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: '#EF4444',
    letterSpacing: 1.5,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: 24,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 10,
  },
  optionalLabel: {
    color: 'rgba(255,255,255,0.2)',
  },
  inputCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  titleInput: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    minHeight: 28,
  },
  charCounter: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'right',
    marginTop: 8,
  },
  charCounterWarn: {
    color: '#FF6B35',
  },
  descInput: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.full,
  },
  categoryChipActive: {
    backgroundColor: '#C8F135',
    borderColor: '#C8F135',
  },
  categoryChipText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  categoryChipTextActive: {
    color: '#000000',
  },
  settingsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
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
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  settingsRowSub: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: Spacing.md,
  },
  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: {
    backgroundColor: '#C8F135',
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignSelf: 'flex-start',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
    backgroundColor: '#000000',
  },
  tipsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,107,53,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  tipsText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  goLiveBtn: {
    backgroundColor: '#C8F135',
    borderRadius: Radius.md,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#C8F135',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  goLiveBtnDisabled: {
    backgroundColor: 'rgba(200,241,53,0.25)',
    shadowOpacity: 0,
  },
  goLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000000',
  },
  goLiveBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#000000',
    letterSpacing: 1.5,
  },
});
