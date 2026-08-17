import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Animated, Keyboard, Share,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts';
import { useApp } from '../context/AppContext';
import { useAlert } from '../context/AlertContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { supabase } from '../lib/supabase';

const GOAL_SUGGESTIONS = ['Lose weight', 'Build muscle', 'Improve strength', 'General fitness', 'Flexibility', 'Sports performance'];

// Tone matches the mockup's neutral "inner circle" fills — not in the shared
// token file because they're a one-off layer between surface and border.
const RAISED_CIRCLE = '#1E211D';
const TRACK_BG = '#1E211D';

function formatTrialEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export default function AddClientScreen() {
  const router = useRouter();
  const { updateClient, plans, refreshClients, trainer, clients } = useApp();
  const { showAlert } = useAlert();

  // Wizard state
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Identity
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);

  // Step 2 — Pass enrollment. "How they start" (trial vs paying now) folds the
  // old separate Trial/Active status control into the pass choice itself —
  // there's no independent status toggle any more. `startMode` only applies
  // when a real plan is selected; picking "No pass for now" always means trial.
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [startMode, setStartMode] = useState<'trial' | 'paying'>('trial');

  // Step 3 — Goals & notes
  const [goals, setGoals] = useState('');
  const [notes, setNotes] = useState('');
  const [justSaved, setJustSaved] = useState<{ id: string; name: string } | null>(null);

  // Find existing
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResults, setFindResults] = useState<any[]>([]);
  const [findLoading, setFindLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const selectedPlanData = plans.find(p => p.id === selectedPlan);
  // Derived DB status: a plan + "paying now" makes the client active;
  // everything else (no plan, or trialling a plan) writes 'trial'.
  const derivedStatus: 'trial' | 'active' = selectedPlan && startMode === 'paying' ? 'active' : 'trial';
  const trialEndLabel = formatTrialEndDate();
  const progressPct = step / 3;

  // ── Contact Import ──
  const handleImportContact = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Contact access is needed to import client info.');
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });
      if (data.length === 0) {
        showAlert({ type: 'info', title: 'No contacts', message: 'No contacts found on this device.' });
        return;
      }
      const validContacts = data.filter(c => c.name).slice(0, 20);
      if (validContacts.length === 0) return;

      const buttons = validContacts.slice(0, 5).map(c => ({
        text: c.name || 'Unknown',
        onPress: () => {
          setName(c.name || '');
          if (c.emails && c.emails.length > 0) setEmail(c.emails[0].email || '');
          if (c.phoneNumbers && c.phoneNumbers.length > 0) setPhone(c.phoneNumbers[0].number || '');
        },
      }));
      buttons.push({ text: 'Cancel', onPress: () => {} });
      Alert.alert('Select contact', 'Choose a contact to import', buttons);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to access contacts' });
    }
  };

  // ── Avatar ──
  const handlePickAvatar = async () => {
    Alert.alert('Client photo', 'Choose how to add a photo', [
      { text: 'Take photo', onPress: () => launchPicker('camera') },
      { text: 'Choose from library', onPress: () => launchPicker('library') },
      ...(avatarUri ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => { setAvatarUri(null); setAvatarBase64(null); } }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Camera access is needed.'); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission required', 'Photo library access is needed.'); return; }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.7, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.7, base64: true });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { Alert.alert('Error', 'Could not read image data.'); return; }
    setAvatarUri(asset.uri);
    setAvatarBase64(asset.base64);
  };

  const uploadClientAvatar = async (clientId: string): Promise<string | undefined> => {
    if (!avatarBase64 || !avatarUri) return undefined;
    try {
      const fileExt = avatarUri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `clients/${clientId}/avatar.${fileExt}`;
      const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
      const binaryStr = atob(avatarBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, bytes.buffer, { contentType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      return `${urlData.publicUrl}?t=${Date.now()}`;
    } catch (err: any) {
      console.error('Client avatar upload failed:', err);
      return undefined;
    }
  };

  // ── Save ──
  const handleSave = async () => {
    if (!name.trim()) return showAlert({ type: 'warning', title: 'Name required', message: 'Please enter a client name.' });
    if (saving) return; // Prevent double-tap

    // Duplicate check by email
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail) {
      const emailDup = clients.find(c => c.email?.toLowerCase() === trimmedEmail);
      if (emailDup) {
        return showAlert({ type: 'warning', title: 'Client already exists', message: `A client with this email (${emailDup.name}) is already in your list.` });
      }
    }

    setSaving(true);
    Keyboard.dismiss();
    try {
      // 1. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 2. Insert directly — do NOT call addClient (it triggers setClients which re-renders everything)
      const insertPayload: any = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        plan_id: selectedPlan || null,
        status: derivedStatus,
        trainer_id: user.id,
      };
      if (goals.trim() || notes.trim()) {
        insertPayload.assessment_data = {
          ...(goals.trim() ? { fitness_goals: goals.split(',').map(g => g.trim()).filter(Boolean) } : {}),
          ...(notes.trim() ? { coach_notes: notes.trim() } : {}),
        };
      }

      const { data: newClient, error } = await supabase
        .from('clients')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;

      // 3. Avatar upload in background
      if (avatarBase64 && avatarUri && newClient) {
        uploadClientAvatar(newClient.id).then(avatarUrl => {
          if (avatarUrl) updateClient(newClient.id, { avatar_url: avatarUrl } as any);
        }).catch(() => {});
      }

      // 4. Show an in-flow success state instead of bouncing back immediately —
      // ties into the setup checklist on the home tab (generic "done" close).
      setJustSaved({ id: newClient.id, name: name.trim() });

      // 5. Refresh client list in the background so it's ready when they leave
      refreshClients();

    } catch (err: any) {
      console.error('[AddClient] Save failed:', err);
      showAlert({ type: 'error', title: 'Failed to add', message: err.message || 'Something went wrong. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const finishToClient = () => {
    if (justSaved) {
      router.replace(`/client/${justSaved.id}` as any);
    } else {
      router.back();
    }
  };

  const finishToDashboard = () => {
    router.back();
  };

  // ── Invite ──
  const handleInvite = async () => {
    const coachName = trainer?.name || 'your coach';
    const clientFirst = name.trim().split(' ')[0] || 'there';
    try {
      await Share.share({
        message: `Hey ${clientFirst}! ${coachName} has invited you to join FitLink to track your workouts and schedule sessions. Download here: https://fitlink.coach${trainer?.id ? `?ref=${trainer.id}` : ''}`,
        title: 'Join me on FitLink',
      });
    } catch (err) {}
  };

  // ── Find existing ──
  const handleFindUser = async () => {
    const q = findQuery.trim();
    if (!q) return;
    setFindLoading(true);
    setFindResults([]);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('search-unassigned-clients', {
        body: { query: q, trainerId: user?.id }
      });
      if (error) throw new Error(error.message || 'Search failed');
      setFindResults(data?.data || []);
      if ((data?.data || []).length === 0) {
        showAlert({ type: 'info', title: 'No results', message: 'No users found. Try a different name or email.' });
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Search error', message: err.message || 'Failed to search' });
    } finally {
      setFindLoading(false);
    }
  };

  const handleLinkClient = async (client: any) => {
    setLinking(client.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (client.authUserId) {
        // Auth user found on FitLink — create client record WITH auth_user_id + assessment
        const { error } = await supabase
          .from('clients')
          .insert({
            name: client.name || 'Client',
            email: client.email || null,
            phone: client.phone || null,
            status: 'active',
            trainer_id: user.id,
            auth_user_id: client.authUserId,
            assessment_data: client.assessment_data || null,
          });
        if (error) throw error;
      } else {
        // Existing client record — claim via edge function (bypasses RLS)
        const { error } = await supabase.functions.invoke('search-unassigned-clients', {
          body: { action: 'link', clientId: client.id, trainerId: user.id }
        });
        if (error) {
          const { error: updateErr } = await supabase
            .from('clients')
            .update({ trainer_id: user.id })
            .eq('id', client.id);
          if (updateErr) throw updateErr;
        }
      }

      // Navigate back FIRST
      showAlert({ type: 'success', title: 'Client added', message: `${client.name} is now your client.` });
      setLinking(null);
      router.back();

      // Refresh state AFTER navigation
      setTimeout(() => { refreshClients(); }, 600);
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Link error', message: err.message || 'Failed to link client' });
      setLinking(null);
    }
  };

  // ── Navigation ──
  const goNext = () => {
    if (step === 1 && !name.trim()) {
      return showAlert({ type: 'warning', title: 'Name required', message: 'Enter a client name to continue.' });
    }
    if (step < 3) setStep(step + 1);
    else handleSave();
  };

  const goBack = () => {
    if (showFind) { setShowFind(false); return; }
    if (step > 1) setStep(step - 1);
    else router.back();
  };

  const initials = (name || 'FL').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  // ═══════════ RENDER: success state ═══════════
  if (justSaved) {
    return (
      <View style={st.container}>
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
          <View style={st.successWrap}>
            <View style={st.successIcon}>
              <Ionicons name="checkmark" size={34} color={CoachColors.onAccent} />
            </View>
            <Text style={st.successTitle}>{justSaved.name} is in</Text>
            <Text style={st.successDesc}>They're added to your roster. Finish their profile whenever you're ready.</Text>
          </View>
          <View style={st.successCtaWrap}>
            <TouchableOpacity onPress={finishToClient} activeOpacity={0.85} style={st.ctaBtn}>
              <Text style={st.ctaBtnText}>Go to profile</Text>
            </TouchableOpacity>
            <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }} onPress={finishToDashboard} activeOpacity={0.7} style={st.successSecondaryBtn}>
              <Text style={st.successSecondaryText}>Back to dashboard</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ═══════════ RENDER ═══════════
  return (
    <View style={st.container}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity hitSlop={4} onPress={goBack} style={st.headerBack}>
            <Ionicons name="arrow-back" size={19} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle}>
              {step === 1 ? "Who's joining?" : step === 2 ? 'Give them a pass' : 'What are they after?'}
            </Text>
            <Text style={st.headerSubtitle}>Step {step} of 3</Text>
          </View>
          {step > 1 && (
            <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }} onPress={goNext} style={st.headerSkip}>
              <Text style={st.headerSkipText}>{step === 3 ? '' : 'Skip'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Progress Bar */}
        <View style={st.progressTrack}>
          <Animated.View style={[st.progressFill, { width: `${progressPct * 100}%` }]} />
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* ═══ STEP 1: Identity ═══ */}
          {step === 1 && !showFind && (
            <KeyboardAwareScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" extraScrollHeight={80} enableOnAndroid>
              {/* Quick Add Methods */}
              <Text style={st.sectionLabel}>Fastest way</Text>
              <View style={st.quickAddRow}>
                <TouchableOpacity style={st.quickAddCard} onPress={handleImportContact} activeOpacity={0.7}>
                  <View style={st.quickAddIcon}>
                    <Ionicons name="people" size={20} color={CoachColors.textSecondary} />
                  </View>
                  <Text style={st.quickAddTitle}>Contacts</Text>
                  <Text style={st.quickAddDesc}>From your phone</Text>
                </TouchableOpacity>

                <TouchableOpacity style={st.quickAddCard} onPress={() => setShowFind(true)} activeOpacity={0.7}>
                  <View style={st.quickAddIcon}>
                    <Ionicons name="search" size={20} color={CoachColors.textSecondary} />
                  </View>
                  <Text style={st.quickAddTitle}>Find user</Text>
                  <Text style={st.quickAddDesc}>Already on FitLink</Text>
                </TouchableOpacity>
              </View>

              {/* Avatar + Name */}
              <Text style={st.sectionLabel}>Or enter it yourself</Text>
              <View style={st.identityCard}>
                <TouchableOpacity style={st.avatarPicker} onPress={handlePickAvatar} activeOpacity={0.8}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={st.avatarImage} contentFit="cover" />
                  ) : (
                    <View style={st.avatarPlaceholder}>
                      {name ? (
                        <Text style={st.avatarInitials}>{initials}</Text>
                      ) : (
                        <Ionicons name="person" size={25} color={CoachColors.textFaint} />
                      )}
                    </View>
                  )}
                  <View style={st.avatarBadge}>
                    <Ionicons name="camera" size={13} color={CoachColors.onAccent} />
                  </View>
                </TouchableOpacity>

                <View style={{ flex: 1, gap: 10 }}>
                  <View style={st.inputWrap}>
                    <Text style={st.inputLabel}>Full name</Text>
                    <TextInput
                      style={st.input}
                      placeholder="Full name"
                      placeholderTextColor={CoachColors.textFaint}
                      value={name}
                      onChangeText={setName}
                      autoFocus
                    />
                  </View>
                </View>
              </View>

              {/* Contact fields */}
              <View style={st.contactRow}>
                <View style={[st.inputRow, { flex: 1 }]}>
                  <Ionicons name="mail-outline" size={19} color={CoachColors.textFaint} />
                  <TextInput
                    style={st.input}
                    placeholder="Email"
                    placeholderTextColor={CoachColors.textFaint}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <View style={st.contactRow}>
                <View style={[st.inputRow, { flex: 1 }]}>
                  <Ionicons name="call-outline" size={19} color={CoachColors.textFaint} />
                  <TextInput
                    style={st.input}
                    placeholder="Phone — optional"
                    placeholderTextColor={CoachColors.textFaint}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
              <Text style={st.helperText}>The email is how they get their invite and sign in.</Text>
            </KeyboardAwareScrollView>
          )}

          {/* ═══ FIND EXISTING (overlay on step 1) ═══ */}
          {step === 1 && showFind && (
            <KeyboardAwareScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" extraScrollHeight={80} enableOnAndroid>
              <Text style={st.findTitle}>Find on FitLink</Text>
              <Text style={st.findDesc}>Search for someone already on the app.</Text>

              <View style={st.inputRow}>
                <Ionicons name="search" size={18} color={CoachColors.textFaint} />
                <TextInput
                  style={st.input}
                  placeholder="Name, email, or phone..."
                  placeholderTextColor={CoachColors.textFaint}
                  value={findQuery}
                  onChangeText={setFindQuery}
                  onSubmitEditing={handleFindUser}
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoFocus
                />
                {findQuery !== '' && (
                  <TouchableOpacity hitSlop={12} onPress={() => { setFindQuery(''); setFindResults([]); }}>
                    <Ionicons name="close-circle" size={18} color={CoachColors.textFaint} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[st.searchBtn, (!findQuery.trim() || findLoading) && { opacity: 0.4 }]}
                onPress={handleFindUser}
                disabled={!findQuery.trim() || findLoading}
              >
                {findLoading ? (
                  <ActivityIndicator size="small" color={CoachColors.onAccent} />
                ) : (
                  <><Ionicons name="search" size={18} color={CoachColors.onAccent} /><Text style={st.searchBtnText}>Search</Text></>
                )}
              </TouchableOpacity>

              {findResults.length > 0 && (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <Text style={st.sectionLabel}>{findResults.length} user{findResults.length !== 1 ? 's' : ''} found</Text>
                  {findResults.map(client => (
                    <View key={client.id} style={st.findResultCard}>
                      <View style={st.findResultInitials}>
                        {client.avatar_url ? (
                          <Image source={{ uri: client.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                        ) : (
                          <Text style={{ fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textMuted }}>
                            {(client.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.findResultName}>{client.name}</Text>
                        <Text style={st.findResultContact}>{client.email || client.phone || 'No contact'}</Text>
                      </View>
                      <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                        style={[st.linkBtn, linking === client.id && { opacity: 0.5 }]}
                        onPress={() => handleLinkClient(client)}
                        disabled={linking === client.id}
                      >
                        {linking === client.id ? (
                          <ActivityIndicator size="small" color={CoachColors.onAccent} />
                        ) : (
                          <Text style={st.linkBtnText}>Add</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </KeyboardAwareScrollView>
          )}

          {/* ═══ STEP 2: Pass enrollment (status folded into the choice) ═══ */}
          {step === 2 && (
            <KeyboardAwareScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false} extraScrollHeight={80} enableOnAndroid>
              <Text style={st.sectionLabel}>Choose a pass</Text>

              {plans.map(plan => {
                const isActive = selectedPlan === plan.id;
                const nodeCount = plan.track?.length;
                return (
                  <TouchableOpacity
                    key={plan.id}
                    style={[st.planCard, isActive && st.planCardActive]}
                    onPress={() => setSelectedPlan(plan.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.planName, isActive && st.planNameActive]}>{plan.name}</Text>
                        <Text style={st.planPrice}>
                          ${plan.price}/{plan.period || 'month'} · {nodeCount ? `${nodeCount} nodes` : 'no track yet'}
                        </Text>
                      </View>
                      <View style={[st.radio, isActive && st.radioActive]}>
                        {isActive && <Ionicons name="checkmark" size={15} color={CoachColors.onAccent} />}
                      </View>
                    </View>
                    {isActive && plan.features && plan.features.length > 0 && (
                      <View style={{ marginTop: 12, gap: 6 }}>
                        {plan.features.slice(0, 3).map((f, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="checkmark" size={15} color={CoachColors.accent} />
                            <Text style={st.planFeature}>{f}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              {/* No Plan option */}
              <TouchableOpacity
                style={[st.planCard, !selectedPlan && st.planCardActive]}
                onPress={() => setSelectedPlan(null)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.planName, !selectedPlan && st.planNameActive]}>No pass for now</Text>
                    <Text style={st.planPrice}>Coach them 1-on-1 only</Text>
                  </View>
                  <View style={[st.radio, !selectedPlan && st.radioActive]}>
                    {!selectedPlan && <Ionicons name="checkmark" size={15} color={CoachColors.onAccent} />}
                  </View>
                </View>
              </TouchableOpacity>

              {/* How they start — the old separate Trial/Active toggle now lives here,
                  and only matters once a real pass is selected. */}
              {selectedPlan && (
                <>
                  <Text style={[st.sectionLabel, { marginTop: 14 }]}>How they start</Text>
                  <View style={st.startModeRow}>
                    <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
                      style={[st.startModeCard, startMode === 'trial' && st.startModeCardActive]}
                      onPress={() => setStartMode('trial')}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.startModeTitle, startMode === 'trial' && st.startModeTitleActive]}>14-day trial</Text>
                      <Text style={st.startModeDesc}>Charges after {trialEndLabel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 1, bottom: 1 }}
                      style={[st.startModeCard, startMode === 'paying' && st.startModeCardActive]}
                      onPress={() => setStartMode('paying')}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.startModeTitle, startMode === 'paying' && st.startModeTitleActive]}>Paying now</Text>
                      <Text style={st.startModeDesc}>First charge today</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </KeyboardAwareScrollView>
          )}

          {/* ═══ STEP 3: Goals, Notes & Invite ═══ */}
          {step === 3 && (
            <KeyboardAwareScrollView contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" extraScrollHeight={80} enableOnAndroid>
              {/* Goals */}
              <Text style={st.sectionLabel}>Goals</Text>
              <View style={st.goalChips}>
                {GOAL_SUGGESTIONS.map(g => {
                  const isSelected = goals.toLowerCase().includes(g.toLowerCase());
                  return (
                    <TouchableOpacity hitSlop={{ top: 6, bottom: 6 }}
                      key={g}
                      style={[st.goalChip, isSelected && st.goalChipActive]}
                      onPress={() => {
                        if (isSelected) {
                          setGoals(goals.replace(new RegExp(g + ',?\\s*', 'i'), '').trim());
                        } else {
                          setGoals(prev => prev ? `${prev}, ${g}` : g);
                        }
                      }}
                    >
                      <Text style={[st.goalChipText, isSelected && st.goalChipTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={st.inputRow}>
                <Ionicons name="flag-outline" size={18} color={CoachColors.textFaint} />
                <TextInput
                  style={[st.input, { minHeight: 60 }]}
                  placeholder="Or type specific goals..."
                  placeholderTextColor={CoachColors.textFaint}
                  value={goals}
                  onChangeText={setGoals}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* Notes */}
              <Text style={[st.sectionLabel, { marginTop: 22 }]}>Private note</Text>
              <View style={st.inputRow}>
                <Ionicons name="document-text-outline" size={18} color={CoachColors.textFaint} />
                <TextInput
                  style={[st.input, { minHeight: 60 }]}
                  placeholder="Only you can see this..."
                  placeholderTextColor={CoachColors.textFaint}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* What happens next */}
              <Text style={[st.sectionLabel, { marginTop: 22 }]}>What happens next</Text>
              <View style={st.nextCard}>
                <View style={st.nextRow}>
                  <View style={st.nextDone}>
                    <Ionicons name="checkmark" size={13} color={CoachColors.onAccent} />
                  </View>
                  <Text style={st.nextText}>They get an invite by email</Text>
                </View>
                {selectedPlanData && (
                  <View style={st.nextRow}>
                    <View style={st.nextDone}>
                      <Ionicons name="checkmark" size={13} color={CoachColors.onAccent} />
                    </View>
                    <Text style={st.nextText}>They start at node 1 of {selectedPlanData.name}</Text>
                  </View>
                )}
                <View style={st.nextRow}>
                  <View style={st.nextTodo} />
                  <Text style={[st.nextText, st.nextTextMuted]}>Send them the onboarding assessment</Text>
                  <Text style={st.nextLater}>Later</Text>
                </View>
                <View style={st.nextRow}>
                  <View style={st.nextTodo} />
                  <Text style={[st.nextText, st.nextTextMuted]}>Book their first session</Text>
                  <Text style={st.nextLater}>Later</Text>
                </View>
              </View>

              {/* Invite */}
              <Text style={[st.sectionLabel, { marginTop: 22 }]}>Invite to app</Text>
              <TouchableOpacity style={st.inviteCard} onPress={handleInvite} activeOpacity={0.7}>
                <View style={st.inviteIconWrap}>
                  <Ionicons name="paper-plane" size={21} color={CoachColors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={st.inviteTitle}>
                    Send invite {name.trim() ? `to ${name.trim().split(' ')[0]}` : ''}
                  </Text>
                  <Text style={st.inviteDesc}>Share a link to download FitLink and connect</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={CoachColors.textFaint} />
              </TouchableOpacity>
            </KeyboardAwareScrollView>
          )}

          {/* ═══ Bottom CTA ═══ */}
          {!showFind && (
            <View style={st.ctaWrap}>
              <TouchableOpacity onPress={goNext} activeOpacity={0.85} disabled={saving} style={st.ctaBtn}>
                {saving ? (
                  <ActivityIndicator size="small" color={CoachColors.onAccent} />
                ) : (
                  <>
                    <Text style={st.ctaBtnText}>
                      {step === 3 ? `Add ${name.trim().split(' ')[0] || 'client'}` : 'Continue'}
                    </Text>
                    {step < 3 && <Ionicons name="arrow-forward" size={20} color={CoachColors.onAccent} />}
                  </>
                )}
              </TouchableOpacity>
              {step === 2 && (
                selectedPlanData ? (
                  <Text style={st.ctaSubtext}>
                    {selectedPlanData.name} · {startMode === 'trial' ? `trial until ${trialEndLabel}, then` : 'charges'} ${selectedPlanData.price}/{selectedPlanData.period || 'mo'}
                  </Text>
                ) : (
                  <Text style={st.ctaSubtext}>No pass · 1-on-1 coaching only</Text>
                )
              )}
              {step === 3 && (
                <Text style={st.ctaSubtext}>You'll land on their profile to finish setup</Text>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ═══════════ STYLES ═══════════
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerBack: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 21.5, color: CoachColors.textPrimary },
  headerSubtitle: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 1 },
  headerSkip: { paddingHorizontal: 12, paddingVertical: 6 },
  headerSkipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textMuted },

  // Progress
  progressTrack: { height: 3, backgroundColor: TRACK_BG, marginHorizontal: 20, borderRadius: 2 },
  progressFill: { height: 3, backgroundColor: CoachColors.accent, borderRadius: 2 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 130 },

  // Section label — sentence case text, small eyebrow treatment
  sectionLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textFaint,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 11,
  },

  // Quick Add
  quickAddRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  quickAddCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingVertical: 15, paddingHorizontal: 14,
  },
  quickAddIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: RAISED_CIRCLE,
    alignItems: 'center', justifyContent: 'center',
  },
  quickAddTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  quickAddDesc: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted, marginTop: 1 },

  // Identity card
  identityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 10,
  },
  avatarPicker: { position: 'relative' },
  avatarImage: { width: 62, height: 62, borderRadius: 31 },
  avatarPlaceholder: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: CoachColors.surface,
    borderWidth: 1.5, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: CoachFonts.headingSemiBold, fontSize: 21.5, color: CoachColors.textFaint },
  avatarBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: CoachColors.accent, borderWidth: 2, borderColor: CoachColors.bg,
    alignItems: 'center', justifyContent: 'center',
  },

  // Inputs
  inputWrap: {
    flex: 1, backgroundColor: CoachColors.surface, borderRadius: 14,
    paddingHorizontal: 15, paddingVertical: 14,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  inputLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textFaint },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    paddingHorizontal: 15, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  input: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textPrimary,
    paddingVertical: 17,
  },
  contactRow: { marginTop: 10 },
  helperText: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 12, lineHeight: 19 },

  // Find
  findTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 24.5, color: CoachColors.textPrimary, marginBottom: 4 },
  findDesc: { fontFamily: CoachFonts.body, fontSize: 14.5, color: CoachColors.textMuted, marginBottom: 20 },
  searchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: CoachColors.accent, borderRadius: 999, paddingVertical: 14, marginTop: 12,
  },
  searchBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.onAccent },
  findResultCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  findResultInitials: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: RAISED_CIRCLE, alignItems: 'center', justifyContent: 'center',
  },
  findResultName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  findResultContact: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2 },
  linkBtn: { backgroundColor: CoachColors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  linkBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.onAccent },

  // Step 2 — Plans (one lime accent, no per-plan tinting, no popular badge)
  planCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 16, padding: 16, marginBottom: 10,
  },
  planCardActive: {
    backgroundColor: CoachColors.accentSofter,
    borderColor: CoachColors.accent, borderWidth: 1.5,
  },
  planName: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textSecondary },
  planNameActive: { fontFamily: CoachFonts.headingSemiBold, fontSize: 19, color: CoachColors.textPrimary },
  planPrice: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 3 },
  planFeature: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },

  // Step 2 — How they start (folded-in status)
  startModeRow: { flexDirection: 'row', gap: 9 },
  startModeCard: {
    flex: 1, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14,
  },
  startModeCardActive: { backgroundColor: CoachColors.accentSofter, borderColor: CoachColors.accent, borderWidth: 1.5 },
  startModeTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textSecondary },
  startModeTitleActive: { color: CoachColors.textPrimary },
  startModeDesc: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 2 },

  // Step 3 — Goals
  goalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  goalChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  goalChipActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  goalChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },
  goalChipTextActive: { color: CoachColors.onAccent },

  // Step 3 — What happens next
  nextCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 16, gap: 11,
  },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  nextDone: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  nextTodo: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: CoachColors.border },
  nextText: { flex: 1, fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textPrimary },
  nextTextMuted: { color: CoachColors.textSecondary },
  nextLater: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.accent },

  // Step 3 — Invite
  inviteCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 16, padding: 16,
  },
  inviteIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: CoachColors.accentSofter, alignItems: 'center', justifyContent: 'center',
  },
  inviteTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary },
  inviteDesc: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2 },

  // CTA
  ctaWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 30, paddingTop: 16,
    backgroundColor: CoachColors.bg,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 999,
    backgroundColor: CoachColors.accent,
  },
  ctaBtnText: { fontFamily: CoachFonts.headingSemiBold, fontSize: 17, color: CoachColors.onAccent },
  ctaSubtext: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint,
    textAlign: 'center', marginTop: 9,
  },

  // Success state (step 3 completion)
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  successIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 23.5, color: CoachColors.textPrimary, textAlign: 'center' },
  successDesc: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21.5 },
  successCtaWrap: { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },
  successSecondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  successSecondaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textMuted },
});
