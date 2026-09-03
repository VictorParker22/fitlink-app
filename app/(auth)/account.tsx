/**
 * (auth)/account.tsx — the deferred account screen (design canvas "FitLink
 * Arrival", Account.dc.html).
 *
 * Value first, account second: by the time an athlete or coach lands here,
 * their goals/specialties are already staged in lib/onboardingDraft.ts. This
 * screen's only job is turning that draft into a real session — Apple/Google
 * one-tap, or "use email instead" into the existing signup screens. Once a
 * session exists, AuthContext applies the draft and AuthGuard routes; this
 * screen never navigates on a successful social sign-in.
 */
import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Linking, Keyboard } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { loadDraft, saveDraft } from '../../lib/onboardingDraft';
import { isAppleAvailable, isGoogleAvailable, signInWithApple, signInWithGoogle } from '../../lib/socialAuth';
import { useAlert } from '../../context/AlertContext';
import { TERMS_URL, PRIVACY_URL } from '../../lib/legalLinks';
import { OB, OBFonts, OBRadius, OBSpace } from '../../constants/onboardingDesign';
import { Screen, TopNav, Headline, Sub, AccentDot, SecondaryButton, TextButton, Hairline } from '../../components/onboarding/Editorial';

/** Keeps the birth-date field to digits and dashes as YYYY-MM-DD. Copied
 *  from client-signup.tsx so both screens format identically. */
function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  return [y, m, d].filter(Boolean).join('-');
}

const MIN_AGE = 16;

function parseDob(value: string): { ok: true; iso: string } | { ok: false; message: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return { ok: false, message: 'Enter your date of birth as YYYY-MM-DD' };
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  const valid = date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  if (!valid || y < 1900) return { ok: false, message: 'That date does not look right' };
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  if (age < MIN_AGE) return { ok: false, message: `You need to be ${MIN_AGE} or older to use FitLink` };
  return { ok: true, iso: value.trim() };
}

