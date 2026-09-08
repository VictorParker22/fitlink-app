/**
 * invite/enter.tsx — type the six-character code from a coach's message.
 * Linked from welcome ("Have an invite code?") and from the not-found and
 * expired states of invite/[code]. A pasted link is accepted too.
 */
import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { INVITE_CODE_LENGTH, isValidCode, normalizeCode, parseInviteFromUrl } from '../../lib/invites';

export default function EnterInviteCodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState('');

  const valid = isValidCode(code);
  const full = code.length === INVITE_CODE_LENGTH;

  const onChange = (raw: string) => {
    const fromLink = parseInviteFromUrl(raw);
    setCode(fromLink ?? normalizeCode(raw));
  };

  const go = () => {
    if (!valid) return;
    router.push(`/invite/${code}` as any);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.top, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(auth)/welcome' as any); }}
          style={s.iconBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={C.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={s.body}>
        <Text style={s.eyebrow} maxFontSizeMultiplier={1.2}>INVITE CODE</Text>
        <Text style={s.headline} maxFontSizeMultiplier={1.25} accessibilityRole="header">Enter your code.</Text>
        <Text style={s.sub} maxFontSizeMultiplier={1.4}>
          Six letters and numbers from the message your coach sent. A pasted link works too.
        </Text>

        <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()} accessibilityRole="none">
          <TextInput
            ref={inputRef}
            style={s.input}
            value={code}
            onChangeText={onChange}
            placeholder="ABC234"
            placeholderTextColor={C.textFaint}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            autoFocus
            maxLength={120}
            returnKeyType="go"
            onSubmitEditing={go}
            accessibilityLabel="Invite code"
            accessibilityHint="Six letters and numbers"
          />
        </TouchableOpacity>
        {full && !valid ? (
          <Text style={s.hint} maxFontSizeMultiplier={1.3}>Codes never use 0, 1, I, L or O. Check the message again.</Text>
        ) : null}
      </View>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <TouchableOpacity
          style={[s.primaryBtn, !valid && s.btnDisabled]}
          onPress={go}
          disabled={!valid}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue"
          accessibilityState={{ disabled: !valid }}
        >
          <Text style={s.primaryBtnText} maxFontSizeMultiplier={1.2}>Continue</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 20, gap: 12 },
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2, color: C.accent },
  headline: { fontFamily: F.headingBold, fontSize: 30, lineHeight: 34, color: C.textPrimary, letterSpacing: -0.4 },
  sub: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.textSecondary },
  input: {
    marginTop: 12, height: 64, borderRadius: 16, borderCurve: 'continuous',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 20, fontFamily: F.mono, fontSize: 26, letterSpacing: 6, color: C.textPrimary,
  },
  hint: { fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: C.warning },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
  primaryBtn: {
    height: 52, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontFamily: F.bodyBold, fontSize: 15.5, color: C.onAccent },
});
