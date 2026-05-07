import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Button from '../../components/Button';
import { Colors, Spacing, Radius, FontFamily, FontSize } from '../../constants/theme';

type AuthMode = 'phone' | 'email';
type PhoneStep = 'phone' | 'otp';

export default function LoginScreen() {
  const { signIn, signUp, signInWithPhone, verifyOtp } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('phone');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [isNewUser, setIsNewUser] = useState(true);
  const [isSignUp, setIsSignUp] = useState(false);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Phone
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [phoneName, setPhoneName] = useState('');

  // Email
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailName, setEmailName] = useState('');

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (raw.startsWith('+')) return raw;
    return `+${digits}`;
  };

  // --- Phone OTP ---
  const handleSendOtp = async () => {
    setError('');
    setSuccess('');
    const formatted = formatPhone(phone);
    if (formatted.length < 11) return setError('Enter a valid phone number');

    setLoading(true);
    try {
      await signInWithPhone(formatted);
      setPhone(formatted);

      // Check if user already exists
      const { data: existing } = await supabase
        .from('trainers')
        .select('id')
        .eq('phone', formatted)
        .maybeSingle();
      setIsNewUser(!existing);

      setPhoneStep('otp');
      setSuccess('Code sent! Check your phone.');
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    setSuccess('');
    if (otpCode.length < 6) return setError('Enter the 6-digit code');

    setLoading(true);
    try {
      const metadata: Record<string, string> = {};
      if (phoneName.trim()) metadata.name = phoneName.trim();
      await verifyOtp(phone, otpCode, metadata);
    } catch (err: any) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  // --- Email ---
  const handleEmailSubmit = async () => {
    setError('');
    setSuccess('');
    if (!email.trim() || !password.trim()) return setError('Fill in all fields');

    setLoading(true);
    try {
      if (isSignUp) {
        if (password.length < 6) throw new Error('Password must be 6+ characters');
        await signUp(email, password, emailName);
        setSuccess('Account created! Check email to confirm.');
        setIsSignUp(false);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) return setError('Enter your email first');
    setLoading(true);
    try {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email);
      if (e) throw e;
      setSuccess('Reset link sent! Check your email.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError('');
    setSuccess('');
    setPhoneStep('phone');
    setOtpCode('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logoIcon}>
            <Ionicons name="barbell" size={32} color={Colors.white} />
          </View>
          <Text style={styles.logoTitle}>FitLink</Text>
          <Text style={styles.logoSubtitle}>
            Grow Your Gym.{'\n'}One Client at a Time.
          </Text>
        </View>

        {/* Auth Tabs */}
        <View style={styles.authTabs}>
          <TouchableOpacity
            style={[styles.authTab, authMode === 'phone' && styles.authTabActive]}
            onPress={() => switchMode('phone')}
          >
            <Ionicons name="call" size={16} color={authMode === 'phone' ? Colors.textPrimary : Colors.textTertiary} />
            <Text style={[styles.authTabText, authMode === 'phone' && styles.authTabTextActive]}>Phone</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.authTab, authMode === 'email' && styles.authTabActive]}
            onPress={() => switchMode('email')}
          >
            <Ionicons name="mail" size={16} color={authMode === 'email' ? Colors.textPrimary : Colors.textTertiary} />
            <Text style={[styles.authTabText, authMode === 'email' && styles.authTabTextActive]}>Email</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
        {success ? <View style={styles.successBox}><Text style={styles.successText}>{success}</Text></View> : null}

        {/* ===== PHONE FLOW ===== */}
        {authMode === 'phone' && phoneStep === 'phone' && (
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PHONE NUMBER</Text>
              <TextInput
                style={styles.input}
                placeholder="(555) 123-4567"
                placeholderTextColor={Colors.textTertiary}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <Text style={styles.inputHint}>We'll send you a verification code via SMS</Text>
            </View>
            <Button title="Send Verification Code" onPress={handleSendOtp} loading={loading} full size="lg" />
          </View>
        )}

        {authMode === 'phone' && phoneStep === 'otp' && (
          <View style={styles.form}>
            {/* OTP sent info */}
            <View style={styles.otpInfo}>
              <Text style={styles.otpInfoText}>Code sent to <Text style={styles.otpInfoBold}>{phone}</Text></Text>
              <TouchableOpacity onPress={() => { setPhoneStep('phone'); setError(''); setSuccess(''); }}>
                <Text style={styles.changeLink}>Change</Text>
              </TouchableOpacity>
            </View>

            {/* Name — only for new users */}
            {isNewUser && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>YOUR NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Coach Mike Johnson"
                  placeholderTextColor={Colors.textTertiary}
                  value={phoneName}
                  onChangeText={setPhoneName}
                  autoComplete="name"
                />
              </View>
            )}

            {/* OTP Code */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>VERIFICATION CODE</Text>
              <TextInput
                style={[styles.input, styles.otpInput]}
                placeholder="000000"
                placeholderTextColor={Colors.textTertiary}
                value={otpCode}
                onChangeText={(t) => setOtpCode(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
              />
            </View>

            <Button title="Verify & Sign In" onPress={handleVerifyOtp} loading={loading} full size="lg" />
            <Button title="Resend Code" onPress={handleSendOtp} variant="secondary" loading={loading} full />
          </View>
        )}

        {/* ===== EMAIL FLOW ===== */}
        {authMode === 'email' && (
          <View style={styles.form}>
            {isSignUp && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>FULL NAME</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Coach Mike Johnson"
                  placeholderTextColor={Colors.textTertiary}
                  value={emailName}
                  onChangeText={setEmailName}
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL</Text>
              <TextInput
                style={styles.input}
                placeholder="coach@example.com"
                placeholderTextColor={Colors.textTertiary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            </View>

            {!isSignUp && (
              <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotRow}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            <Button
              title={isSignUp ? 'Create Account' : 'Sign In'}
              onPress={handleEmailSubmit}
              loading={loading}
              full
              size="lg"
            />

            <TouchableOpacity
              onPress={() => { setIsSignUp(!isSignUp); setError(''); setSuccess(''); }}
              style={styles.switchRow}
            >
              <Text style={styles.switchText}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={styles.switchLink}>{isSignUp ? 'Sign In' : 'Sign Up'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing['3xl'],
  },

  // Logo
  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  logoTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize['3xl'],
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  logoSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 20,
  },

  // Auth tabs
  authTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.bgSecondary,
    borderRadius: Radius.sm,
    padding: 3,
    marginBottom: Spacing.xl,
  },
  authTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.xs,
  },
  authTabActive: {
    backgroundColor: Colors.bgElevated,
  },
  authTabText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: Colors.textTertiary,
  },
  authTabTextActive: {
    color: Colors.textPrimary,
    fontFamily: FontFamily.bodySemiBold,
  },

  // Messages
  errorBox: {
    backgroundColor: Colors.redSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.2)',
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.red,
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: Colors.greenSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.2)',
  },
  successText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.green,
    textAlign: 'center',
  },

  // Form
  form: {
    gap: Spacing.base,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: Colors.bgInput,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: FontSize.md,
    fontFamily: FontFamily.body,
    color: Colors.textPrimary,
  },
  inputHint: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },

  // OTP
  otpInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  otpInfoText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  otpInfoBold: {
    fontFamily: FontFamily.bodySemiBold,
    color: Colors.textPrimary,
  },
  changeLink: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.accentText,
  },
  otpInput: {
    textAlign: 'center',
    fontSize: FontSize['2xl'],
    fontFamily: FontFamily.headingExtraBold,
    letterSpacing: 8,
  },

  // Forgot password
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: -8,
  },
  forgotText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.xs,
    color: Colors.accentText,
  },

  // Sign up / Sign in toggle
  switchRow: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  switchText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  switchLink: {
    fontFamily: FontFamily.bodySemiBold,
    color: Colors.accentText,
  },
});