export default function AccountScreen() {
  const router = useRouter();
  const { showAlert } = useAlert();
  const params = useLocalSearchParams<{ role?: string }>();
  const role: 'client' | 'trainer' = params.role === 'trainer' ? 'trainer' : 'client';
  const isClient = role === 'client';

  const [dob, setDob] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const googleAvailable = isGoogleAvailable();
  const [loadingApple, setLoadingApple] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  useEffect(() => {
    isAppleAvailable().then(setAppleAvailable);
    loadDraft().then((d) => { if (d.dob) setDob(d.dob); });
  }, []);

  const dobCheck = parseDob(dob);
  const socialDisabled = isClient && !dobCheck.ok;
  const anyLoading = loadingApple || loadingGoogle;

  const handleResult = useCallback((result: { ok: true } | { cancelled: true } | { error: string }) => {
    if ('error' in result) {
      showAlert({ type: 'error', title: 'Sign-in failed', message: result.error });
    }
    // cancelled: do nothing. ok: do nothing — AuthContext + AuthGuard take it from here.
  }, [showAlert]);

  const persistDob = async () => {
    if (isClient && dobCheck.ok) await saveDraft({ dob: dobCheck.iso });
  };

  const handleApple = async () => {
    if (socialDisabled || anyLoading) return;
    setLoadingApple(true);
    await persistDob();
    const result = await signInWithApple();
    setLoadingApple(false);
    handleResult(result);
  };

  const handleGoogle = async () => {
    if (socialDisabled || anyLoading) return;
    setLoadingGoogle(true);
    await persistDob();
    const result = await signInWithGoogle();
    setLoadingGoogle(false);
    handleResult(result);
  };

  const useEmailInstead = async () => {
    await persistDob();
    router.push((isClient ? '/(auth)/client-signup' : '/(auth)/coach-signup') as any);
  };

  return (
    <Screen>
      <TopNav onBack={() => router.back()} />

      <View style={s.body}>
        <View style={{ gap: 10 }}>
          <Headline>Keep this. Save your FitLink.</Headline>
          <Sub>
            {isClient
              ? 'Your goals and matches are ready. An account makes them yours on any phone.'
              : 'Your specialties are saved. An account makes them yours on any phone.'}
          </Sub>
        </View>

        <Hairline style={{ marginTop: 28 }} />

        <View style={{ marginTop: 24, gap: 10 }}>
          {isClient && (
            <View style={s.dobField}>
              <Text style={s.dobLabel}>Date of birth</Text>
              <TextInput
                style={s.dobInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={OB.faint}
                value={dob}
                onChangeText={(t) => {
                  const v = formatDobInput(t);
                  setDob(v);
                  // number-pad has no return key on iOS: the field is done
                  // the moment the date is complete, so put the keyboard away.
                  if (v.length === 10) Keyboard.dismiss();
                }}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
                blurOnSubmit
                maxLength={10}
                accessibilityLabel="Date of birth"
                selectionColor={OB.accent}
              />
              <Text style={s.dobHint}>16 or older. Your coach never sees this.</Text>
            </View>
          )}

          {appleAvailable && (
            <Pressable
              onPress={handleApple}
              disabled={socialDisabled || anyLoading}
              style={({ pressed }) => [s.appleBtn, (socialDisabled || anyLoading) && s.btnOff, pressed && !socialDisabled && !anyLoading && { opacity: 0.9 }]}
              accessibilityRole="button"
              accessibilityLabel="Continue with Apple"
            >
              {loadingApple ? (
                <ActivityIndicator color={OB.bg} />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={18} color={OB.bg} />
                  <Text style={s.appleText}>Continue with Apple</Text>
                </>
              )}
            </Pressable>
          )}

          {googleAvailable && (
            <SecondaryButton
              label={loadingGoogle ? 'Continuing…' : 'Continue with Google'}
              onPress={handleGoogle}
              icon={loadingGoogle ? <ActivityIndicator color={OB.fg} /> : <Ionicons name="logo-google" size={18} color={OB.fg} />}
            />
          )}

          <TextButton label="Use email instead" onPress={useEmailInstead} />
        </View>

        <View style={s.noteRow}>
          <AccentDot />
          <Text style={s.noteText}>
            {isClient
              ? 'Nothing is shared with a coach until you choose one.'
              : 'You set every price. Athletes pay in the app.'}
          </Text>
        </View>
      </View>

      <View style={s.legalWrap}>
        <Text style={s.legalText}>
          By continuing you agree to the{' '}
          <Text style={s.legalLink} onPress={() => Linking.openURL(TERMS_URL)}>Terms of use</Text>
          {' '}and{' '}
          <Text style={s.legalLink} onPress={() => Linking.openURL(PRIVACY_URL)}>Privacy policy</Text>
          .
        </Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: OBSpace.screen, paddingTop: 8 },

  dobField: { gap: 8, marginBottom: 4 },
  dobLabel: { fontFamily: OBFonts.sansSemiBold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: OB.muted },
  dobInput: {
    height: 54, borderRadius: OBRadius.m, borderCurve: 'continuous', backgroundColor: OB.surface,
    borderWidth: 1, borderColor: OB.line, paddingHorizontal: 16,
    fontFamily: OBFonts.sansMedium, fontSize: 16, color: OB.fg,
  },
  dobHint: { fontFamily: OBFonts.sans, fontSize: 13, color: OB.faint },

  appleBtn: {
    height: 56, borderRadius: OBRadius.m, borderCurve: 'continuous', backgroundColor: OB.fg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  appleText: { fontFamily: OBFonts.sansSemiBold, fontSize: 16, color: OB.bg },
  btnOff: { opacity: 0.35 },

  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  noteText: { flex: 1, fontFamily: OBFonts.sans, fontSize: 13, lineHeight: 18, color: OB.muted },

  legalWrap: { paddingHorizontal: OBSpace.screen, paddingBottom: 40, paddingTop: 8 },
  legalText: { fontFamily: OBFonts.sans, fontSize: 12, lineHeight: 17, color: OB.faint, textAlign: 'center' },
  legalLink: { color: OB.muted, textDecorationLine: 'underline' },
});
