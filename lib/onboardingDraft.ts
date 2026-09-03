/**
 * onboardingDraft — answers collected BEFORE an account exists.
 *
 * The editorial onboarding asks role, goals and preferences first and only
 * then asks for an account (value first, one-tap auth). Until the session
 * exists the answers live here, on-device. `applyOnboardingDraft` runs once
 * a session appears (AuthContext), writes the answers where the app reads
 * them, and clears the draft.
 *
 * Athlete answers → clients.assessment_data.intake (existing contract with
 * find-coach) plus auth metadata intake_* keys. There is no clients row
 * until the athlete picks a coach, so the athlete's draft is kept in auth
 * metadata (`onboarding_intake`) and folded into the clients row by
 * find-coach / create_client_and_notify later.
 *
 * Coach answers → trainers.specializations, trainers.training_locations,
 * trainers.coaching_mode.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const KEY = 'fitlink_onboarding_draft_v1';

export type DraftRole = 'client' | 'trainer';
export type CoachingMode = 'in_person' | 'remote' | 'hybrid';

export interface OnboardingDraft {
  role?: DraftRole;
  /** Athlete goals (labels) or coach specialties (labels). */
  goals?: string[];
  /** Where training happens: athlete single value, coach multi. */
  locations?: string[];
  mode?: CoachingMode;
  /** ISO date; athletes only (16+ gate). */
  dob?: string;
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
    await supabase.auth.updateUser({ data: { role: 'trainer' } }).catch(() => {});
  } else {
    // Athlete: role + intake into auth metadata. A stray trainers row from
    // the signup trigger (OAuth signups carry no role) is removed server-side.
    const meta: Record<string, any> = {
      role: 'client',
      client_onboarded: true,
      onboarding_intake: {
        goals: d.goals ?? [],
        location: d.locations?.[0] ?? null,
        mode: d.mode ?? null,
      },
      intake_goal: d.goals?.[0] ?? null,
    };
    if (d.dob) meta.date_of_birth = d.dob;
    const { error } = await supabase.auth.updateUser({ data: meta });
    if (error && __DEV__) console.warn('[onboardingDraft] metadata update failed:', error.message);
    await supabase.rpc('claim_athlete_role').then(({ error: e }) => {
      if (e && __DEV__) console.warn('[onboardingDraft] claim_athlete_role failed:', e.message);
    });
  }

  await clearDraft();
  return d.role;
}
