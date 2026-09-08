/**
 * InviteSheet — the coach's one place to invite (design canvas "FitLink
 * Invitations", boards 01 and 06).
 *
 *   kind 'coach'  Name, phone or email, THE MESSAGE (editable in place), the
 *                 coach's standing link, "Send to <first>" (creates the invite,
 *                 then the OS share sheet) and "Copy the link instead".
 *   kind 'live'   "Invite people to watch." — the class link with Copy, what a
 *                 guest and an athlete with another coach each get, "Share the link".
 *
 * Modal handoff rule (INVARIANTS §5): nothing navigates or presents another
 * native sheet while this Modal is visible. Sharing closes the sheet first and
 * opens the OS share sheet ~350 ms later.
 *
 * The message preview carries the coach's standing link because the personal
 * code does not exist until the row is created; `messageForInvite` swaps in
 * the personal link at send time.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { useReducedMotion } from '../../lib/useReducedMotion';
import {
  type InviteKind, type InviteRow,
  buildInviteMessage, buildLiveShareMessage, copyToClipboard, createInvite,
  firstName, hapticMoment, inviteLink, messageForInvite,
} from '../../lib/invites';

/** Long enough for the sheet to be gone before the OS share sheet rises. */
const HANDOFF_MS = 350;
const COPIED_MS = 1600;

/** create_invite raises short codes; the sheet says them in sentences. */
function friendlyCreateError(e: unknown, fallback: string): string {
  const msg = String((e as any)?.message ?? '');
  if (msg.includes('invite_rate_limited')) return 'You have sent a lot of invites in a short time. Give it a few minutes and try again.';
  if (msg.includes('live_class_over')) return 'This class has ended, so there is nothing to invite people to.';
  if (msg.includes('not_your_class')) return 'This class belongs to another coach.';
  if (msg.includes('not_a_trainer')) return 'Only a coach account can send invites.';
  return fallback;
}

export interface InviteSheetProps {
  visible: boolean;
  onClose: () => void;
  kind: InviteKind;
  /** Required for kind 'live'. */
  liveClassId?: string | null;
  liveTitle?: string | null;
  /** The coach's full name; the message uses the first word. */
  coachName?: string | null;
  /** Prefill from a screen that already asked (add-client). */
  initialName?: string;
  initialContact?: string;
  /** An invite row was created (sent or copied). The list refreshes on it. */
  onCreated?: (invite: InviteRow) => void;
}

