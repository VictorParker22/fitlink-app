import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Animated, Keyboard, Share,
  KeyboardAvoidingView, Platform, ScrollView, TouchableWithoutFeedback,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Contacts from 'expo-contacts';
import { useApp } from '../context/AppContext';
import { useAlert } from '../context/AlertContext';
import { useRevenueCat } from '../context/RevenueCatContext';
import CoachElitePaywall from '../components/paywalls/CoachElitePaywall';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { supabase } from '../lib/supabase';

const GOAL_SUGGESTIONS = ['Lose weight', 'Build muscle', 'Improve strength', 'General fitness', 'Flexibility', 'Sports performance'];

// Tone matches the mockup's neutral "inner circle" fills — not in the shared
// token file because they're a one-off layer between surface and border.
const RAISED_CIRCLE = '#1E211D';
const TRACK_BG = '#1E211D';

// ── Find-result intake display ──
// The search-unassigned-clients function returns each athlete's own intake in
// `assessment_data`, in either (or both) of two shapes. Display precedence is
// intake_* first, legacy second, and ANY field may be absent — absent fields
// are omitted entirely, never placeholdered (INVARIANTS §4).
//   New:    { intake_goal, intake_days, intake_experience, intake_limitation }
//   Legacy: { fitness_goal, fitness_goals[], commit_days, age, gender,
//             weight, height, training_styles[], activities[] }
const present = (v: any): boolean => v !== null && v !== undefined && String(v).trim() !== '';

function intakeGoal(ad: any, joinLegacyList: boolean): string | null {
  if (!ad) return null;
  if (present(ad.intake_goal)) return String(ad.intake_goal).trim();
  if (present(ad.fitness_goal)) return String(ad.fitness_goal).trim();
  const list = Array.isArray(ad.fitness_goals) ? ad.fitness_goals.filter(present) : [];
  if (list.length === 0) return null;
  return joinLegacyList ? list.map((g: any) => String(g).trim()).join(', ') : String(list[0]).trim();
}

