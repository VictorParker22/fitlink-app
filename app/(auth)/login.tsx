import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  Image, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Colors, Spacing, Radius, FontFamily, FontSize } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 260;

export default function LoginScreen() {
  const { signIn, signUp, signInWithPhone, verifyOtp } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Email
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailName, setEmailName] = useState('');

  // --- Email ---
  const handleEmailSubmit = async () => {
    setError('');
    setSuccess('');
    if (!email.trim() || !password.trim()) return setError('Fill in all fields');

    setLoading(true);
    try {
      if (isSignUp) {
        if (password.length < 6) throw new Error('Password must be 6+ characters');
        if (password !== confirmPassword) {
          setError('Passwords don\'t match');
          setLoading(false);
          return;
        }
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

  const toggleMode = () => {
    setIsSignUp(!isSignUp);
    setError('');
    setSuccess('');
    setConfirmPassword('');
  };

  return (
    <View style={styles.container}>
      {/* Hero Image with White Gradient Overlay */}
      <View style={styles.heroSection}>
        <Image
          source={require('../../assets/images/login-hero.png')}
          style={styles.heroImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(250,251,252,0.4)', 'rgba(250,251,252,0.85)', '#FAFBFC']}
          locations={[0, 0.4, 0.7, 1]}
          style={styles.heroGradient}
        />
        {/* Logo Badge */}
        <View style={styles.logoBadge}>
          <Ionicons name="fitness" size={22} color={Colors.white} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.formWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <Text style={styles.title}>
            {isSignUp ? 'Sign Up For Free' : 'Sign In To FitLink'}
          </Text>
          <Text style={styles.subtitle}>
            {isSignUp
              ? 'Quickly make your account in 1 minute'
              : "Let's personalize your fitness coaching"}
          </Text>

          {/* Messages */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {success ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{success}</Text>
            </View>
          ) : null}

          {/* Name (Sign Up only) */}
          {isSignUp && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Coach Mike Johnson"
                  placeholderTextColor={Colors.textTertiary}
                  value={emailName}
                  onChangeText={setEmailName}
                  autoComplete="name"
                />
              </View>
            </View>
          )}

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
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
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={Colors.textTertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password (Sign Up only) */}
          {isSignUp && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <View style={[
                styles.inputWrapper,
                confirmPassword && password !== confirmPassword && styles.inputWrapperError,
              ]}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={Colors.textTertiary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>
              {confirmPassword && password !== confirmPassword && (
                <View style={styles.matchError}>
                  <Text style={styles.matchErrorEmoji}>⚠️</Text>
                  <Text style={styles.matchErrorText}>ERROR: Password Don't Match!</Text>
                </View>
              )}
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleEmailSubmit}
            disabled={loading}
          >
            <Text style={styles.submitText}>{isSignUp ? 'Sign Up' : 'Sign In'}</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} />
          </TouchableOpacity>

          {/* Social Icons (decorative) */}
          {!isSignUp && (
            <View style={styles.socialRow}>
              {(['logo-instagram', 'logo-facebook', 'logo-linkedin'] as const).map((icon) => (
                <TouchableOpacity key={icon} style={styles.socialBtn}>
                  <Ionicons name={icon} size={18} color={Colors.textPrimary} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Toggle + Forgot */}
          <View style={styles.footerLinks}>
            <TouchableOpacity onPress={toggleMode}>
              <Text style={styles.toggleText}>
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <Text style={styles.toggleLink}>{isSignUp ? 'Sign In.' : 'Sign Up.'}</Text>
              </Text>
            </TouchableOpacity>
            {!isSignUp && (
              <TouchableOpacity onPress={handleForgotPassword} style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Forgot Password</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },

  // Hero
  heroSection: {
    height: HERO_HEIGHT,
    width: '100%',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HERO_HEIGHT,
  },
  logoBadge: {
    position: 'absolute',
    left: Spacing.xl,
    bottom: 50,
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    // Shadow
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },

  // Form
  formWrapper: {
    flex: 1,
    marginTop: -30,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },

  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize['3xl'],
    color: Colors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },

  // Messages
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.redSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorEmoji: { fontSize: 14 },
  errorText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.red,
    flex: 1,
  },
  successBox: {
    backgroundColor: Colors.greenSoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.base,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  successText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.green,
    textAlign: 'center',
  },

  // Input
  inputGroup: {
    marginBottom: Spacing.base,
  },
  inputLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7F2',
    borderWidth: 1.5,
    borderColor: '#FDDCB5',
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
  },
  inputWrapperError: {
    borderColor: Colors.red,
    backgroundColor: Colors.redSoft,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: FontSize.base,
    fontFamily: FontFamily.body,
    color: Colors.textPrimary,
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 4,
  },
  matchError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  matchErrorEmoji: { fontSize: 12 },
  matchErrorText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.red,
  },

  // Submit
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.textPrimary,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    marginTop: Spacing.sm,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.md,
    color: Colors.white,
  },

  // Social
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginTop: Spacing['2xl'],
  },
  socialBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Footer
  footerLinks: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  toggleText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  toggleLink: {
    fontFamily: FontFamily.bodySemiBold,
    color: Colors.accentText,
    textDecorationLine: 'underline',
  },
  forgotBtn: {
    marginTop: 2,
  },
  forgotText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: Colors.accentText,
    textDecorationLine: 'underline',
  },
});
