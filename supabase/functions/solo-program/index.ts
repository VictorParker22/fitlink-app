// ============================================================
// solo-program — the corner writes the athlete's first week.
//
// A Solo athlete answered goals, where they train and how many days in
// onboarding. This turns those answers into real workouts (workouts +
// workout_exercises, trainer_id NULL) and assigns them (client_workouts)
// across the next seven days, so Train and Today are populated the moment
// the trial starts. Same paid boundary as solo-corner: premium_until.
//
// Idempotent: refuses when a program was built in the last 6 days unless
// { rebuild: true }. Exercises are chosen ONLY from the shared library
// (exercises.trainer_id IS NULL) so every pick has instructions and media.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts';
import { guardRate, clampText } from '../_shared/rateLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

const LOCATION_EQUIPMENT: Record<string, string> = {
  gym: 'full commercial gym: barbells, dumbbells, cables, machines, racks',
  home: 'home: bodyweight, a pair of dumbbells, a band; no barbell or machines',
  outdoors: 'outdoors: bodyweight, running, a bench or bar if available',
  coach_location: 'a coach\'s studio: barbells, dumbbells, kettlebells, cables',
  flexible: 'varies: prefer dumbbell and bodyweight movements that work anywhere',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const caller = await requireCaller(req);
    const admin = caller.admin;

    const { data: client } = await admin
      .from('clients')
      .select('id, name, premium_until, solo_program_built_at, trainer_id')
      .eq('auth_user_id', caller.id)
      .maybeSingle();
    if (!client) return json({ error: 'no_client' }, 404);

    const premiumUntil = client.premium_until ? new Date(client.premium_until) : null;
    if (!premiumUntil || premiumUntil.getTime() <= Date.now()) return json({ error: 'premium_required' }, 402);

    const body = await req.json().catch(() => ({}));
    const rebuild = body?.rebuild === true;
    if (!rebuild && client.solo_program_built_at) {
      const age = Date.now() - new Date(client.solo_program_built_at).getTime();
      if (age < 6 * 24 * 3600 * 1000) return json({ ok: true, skipped: 'recent' });
    }

    const rl = await guardRate(admin, caller.id, { bucket: 'solo-program', limit: 4, windowSeconds: 86400 }, corsHeaders);
    if (rl) return rl;

    // Intake from auth metadata (written by the onboarding draft).
    const { data: userRes } = await admin.auth.admin.getUserById(caller.id);
    const meta = (userRes?.user?.user_metadata ?? {}) as Record<string, any>;
    const intake = meta.onboarding_intake ?? {};
    const goals: string[] = Array.isArray(intake.goals) ? intake.goals.slice(0, 6) : [];
    const location: string = String(intake.location ?? body?.location ?? 'gym');
    const daysRaw = Number(body?.days ?? meta.intake_days ?? 3);
    const days = Math.min(6, Math.max(2, Number.isFinite(daysRaw) ? Math.round(daysRaw) : 3));
    const experience = clampText(String(body?.experience ?? meta.intake_experience ?? 'not stated'), 80);
    const limitation = clampText(String(body?.limitation ?? meta.intake_limitation ?? ''), 200);

    // Library exercises only.
    const { data: exercises } = await admin
      .from('exercises')
      .select('id, name, category, muscle_group, equipment, difficulty')
      .is('trainer_id', null)
      .limit(220);
    if (!exercises || exercises.length < 10) return json({ error: 'library_unavailable' }, 500);

    const byName = new Map<string, any>();
    for (const e of exercises) byName.set(String(e.name).toLowerCase(), e);
    const list = exercises.map((e: any) => `${e.name} | ${e.category ?? ''} | ${e.muscle_group ?? ''} | ${e.equipment ?? ''}`).join('\n');

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });

    const prompt = `You are a strength and conditioning coach writing ONE WEEK of training for an athlete who trains without a human coach.
Athlete: goals = ${goals.join(', ') || 'general fitness'}; experience = ${experience}; trains ${days} days a week; setting = ${LOCATION_EQUIPMENT[location] ?? LOCATION_EQUIPMENT.gym}${limitation ? `; must work around: ${limitation}` : ''}.

Write exactly ${days} workouts. Return ONLY JSON:
{"workouts":[{"name":string,"description":string,"estimated_duration":number,"exercises":[{"exercise_name":string,"sets":number,"reps":string,"rest_seconds":number}]}]}
Rules:
- exercise_name MUST exactly match a name from the list below.
- 4 to 7 exercises per workout, compound movements first, then accessories. Balance push, pull, legs and core across the week.
- reps as a string like "8" or "8-10" or "30s".
- estimated_duration in minutes, 35-60.
- Beginners: fewer sets, simpler movements. Respect the setting: never pick equipment the athlete does not have.
- Names: short and specific ("Lower body A", "Upper body pull"). description: one sentence on the intent.

Available exercises (name | category | muscle | equipment):
${list}`;

    const result = await model.generateContent(prompt);
    let parsed: any;
    try { parsed = JSON.parse(result.response.text()); } catch { return json({ error: 'bad_generation' }, 502); }
    const workouts: any[] = Array.isArray(parsed?.workouts) ? parsed.workouts.slice(0, days) : [];
    if (workouts.length === 0) return json({ error: 'bad_generation' }, 502);

    // Rebuild: clear this athlete's future solo assignments first.
    if (rebuild) {
      const today = new Date().toISOString().slice(0, 10);
      await admin.from('client_workouts').delete().eq('client_id', client.id).is('trainer_id', null).gte('assigned_date', today);
    }

    // Spread across the next 7 days, starting tomorrow.
    const slots = spreadDays(days);
    const created: { id: string; name: string; date: string }[] = [];
    for (let i = 0; i < workouts.length; i++) {
      const w = workouts[i];
      const name = clampText(String(w.name ?? `Session ${i + 1}`), 60);
      const { data: wRow, error: wErr } = await admin
        .from('workouts')
        .insert({
          trainer_id: null,
          name,
          description: clampText(String(w.description ?? ''), 240),
          category: 'solo',
          estimated_duration: Math.min(90, Math.max(20, Number(w.estimated_duration) || 45)),
        })
        .select('id')
        .single();
      if (wErr || !wRow) { console.error('[solo-program] workout insert', wErr?.message); continue; }

      const rows: any[] = [];
      let order = 0;
      for (const ex of (Array.isArray(w.exercises) ? w.exercises : []).slice(0, 8)) {
        const lib = byName.get(String(ex.exercise_name ?? '').toLowerCase());
        if (!lib) continue;
        rows.push({
          workout_id: wRow.id,
          exercise_id: lib.id,
          order_index: order++,
          sets: Math.min(6, Math.max(1, Number(ex.sets) || 3)),
          reps: clampText(String(ex.reps ?? '8-10'), 12),
          rest_seconds: Math.min(240, Math.max(20, Number(ex.rest_seconds) || 75)),
        });
      }
      if (rows.length === 0) { await admin.from('workouts').delete().eq('id', wRow.id); continue; }
      const { error: exErr } = await admin.from('workout_exercises').insert(rows);
      if (exErr) { console.error('[solo-program] exercises insert', exErr.message); await admin.from('workouts').delete().eq('id', wRow.id); continue; }

      const date = slots[i] ?? slots[slots.length - 1];
      const { error: cwErr } = await admin.from('client_workouts').insert({
        client_id: client.id,
        workout_id: wRow.id,
        trainer_id: null,
        assigned_date: date,
        status: 'assigned',
      });
      if (cwErr) console.error('[solo-program] assign', cwErr.message);
      created.push({ id: wRow.id, name, date });
    }

    if (created.length === 0) return json({ error: 'bad_generation' }, 502);
    await admin.from('clients').update({ solo_program_built_at: new Date().toISOString() }).eq('id', client.id);
    return json({ ok: true, created });
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error('[solo-program]', err);
    return json({ error: 'Something went wrong' }, 500);
  }
});

/** ISO dates for `days` sessions spread over the next 7 days, from tomorrow. */
function spreadDays(days: number): string[] {
  const out: string[] = [];
  const step = 7 / days;
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + 1 + Math.round(i * step));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
