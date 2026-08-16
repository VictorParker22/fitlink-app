/**
 * (auth)/client-login.tsx — Athlete sign-in (design turn 25a's "Sign in" fork).
 *
 * Previously this screen duplicated the whole signup flow; that now lives
 * entirely in client-signup. This is a plain sign-in: email + password,
 * forgot password, and links back to signup / coach login.
 *
 * Fixed dark/lime system (constants/coachDesign.ts). No useTheme here.
 */

import { useState, useEffect } from 'react';
import {
  AccessibilityInfo,
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

const C = CoachColors;
const F = CoachFonts;

export default function ClientLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // accessibilityLiveRegion is Android-only, so on iOS an error that merely
  // appears on screen is silent for VoiceOver. Announce it explicitly.
  useEffect(() => {
    if (error) AccessibilityInfo.announceForAccessibility(`Sign in failed. ${error}`);
  }, [error]);

  const [success, setSuccess] = useState('');

  const handleSignIn = async () => {
    setError(''); setSuccess('');
    if (!email.trim() || !password.trim()) return setError('Fill in both fields');
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message || 'Invalid credentials');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return setError('Enter your email address first');
    setLoading(true);
    setError(''); setSuccess('');
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(trimmed);
      if (e) throw e;
      setSuccess('Reset link sent. Check your email.');
    } catch (err: any) {
      if (err.message?.toLowerCase().includes('rate limit')) {
        setError('Too many reset attempts. Please try again later.');
      } else {
        setError(err.message || 'Failed to send reset email');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={st.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[st.scrollContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <TouchableOpacity hitSlop={5}
            style={st.backBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={18} color="#C9CEC2" />
          </TouchableOpacity>

          <Text style={st.title}>Welcome back</Text>
          <Text style={st.subtitle}>Sign in to pick up where you left off.</Text>

          {error ? (
            <View
              style={st.messageBox}
              accessible
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
              accessibilityLabel={`Sign in failed. ${error}`}
            >
              <Ionicons name="alert-circle" size={17} color={C.danger} />
              <Text style={st.errorText}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={st.messageBox}>
              <Ionicons name="checkmark-circle" size={17} color={C.accent} />
              <Text style={st.successText}>{success}</Text>
            </View>
          ) : null}

          <View style={st.field}>
            <Text style={st.fieldLabel}>Email</Text>
            <TextInput
              style={st.input}
              placeholder="you@example.com"
              placeholderTextColor={C.textFaint}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              autoFocus
              accessibilityLabel="Email"
              selectionColor={C.accent}
            />
          </View>

          <View style={st.field}>
            <Text style={st.fieldLabel}>Password</Text>
            <View style={st.passwordWrap}>
              <TextInput
                style={[st.input, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
                placeholder="Your password"
                placeholderTextColor={C.textFaint}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                accessibilityLabel="Password"
                selectionColor={C.accent}
              />
              <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                onPress={() => setShowPassword(!showPassword)}
                style={st.showBtn}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Text style={st.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }} onPress={handleForgotPassword} style={st.forgotRow} accessibilityRole="button" accessibilityLabel="Forgot password">
            <Text style={st.forgotText}>Forgot password</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.primaryBtn, loading && st.btnDisabled]}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={st.primaryBtnText}>{loading ? 'Signing in...' : 'Sign in'}</Text>
          </TouchableOpacity>

          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => router.push('/(auth)/client-signup')}
            style={st.footerRow}
            accessibilityRole="button"
            accessibilityLabel="Go to sign up"
          >
            <Text style={st.footerText}>
              New here? <Text style={st.footerLink}>Create an account</Text>
            </Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
            onPress={() => router.push('/(auth)/login' as any)}
            style={st.coachRow}
            accessibilityRole="button"
            accessibilityLabel="Go to coach login"
          >
            <Text style={st.footerText}>
              Are you a coach? <Text style={st.footerLink}>Sign in here</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20 },
  backBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: F.headingBold, fontSize: 27, lineHeight: 32,
    color: C.textPrimary, marginTop: 26,
  },
  subtitle: { fontFamily: F.body, fontSize: 13, lineHeight: 20, color: C.textMuted, marginTop: 9, marginBottom: 26 },

  messageBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  errorText: { fontFamily: F.body, fontSize: 13, color: C.danger, flex: 1 },
  successText: { fontFamily: F.body, fontSize: 13, color: C.accent, flex: 1 },

  field: { marginBottom: 11 },
  fieldLabel: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted, marginBottom: 7 },
  input: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 14, paddingVertical: 15, paddingHorizontal: 15,
    fontFamily: F.bodyMedium, fontSize: 15, color: C.textPrimary,
  },
  passwordWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14,
  },
  showBtn: { paddingHorizontal: 15, paddingVertical: 12 },
  showText: { fontFamily: F.bodySemiBold, fontSize: 11.5, color: C.accent },

  forgotRow: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 20, paddingVertical: 4 },
  forgotText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: '#C9CEC2' },

  primaryBtn: {
    backgroundColor: C.accent, borderRadius: 999, paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnText: { fontFamily: F.bodyBold, fontSize: 15.5, color: C.onAccent },
  btnDisabled: { opacity: 0.5 },

  footerRow: { alignItems: 'center', marginTop: 20, paddingVertical: 8 },
  footerText: { fontFamily: F.body, fontSize: 13, color: C.textMuted },
  footerLink: { fontFamily: F.bodySemiBold, color: C.accent },

  coachRow: { alignItems: 'center', paddingVertical: 8, marginTop: 16 },
});
