/**
 * AiConsentSheet — Apple 5.1.2(i) gate for any AI call (the corner's
 * solo-corner, the trainer's coach-assistant). Shown once, before the
 * FIRST model call an account ever triggers; lib/aiConsent.ts persists the
 * answer on the auth user so this never asks twice.
 */
import { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { grantAiConsent } from '../../lib/aiConsent';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AiConsentSheetProps {
  visible: boolean;
  /** Consent was recorded — safe to make the queued call now. */
  onAgree: () => void;
  /** Athlete declined — caller must not call the model. */
  onDecline: () => void;
}

export default function AiConsentSheet({ visible, onAgree, onDecline }: AiConsentSheetProps) {
  const [saving, setSaving] = useState(false);

  const handleAgree = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await grantAiConsent();
      Haptics.selectionAsync().catch(() => {});
      onAgree();
    } catch (e) {
      if (__DEV__) console.warn('[AiConsentSheet] grantAiConsent failed:', e);
      // Consent write failed — do not treat as agreed. The athlete can try again.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onDecline}>
      <View style={s.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDecline} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title} maxFontSizeMultiplier={1.3}>Before your corner speaks</Text>
          <Text style={s.body} maxFontSizeMultiplier={1.4}>
            To answer, FitLink sends your question, your first name and the training context shown
            here (and your daily step count only if health sharing is on) to Google's Gemini API.
            Nothing else leaves the app. It is used for one reply and not for training Google's
            models. You can read the full policy in Privacy.
          </Text>
          <TouchableOpacity
            style={[s.primaryBtn, saving && s.btnDisabled]}
            onPress={handleAgree}
            disabled={saving}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Agree and continue"
          >
            <Text style={s.primaryBtnText} maxFontSizeMultiplier={1.2}>Agree and continue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.textBtn}
            onPress={onDecline}
            disabled={saving}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={s.textBtnText} maxFontSizeMultiplier={1.2}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(16,18,16,0.72)',
  },
  sheet: {
    width: SCREEN_WIDTH,
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderBottomWidth: 0,
    padding: 22,
    paddingBottom: 32,
    gap: 14,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, borderCurve: 'continuous',
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 4,
  },
  title: {
    fontFamily: F.headingBold, fontSize: 19, lineHeight: 23, color: C.textPrimary,
  },
  body: {
    fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textSecondary,
  },
  primaryBtn: {
    height: 52, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { fontFamily: F.bodyBold, fontSize: 15.5, color: C.onAccent },
  textBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  textBtnText: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textFaint },
});
