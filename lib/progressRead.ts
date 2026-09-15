/**
 * progressRead — the corner's read of the athlete's progress (solo-progress).
 *
 * The weekly read is served fresh from the server for 12 hours; the app keeps
 * the last one on disk so the Progress tab paints instantly and offline. The
 * check-in reply is generated once when the athlete sends the check-in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export interface ProgressRead {
  id: string;
  headline: string;
  body: string;
  next: string[];
  facts: Record<string, unknown>;
  character: string | null;
  created_at: string;
}

export interface HealthFacts {
  stepsAvg7?: number | null;
  sleepAvgMin7?: number | null;
  restingHr?: number | null;
  restingHrDelta28?: number | null;
  weightLbs?: number | null;
}

export type ProgressReadResult =
  | { ok: true; read: ProgressRead; cached: boolean }
  | { ok: false; reason: 'premium_required' | 'not_solo' | 'rate_limited' | 'error' };

const KEY = 'fitlink_progress_read_v1';

export async function loadStoredRead(): Promise<ProgressRead | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProgressRead) : null;
  } catch {
    return null;
  }
}

export async function fetchProgressRead(mode: 'week' | 'checkin', health: HealthFacts, force = false): Promise<ProgressReadResult> {
  const { data, error } = await supabase.functions.invoke('solo-progress', { body: { mode, health, force } });
  if (error || !data) {
    const status = (error as any)?.context?.status ?? (error as any)?.status;
    const body = (data as any) ?? {};
    if (status === 402 || body?.error === 'premium_required') return { ok: false, reason: 'premium_required' };
    if (status === 409 || body?.error === 'not_solo') return { ok: false, reason: 'not_solo' };
    if (status === 429) return { ok: false, reason: 'rate_limited' };
    return { ok: false, reason: 'error' };
  }
  if ((data as any).error === 'premium_required') return { ok: false, reason: 'premium_required' };
  if ((data as any).error === 'not_solo') return { ok: false, reason: 'not_solo' };
  const read = (data as any).read as ProgressRead | undefined;
  if (!read) return { ok: false, reason: 'error' };
  if (mode === 'week') {
    try { await AsyncStorage.setItem(KEY, JSON.stringify(read)); } catch { /* disk is a convenience */ }
  }
  return { ok: true, read, cached: !!(data as any).cached };
}
