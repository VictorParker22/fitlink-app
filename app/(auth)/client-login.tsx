import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  Image, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontFamily, FontSize } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 220;

type AuthMode = 'phone' | 'email';
type PhoneStep = 'phone' | 'otp';

export default function ClientLoginScreen() {
  const router = useRouter();
  const { signInWithPhone, verifyOtpAsClient, signUpAsClient, signIn, linkClientAccount } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('phone');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [isSignUp, setIsSignUp] = useState(true);

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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailName, setEmailName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (raw.startsWith('+')) return raw;
    return `+${digits}`;
  };

  // --- Phone OTP ---
  const handleSendOtp = async () => {
    setError(''); setSuccess('');
    const formatted = formatPhone(phone);
    if (formatted.length < 11) return setError('Enter a valid phone number');

    setLoading(true);
    try {
      await signInWithPhone(formatted);
      setPhone(formatted);
      setPhoneStep('otp');
      setSuccess('Code sent! Check your phone.');
    } catch (err: any) {
      setError(err.message || 'Failed to send code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(''); setSuccess('');
    if (otpCode.length < 6) return setError('Enter the 6-digit code');

    setLoading(true);
    try {
      await verifyOtpAsClient(phone, otpCode, phoneName.trim() || undefined);
    } catch (err: any) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  // --- Email ---
  const handleEmailSubmit = async () => {
    setError(''); setSuccess('');
    if (!email.trim() || !password.trim()) return setError('Fill in all fields');

    setLoading(true);
    try {
      if (isSignUp) {
        if (password.length < 6) throw new Error('Password must be 6+ characters');
        if (password !== confirmPassword) { setError("Passwords don't match"); setLoading(false); return; }
        await signUpAsClient(email, password, emailName.trim() || 'Client');
        setSuccess('Account created! You can now sign in.');
      } else {
        await signIn(email, password);
        // After sign-in, try to auto-link if not already linked
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Set role to client if not already
          await supabase.auth.updateUser({ data: { role: 'client' } });
          await linkClientAccount(user.id, email);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(''); setSuccess('');
    setPhoneStep('phone');
    setOtpCode('');
  };

  const getTitle = () => {
    if (authMode === 'phone') return phoneStep === 'otp' ? 'Verify Code' : 'Client Sign In';
    return isSignUp ? 'Create Client Account' : 'Client Sign In';
  };

  const getSubtitle = () => {
    if (authMode === 'phone') return phoneStep === 'otp' ? `Enter the code sent to ${phone}` : 'Use the phone number your trainer has on file';
    return isSignUp ? 'Use the email your trainer invited you with' : 'Sign in to view your workouts & plans';
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.heroSection}>
        <LinearGradient
          colors={[Colors.accent, '#FF8A65', '#FFB74D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroGradient}
        />
        <View style={styles.heroContent}>
          <Ionicons name="fitness" size={36} color={Colors.white} />
          <Text style={styles.heroTitle}>FitLink</Text>
          <Text style={styles.heroSub}>Client Portal</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.formWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Back to trainer login */}
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="arrow-back" size={16} color={Colors.textTertiary} />
            <Text style={styles.backText}>Back to trainer login</Text>
          </TouchableOpacity>

          <Text style={styles.title}>{getTitle()}</Text>
          <Text style={styles.subtitle}>{getSubtitle()}</Text>

          {/* Auth Mode Tabs */}
          <View style={styles.authTabs}>
            <TouchableOpacity style={[styles.authTab, authMode === 'phone' && styles.authTabActive]} onPress={() => switchMode('phone')}>
              <Ionicons name="call-outline" size={15} color={authMode === 'phone' ? Colors.accent : Colors.textTertiary} />
              <Text style={[styles.authTabText, authMode === 'phone' && styles.authTabTextActive]}>Phone</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.authTab, authMode === 'email' && styles.authTabActive]} onPress={() => switchMode('email')}>
              <Ionicons name="mail-outline" size={15} color={authMode === 'email' ? Colors.accent : Colors.textTertiary} />
              <Text style={[styles.authTabText, authMode === 'email' && styles.authTabTextActive]}>Email</Text>
            </TouchableOpacity>
          </View>

          {/* Error / Success */}
          {error ? (
            <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={Colors.red} /><Text style={styles.errorText}>{error}</Text></View>
          ) : null}
          {success ? (
            <View style={styles.successBox}><Ionicons name="checkmark-circle" size={16} color={Colors.green} /><Text style={styles.successText}>{success}</Text></View>
          ) : null}

          {/* Phone Flow */}
          {authMode === 'phone' && phoneStep === 'phone' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Your Name</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="Your full name" placeholderTextColor={Colors.textTertiary} value={phoneName} onChangeText={setPhoneName} />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="call-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="(555) 000-0000" placeholderTextColor={Colors.textTertiary} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                </View>
              </View>
              <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleSendOtp} disabled={loading} activeOpacity={0.85}>
                <Text style={styles.submitText}>{loading ? 'Sending...' : 'Send Code'}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>
            </>
          )}

          {authMode === 'phone' && phoneStep === 'otp' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Verification Code</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="keypad-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="000000" placeholderTextColor={Colors.textTertiary} value={otpCode} onChangeText={setOtpCode} keyboardType="number-pad" maxLength={6} />
                </View>
              </View>
              <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleVerifyOtp} disabled={loading} activeOpacity={0.85}>
                <Text style={styles.submitText}>{loading ? 'Verifying...' : 'Verify & Sign In'}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setPhoneStep('phone'); setOtpCode(''); setError(''); }} style={{ marginTop: Spacing.md, alignItems: 'center' }}>
                <Text style={styles.backText}>← Change number</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Email Flow */}
          {authMode === 'email' && (
            <>
              {isSignUp && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Your Name</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="person-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="Your full name" placeholderTextColor={Colors.textTertiary} value={emailName} onChangeText={setEmailName} />
                  </View>
                </View>
              )}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="you@email.com" placeholderTextColor={Colors.textTertiary} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor={Colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>
              {isSignUp && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm Password</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                    <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor={Colors.textTertiary} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
                  </View>
                </View>
              )}
              <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleEmailSubmit} disabled={loading} activeOpacity={0.85}>
                <Text style={styles.submitText}>{loading ? 'Please wait...' : (isSignUp ? 'Create Account' : 'Sign In')}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setIsSignUp(!isSignUp); setError(''); setSuccess(''); }} style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
                <Text style={styles.toggleText}>
                  {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                  <Text style={styles.toggleLink}>{isSignUp ? 'Sign In.' : 'Sign Up.'}</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFBFC' },

  heroSection: { height: HERO_HEIGHT, overflow: 'hidden' },
  heroGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 30 },
  heroTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 28, color: Colors.white, marginTop: Spacing.sm },
  heroSub: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 4, letterSpacing: 1, textTransform: 'uppercase' },

  formWrapper: { flex: 1, marginTop: -20, backgroundColor: '#FAFBFC', borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'] },
  scrollContent: { padding: Spacing.xl, paddingBottom: Spacing['4xl'] },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.lg },
  backText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },

  title: { fontFamily: FontFamily.headingExtraBold, fontSize: 24, color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 6, lineHeight: 20, marginBottom: Spacing.xl },

  authTabs: { flexDirection: 'row', backgroundColor: Colors.bgSecondary, borderRadius: Radius.md, padding: 4, marginBottom: Spacing.lg },
  authTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.sm },
  authTabActive: { backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  authTabText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textTertiary },
  authTabTextActive: { color: Colors.accent },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${Colors.red}10`, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  errorText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.red, flex: 1 },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${Colors.green}10`, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.md },
  successText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.green, flex: 1 },

  inputGroup: { marginBottom: Spacing.md },
  inputLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: Colors.textPrimary, marginBottom: 6 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md, paddingHorizontal: Spacing.md },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, paddingVertical: 14, fontFamily: FontFamily.body, fontSize: FontSize.base, color: Colors.textPrimary },
  eyeBtn: { padding: 6 },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: Radius.md, paddingVertical: 15, marginTop: Spacing.sm, shadowColor: Colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.white },

  toggleText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary },
  toggleLink: { fontFamily: FontFamily.bodySemiBold, color: Colors.accent },
});
