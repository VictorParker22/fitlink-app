// ============================================================
// solo-nutrition — the corner writes the athlete's meal plan.
//
// Solo athletes had no nutrition at all: generate-diet is a coach's library
// tool and the Food tab told them to "track food yourself". This writes a
// real plan into the same tables the Food tab already reads
// (diet_plans with trainer_id NULL → diet_plan_meals → meals, assigned via
// client_diets), with a training-day list and a rest-day variant.
//
// Doctrine:
// - The NUMBERS are arithmetic (targets.ts): body weight × training days →
//   maintenance, moved for the goal; protein by body weight; carbs up on
//   training days. The model never sets a target.
// - The model fills the numbers with ordinary foods (one food per entry,
//   real portions). Every food is cleaned (macros vs calories reconciled)
//   and the day is scaled onto the targets; a day that cannot be fixed, or
//   no model answer at all, falls back to a plain pantry day that always
//   lands. A plan is ALWAYS written.
// - Body weight comes from the request (the athlete told the corner), else
//   onboarding metadata. With neither: 409 needs_weight, and the app asks.
//   A weight given here is saved to metadata so the next build has it.
// - Paid boundary: premium_until (402). Rate-limited like every builder.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts';
import { guardRate, clampText } from '../_shared/rateLimit.ts';
import { withRetry, AiTimeout, PROMPT_VERSION, clampStr, parseJson, report, FAST_JSON, BUILD_TIMEOUT_MS } from '../_shared/ai.ts';
import { goalKeyFrom, tagsFrom } from '../solo-program/plan.ts';
import {
  targetsFor, nutritionGoalFrom, cleanFood, fitToTargets, fallbackDay, totals, buildNutritionPrompt, applyRestrictions,
  NUTRITION_SCHEMA, SLOT_LABELS, SLOT_OF_MEAL_TIME, type Food, type Targets,
} from './targets.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DEFAULT_DAYS: Record<number, string[]> = {
  2: ['tue', 'thu'], 3: ['mon', 'wed', 'fri'], 4: ['mon', 'tue', 'thu', 'fri'], 5: ['mon', 'tue', 'wed', 'thu', 'fri'], 6: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
};
const MEAL_CATEGORY: Record<Food['meal_time'], string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const caller = await requireCaller(req);
    const admin = caller.admin;

    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, name, premium_until, solo_block, weight_unit, trainer_id')
      .eq('auth_user_id', caller.id)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) return json({ error: 'no_client' }, 404);

    const premiumUntil = client.premium_until ? new Date(client.premium_until) : null;
    if (!premiumUntil || premiumUntil.getTime() <= Date.now()) return json({ error: 'premium_required' }, 402);

    const body = await req.json().catch(() => ({}));
    const preferences = clampText(String(body?.preferences ?? ''), 300);

    const { data: userRes } = await admin.auth.admin.getUserById(caller.id);
    const meta = (userRes?.user?.user_metadata ?? {}) as Record<string, any>;
    const intake = meta.onboarding_intake ?? {};
    const goals: string[] = Array.isArray(intake.goals) ? intake.goals.slice(0, 6).map((g: unknown) => clampText(String(g ?? ''), 40)) : [];

    // Body weight: the request first (the athlete just said it), then
    // onboarding. Kilograms are accepted and stored as pounds.
    let weightLbs: number | null = null;
    const w = Number(body?.weight);
    if (Number.isFinite(w) && w > 0) {
      const unit = String(body?.unit ?? client.weight_unit ?? 'lbs').toLowerCase().startsWith('k') ? 'kg' : 'lbs';
      weightLbs = unit === 'kg' ? w * 2.20462 : w;
    } else if (Number.isFinite(Number(meta.intake_weight_lbs)) && Number(meta.intake_weight_lbs) > 0) {
      weightLbs = Number(meta.intake_weight_lbs);
    }
    if (weightLbs === null || weightLbs < 60 || weightLbs > 600) return json({ error: 'needs_weight' }, 409);

    // Charged only once a build is actually going to run.
    const rl = await guardRate(admin, caller.id, { bucket: 'solo-nutrition', global: 300, limit: 3, windowSeconds: 3600, daily: 6 }, corsHeaders);
    if (rl) return rl;

    if (Number.isFinite(w) && w > 0 && Math.round(weightLbs) !== Number(meta.intake_weight_lbs)) {
      // Best effort: the next build should not have to ask again.
      await admin.auth.admin.updateUserById(caller.id, { user_metadata: { ...meta, intake_weight_lbs: Math.round(weightLbs) } }).catch(() => {});
    }

    const daysFromBlock = Number(client.solo_block?.days);
    const trainingDaysCount = Number.isFinite(daysFromBlock) && daysFromBlock > 0 ? daysFromBlock : Math.max(0, Math.min(7, Number(meta.intake_days) || 3));
    const age = ageFrom(meta.date_of_birth);
    const goalKey = goalKeyFrom(meta.intake_goal_key, meta.intake_goal, goals);
    const goal = nutritionGoalFrom(goalKey, tagsFrom(goals));
    const targets: Targets = targetsFor({ weightLbs, trainingDays: trainingDaysCount, goal, age });

    // Which weekdays are training days: the week the corner wrote first,
    // then the onboarding choice, then a sensible default for the count.
    const trainingDays = await resolveTrainingDays(admin, client.id, meta, trainingDaysCount);

    // Library foods the model may reuse by exact name.
    const { data: libRows } = await admin.from('meals').select('name, calories, protein, carbs, fat').eq('is_custom', false).limit(40);
    const libraryLines = (libRows ?? []).map((m: any) => `- ${m.name} (${m.calories} kcal, ${m.protein} g P, ${m.carbs} g C, ${m.fat} g F)`).join('\n');

    let planName = '';
    let description = '';
    let training: Food[] | null = null;
    let rest: Food[] | null = null;
    let modelUsed: 'gemini' | 'fallback' = 'fallback';
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { ...FAST_JSON, responseSchema: NUTRITION_SCHEMA, maxOutputTokens: 5000 } as any });
        const prompt = buildNutritionPrompt({ targets, goal, preferences, libraryLines, trainingDaysLabel: trainingDays.map(cap).join('/') });
        const t0 = Date.now();
        const result = await withRetry(() => model.generateContent(prompt), { timeoutMs: BUILD_TIMEOUT_MS, label: 'solo-nutrition' });
        const parsed = parseJson(result.response.text());
        console.log('[solo-nutrition] generation ms', Date.now() - t0, 'parsed', !!parsed);
        if (parsed) {
          // Restrictions are enforced here, whatever the model did with them.
          const tr = applyRestrictions((Array.isArray(parsed.training_day) ? parsed.training_day : []).map(cleanFood).filter(Boolean).slice(0, 16) as Food[], preferences);
          const rs = applyRestrictions((Array.isArray(parsed.rest_day) ? parsed.rest_day : []).map(cleanFood).filter(Boolean).slice(0, 16) as Food[], preferences);
          const fitT = fitToTargets(tr, targets.training);
          const fitR = fitToTargets(rs.length >= 6 ? rs : tr, targets.rest);
          console.log('[solo-nutrition] foods', tr.length, rs.length, 'fit', fitT.ok, fitT.offCalories.toFixed(3), fitT.offProtein.toFixed(3), fitR.ok, fitR.offCalories.toFixed(3));
          if (tr.length >= 6 && fitT.ok && fitR.ok) {
            training = fitT.foods; rest = fitR.foods; modelUsed = 'gemini';
            planName = clampStr(parsed.name, 60);
            description = clampStr(parsed.description, 240);
          }
        }
      } catch (err) {
        report(err, { fn: 'solo-nutrition', stage: 'model' });
        console.error('[solo-nutrition] model failed, writing the pantry day:', (err as any)?.message ?? err);
      }
    }
    if (!training || !rest) {
      training = fallbackDay(targets.training, preferences);
      rest = fallbackDay(targets.rest, preferences);
    }
    const goalWord = goal === 'fat_loss' ? 'Simple cut' : goal === 'strength' ? 'Strength fuel' : 'Everyday fuel';
    planName = planName || goalWord;
    description = description || 'Three meals and one snack around training; the same protein foods every day, bigger carb portions on the days you lift.';
    const fullDescription = `${description} ${targets.method}`.slice(0, 600);

    // Replace any previous corner-written plan: the plans, their rows and
    // the foods that only they referenced.
    const { data: prevDiets } = await admin.from('client_diets').select('diet_plan_id, diet_plans!inner(trainer_id)').eq('client_id', client.id).is('diet_plans.trainer_id', null);
    const prevPlanIds = (prevDiets ?? []).map((d: any) => d.diet_plan_id).filter(Boolean);
    if (prevPlanIds.length > 0) {
      const [{ data: prevRows }, { data: prevPlans }] = await Promise.all([
        admin.from('diet_plan_meals').select('meal_id').in('diet_plan_id', prevPlanIds),
        admin.from('diet_plans').select('week_structure').in('id', prevPlanIds),
      ]);
      // Training-day foods hang off diet_plan_meals; rest-day foods are only
      // referenced inside week_structure.restVariant, so both lists are read.
      const restIds = (prevPlans ?? []).flatMap((p: any) => (p?.week_structure?.restVariant?.mealList ?? []).map((m: any) => m?.meal_id));
      const prevMealIds = Array.from(new Set([...(prevRows ?? []).map((r: any) => r.meal_id), ...restIds].filter(Boolean)));
      await admin.from('diet_plans').delete().in('id', prevPlanIds);
      if (prevMealIds.length > 0) await admin.from('meals').delete().in('id', prevMealIds).is('trainer_id', null).eq('is_custom', true);
    }

    // Foods for both days become meals rows (custom, coachless: readable only
    // through the plan that references them, never in a coach's library).
    const insertFoods = async (foods: Food[]) => {
      const { data, error } = await admin.from('meals').insert(foods.map((f) => ({
        name: f.name, category: MEAL_CATEGORY[f.meal_time], calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat,
        trainer_id: null, is_custom: true, serving_size_g: 100,
      }))).select('id, name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    };
    const trainingRows = await insertFoods(training);
    const restRows = await insertFoods(rest);

    const restVariant = {
      mealList: rest.map((f, i) => ({
        meal_id: restRows[i]?.id, name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat,
        meal_time: f.meal_time, servings: f.servings, slotLabel: SLOT_LABELS[SLOT_OF_MEAL_TIME[f.meal_time]], slot_index: SLOT_OF_MEAL_TIME[f.meal_time],
      })),
    };
    const { data: planRow, error: planErr } = await admin.from('diet_plans').insert({
      trainer_id: null,
      name: planName,
      description: fullDescription,
      category: goal === 'fat_loss' ? 'weight-loss' : goal === 'strength' ? 'high-protein' : 'balanced',
      target_calories: targets.training.calories,
      target_protein: targets.training.protein,
      target_carbs: targets.training.carbs,
      target_fat: targets.training.fat,
      week_structure: { mealsPerDay: SLOT_LABELS.length, slotLabels: [...SLOT_LABELS], trainingDays, restVariant, freeMeal: null },
      swaps: null,
    }).select('id').single();
    if (planErr || !planRow) throw planErr ?? new Error('diet plan insert failed');

    const perSlot = new Map<number, number>();
    const dpm = training.map((f, i) => {
      const slot = SLOT_OF_MEAL_TIME[f.meal_time];
      const order = perSlot.get(slot) ?? 0;
      perSlot.set(slot, order + 1);
      return { diet_plan_id: planRow.id, meal_id: trainingRows[i].id, meal_time: f.meal_time, servings: f.servings, slot_index: slot, order_index: order };
    });
    const { error: dpmErr } = await admin.from('diet_plan_meals').insert(dpm);
    if (dpmErr) throw dpmErr;
    const today = new Date().toISOString().slice(0, 10);
    const { error: cdErr } = await admin.from('client_diets').insert({ client_id: client.id, diet_plan_id: planRow.id, assigned_date: today, status: 'assigned' });
    if (cdErr) throw cdErr;

    const nutrition = {
      built_at: new Date().toISOString(),
      calories: targets.training.calories, protein: targets.training.protein, carbs: targets.training.carbs, fat: targets.training.fat,
      rest_calories: targets.rest.calories, method: targets.method,
    };
    await admin.from('clients').update({ solo_block: { ...(client.solo_block ?? {}), nutrition } }).eq('id', client.id);

    const tt = totals(training);
    console.log('[solo-nutrition] wrote plan', planRow.id, 'model', modelUsed, 'foods', training.length, rest.length, 'day', Math.round(tt.calories), 'kcal', Math.round(tt.protein), 'g P; target', targets.training.calories, targets.training.protein);
    return json({
      ok: true,
      plan_id: planRow.id,
      name: planName,
      model: modelUsed,
      targets: { training: targets.training, rest: targets.rest, method: targets.method },
      prompt_version: PROMPT_VERSION,
    });
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    report(err, { fn: 'solo-nutrition' });
    console.error('[solo-nutrition]', err);
    if (err instanceof AiTimeout) return json({ error: 'ai_timeout' }, 504);
    return json({ error: 'Something went wrong' }, 500);
  }
});