function intakeDaysPerWeek(ad: any): number | null {
  if (!ad) return null;
  const raw = present(ad.intake_days) ? ad.intake_days : ad.commit_days;
  if (!present(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// The lime chips under a result's name — goal, days, experience only.
function intakeChips(ad: any): string[] {
  const chips: string[] = [];
  const goal = intakeGoal(ad, false);
  if (goal) chips.push(goal);
  const days = intakeDaysPerWeek(ad);
  if (days !== null) chips.push(`${days} days a week`);
  if (ad && present(ad.intake_experience)) chips.push(String(ad.intake_experience).trim());
  return chips;
}

// Every present intake field as a label+value row for the expanded block.
function intakeDetails(ad: any): { label: string; value: string }[] {
  if (!ad) return [];
  const rows: { label: string; value: string }[] = [];
  const goal = intakeGoal(ad, true);
  if (goal) rows.push({ label: 'Goal', value: goal });
  const days = intakeDaysPerWeek(ad);
  if (days !== null) rows.push({ label: 'Days a week', value: String(days) });
  if (present(ad.intake_experience)) rows.push({ label: 'Experience', value: String(ad.intake_experience).trim() });
  // The one a coach needs most before committing: injuries and limitations.
  if (present(ad.intake_limitation)) rows.push({ label: 'Working around', value: String(ad.intake_limitation).trim() });
  if (present(ad.age)) rows.push({ label: 'Age', value: String(ad.age) });
  if (present(ad.weight) && present(ad.height)) {
    rows.push({ label: 'Weight & height', value: `${String(ad.weight)} · ${String(ad.height)}` });
  } else if (present(ad.weight)) {
    rows.push({ label: 'Weight', value: String(ad.weight) });
  } else if (present(ad.height)) {
    rows.push({ label: 'Height', value: String(ad.height) });
  }
  const styles = Array.isArray(ad.training_styles) ? ad.training_styles.filter(present) : [];
  if (styles.length > 0) rows.push({ label: 'Training styles', value: styles.map((s: any) => String(s).trim()).join(', ') });
  const acts = Array.isArray(ad.activities) ? ad.activities.filter(present) : [];
  if (acts.length > 0) rows.push({ label: 'Activities', value: acts.map((a: any) => String(a).trim()).join(', ') });
  return rows;
}

// Expansion is only offered when it would show something the chips don't.
function intakeHasDetailBeyondChips(ad: any): boolean {
  if (!ad) return false;
  if (present(ad.intake_limitation) || present(ad.age) || present(ad.weight) || present(ad.height)) return true;
  if (Array.isArray(ad.training_styles) && ad.training_styles.filter(present).length > 0) return true;
  if (Array.isArray(ad.activities) && ad.activities.filter(present).length > 0) return true;
  // A legacy multi-goal list is truncated to its first entry in the chip row.
  return intakeGoal(ad, true) !== intakeGoal(ad, false);
}

const TRIAL_DAYS = 14;

/** The trial's end, TRIAL_DAYS from now — written to clients.trial_end_date. */
function trialEndDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d;
}

function formatTrialEndDate(): string {
  const d = trialEndDate();
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

  // Live matching (design option C): the name field IS the search. FitLink
  // matches stream in debounced; contact matches filter locally once the
  // coach opts in to contact access (in-context ask, never cold).
  const [findResults, setFindResults] = useState<any[]>([]);
  const [findLoading, setFindLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [contactsIndex, setContactsIndex] = useState<Contacts.Contact[] | null>(null);
  const [contactsDenied, setContactsDenied] = useState(false);
  const searchSeq = useRef(0);

  // The hero name field used to autoFocus. With the header outside the
  // keyboard-avoiding view and a keyboard-aware scroller inside it, the
  // focus fired before layout settled and the auto-scroll pushed the field up
  // under the fixed header. Focus after the screen has laid out instead.
  const nameInputRef = useRef<TextInput>(null);
  useEffect(() => {
    const t = setTimeout(() => nameInputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  // Free tier holds 5 active athletes; Elite is unlimited. The database
  // enforces this too (trg_roster_cap) — this is the friendly wall, the
  // trigger is the real one.
  const { isCoachElite } = useRevenueCat();
  const [showElitePaywall, setShowElitePaywall] = useState(false);
  const atRosterCap = !isCoachElite && !(trainer as any)?.org_id &&
    clients.filter(c => c.status !== 'inactive').length >= 5;

  const selectedPlanData = plans.find(p => p.id === selectedPlan);
  // Derived DB status: a plan + "paying now" makes the client active;
  // everything else (no plan, or trialling a plan) writes 'trial'.
  const derivedStatus: 'trial' | 'active' = selectedPlan && startMode === 'paying' ? 'active' : 'trial';
  const trialEndLabel = formatTrialEndDate();
  const progressPct = step / 3;

  // ── Contacts opt-in ──
  // No picker dialog: once granted, contacts become a local index the name
  // field matches against live. The ask happens in context, on the coach's
  // own tap — never cold (lib/permissions doctrine).
  const enableContactMatching = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setContactsDenied(true);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });
      setContactsIndex(data.filter(c => c.name));
    } catch {
      setContactsDenied(true);
    }
  };

  // Local contact matches for the typed name — top 3, only with 2+ chars.
  const contactMatches = (() => {
    const q = name.trim().toLowerCase();
    if (!contactsIndex || q.length < 2) return [];
    return contactsIndex.filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 3);
  })();

  // ── Live FitLink search ──
  // Debounced off the name field; silent (no alerts) — an empty result list
  // just means nothing renders. Sequence guard drops stale responses.
  useEffect(() => {
    const q = name.trim();
    if (step !== 1 || q.length < 3) { setFindResults([]); return; }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      setFindLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.functions.invoke('search-unassigned-clients', {
          body: { query: q, trainerId: user?.id },
        });
        if (seq !== searchSeq.current) return;
        setFindResults(error ? [] : (data?.data || []).slice(0, 3));
      } catch {
        if (seq === searchSeq.current) setFindResults([]);
      } finally {
        if (seq === searchSeq.current) setFindLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [name, step]);

  // ── Avatar ──
  const handlePickAvatar = async () => {
    showAlert({
      type: 'info',
      title: 'Client photo',
      message: 'Choose how to add a photo',
      buttons: [
        { text: 'Take photo', onPress: () => launchPicker('camera') },
        { text: 'Choose from library', onPress: () => launchPicker('library') },
        ...(avatarUri ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => { setAvatarUri(null); setAvatarBase64(null); } }] : []),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    });
  };

  const launchPicker = async (source: 'camera' | 'library') => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { showAlert({ type: 'warning', title: 'Permission required', message: 'Camera access is needed.' }); return; }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { showAlert({ type: 'warning', title: 'Permission required', message: 'Photo library access is needed.' }); return; }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.7, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.7, base64: true });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { showAlert({ type: 'error', title: 'Error', message: 'Could not read image data.' }); return; }
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
      // A trial has a real end date on the row so the athlete profile's
      // countdown reads the same day this wizard promised. Nothing schedules
      // a charge at that date — the athlete checks out themselves.
      if (derivedStatus === 'trial') {
        insertPayload.trial_end_date = trialEndDate().toISOString();
      }
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
      // The database's roster-cap trigger (trg_roster_cap) — a patched or
      // stale client got past the soft wall; answer with the paywall, not
      // a raw Postgres message.
      if (String(err?.message || '').includes('roster_limit')) {
        setShowElitePaywall(true);
        return;
      }
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

  const handleLinkClient = async (client: any) => {
    if (atRosterCap) { setShowElitePaywall(true); return; }
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
        // Existing client record — claim via the edge function, which is
        // the ONLY path allowed to set trainer_id on a row this coach does
        // not yet own. It refuses (409) when the client already has a coach.
        //
        // There used to be a direct-update fallback here for when the
        // function errored. It is gone: a refusal is now a real answer, not
        // an outage, and retrying it client-side would have been an attempt
        // to take an athlete away from another coach.
        const { error } = await supabase.functions.invoke('search-unassigned-clients', {
          body: { action: 'link', clientId: client.id, trainerId: user.id }
        });
        if (error) throw new Error(error.message || 'Could not add that client');
      }

      // Navigate back FIRST. When the athlete arrived with their own intake,
      // the confirm says so — the coach is not starting from a blank profile.
      const hasIntake = intakeDetails(client.assessment_data).length > 0;
      showAlert({
        type: 'success',
        title: 'Client added',
        message: hasIntake
          ? `${client.name} is now your athlete — their intake is already on their profile.`
          : `${client.name} is now your client.`,
      });
      setLinking(null);
      router.back();

      // Refresh state AFTER navigation
      setTimeout(() => { refreshClients(); }, 600);
    } catch (err: any) {
      if (String(err?.message || '').includes('roster_limit')) {
        setShowElitePaywall(true);
        return;
      }
      showAlert({ type: 'error', title: 'Link error', message: err.message || 'Failed to link client' });
      setLinking(null);
    }
  };

  // ── Navigation ──
  const goNext = () => {
    if (step === 1 && atRosterCap) {
      setShowElitePaywall(true);
      return;
    }
    if (step === 1 && !name.trim()) {
      return showAlert({ type: 'warning', title: 'Name required', message: 'Enter a client name to continue.' });
    }
    if (step < 3) setStep(step + 1);
    else handleSave();
  };

  const goBack = () => {
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
  // Same shape as app/(auth)/login.tsx: the keyboard-avoiding view wraps the
  // header, progress and content together, so the whole column shrinks above
  // the keyboard and nothing scrolls up behind a fixed header. One plain
  // ScrollView per step, taps outside a field dismiss the keyboard.
  return (
    <View style={st.container}>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
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

          {/* ═══ STEP 1: Identity — the name is the screen (design option C) ═══ */}
          {step === 1 && (
            <ScrollView
              contentContainerStyle={st.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              bounces={false}
            >
              {/* Hero name field: one oversized input; contacts + FitLink
                  matches surface live underneath as the coach types. */}
              <View style={st.heroRow}>
                <TouchableOpacity style={st.avatarPicker} onPress={handlePickAvatar} activeOpacity={0.8}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={st.avatarImage} contentFit="cover" />
                  ) : (
                    <View style={st.avatarPlaceholder}>
                      {name ? (
                        <Text style={st.avatarInitials}>{initials}</Text>
                      ) : (
                        <Ionicons name="person" size={23} color={CoachColors.textFaint} />
                      )}
                    </View>
                  )}
                  <View style={st.avatarBadge}>
                    <Ionicons name="camera" size={12} color={CoachColors.onAccent} />
                  </View>
                </TouchableOpacity>
                <View style={st.heroField}>
                  <Text style={st.heroLabel}>Athlete name</Text>
                  <TextInput
                    ref={nameInputRef}
                    style={st.heroInput}
                    placeholder="Start typing…"
                    placeholderTextColor={CoachColors.textFaint}
                    value={name}
                    onChangeText={setName}
                    autoCorrect={false}
                    accessibilityLabel="Athlete name"
                  />
                </View>
              </View>

              {/* Contact-matching opt-in — appears until granted or declined */}
              {contactsIndex === null && !contactsDenied && (
                <TouchableOpacity style={st.contactsOptIn} onPress={enableContactMatching} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Match from your contacts">
                  <Ionicons name="people-outline" size={15} color={CoachColors.accent} />
                  <Text style={st.contactsOptInText}>Match from your contacts as you type</Text>
                </TouchableOpacity>
              )}

              {/* Live matches: FitLink users first (they link, not duplicate), then contacts */}
              {(findLoading || findResults.length > 0 || contactMatches.length > 0) && (
                <View style={{ gap: 8, marginTop: 18 }}>
                  {findLoading && findResults.length === 0 && (
                    <View style={st.matchSearchingRow}>
                      <ActivityIndicator size="small" color={CoachColors.textFaint} />
                      <Text style={st.matchSearchingText}>Checking FitLink…</Text>
                    </View>
                  )}
                  {findResults.map(client => {
                    const chips = intakeChips(client.assessment_data);
                    const canExpand = intakeHasDetailBeyondChips(client.assessment_data);
                    const isExpanded = canExpand && expandedResult === client.id;
                    return (
                    <View key={client.id} style={st.findResultCard}>
                      <View style={st.findResultTopRow}>
                        <TouchableOpacity
                          style={st.findResultBody}
                          activeOpacity={0.7}
                          disabled={!canExpand}
                          onPress={() => setExpandedResult(prev => (prev === client.id ? null : client.id))}
                        >
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
                            <Text style={st.findResultContact}>On FitLink · {client.email || client.phone || 'no contact'}</Text>
                          </View>
                          {canExpand && (
                            <Ionicons
                              name="chevron-down" size={17} color={CoachColors.textFaint}
                              style={{ transform: [{ rotate: isExpanded ? '180deg' : '0deg' }] }}
                            />
                          )}
                        </TouchableOpacity>
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
                      {chips.length > 0 ? (
                        <View style={st.findChipRow}>
                          {chips.map((c, i) => (
                            <View key={`${i}-${c}`} style={st.findChip}><Text style={st.findChipText}>{c}</Text></View>
                          ))}
                        </View>
                      ) : !canExpand ? (
                        // A true statement about a real absence — allowed by §4.
                        <View style={st.findChipRow}>
                          <View style={st.findChipMuted}><Text style={st.findChipMutedText}>No intake yet</Text></View>
                        </View>
                      ) : null}
                      {isExpanded && (
                        <View style={st.findExpand}>
                          {intakeDetails(client.assessment_data).map(d => (
                            <View key={d.label} style={st.findExpandRow}>
                              <Text style={st.findExpandLabel}>{d.label}</Text>
                              <Text style={st.findExpandValue}>{d.value}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    );
                  })}
                  {contactMatches.map((c, idx) => (
                    <View key={`contact-${idx}`} style={st.findResultCard}>
                      <View style={st.findResultTopRow}>
                        <View style={st.findResultBody}>
                          <View style={st.findResultInitials}>
                            <Ionicons name="person-outline" size={17} color={CoachColors.textSecondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={st.findResultName}>{c.name}</Text>
                            <Text style={st.findResultContact}>
                              From your contacts · {c.emails?.[0]?.email || c.phoneNumbers?.[0]?.number || 'no details'}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }}
                          style={st.contactFillBtn}
                          onPress={() => {
                            setName(c.name || '');
                            if (c.emails?.[0]?.email) setEmail(c.emails[0].email);
                            if (c.phoneNumbers?.[0]?.number) setPhone(c.phoneNumbers[0].number);
                          }}
                        >
                          <Text style={st.contactFillBtnText}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Details */}
              <View style={[st.contactRow, { marginTop: 22 }]}>
                <View style={[st.inputRow, { flex: 1 }]}>
                  <Ionicons name="mail-outline" size={19} color={CoachColors.textFaint} />
                  <TextInput
                    style={st.input}
                    placeholder="Email — sends their invite"
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
            </ScrollView>
          )}

          {/* ═══ STEP 2: Pass enrollment (status folded into the choice) ═══ */}
          {step === 2 && (
            <ScrollView
              contentContainerStyle={st.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              bounces={false}
            >
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
                      <Text style={[st.startModeTitle, startMode === 'trial' && st.startModeTitleActive]}>{TRIAL_DAYS}-day trial</Text>
                      <Text style={st.startModeDesc}>Trial until {trialEndLabel} · no charge until they check out</Text>
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
            </ScrollView>
          )}

          {/* ═══ STEP 3: Goals, Notes & Invite ═══ */}
          {step === 3 && (
            <ScrollView
              contentContainerStyle={st.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              bounces={false}
            >
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
            </ScrollView>
          )}

          {/* ═══ Bottom CTA ═══ */}
          {(
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
                    {selectedPlanData.name} · {startMode === 'trial' ? `trial until ${trialEndLabel} · no charge until they check out` : `charges $${selectedPlanData.price}/${selectedPlanData.period === 'year' ? 'yr' : 'mo'}`}
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
        </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <CoachElitePaywall
        visible={showElitePaywall}
        onClose={() => setShowElitePaywall(false)}
        onSuccess={() => setShowElitePaywall(false)}
      />
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
    width: 36, height: 36, borderRadius: 18, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 21.5, color: CoachColors.textPrimary },
  headerSubtitle: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 1 },
  headerSkip: { paddingHorizontal: 12, paddingVertical: 6 },
  headerSkipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textMuted },

  // Progress
  progressTrack: { height: 3, backgroundColor: TRACK_BG, marginHorizontal: 20, borderRadius: 2, borderCurve: 'continuous' },
  progressFill: { height: 3, backgroundColor: CoachColors.accent, borderRadius: 2, borderCurve: 'continuous' },

  // 130 keeps the last field clear of the absolute CTA; flexGrow lets the
  // column fill the screen so a tap on empty space reaches the dismisser.
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 130 },

  // Section label — sentence case text, small eyebrow treatment
  sectionLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textFaint,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 11,
  },

  // Quick Add
  // Identity card
  // Hero name field (design option C): the name is the screen. Underline
  // treatment instead of a boxed input — the accent bottom border reads as
  // "this is the one thing to do here".
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  heroField: {
    flex: 1, borderBottomWidth: 2, borderBottomColor: CoachColors.accent,
    paddingBottom: 8, gap: 2,
  },
  heroLabel: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase', color: CoachColors.textFaint,
  },
  heroInput: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 24, color: CoachColors.textPrimary,
    padding: 0,
  },
  contactsOptIn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    marginTop: 14, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSofter,
  },
  contactsOptInText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.accent },
  matchSearchingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  matchSearchingText: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textFaint },
  contactFillBtn: {
    height: 32, borderRadius: 999, borderCurve: 'continuous',
    borderWidth: 1, borderColor: CoachColors.border,
    paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
  },
  contactFillBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },
  avatarPicker: { position: 'relative' },
  avatarImage: { width: 62, height: 62, borderRadius: 31, borderCurve: 'continuous' },
  avatarPlaceholder: {
    width: 62, height: 62, borderRadius: 31, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1.5, borderColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: CoachFonts.headingSemiBold, fontSize: 21.5, color: CoachColors.textFaint },
  avatarBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 24, height: 24, borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: CoachColors.accent, borderWidth: 2, borderColor: CoachColors.bg,
    alignItems: 'center', justifyContent: 'center',
  },

  // Inputs
  inputWrap: {
    flex: 1, backgroundColor: CoachColors.surface, borderRadius: 14, borderCurve: 'continuous',
    paddingHorizontal: 15, paddingVertical: 14,
    borderWidth: 1, borderColor: CoachColors.border,
  },
  inputLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textFaint },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: CoachColors.surface, borderRadius: 14, borderCurve: 'continuous',
    paddingHorizontal: 15, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  input: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 16, color: CoachColors.textPrimary,
    paddingVertical: 17,
  },
  contactRow: { marginTop: 10 },
  helperText: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 12, lineHeight: 19 },

  // Find
  findResultCard: {
    backgroundColor: CoachColors.surface, borderRadius: 14, borderCurve: 'continuous',
    padding: 14, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  findResultTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  findResultBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  findResultInitials: {
    width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous',
    backgroundColor: RAISED_CIRCLE, alignItems: 'center', justifyContent: 'center',
  },
  findResultName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15.5, color: CoachColors.textPrimary },
  findResultContact: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2 },
  linkBtn: { backgroundColor: CoachColors.accent, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderCurve: 'continuous' },
  linkBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.onAccent },

  // Find — intake chips + expandable detail. Every line is the athlete's own
  // intake from search-unassigned-clients; absent fields are omitted (§4).
  findChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  findChip: {
    backgroundColor: CoachColors.accentSoft, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 12, paddingVertical: 4,
  },
  findChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.accent },
  findChipMuted: {
    borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 12, paddingVertical: 4,
  },
  findChipMutedText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textFaint },
  findExpand: {
    marginTop: 12, paddingTop: 12, gap: 8,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  findExpandRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  findExpandLabel: { width: 112, fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.textFaint },
  findExpandValue: { flex: 1, fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textPrimary, fontVariant: ['tabular-nums'] },

  // Step 2 — Plans (one lime accent, no per-plan tinting, no popular badge)
  planCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 16, marginBottom: 10,
  },
  planCardActive: {
    backgroundColor: CoachColors.accentSofter,
    borderColor: CoachColors.accent, borderWidth: 1.5,
  },
  planName: { fontFamily: CoachFonts.headingSemiBold, fontSize: 18, color: CoachColors.textSecondary },
  planNameActive: { fontFamily: CoachFonts.headingSemiBold, fontSize: 19, color: CoachColors.textPrimary },
  planPrice: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textMuted, marginTop: 3 },
  planFeature: { fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary },
  radio: { width: 22, height: 22, borderRadius: 11, borderCurve: 'continuous', borderWidth: 1.5, borderColor: CoachColors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },

  // Step 2 — How they start (folded-in status)
  startModeRow: { flexDirection: 'row', gap: 9 },
  startModeCard: {
    flex: 1, backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, borderCurve: 'continuous', paddingVertical: 13, paddingHorizontal: 14,
  },
  startModeCardActive: { backgroundColor: CoachColors.accentSofter, borderColor: CoachColors.accent, borderWidth: 1.5 },
  startModeTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textSecondary },
  startModeTitleActive: { color: CoachColors.textPrimary },
  startModeDesc: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 2 },

  // Step 3 — Goals
  goalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  goalChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  goalChipActive: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  goalChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textSecondary },
  goalChipTextActive: { color: CoachColors.onAccent },

  // Step 3 — What happens next
  nextCard: {
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, borderCurve: 'continuous', padding: 16, gap: 11,
  },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  nextDone: {
    width: 22, height: 22, borderRadius: 11, borderCurve: 'continuous', backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  nextTodo: { width: 22, height: 22, borderRadius: 11, borderCurve: 'continuous', borderWidth: 1.5, borderColor: CoachColors.border },
  nextText: { flex: 1, fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textPrimary },
  nextTextMuted: { color: CoachColors.textSecondary },
  nextLater: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.accent },

  // Step 3 — Invite
  inviteCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 16,
  },
  inviteIconWrap: {
    width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSofter, alignItems: 'center', justifyContent: 'center',
  },
  inviteTitle: { fontFamily: CoachFonts.bodySemiBold, fontSize: 16, color: CoachColors.textPrimary },
  inviteDesc: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textMuted, marginTop: 2 },

  // CTA
  ctaWrap: {
    // Absolute inside a SafeAreaView edges={['top','bottom']} — the home-indicator
    // inset is already applied by that container, so this is breathing room only.
    // (Was 30, which stacked on the inset for ~64pt of dead space.)
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20, paddingBottom: 12, paddingTop: 16,
    backgroundColor: CoachColors.bg,
  },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 999, borderCurve: 'continuous',
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
    width: 64, height: 64, borderRadius: 32, borderCurve: 'continuous', backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  successTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 23.5, color: CoachColors.textPrimary, textAlign: 'center' },
  successDesc: { fontFamily: CoachFonts.body, fontSize: 15, color: CoachColors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21.5 },
  successCtaWrap: { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },
  successSecondaryBtn: { alignItems: 'center', paddingVertical: 12 },
  successSecondaryText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textMuted },
});
