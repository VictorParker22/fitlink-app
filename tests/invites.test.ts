/**
 * The invite code and link contract shared with the website and the
 * database: 6 characters from an unambiguous alphabet, links under
 * fitlink.coach/i and /live, one deep link, and a message the coach can send
 * as is. These must not drift, so they are pinned here.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(), ImpactFeedbackStyle: {}, NotificationFeedbackType: {} }));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));
jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() }, from: jest.fn() } }));

import {
  normalizeCode, isValidCode, inviteLink, inviteDeepLink, buildInviteMessage, messageForInvite,
  buildLiveShareMessage, parseInviteFromUrl, canResend, relativeTime, setPendingInviteCode,
  getPendingInviteCode, clearPendingInviteCode,
} from '../lib/invites';

describe('codes', () => {
  it('normalises what people type or paste', () => {
    expect(normalizeCode(' vp-7k3q ')).toBe('VP7K3Q');
    expect(normalizeCode('vp7k3q9999')).toBe('VP7K3Q');
    expect(normalizeCode(null)).toBe('');
  });

  it('accepts only the unambiguous alphabet', () => {
    expect(isValidCode('VP7K3Q')).toBe(true);
    expect(isValidCode('VP7K3')).toBe(false);
    expect(isValidCode('VP0K3Q')).toBe(false); // zero is not in the alphabet
    expect(isValidCode('VPIK3Q')).toBe(false); // nor I
  });
});

describe('links and messages', () => {
  it('builds the two web links and the deep link', () => {
    expect(inviteLink('coach', 'vp7k3q')).toBe('https://fitlink.coach/i/VP7K3Q');
    expect(inviteLink('live', 'K4RX9M')).toBe('https://fitlink.coach/live/K4RX9M');
    expect(inviteDeepLink('vp7k3q')).toBe('fitlink://invite/VP7K3Q');
  });

  it('writes the coach message with and without a name', () => {
    const withName = buildInviteMessage({ coachFirst: 'Victor', inviteeFirst: 'Sam', code: 'VP7K3Q' });
    expect(withName.startsWith('Hi Sam, Victor here.')).toBe(true);
    expect(withName.endsWith('https://fitlink.coach/i/VP7K3Q')).toBe(true);
    const noName = buildInviteMessage({ coachFirst: 'Victor', inviteeFirst: '', code: 'VP7K3Q' });
    expect(noName.startsWith('Victor here.')).toBe(true);
  });

  it('swaps a preview link for the row\'s own code when resending', () => {
    const row = { code: 'ABCDEF', invitee_name: 'Sam', message: 'Join me: https://fitlink.coach/i/VP7K3Q' };
    expect(messageForInvite(row, 'Victor')).toBe('Join me: https://fitlink.coach/i/ABCDEF');
    const noLink = { code: 'ABCDEF', invitee_name: null, message: 'Join me' };
    expect(messageForInvite(noLink, 'Victor')).toContain('https://fitlink.coach/i/ABCDEF');
  });

  it('writes the live share message', () => {
    expect(buildLiveShareMessage({ coachFirst: 'Victor', title: 'Upper body push', code: 'K4RX9M' }))
      .toBe('Victor is streaming Upper body push live on FitLink. Watch here: https://fitlink.coach/live/K4RX9M');
  });
});

describe('parseInviteFromUrl', () => {
  it('reads every link shape', () => {
    expect(parseInviteFromUrl('https://fitlink.coach/i/VP7K3Q')).toBe('VP7K3Q');
    expect(parseInviteFromUrl('https://www.fitlink.coach/live/k4rx9m?utm=x')).toBe('K4RX9M');
    expect(parseInviteFromUrl('fitlink://invite/VP7K3Q')).toBe('VP7K3Q');
  });

  it('rejects anything else', () => {
    expect(parseInviteFromUrl('https://fitlink.coach/pricing')).toBeNull();
    expect(parseInviteFromUrl('https://evil.example/i/VP7K3Q')).toBeNull();
    expect(parseInviteFromUrl(null)).toBeNull();
  });
});

describe('list helpers', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-09-08T12:00:00Z');
  const row = (over: Record<string, unknown>) => ({
    id: 'i', code: 'VP7K3Q', kind: 'coach', trainer_id: 't', live_class_id: null, invitee_name: 'Sam',
    invitee_contact: 'x', message: null, status: 'sent', sent_at: new Date(now - 3 * day).toISOString(),
    opened_at: null, opened_count: 0, accepted_at: null, accepted_by: null, accepted_client_id: null,
    expires_at: new Date(now + 20 * day).toISOString(), created_at: null, ...over,
  }) as any;

  it('offers Resend only after two days and only while unanswered', () => {
    expect(canResend(row({}), now)).toBe(true);
    expect(canResend(row({ sent_at: new Date(now - day).toISOString() }), now)).toBe(false);
    expect(canResend(row({ status: 'accepted' }), now)).toBe(false);
  });

  it('describes time in plain words', () => {
    expect(relativeTime(new Date(now - 30 * 1000).toISOString(), now)).toBe('just now');
    expect(relativeTime(new Date(now - 2 * 60 * 60 * 1000).toISOString(), now)).toBe('2 hours ago');
    expect(relativeTime(new Date(now - 3 * day).toISOString(), now)).toBe('3 days ago');
  });
});

describe('pending code', () => {
  it('parks, reads and clears a code', async () => {
    await setPendingInviteCode('vp7k3q');
    expect(await getPendingInviteCode()).toBe('VP7K3Q');
    await clearPendingInviteCode();
    expect(await getPendingInviteCode()).toBeNull();
  });
});
