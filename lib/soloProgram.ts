/**
 * soloProgram — ask the corner to write (or rewrite) the athlete's week.
 *
 * Calls the solo-program function, which builds real workouts from the
 * onboarding intake and assigns them across the next seven days. Paid
 * boundary is server-side (402). Idempotent server-side too: a program
 * built in the last six days is not rebuilt unless `rebuild` is true.
 */
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

export type SoloProgramResult =
  | { ok: true; created: { id: string; name: string; date: string }[]; skipped?: string; /** Adapt only: one spoken sentence on what changed and why. */ changes?: string; /** "week 2 of 4 (build), upper lower, 4 days: …" */ block?: string; /** Which brain wrote it: the model, or the plan alone when the model failed. */ model?: 'gemini' | 'fallback' }
  | { ok: false; reason: 'premium_required' | 'no_client' | 'rate_limited' | 'error'; message?: string };

export async function buildSoloProgram(opts: { rebuild?: boolean; days?: number; adapt?: boolean } = {}): Promise<SoloProgramResult> {
  // One id per attempt: the server refuses to build the same id twice, so a
  // retry or a double tap can never write two weeks.
  const request_id = Crypto.randomUUID();
  const { data, error } = await supabase.functions.invoke('solo-program', { body: { ...opts, request_id } });
  if (error) {
    const status = (error as any)?.context?.status ?? (error as any)?.status;
    if (status === 402) return { ok: false, reason: 'premium_required' };
    if (status === 404) return { ok: false, reason: 'no_client' };
    // 429 is the corner's own ceiling on rewrites, 503 'capacity' the
    // platform's; both mean "the week you have is the week to train".
    if (status === 429 || status === 503) return { ok: false, reason: 'rate_limited', message: error.message };
    return { ok: false, reason: 'error', message: error.message };
  }
  if (data?.error === 'premium_required') return { ok: false, reason: 'premium_required' };
  if (data?.error === 'no_client') return { ok: false, reason: 'no_client' };
  if (data?.error) return { ok: false, reason: 'error', message: String(data.error) };
  return {
    ok: true,
    created: data?.created ?? [],
    skipped: data?.skipped,
    changes: typeof data?.changes === 'string' && data.changes.trim() ? data.changes.trim() : undefined,
    block: typeof data?.block === 'string' && data.block.trim() ? data.block.trim() : undefined,
    model: data?.model === 'gemini' ? 'gemini' : data?.model === 'fallback' ? 'fallback' : undefined,
  };
}
