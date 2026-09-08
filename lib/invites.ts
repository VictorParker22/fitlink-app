/**
 * invites — the app side of FitLink's invitation system (design canvas
 * "FitLink Invitations", 2026-09-07).
 *
 * A coach sends a person a link. Opening it shows the coach; accepting it
 * attaches the athlete to that coach (or lets them watch one live class).
 * The backend contract:
 *
 *   rpc create_invite(p_kind, p_live_class_id, p_invitee_name,
 *                     p_invitee_contact, p_message)        → invites row
 *   rpc accept_invite(p_code, p_confirm_switch)            → { kind, trainer_id,
 *                                                             client_id, live_class_id, switched }
 *   rpc revoke_invite(p_id)
 *   edge invite-info { code }                              → InviteInfo | 404 (works signed out)
 *
 * Codes are six characters from ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no 0/O, 1/I/L).
 * Links: https://fitlink.coach/i/<CODE> (coach) and https://fitlink.coach/live/<CODE>
 * (live); the in-app deep link is fitlink://invite/<CODE> for both kinds.
 *
 * A signed-out person who opens a link has the code parked in AsyncStorage
 * (`fitlink_pending_invite`); AuthGuard resumes it once they have a session.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { HapticMoment } from '../constants/motion';
import { supabase } from './supabase';

export type InviteKind = 'coach' | 'live';
export type InviteStatus = 'sent' | 'opened' | 'accepted' | 'expired' | 'revoked';

export interface InviteRow {
  id: string;
  code: string;
  kind: InviteKind;
  trainer_id: string;
  live_class_id: string | null;
  invitee_name: string | null;
  invitee_contact: string | null;
  message: string | null;
  status: InviteStatus;
  sent_at: string;
  opened_at: string | null;
  opened_count: number | null;
  accepted_at: string | null;
  accepted_by: string | null;
  accepted_client_id: string | null;
  expires_at: string | null;
}

export interface InviteInfo {
  kind: InviteKind;
  code: string;
  expired: boolean;
  coach: {
    id: string;
    name: string;
    avatar_url: string | null;
    specialization: string | null;
    specializations: string[] | null;
    bio: string | null;
  };
  live?: {
    class_id: string;
    title: string;
    status: 'scheduled' | 'live' | 'ended' | 'cancelled' | string;
    playback_id: string | null;
    went_live_at: string | null;
  };
}

// ── Codes and links ──────────────────────────────────────────────────────────

export const INVITE_CODE_LENGTH = 6;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`);

/** Upper-case, strip anything that is not a letter or digit, keep six. */
export function normalizeCode(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, INVITE_CODE_LENGTH);
}

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code);
}

export const INVITE_WEB_ORIGIN = 'https://fitlink.coach';

export function inviteLink(kind: InviteKind, code: string): string {
  const c = normalizeCode(code);
  return kind === 'live' ? `${INVITE_WEB_ORIGIN}/live/${c}` : `${INVITE_WEB_ORIGIN}/i/${c}`;
}

export function inviteDeepLink(code: string): string {
  return `fitlink://invite/${normalizeCode(code)}`;
}

