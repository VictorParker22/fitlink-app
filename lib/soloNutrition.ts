/**
 * soloNutrition — ask the corner to write (or rewrite) the athlete's meal plan.
 *
 * Calls the solo-nutrition function, which computes calorie and protein
 * targets from body weight, training days and the goal, fills them with real
 * foods, and writes the plan into the same tables the Food tab reads
 * (client_diets → diet_plans with trainer_id NULL). Paid boundary is
 * server-side (402). Without a known body weight the server answers 409
 * `needs_weight`; the corner asks and the next call passes it.
 */
import { supabase } from './supabase';

export interface SoloNutritionTargets {
  training: { calories: number; protein: number; carbs: number; fat: number };
  rest: { calories: number; protein: number; carbs: number; fat: number };
  method: string;
}

export type SoloNutritionResult =
  | { ok: true; planId: string; name: string; targets: SoloNutritionTargets; model: 'gemini' | 'fallback' }
  | { ok: false; reason: 'needs_weight' | 'premium_required' | 'no_client' | 'rate_limited' | 'error'; message?: string };

export interface SoloNutritionInput {
  /** Body weight the athlete just stated, in `unit`. */
  weight?: number;
  unit?: 'lbs' | 'kg';
  /** Free text: restrictions, dislikes, budget, cooking time. */
  preferences?: string;
}

export async function buildSoloNutrition(input: SoloNutritionInput = {}): Promise<SoloNutritionResult> {
  const { data, error } = await supabase.functions.invoke('solo-nutrition', { body: input });
  if (error) {
    const status = (error as any)?.context?.status ?? (error as any)?.status;
    if (status === 409) return { ok: false, reason: 'needs_weight' };
    if (status === 402) return { ok: false, reason: 'premium_required' };
    if (status === 404) return { ok: false, reason: 'no_client' };
    if (status === 429 || status === 503) return { ok: false, reason: 'rate_limited', message: error.message };
    return { ok: false, reason: 'error', message: error.message };
  }
  if (data?.error === 'needs_weight') return { ok: false, reason: 'needs_weight' };
  if (data?.error === 'premium_required') return { ok: false, reason: 'premium_required' };
  if (data?.error === 'no_client') return { ok: false, reason: 'no_client' };
  if (data?.error) return { ok: false, reason: 'error', message: String(data.error) };
  return { ok: true, planId: String(data?.plan_id ?? ''), name: String(data?.name ?? ''), targets: data?.targets, model: data?.model === 'gemini' ? 'gemini' : 'fallback' };
}

/**
 * A body weight stated in a message: "I weigh 190", "86 kg", "about 190 lbs".
 * Pounds unless the athlete says kilograms; `fallbackUnit` is their setting.
 * Null when no plausible number is present (60-600 lb, 30-270 kg).
 */
export function parseStatedWeight(text: string, fallbackUnit: 'lbs' | 'kg' = 'lbs'): { weight: number; unit: 'lbs' | 'kg' } | null {
  const m = /(\d{2,3}(?:\.\d)?)\s*(kg|kgs|kilo|kilos|kilograms?|lb|lbs|pounds?)?\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  const said = (m[2] ?? '').toLowerCase();
  const unit: 'lbs' | 'kg' = said ? (said.startsWith('k') ? 'kg' : 'lbs') : fallbackUnit;
  if (unit === 'kg' ? n < 30 || n > 270 : n < 60 || n > 600) return null;
  return { weight: n, unit };
}

/** Whether a message reads as "write me a meal plan". */
export const NUTRITION_INTENT = /(meal plan|diet plan|nutrition plan|eating plan|food plan|my (diet|nutrition|macros|calories)|what (should|do|can) i eat|how (much|many) (should i|to) eat|calorie target|macros)/i;

/** Restriction-sounding text worth passing along as preferences. */
export const PREFERENCE_HINT = /(vegan|vegetarian|pescatarian|halal|kosher|dairy|lactose|gluten|celiac|coeliac|allerg|nut|shellfish|budget|cheap|no time|quick|don't eat|dont eat|can't eat|cant eat|hate|dislike|avoid)/i;