export default function InviteSheet({
  visible, onClose, kind, liveClassId, liveTitle, coachName, initialName, initialContact, onCreated,
}: InviteSheetProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const coachFirst = firstName(coachName) || 'Your coach';

  const [name, setName] = useState(initialName ?? '');
  const [contact, setContact] = useState(initialContact ?? '');
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<'send' | 'copy' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'standing' | 'live' | 'personal' | null>(null);

  // The link this sheet shows: the coach's standing link (coach) or the class
  // invite (live). Created once per open; a live link is cached per class.
  const [linkRow, setLinkRow] = useState<InviteRow | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const liveCache = useRef<Map<string, InviteRow>>(new Map());
  const standingCache = useRef<InviteRow | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefill follows the caller while the sheet is closed (add-client types
  // the name before opening it); once open, the coach's edits win.
  useEffect(() => {
    if (!visible) {
      setName(initialName ?? '');
      setContact(initialContact ?? '');
    }
  }, [visible, initialName, initialContact]);

  const loadLink = useCallback(async () => {
    setLinkError(null);
    if (kind === 'live') {
      const id = liveClassId ?? '';
      if (!id) { setLinkError('This class has no id yet.'); return; }
      const cached = liveCache.current.get(id);
      if (cached) { setLinkRow(cached); return; }
      setLinkLoading(true);
      try {
        const row = await createInvite({ kind: 'live', liveClassId: id });
        liveCache.current.set(id, row);
        setLinkRow(row);
      } catch (e: any) {
        setLinkError(friendlyCreateError(e, 'We could not make the link. Check your connection and try again.'));
        if (__DEV__) console.warn('[InviteSheet] live invite failed:', e?.message);
      } finally {
        setLinkLoading(false);
      }
      return;
    }
    if (standingCache.current) { setLinkRow(standingCache.current); return; }
    setLinkLoading(true);
    try {
      const row = await createInvite({ kind: 'coach' });
      standingCache.current = row;
      setLinkRow(row);
    } catch (e: any) {
      setLinkError('We could not load your link. You can still send an invite.');
      if (__DEV__) console.warn('[InviteSheet] standing link failed:', e?.message);
    } finally {
      setLinkLoading(false);
    }
  }, [kind, liveClassId]);

  useEffect(() => {
    if (!visible) {
      setBusy(null);
      setError(null);
      setCopied(null);
      setEditing(false);
      return;
    }
    loadLink();
  }, [visible, loadLink]);

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const flashCopied = (which: 'standing' | 'live' | 'personal') => {
    setCopied(which);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };

  const inviteeFirst = firstName(name);
  const generated = useMemo(
    () => (linkRow ? buildInviteMessage({ coachFirst, inviteeFirst, code: linkRow.code }) : null),
    [coachFirst, inviteeFirst, linkRow],
  );
  const messageText = draft ?? generated ?? '';

  /** Close, wait for the Modal to be gone, then hand the OS the text. */
  const closeThenShare = (message: string) => {
    onClose();
    setTimeout(() => {
      Share.share({ message }).catch(() => { /* the person dismissed the share sheet */ });
    }, HANDOFF_MS);
  };

  // ── Coach: send ─────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (busy || !name.trim()) return;
    setBusy('send');
    setError(null);
    try {
      const row = await createInvite({
        kind: 'coach',
        inviteeName: name,
        inviteeContact: contact,
        message: messageText || null,
      });
      onCreated?.(row);
      closeThenShare(messageForInvite(row, coachFirst));
    } catch (e: any) {
      setError(friendlyCreateError(e, 'The invite was not created. Check your connection and try again.'));
      if (__DEV__) console.warn('[InviteSheet] createInvite failed:', e?.message);
      setBusy(null);
    }
  };

  // ── Coach: copy the link instead ───────────────────────────────────────
  const handleCopyInstead = async () => {
    if (busy) return;
    setBusy('copy');
    setError(null);
    try {
      const personal = !!(name.trim() || contact.trim());
      const row = personal
        ? await createInvite({ kind: 'coach', inviteeName: name, inviteeContact: contact, message: messageText || null })
        : (linkRow ?? await createInvite({ kind: 'coach' }));
      if (personal) onCreated?.(row);
      const link = inviteLink('coach', row.code);
      const ok = await copyToClipboard(link);
      if (ok) {
        hapticMoment('select');
        flashCopied('personal');
        setBusy(null);
      } else {
        closeThenShare(link);
      }
    } catch (e: any) {
      setError(friendlyCreateError(e, 'The link was not created. Check your connection and try again.'));
      if (__DEV__) console.warn('[InviteSheet] copy failed:', e?.message);
      setBusy(null);
    }
  };

  // ── Copy the shown link (standing or live) ─────────────────────────────
  const handleCopyLink = async () => {
    if (!linkRow || busy) return;
    const link = inviteLink(kind, linkRow.code);
    const ok = await copyToClipboard(link);
    if (ok) {
      hapticMoment('select');
      flashCopied(kind === 'live' ? 'live' : 'standing');
    } else {
      closeThenShare(link);
    }
  };

  // ── Live: share ─────────────────────────────────────────────────────────
  const handleShareLive = () => {
    if (!linkRow || busy) return;
    setBusy('share');
    closeThenShare(buildLiveShareMessage({ coachFirst, title: liveTitle, code: linkRow.code }));
  };

  const shownLink = linkRow ? inviteLink(kind, linkRow.code) : null;
  const shownLinkShort = shownLink ? shownLink.replace(/^https:\/\//, '') : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      statusBarTranslucent
      onRequestClose={() => { if (!busy) onClose(); }}
    >
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => { if (!busy) onClose(); }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} accessibilityViewIsModal>
          <View style={s.handle} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scroll}
            bounces={false}
          >
            {kind === 'coach' ? (
              <>
                <Text style={s.title} maxFontSizeMultiplier={1.3} accessibilityRole="header">Invite an athlete.</Text>
                <Text style={s.sub} maxFontSizeMultiplier={1.4}>
                  They get a link with your name on it. When they join, they land on your roster with their first week waiting.
                </Text>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel} maxFontSizeMultiplier={1.3}>Name</Text>
                  <TextInput
                    style={s.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Their name"
                    placeholderTextColor={C.textFaint}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!busy}
                    accessibilityLabel="Athlete name"
                  />
                </View>
                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel} maxFontSizeMultiplier={1.3}>Phone or email</Text>
                  <TextInput
                    style={s.input}
                    value={contact}
                    onChangeText={setContact}
                    placeholder="Where the invite goes"
                    placeholderTextColor={C.textFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="done"
                    editable={!busy}
                    accessibilityLabel="Athlete phone or email"
                  />
                </View>

                {/* THE MESSAGE */}
                <View style={s.messageCard}>
                  <View style={s.messageHead}>
                    <Text style={s.eyebrow} maxFontSizeMultiplier={1.2}>THE MESSAGE</Text>
                    {generated !== null && (
                      <TouchableOpacity
                        onPress={() => {
                          if (editing) { setEditing(false); return; }
                          setDraft(messageText);
                          setEditing(true);
                        }}
                        disabled={!!busy}
                        activeOpacity={0.7}
                        style={s.editBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={editing ? 'Done editing the message' : 'Edit the message'}
                      >
                        <Text style={s.editBtnText} maxFontSizeMultiplier={1.2}>{editing ? 'Done' : 'Edit'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {generated === null ? (
                    <View style={s.messagePending}>
                      {linkLoading ? <ActivityIndicator size="small" color={C.textMuted} /> : null}
                      <Text style={s.messagePendingText} maxFontSizeMultiplier={1.3}>
                        {linkLoading ? 'Writing your message' : (linkError ?? 'Your message appears once your link is ready.')}
                      </Text>
                      {!linkLoading && linkError ? (
                        <TouchableOpacity onPress={loadLink} style={s.retryBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Try loading the link again">
                          <Text style={s.retryText} maxFontSizeMultiplier={1.2}>Try again</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : editing ? (
                    <TextInput
                      style={s.messageInput}
                      value={messageText}
                      onChangeText={setDraft}
                      multiline
                      autoFocus
                      textAlignVertical="top"
                      scrollEnabled={false}
                      accessibilityLabel="Invite message"
                    />
                  ) : (
                    <Text style={s.messageText} maxFontSizeMultiplier={1.4}>{messageText}</Text>
                  )}
                  {draft !== null && !editing && (
                    <TouchableOpacity
                      onPress={() => setDraft(null)}
                      style={s.resetBtn}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Use the original message"
                    >
                      <Text style={s.resetText} maxFontSizeMultiplier={1.2}>Use the original</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Standing link */}
                {(shownLinkShort || linkLoading) && (
                  <View style={s.linkRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.linkLabel} maxFontSizeMultiplier={1.3}>Your standing link</Text>
                      <Text style={s.linkText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                        {shownLinkShort ?? 'Loading'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={handleCopyLink}
                      disabled={!shownLink || !!busy}
                      style={s.copyBtn}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Copy your standing link"
                    >
                      <Ionicons name={copied === 'standing' ? 'checkmark' : 'copy-outline'} size={16} color={C.textPrimary} />
                      <Text style={s.copyBtnText} maxFontSizeMultiplier={1.2}>{copied === 'standing' ? 'Copied' : 'Copy'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {error ? <Text style={s.error} maxFontSizeMultiplier={1.3}>{error}</Text> : null}

                <TouchableOpacity
                  style={[s.primaryBtn, (!name.trim() || !!busy) && s.btnDisabled]}
                  onPress={handleSend}
                  disabled={!name.trim() || !!busy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={inviteeFirst ? `Send the invite to ${inviteeFirst}` : 'Send the invite'}
                  accessibilityState={{ disabled: !name.trim() || !!busy, busy: busy === 'send' }}
                >
                  {busy === 'send'
                    ? <ActivityIndicator size="small" color={C.onAccent} />
                    : <Text style={s.primaryBtnText} maxFontSizeMultiplier={1.2}>{inviteeFirst ? `Send to ${inviteeFirst}` : 'Send the invite'}</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.secondaryBtn}
                  onPress={handleCopyInstead}
                  disabled={!!busy}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Copy the link instead"
                >
                  {busy === 'copy'
                    ? <ActivityIndicator size="small" color={C.textSecondary} />
                    : <Text style={s.secondaryBtnText} maxFontSizeMultiplier={1.2}>{copied === 'personal' ? 'Link copied' : 'Copy the link instead'}</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.title} maxFontSizeMultiplier={1.3} accessibilityRole="header">Invite people to watch.</Text>
                {liveTitle ? <Text style={s.sub} maxFontSizeMultiplier={1.4}>{liveTitle}</Text> : null}

                <View style={s.linkChip}>
                  <Ionicons name="link-outline" size={18} color={C.accent} />
                  <Text style={s.linkChipText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {shownLinkShort ?? (linkLoading ? 'Making your link' : (linkError ?? 'No link yet'))}
                  </Text>
                  {shownLink ? (
                    <TouchableOpacity
                      onPress={handleCopyLink}
                      disabled={!!busy}
                      style={s.copyBtn}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Copy the class link"
                    >
                      <Ionicons name={copied === 'live' ? 'checkmark' : 'copy-outline'} size={16} color={C.textPrimary} />
                      <Text style={s.copyBtnText} maxFontSizeMultiplier={1.2}>{copied === 'live' ? 'Copied' : 'Copy'}</Text>
                    </TouchableOpacity>
                  ) : linkLoading ? (
                    <ActivityIndicator size="small" color={C.textMuted} />
                  ) : (
                    <TouchableOpacity onPress={loadLink} style={s.copyBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Try making the link again">
                      <Text style={s.copyBtnText} maxFontSizeMultiplier={1.2}>Try again</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={s.infoRow}>
                  <View style={s.infoIcon}><Ionicons name="globe-outline" size={18} color={C.textSecondary} /></View>
                  <Text style={s.infoText} maxFontSizeMultiplier={1.4}>
                    Anyone with the link watches on the web. No account, no download.
                  </Text>
                </View>
                <View style={s.infoRow}>
                  <View style={s.infoIcon}><Ionicons name="people-outline" size={18} color={C.textSecondary} /></View>
                  <Text style={s.infoText} maxFontSizeMultiplier={1.4}>
                    Athletes who train with another coach can watch this class only. Nothing else about their coaching changes.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[s.primaryBtn, (!shownLink || !!busy) && s.btnDisabled]}
                  onPress={handleShareLive}
                  disabled={!shownLink || !!busy}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Share the link"
                  accessibilityState={{ disabled: !shownLink || !!busy, busy: busy === 'share' }}
                >
                  {busy === 'share'
                    ? <ActivityIndicator size="small" color={C.onAccent} />
                    : <Text style={s.primaryBtnText} maxFontSizeMultiplier={1.2}>Share the link</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.secondaryBtn}
                  onPress={() => { if (!busy) onClose(); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Not now"
                >
                  <Text style={s.secondaryBtnText} maxFontSizeMultiplier={1.2}>Not now</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16,18,16,0.72)' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: C.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.borderMuted, borderBottomWidth: 0,
    paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, borderCurve: 'continuous',
    backgroundColor: C.border, alignSelf: 'center', marginBottom: 8,
  },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, gap: 12 },

  title: { fontFamily: F.headingBold, fontSize: 22, lineHeight: 26, color: C.textPrimary, letterSpacing: -0.2 },
  sub: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textSecondary, marginTop: -4 },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontFamily: F.bodyMedium, fontSize: 13, color: C.textMuted },
  input: {
    minHeight: 48, borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderMuted,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: F.body, fontSize: 15.5, color: C.textPrimary,
  },

  messageCard: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', padding: 16, gap: 8,
  },
  messageHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.5, color: C.textFaint },
  editBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end', marginVertical: -10, marginRight: -4, paddingHorizontal: 4 },
  editBtnText: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.accent },
  messageText: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.textPrimary },
  messageInput: {
    fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.textPrimary,
    minHeight: 110, padding: 0, margin: 0,
  },
  messagePending: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 44 },
  messagePendingText: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.textMuted, flexShrink: 1 },
  retryBtn: { minHeight: 44, justifyContent: 'center' },
  retryText: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.accent },
  resetBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginBottom: -10 },
  resetText: { fontFamily: F.bodyMedium, fontSize: 13, color: C.textMuted },

  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: C.borderMuted, borderRadius: 16, borderCurve: 'continuous',
    paddingHorizontal: 16, paddingVertical: 12, minHeight: 64,
  },
  linkLabel: { fontFamily: F.bodyMedium, fontSize: 13, color: C.textMuted },
  linkText: { fontFamily: F.mono, fontSize: 13.5, color: C.textPrimary, marginTop: 4 },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  copyBtnText: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textPrimary },

  linkChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous', paddingLeft: 16, paddingRight: 8, paddingVertical: 8, minHeight: 60,
  },
  linkChipText: { flex: 1, fontFamily: F.mono, fontSize: 13.5, color: C.textPrimary },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  infoIcon: { width: 32, height: 32, borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  infoText: { flex: 1, fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textSecondary },

  error: { fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: C.danger },

  primaryBtn: {
    height: 52, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { fontFamily: F.bodyBold, fontSize: 15.5, color: C.onAccent },
  secondaryBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textSecondary },
});