export function firstName(name: string | null | undefined): string {
  return String(name ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * The message a coach sends. Written once, in the coach's voice, so a
 * personal invite reads as one person writing to another and not as a
 * product announcement. No name → no greeting.
 */
export function buildInviteMessage({ coachFirst, inviteeFirst, code }: {
  coachFirst: string;
  inviteeFirst?: string | null;
  code: string;
}): string {
  const link = inviteLink('coach', code);
  const greeting = inviteeFirst && inviteeFirst.trim() ? `Hi ${inviteeFirst.trim()}, ` : '';
  const coach = coachFirst.trim() || 'Your coach';
  return `${greeting}${coach} here. I moved my coaching to FitLink: your sessions, check-ins and our messages in one place. Join me here and I'll have your first week ready: ${link}`;
}

const COACH_LINK_RE = /https:\/\/(?:www\.)?fitlink\.coach\/i\/[A-Za-z0-9]{6}/g;

/**
 * The text to share for one invite row. The sheet previews the message with
 * the coach's standing link (the personal code does not exist until the row
 * is created), so the stored text may carry that link: swap every coach link
 * for this row's own, and append it when the coach edited the link away.
 */
export function messageForInvite(row: Pick<InviteRow, 'code' | 'message' | 'invitee_name'>, coachFirst: string): string {
  const link = inviteLink('coach', row.code);
  const base = row.message && row.message.trim()
    ? row.message.trim()
    : buildInviteMessage({ coachFirst, inviteeFirst: firstName(row.invitee_name), code: row.code });
  const swapped = base.replace(COACH_LINK_RE, link);
  return swapped.includes(link) ? swapped : `${swapped}\n${link}`;
}

/** Live-class share text. Plain, one sentence, the link last. */
export function buildLiveShareMessage({ coachFirst, title, code }: {
  coachFirst: string;
  title?: string | null;
  code: string;
}): string {
  const who = coachFirst.trim() || 'Your coach';
  const what = title && title.trim() ? ` ${title.trim()}` : '';
  return `${who} is streaming${what} live on FitLink. Watch here: ${inviteLink('live', code)}`;
}

/**
 * Pull an invite code out of any link the app can be opened with:
 *   fitlink://invite/CODE
 *   https://fitlink.coach/i/CODE
 *   https://fitlink.coach/live/CODE
 * Trailing slashes, query strings and fragments are ignored. Anything else
 * returns null.
 */
export function parseInviteFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = String(url).trim().split(/[?#]/)[0];
  const m =
    clean.match(/^fitlink:\/\/(?:invite)\/([A-Za-z0-9]{6})\/?$/) ||
    clean.match(/^https?:\/\/(?:www\.)?fitlink\.coach\/(?:i|live)\/([A-Za-z0-9]{6})\/?$/);
  if (!m) return null;
  const code = normalizeCode(m[1]);
  return isValidCode(code) ? code : null;
}

/** True for the custom-scheme form Expo Router already routes to app/invite/[code]. */
export function isRouterHandledInviteUrl(url: string): boolean {
  return /^fitlink:\/\/invite\//i.test(String(url).trim());
}

// ── Pending code (signed-out arrival) ────────────────────────────────────────

const PENDING_KEY = 'fitlink_pending_invite';

export async function setPendingInviteCode(code: string): Promise<void> {
  const c = normalizeCode(code);
  if (!isValidCode(c)) return;
  try { await AsyncStorage.setItem(PENDING_KEY, c); } catch { /* storage unavailable: the person can enter the code by hand */ }
}

export async function getPendingInviteCode(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    const c = normalizeCode(raw);
    return isValidCode(c) ? c : null;
  } catch {
    return null;
  }
}

export async function clearPendingInviteCode(): Promise<void> {
  try { await AsyncStorage.removeItem(PENDING_KEY); } catch { /* nothing to clear */ }
}

// ── Coach side ───────────────────────────────────────────────────────────────

export interface CreateInviteInput {
  kind: InviteKind;
  liveClassId?: string | null;
  inviteeName?: string | null;
  inviteeContact?: string | null;
  message?: string | null;
}

const blankToNull = (v: string | null | undefined): string | null => {
  const t = String(v ?? '').trim();
  return t ? t : null;
};

/**
 * Create an invite. With kind 'coach' and no name or contact the RPC returns
 * the coach's STANDING link (the same row every time). Throws with the
 * server's message on failure — callers show it honestly, never a success.
 */
export async function createInvite(input: CreateInviteInput): Promise<InviteRow> {
  const { data, error } = await supabase.rpc('create_invite', {
    p_kind: input.kind,
    p_live_class_id: input.kind === 'live' ? blankToNull(input.liveClassId) : null,
    p_invitee_name: blankToNull(input.inviteeName),
    p_invitee_contact: blankToNull(input.inviteeContact),
    p_message: blankToNull(input.message),
  });
  if (error) throw new Error(error.message);
  // A `returns invites` function hands back one object; a `setof` hands back
  // an array of one. Accept both so a contract tweak does not break the sheet.
  const row = (Array.isArray(data) ? data[0] : data) as InviteRow | undefined;
  if (!row || !row.code) throw new Error('invite_not_created');
  return { ...row, code: normalizeCode(row.code) };
}

export async function revokeInvite(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('revoke_invite', { p_id: id });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function fetchMyInvites(trainerId: string): Promise<{ rows: InviteRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('invites')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('sent_at', { ascending: false });
  if (error) return { rows: [], error: error.message };
  return { rows: ((data ?? []) as InviteRow[]).map((r) => ({ ...r, code: normalizeCode(r.code) })), error: null };
}

/** The coach's standing link row: kind coach, nobody named. Not a person, so the list hides it. */
export function isStandingInvite(row: InviteRow): boolean {
  return row.kind === 'coach' && !blankToNull(row.invitee_name) && !blankToNull(row.invitee_contact);
}

export const RESEND_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/** "Resend" appears only once a sent invite has sat unopened for two days. */
export function canResend(row: InviteRow, now: number = Date.now()): boolean {
  if (row.status !== 'sent') return false;
  const sent = Date.parse(row.sent_at);
  return Number.isFinite(sent) && now - sent >= RESEND_AFTER_MS;
}

// ── Athlete side ─────────────────────────────────────────────────────────────

export type InviteInfoResult =
  | { ok: true; info: InviteInfo }
  | { ok: false; reason: 'not_found' | 'network' | 'error'; message?: string };

/** Public lookup: works signed out (the function accepts the anon key). */
export async function fetchInviteInfo(code: string): Promise<InviteInfoResult> {
  const c = normalizeCode(code);
  if (!isValidCode(c)) return { ok: false, reason: 'not_found' };
  const { data, error } = await supabase.functions.invoke('invite-info', { body: { code: c } });
  if (error) {
    // supabase-js: a non-2xx reply is a FunctionsHttpError whose `context` is
    // the Response; a FunctionsFetchError has no status at all (nothing answered).
    const status: number | undefined =
      typeof (error as any)?.context?.status === 'number' ? (error as any).context.status
      : typeof (error as any)?.status === 'number' ? (error as any).status
      : undefined;
    if (status === 404) return { ok: false, reason: 'not_found' };
    if (status === undefined) return { ok: false, reason: 'network', message: error.message };
    return { ok: false, reason: 'error', message: error.message };
  }
  if (!data || data.error === 'not_found' || !data.coach) return { ok: false, reason: 'not_found' };
  const info: InviteInfo = {
    kind: data.kind === 'live' ? 'live' : 'coach',
    code: normalizeCode(data.code ?? c),
    expired: !!data.expired,
    coach: {
      id: String(data.coach.id ?? ''),
      name: String(data.coach.name ?? 'Your coach'),
      avatar_url: data.coach.avatar_url ?? null,
      specialization: data.coach.specialization ?? null,
      specializations: Array.isArray(data.coach.specializations) ? data.coach.specializations : null,
      bio: data.coach.bio ?? null,
    },
  };
  if (data.live && data.live.class_id) {
    info.live = {
      class_id: String(data.live.class_id),
      title: String(data.live.title ?? 'Live class'),
      status: String(data.live.status ?? 'scheduled'),
      playback_id: data.live.playback_id ?? null,
      went_live_at: data.live.went_live_at ?? null,
    };
  }
  return { ok: true, info };
}

export type AcceptInviteFailure =
  | 'not_found'
  | 'expired'
  | 'already_accepted'
  | 'needs_switch'
  | 'trainer_cannot_accept'
  | 'error';

export type AcceptInviteResult =
  | { ok: true; kind: InviteKind; trainerId: string | null; clientId: string | null; liveClassId: string | null; switched: boolean }
  | { ok: false; reason: AcceptInviteFailure; currentCoachName?: string; message?: string };

/**
 * Accept an invite as the signed-in athlete. The server's error strings are
 * mapped to typed results so a screen never has to grep a message; the one
 * with a payload ('needs_switch_confirmation: <name>') carries the current
 * coach's name for the switch confirmation.
 */
export async function acceptInvite(code: string, confirmSwitch: boolean = false): Promise<AcceptInviteResult> {
  const c = normalizeCode(code);
  if (!isValidCode(c)) return { ok: false, reason: 'not_found' };
  const { data, error } = await supabase.rpc('accept_invite', { p_code: c, p_confirm_switch: confirmSwitch });
  if (error) {
    const msg = String(error.message ?? '');
    if (msg.includes('needs_switch_confirmation')) {
      const name = msg.split('needs_switch_confirmation')[1]?.replace(/^\s*:\s*/, '').trim();
      return { ok: false, reason: 'needs_switch', currentCoachName: name || undefined };
    }
    if (msg.includes('invite_not_found')) return { ok: false, reason: 'not_found' };
    if (msg.includes('invite_expired')) return { ok: false, reason: 'expired' };
    if (msg.includes('invite_already_accepted')) return { ok: false, reason: 'already_accepted' };
    if (msg.includes('trainer_cannot_accept')) return { ok: false, reason: 'trainer_cannot_accept' };
    return { ok: false, reason: 'error', message: msg };
  }
  const row = (Array.isArray(data) ? data[0] : data) ?? {};
  return {
    ok: true,
    kind: row.kind === 'live' ? 'live' : 'coach',
    trainerId: row.trainer_id ?? null,
    clientId: row.client_id ?? null,
    liveClassId: row.live_class_id ?? null,
    switched: !!row.switched,
  };
}

// ── Small shared helpers ─────────────────────────────────────────────────────

/** "just now", "12 minutes ago", "3 hours ago", "yesterday", "4 days ago", then a date. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} ${min === 1 ? 'minute' : 'minutes'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${hr === 1 ? 'hour' : 'hours'} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Copy text if the device carries a clipboard module. expo-clipboard is not a
 * dependency today: probe the native side (never a bare require, see
 * lib/soloDictation.ts) and report false so the caller falls back to Share.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const mod = requireOptionalNativeModule<{ setStringAsync?: (s: string, o?: Record<string, unknown>) => Promise<boolean> }>('ExpoClipboard');
    if (!mod || typeof mod.setStringAsync !== 'function') return false;
    await mod.setStringAsync(text, {});
    return true;
  } catch {
    return false;
  }
}

/**
 * The one haptic engine for the invite screens: a HapticMoment from
 * constants/motion.ts, nothing invented per screen. Fire-and-forget.
 */
export function hapticMoment(moment: HapticMoment): void {
  let p: Promise<void>;
  switch (moment) {
    case 'select': p = Haptics.selectionAsync(); break;
    case 'start': p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
    case 'done':
    case 'record': p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); break;
    case 'destroy': p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
    case 'fail': p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); break;
    default: return;
  }
  p.catch(() => { /* no haptic engine on this device */ });
}
