import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, FlatList,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import Card from '../../components/Card';
import { Colors, Spacing, Radius, FontFamily, FontSize } from '../../constants/theme';

const HERO_HEIGHT = 200;

// Lookup status after email/phone entered
type LookupStatus = 'idle' | 'checking' | 'found' | 'not_found';

// Flow: email entry → lookup → either "create password" or "full signup + pick trainer"
type FlowStep = 'enter_info' | 'create_password' | 'pick_trainer';

export default function ClientLoginScreen() {
  const router = useRouter();
  const { signUpAsClient, signIn, linkClientAccount } = useAuth();

  const [flowStep, setFlowStep] = useState<FlowStep>('enter_info');
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>('idle');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Found client data
  const [foundClient, setFoundClient] = useState<any>(null);
  const [foundTrainerName, setFoundTrainerName] = useState('');

  // Trainer picker (for new clients)
  const [trainers, setTrainers] = useState<any[]>([]);
  const [selectedTrainer, setSelectedTrainer] = useState<string | null>(null);
  const [loadingTrainers, setLoadingTrainers] = useState(false);

  // --- Lookup client by email (uses RPC to bypass RLS) ---
  const handleLookup = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) return setError('Enter a valid email address');

    setError(''); setSuccess('');
    setLookupStatus('checking');

    try {
      const { data, error: rpcErr } = await supabase.rpc('lookup_client_by_email', {
        lookup_email: trimmed,
      });

      console.log('[ClientLogin] RPC result:', JSON.stringify({ trimmed, data, rpcErr }));

      if (rpcErr) throw rpcErr;

      if (data?.found) {
        if (data.has_account) {
          // Already linked — switch to sign in
          setLookupStatus('not_found');
          setIsSignIn(true);
          setSuccess('You already have an account! Sign in below.');
        } else {
          // Found unlinked client — create password flow
          setFoundClient({ name: data.client_name });
          setFoundTrainerName(data.trainer_name || 'your trainer');
          setName(data.client_name || '');
          setLookupStatus('found');
          setFlowStep('create_password');
        }
      } else {
        // Not found — new client
        setLookupStatus('not_found');
        setFlowStep('enter_info');
      }
    } catch (err) {
      console.error('[ClientLogin] Lookup error:', err);
      setLookupStatus('not_found');
    }
  }, [email]);

  // --- Existing client: create password & link ---
  const handleCreatePassword = async () => {
    setError('');
    if (!password.trim()) return setError('Create a password');
    if (password.length < 6) return setError('Password must be 6+ characters');
    if (password !== confirmPassword) return setError("Passwords don't match");

    setLoading(true);
    try {
      const trimmedEmail = email.trim().toLowerCase();
      // Create the account
      await signUpAsClient(trimmedEmail, password, name || 'Client');
      // Immediately sign in (signUp may require email confirmation)
      await signIn(trimmedEmail, password);
      // Ensure role is set and account is linked
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.auth.updateUser({ data: { role: 'client' } });
        await linkClientAccount(user.id, trimmedEmail);
      }
      setSuccess('You\'re in! Redirecting...');
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // --- New client: full signup ---
  const handleNewSignup = async () => {
    setError('');
    if (!name.trim()) return setError('Enter your name');
    if (!email.trim()) return setError('Enter your email');
    if (password.length < 6) return setError('Password must be 6+ characters');
    if (password !== confirmPassword) return setError("Passwords don't match");

    setLoading(true);
    try {
      // Create auth account
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { name: name.trim(), role: 'client' } },
      });
      if (signUpErr) throw signUpErr;

      if (!selectedTrainer) {
        // Load trainers for picker
        setLoadingTrainers(true);
        const { data: trainerList } = await supabase
          .from('trainers')
          .select('id, name, specialization, avatar_url')
          .order('name');
        setTrainers(trainerList || []);
        setLoadingTrainers(false);
        setFlowStep('pick_trainer');
        setLoading(false);
        return;
      }

      // If trainer already selected, create client row
      await createClientRow(data.user!.id, selectedTrainer);
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // --- Pick trainer & create client row ---
  const handlePickTrainer = async (trainerId: string) => {
    setSelectedTrainer(trainerId);
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      await createClientRow(user.id, trainerId);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to trainer');
      setLoading(false);
    }
  };

  const createClientRow = async (userId: string, trainerId: string) => {
    // Create client row linked to trainer
    const { error: insertErr } = await supabase.from('clients').insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      trainer_id: trainerId,
      auth_user_id: userId,
      status: 'trial',
    });
    if (insertErr) throw insertErr;

    // Notify trainer
    try {
      await supabase.from('notifications').insert({
        trainer_id: trainerId,
        type: 'new_client',
        title: 'New Client!',
        message: `${name.trim()} just signed up and chose you as their trainer!`,
        read: false,
      });
    } catch {} // non-critical

    setSuccess('Connected! Redirecting...');
    // Auth state change will trigger navigation
  };

  // --- Existing user sign in ---
  const handleSignIn = async () => {
    setError('');
    if (!email.trim() || !password.trim()) return setError('Fill in all fields');
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.auth.updateUser({ data: { role: 'client' } });
        await linkClientAccount(user.id, email.trim().toLowerCase());
      }
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const [isSignIn, setIsSignIn] = useState(false);

  // === RENDER ===
  return (
    <View style={styles.container}>
      <View style={styles.heroSection}>
        <LinearGradient colors={[Colors.accent, '#FF8A65', '#FFB74D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroGradient} />
        <View style={styles.heroContent}>
          <Ionicons name="fitness" size={32} color={Colors.white} />
          <Text style={styles.heroTitle}>FitLink</Text>
          <Text style={styles.heroSub}>Client Portal</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.formWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => flowStep === 'enter_info' ? router.back() : setFlowStep('enter_info')} style={styles.backRow}>
            <Ionicons name="arrow-back" size={16} color={Colors.textTertiary} />
            <Text style={styles.backText}>{flowStep === 'enter_info' ? 'Back to trainer login' : 'Back'}</Text>
          </TouchableOpacity>

          {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={Colors.red} /><Text style={styles.errorText}>{error}</Text></View> : null}
          {success ? <View style={styles.successBox}><Ionicons name="checkmark-circle" size={16} color={Colors.green} /><Text style={styles.successText}>{success}</Text></View> : null}

          {/* ============ STEP 1: Enter email to check ============ */}
          {flowStep === 'enter_info' && !isSignIn && (
            <>
              <Text style={styles.title}>Get Started</Text>
              <Text style={styles.subtitle}>Enter your email and we'll check if your trainer already set you up.</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="you@email.com" placeholderTextColor={Colors.textTertiary} value={email} onChangeText={(t) => { setEmail(t); setLookupStatus('idle'); }} keyboardType="email-address" autoCapitalize="none" autoFocus />
                </View>
              </View>

              {/* Found banner */}
              {lookupStatus === 'found' && (
                <View style={styles.foundBanner}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.green} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foundTitle}>Welcome, {foundClient?.name}! 🎉</Text>
                    <Text style={styles.foundSub}>Your trainer {foundTrainerName} already added you. Just create a password below.</Text>
                  </View>
                </View>
              )}

              {lookupStatus === 'not_found' && email.includes('@') && (
                <>
                  <View style={styles.newBanner}>
                    <Ionicons name="person-add" size={20} color={Colors.blue} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.newTitle}>New here? No problem!</Text>
                      <Text style={styles.newSub}>Fill out your info below and pick your trainer.</Text>
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Your Name</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="person-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                      <TextInput style={styles.input} placeholder="Your full name" placeholderTextColor={Colors.textTertiary} value={name} onChangeText={setName} />
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Create Password</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                      <TextInput style={styles.input} placeholder="6+ characters" placeholderTextColor={Colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Confirm Password</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                      <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor={Colors.textTertiary} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
                    </View>
                  </View>
                  <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleNewSignup} disabled={loading} activeOpacity={0.85}>
                    <Text style={styles.submitText}>{loading ? 'Creating...' : 'Sign Up & Pick Trainer'}</Text>
                    <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                  </TouchableOpacity>
                </>
              )}

              {lookupStatus === 'idle' && (
                <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleLookup} disabled={loading} activeOpacity={0.85}>
                <Text style={styles.submitText}>Continue</Text><Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => setIsSignIn(true)} style={{ marginTop: Spacing.xl, alignItems: 'center' }}>
                <Text style={styles.toggleText}>Already have an account? <Text style={styles.toggleLink}>Sign In.</Text></Text>
              </TouchableOpacity>
            </>
          )}

          {/* ============ Sign In Mode ============ */}
          {flowStep === 'enter_info' && isSignIn && (
            <>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to your client account.</Text>

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
              <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleSignIn} disabled={loading} activeOpacity={0.85}>
                <Text style={styles.submitText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsSignIn(false)} style={{ marginTop: Spacing.xl, alignItems: 'center' }}>
                <Text style={styles.toggleText}>Don't have an account? <Text style={styles.toggleLink}>Sign Up.</Text></Text>
              </TouchableOpacity>
            </>
          )}

          {/* ============ STEP 2: Existing client — create password ============ */}
          {flowStep === 'create_password' && (
            <>
              <Text style={styles.title}>Almost There! 🎉</Text>
              <View style={styles.foundBanner}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.green} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.foundTitle}>Welcome, {foundClient?.name}!</Text>
                  <Text style={styles.foundSub}>Coach {foundTrainerName} has everything ready for you. Just create a password to get started.</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Create Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="6+ characters" placeholderTextColor={Colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoFocus />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textTertiary} style={styles.inputIcon} />
                  <TextInput style={styles.input} placeholder="••••••••" placeholderTextColor={Colors.textTertiary} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
                </View>
              </View>
              <TouchableOpacity style={[styles.submitBtn, loading && styles.submitBtnDisabled]} onPress={handleCreatePassword} disabled={loading} activeOpacity={0.85}>
                <Text style={styles.submitText}>{loading ? 'Creating...' : "Let's Go!"}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.white} />
              </TouchableOpacity>
            </>
          )}

          {/* ============ STEP 3: Pick a trainer ============ */}
          {flowStep === 'pick_trainer' && (
            <>
              <Text style={styles.title}>Pick Your Coach</Text>
              <Text style={styles.subtitle}>Choose a trainer to start your fitness journey with.</Text>

              {loadingTrainers ? (
                <ActivityIndicator size="large" color={Colors.accent} style={{ marginTop: Spacing['2xl'] }} />
              ) : trainers.length === 0 ? (
                <View style={styles.emptyTrainers}>
                  <Ionicons name="people-outline" size={40} color={Colors.textTertiary} />
                  <Text style={styles.emptyText}>No trainers available yet</Text>
                </View>
              ) : (
                trainers.map((t) => (
                  <TouchableOpacity key={t.id} activeOpacity={0.7} onPress={() => handlePickTrainer(t.id)} disabled={loading}>
                    <Card style={styles.trainerCard}>
                      <View style={styles.trainerRow}>
                        <Avatar name={t.name} size="md" imageUrl={t.avatar_url} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.trainerName}>{t.name}</Text>
                          {t.specialization && <Text style={styles.trainerSpec}>{t.specialization}</Text>}
                        </View>
                        <View style={[styles.pickBadge, { backgroundColor: Colors.accentSoft }]}>
                          <Text style={styles.pickText}>Select</Text>
                        </View>
                      </View>
                    </Card>
                  </TouchableOpacity>
                ))
              )}
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
  heroTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: 26, color: Colors.white, marginTop: Spacing.xs },
  heroSub: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.8)', marginTop: 2, letterSpacing: 1, textTransform: 'uppercase' },
  formWrapper: { flex: 1, marginTop: -20, backgroundColor: '#FAFBFC', borderTopLeftRadius: Radius['2xl'], borderTopRightRadius: Radius['2xl'] },
  scrollContent: { padding: Spacing.xl, paddingBottom: Spacing['4xl'] },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.lg },
  backText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: 24, color: Colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 6, lineHeight: 20, marginBottom: Spacing.xl },

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

  foundBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: `${Colors.green}10`, padding: Spacing.lg, borderRadius: Radius.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: `${Colors.green}30` },
  foundTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  foundSub: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },

  newBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, backgroundColor: `${Colors.blue}10`, padding: Spacing.lg, borderRadius: Radius.lg, marginBottom: Spacing.lg, borderWidth: 1, borderColor: `${Colors.blue}30` },
  newTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  newSub: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },

  trainerCard: { marginBottom: Spacing.md },
  trainerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  trainerName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: Colors.textPrimary },
  trainerSpec: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.accentText, marginTop: 2 },
  pickBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
  pickText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: Colors.accent },

  emptyTrainers: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: Colors.textTertiary },
});