const cap = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);

function ageFrom(dob: unknown): number | null {
  const d = new Date(String(dob ?? ''));
  if (!Number.isFinite(d.getTime())) return null;
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return years >= 13 && years <= 100 ? Math.floor(years) : null;
}

async function resolveTrainingDays(admin: any, clientId: string, meta: Record<string, any>, count: number): Promise<string[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: upcoming } = await admin.from('client_workouts').select('assigned_date').eq('client_id', clientId).is('trainer_id', null).gte('assigned_date', today).order('assigned_date').limit(7);
  const fromWeek = Array.from(new Set((upcoming ?? []).map((r: any) => WEEKDAY_KEYS[new Date(`${r.assigned_date}T12:00:00Z`).getUTCDay()])));
  if (fromWeek.length > 0) return WEEKDAY_KEYS.filter((k) => fromWeek.includes(k));
  const raw = meta.intake_training_days ?? meta.onboarding_intake?.training_days;
  if (Array.isArray(raw)) {
    const picked = new Set(raw.slice(0, 14).map((v: unknown) => String(v ?? '').trim().toLowerCase().slice(0, 3)));
    const days = WEEKDAY_KEYS.filter((k) => picked.has(k));
    if (days.length > 0) return days;
  }
  return DEFAULT_DAYS[Math.max(2, Math.min(6, count))] ?? DEFAULT_DAYS[3];
}
