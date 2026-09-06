/**
 * onboardingDraft — answers collected BEFORE an account exists.
 *
 * The editorial onboarding asks role, then (athletes) one goal, the days and
 * the setting — "FitLink First Week" — and only then asks for an account
 * (value first). Until the session exists the answers live here, on-device.
 * `applyOnboardingDraft` runs once a session appears (AuthContext), writes
 * the answers where the app reads them, and clears the draft.
 *
 * Athlete answers → auth metadata intake_* keys (the contract with
 * find-coach, add-client, search-unassigned-clients and solo-program) plus
 * `onboarding_intake`. There is no clients row until the athlete picks a
 * coach or goes solo, so the draft stays in metadata and is folded into the
 * clients row by find-coach / create_client_and_notify / ensure_solo_client
 * later. The per-account device flag the route guard reads is set first.
 *
 * Coach answers → trainers.specializations, trainers.training_locations,
 * trainers.coaching_mode.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
// Platform-aware wrapper: expo-secure-store has no web implementation.
import * as SecureStore from './secureStore';
import { supabase } from './supabase';
import { clientOnboardedKey } from './onboardingFlags';

const KEY = 'fitlink_onboarding_draft_v1';

export type DraftRole = 'client' | 'trainer';
export type CoachingMode = 'in_person' | 'remote' | 'hybrid';

/** The one goal the First Week intake asks for. */
export type GoalKey = 'strength' | 'fat_loss' | 'return' | 'pain';

/**
 * Goal labels as other screens match on them (lib/coachMatch.ts keywords,
 * find-coach prefill, add-client). Change a string here and those matches
 * silently stop — the label IS the contract.
 */
export const GOAL_LABEL: Record<GoalKey, string> = {
  strength: 'Get stronger on the big lifts',
  fat_loss: 'Lose fat, keep the strength I have',
  return: 'Get back into it after a break',
  pain: 'Train around something that hurts',
};

export interface OnboardingDraft {
  role?: DraftRole;
  /** Athlete: the single First Week goal. */
  goal?: GoalKey;
  /** Athlete goals (labels, `[GOAL_LABEL[goal]]`) or coach specialties (labels). */
  goals?: string[];
  /** Athlete: sessions a week, 1-7 (= trainingDays.length). */
  days?: number;
  /** Athlete: three-letter lowercase weekday keys, e.g. ['tue','thu','sat']. */
  trainingDays?: string[];
  /** Where training happens: athlete single value (`locations[0]`), coach multi. */
  locations?: string[];
  /** Coaches only now; kept optional on the type. */
  mode?: CoachingMode;
  /** ISO date; athletes only (16+ gate). */
  dob?: string;
  /** Athlete's chosen way to train: a human coach, or the AI corner. */
  path?: 'coach' | 'solo';
  /** Display name typed on the account step (phone sign-ups have no other source). */
  name?: string;
  updatedAt?: number;
}

export async function loadDraft(): Promise<OnboardingDraft> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OnboardingDraft) : {};
  } catch {
    return {};
  }
}

export async function saveDraft(patch: Partial<OnboardingDraft>): Promise<OnboardingDraft> {
  const cur = await loadDraft();
  const next = { ...cur, ...patch, updatedAt: Date.now() };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

export async function clearDraft(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch {}
}

/**
 * Write the draft to the signed-in user's profile. Idempotent; safe to call
 * on every SIGNED_IN. Returns the role that was applied, or null when there
 * was nothing to apply.
 */
export async function applyOnboardingDraft(userId: string): Promise<DraftRole | null> {
  const d = await loadDraft();
  if (!d.role) return null;

  if (d.role === 'trainer') {
    // Coach: the signup trigger already created the trainers row.
    const update: Record<string, any> = {};
    if (d.goals?.length) {
      update.specializations = d.goals;
      update.specialization = d.goals[0];
    }
    if (d.locations?.length) update.training_locations = d.locations;
    if (d.mode) update.coaching_mode = d.mode;
    if (Object.keys(update).length) {
      const { error } = await supabase.from('trainers').update(update).eq('id', userId);
      if (error && __DEV__) console.warn('[onboardingDraft] trainers update failed:', error.message);
    }
    await supabase.auth.updateUser({ data: { role: 'trainer', ...(d.name ? { name: d.name } : {}) } }).catch(() => {});
    if (d.name) {
      await supabase.from('trainers').update({ name: d.name }).eq('id', userId);
    }
  } else {
    // The route guard (app/_layout.tsx) reads this device flag alongside the
    // metadata. Set it BEFORE the metadata round-trip so a slow or failed
    // updateUser cannot bounce a freshly signed-up athlete back into intake.
    await SecureStore.setItemAsync(clientOnboardedKey(userId), 'true').catch(() => {});

    // Athlete: role + intake into auth metadata. A stray trainers row from
    // the signup trigger (OAuth signups carry no role) is removed server-side.
    // The intake_* keys are the contract with find-coach, add-client,
    // search-unassigned-clients and solo-program — labels, not keys.
    const goalLabel = d.goal ? GOAL_LABEL[d.goal] : (d.goals?.[0] ?? null);
    const trainingDays = Array.isArray(d.trainingDays) ? d.trainingDays : [];
    const days = d.days ?? (trainingDays.length > 0 ? trainingDays.length : null);
    const location = d.locations?.[0] ?? null;
    const meta: Record<string, any> = {
      role: 'client',
      client_onboarded: true,
      intake_goal: goalLabel,
      intake_goal_key: d.goal ?? null,
      intake_days: days,
      intake_training_days: trainingDays,
      intake_experience: 'not stated',
      onboarding_intake: {
        goals: goalLabel ? [goalLabel] : [],
        goal_key: d.goal ?? null,
        location,
        ...(d.mode ? { mode: d.mode } : {}),
        days,
        training_days: trainingDays,
      },
      onboarding_path: d.path ?? null,
    };
    if (d.dob) meta.date_of_birth = d.dob;
    if (d.name) meta.name = d.name;
    const { error } = await supabase.auth.updateUser({ data: meta });
    if (error && __DEV__) console.warn('[onboardingDraft] metadata update failed:', error.message);
    await supabase.rpc('claim_athlete_role').then(({ error: e }) => {
      if (e && __DEV__) console.warn('[onboardingDraft] claim_athlete_role failed:', e.message);
    });
  }

  await clearDraft();
  return d.role;
}
