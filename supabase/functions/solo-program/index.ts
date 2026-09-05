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
// { rebuild: true } or { adapt: true }. Exercises are chosen ONLY from the
// global library rows (is_custom = false) that carry a demo image and
// instructions, filtered to the athlete's equipment and sampled so every
// muscle group is represented (see sample.ts) — so every pick has a demo
// the athlete can watch and copy the corner can read aloud.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts';
import { guardRate, clampText } from '../_shared/rateLimit.ts';
import { withRetry, AiTimeout, PROMPT_VERSION, clampInt, clampStr, pickEnum, parseJson, report } from '../_shared/ai.ts';
import { equipmentFor, normalizeName, dedupePreferMedia, sampleBalanced, formatForPrompt, type LibraryRow } from './sample.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

// workouts.category is CHECK-constrained to these five.
const ALLOWED_CATEGORIES = ['strength', 'cardio', 'flexibility', 'hiit', 'circuit'] as const;

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

    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, name, premium_until, solo_program_built_at, solo_program_request_id, trainer_id')
      .eq('auth_user_id', caller.id)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) return json({ error: 'no_client' }, 404);

    const premiumUntil = client.premium_until ? new Date(client.premium_until) : null;
    if (!premiumUntil || premiumUntil.getTime() <= Date.now()) return json({ error: 'premium_required' }, 402);

    const body = await req.json().catch(() => ({}));
    const rebuild = body?.rebuild === true;
    const adapt = body?.adapt === true;
    // Idempotency: the same request_id never builds twice (a retry or a
    // double tap returns the earlier outcome instead of a second week).
    const requestId = clampStr(body?.request_id, 80) || null;
    if (requestId && client.solo_program_request_id === requestId) {
      return json({ ok: true, created: [], skipped: 'duplicate' });
    }

    // Rate check moved ABOVE the "built recently -> skip" branch: a
    // rebuild:true (or adapt:true) caller must always be counted against
    // the daily cap, not just the callers who get past the recency guard.
    const rl = await guardRate(admin, caller.id, { bucket: 'solo-program', limit: 4, windowSeconds: 86400 }, corsHeaders);
    if (rl) return rl;

    if (!rebuild && !adapt && client.solo_program_built_at) {
      const age = Date.now() - new Date(client.solo_program_built_at).getTime();
      if (age < 6 * 24 * 3600 * 1000) return json({ ok: true, skipped: 'recent' });
    }

    // Intake from auth metadata (written by the onboarding draft).
    const { data: userRes } = await admin.auth.admin.getUserById(caller.id);
    const meta = (userRes?.user?.user_metadata ?? {}) as Record<string, any>;
    const intake = meta.onboarding_intake ?? {};
    const goals: string[] = Array.isArray(intake.goals) ? intake.goals.slice(0, 6) : [];
    const location: string = String(intake.location ?? body?.location ?? 'gym');
    const daysRaw = Number(body?.days ?? meta.intake_days ?? 3);
    const days = clampInt(daysRaw, 2, 6, 3);
    const experience = clampText(String(body?.experience ?? meta.intake_experience ?? 'not stated'), 80);
    const limitation = clampText(String(body?.limitation ?? meta.intake_limitation ?? ''), 200);

    // Global library rows with a demo and instructions, in the athlete's
    // equipment. PostgREST caps a page at 1,000 rows, so page defensively.
    const equipment = equipmentFor(location);
    const all: LibraryRow[] = [];
    for (let from = 0; from < 5000; from += 1000) {
      const { data: page, error: pageErr } = await admin
        .from('exercises')
        .select('id, name, category, muscle_group, secondary_muscles, equipment, difficulty, image_url')
        .eq('is_custom', false)
        .not('image_url', 'is', null)
        .neq('instructions', '')
        .in('equipment', equipment)
        .order('name')
        .range(from, from + 999);
      if (pageErr) throw pageErr;
      if (!page || page.length === 0) break;
      for (const r of page) all.push({ ...r, instructions_len: 1 });
      if (page.length < 1000) break;
    }
    if (all.length < 10) return json({ error: 'library_unavailable' }, 500);

    const today = new Date().toISOString().slice(0, 10);
    const pool = sampleBalanced(dedupePreferMedia(all), { target: 230, seed: `${client.id}:${today}` });
    console.log('[solo-program] library', all.length, 'pool', pool.length, 'equipment', equipment.join(','));

    const byName = new Map<string, LibraryRow>();
    for (const e of pool) byName.set(normalizeName(e.name), e);
    const list = pool.map(formatForPrompt).join('\n');

    // Last 14 days of completed (and skipped) work, when it exists, so the
    // corner can progress what worked and repeat what got missed instead of
    // writing next week blind.
    const historyBlock = await buildRecentHistoryBlock(admin, client.id);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } });

    const prompt = `You are a strength and conditioning coach writing ONE WEEK of training for an athlete who trains without a human coach.
Athlete: goals = ${goals.join(', ') || 'general fitness'}; experience = ${experience}; trains ${days} days a week; setting = ${LOCATION_EQUIPMENT[location] ?? LOCATION_EQUIPMENT.gym}${limitation ? `; must work around: ${limitation}` : ''}.
${historyBlock ? `\nAthlete's last 14 days:\n${historyBlock}\n` : ''}
${adapt
  ? 'This is an ADAPTIVE rewrite: use the last 14 days above. Progress (more weight/reps/sets, or a harder variation) whatever was logged as completed. Repeat, essentially unchanged, whatever was assigned but never logged (skipped) so the athlete gets another chance at it.'
  : ''}

Write exactly ${days} workouts. Return ONLY JSON:
{"workouts":[{"name":string,"description":string,"category":"strength"|"cardio"|"flexibility"|"hiit"|"circuit","estimated_duration":number,"exercises":[{"exercise_name":string,"sets":number,"reps":string,"rest_seconds":number}]}]${adapt ? ',"changes":string' : ''}}${adapt ? `
- "changes": ONE spoken sentence, under 35 words, in the corner's voice, saying what changed from last week and why (name the sessions or lifts; no numbers that are not in the last 14 days above).` : ''}
Rules:
- exercise_name MUST exactly match a name from the list below.
- When a goal names a muscle (for example "hamstrings and glutes"), prefer exercises whose primary OR secondary muscle matches it.
- 4 to 7 exercises per workout, compound movements first, then accessories. Balance push, pull, legs and core across the week.
- reps as a string like "8" or "8-10" or "30s".
- estimated_duration in minutes, 35-60.
- Beginners: fewer sets, simpler movements. Respect the setting: never pick equipment the athlete does not have.
- Names: short and specific ("Lower body A", "Upper body pull"). description: one sentence on the intent.

Available exercises (name | category | primary muscle | secondary muscles | equipment):
${list}`;

    const result = await withRetry(() => model.generateContent(prompt), { timeoutMs: 20000, label: 'solo-program' });
    const parsed = parseJson(result.response.text());
    if (!parsed) return json({ error: 'bad_generation' }, 502);
    const workouts: any[] = Array.isArray(parsed?.workouts) ? parsed.workouts.slice(0, days) : [];
    if (workouts.length === 0) return json({ error: 'bad_generation' }, 502);

    // Rebuild/adapt: clear this athlete's future solo assignments first.
    if (rebuild || adapt) {
      const today = new Date().toISOString().slice(0, 10);
      // Future, not-yet-done assignments only: a session the athlete already
      // completed today (adapt runs automatically on open) must survive.
      await admin.from('client_workouts').delete().eq('client_id', client.id).is('trainer_id', null).gt('assigned_date', today);
      await admin.from('client_workouts').delete().eq('client_id', client.id).is('trainer_id', null).eq('assigned_date', today).neq('status', 'completed');
    }

    // Spread across the next 7 days, starting tomorrow.
    const slots = spreadDays(days);
    const created: { id: string; name: string; date: string }[] = [];
    let unmatched = 0;
    for (let i = 0; i < workouts.length; i++) {
      const w = workouts[i];
      const name = clampStr(w?.name, 60, `Session ${i + 1}`);
      const { data: wRow, error: wErr } = await admin
        .from('workouts')
        .insert({
          trainer_id: null,
          name,
          description: clampStr(w?.description, 240, ''),
          category: pickEnum(w?.category, ALLOWED_CATEGORIES, 'strength'),
          estimated_duration: clampInt(w?.estimated_duration, 20, 90, 45),
        })
        .select('id')
        .single();
      if (wErr || !wRow) { console.error('[solo-program] workout insert', wErr?.message); continue; }

      const rows: any[] = [];
      let order = 0;
      for (const ex of (Array.isArray(w?.exercises) ? w.exercises : []).slice(0, 8)) {
        const lib = byName.get(normalizeName(ex?.exercise_name));
        if (!lib) { unmatched++; continue; }
        rows.push({
          workout_id: wRow.id,
          exercise_id: lib.id,
          order_index: order++,
          sets: clampInt(ex?.sets, 1, 6, 3),
          reps: clampStr(typeof ex?.reps === 'number' ? String(ex.reps) : ex?.reps, 12, '8-10'),
          rest_seconds: clampInt(ex?.rest_seconds, 20, 240, 75),
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
    console.log('[solo-program] wrote', created.length, 'workouts; unmatched exercise names:', unmatched);
    await admin.from('clients').update({
      solo_program_built_at: new Date().toISOString(),
      ...(requestId ? { solo_program_request_id: requestId } : {}),
    }).eq('id', client.id);
    // The adaptation note is spoken by the corner; keep it one clean sentence.
    const changes = adapt ? clampStr(parsed?.changes, 320) : '';
    return json({ ok: true, created, prompt_version: PROMPT_VERSION, ...(changes ? { changes } : {}) });
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    report(err, { fn: 'solo-program' });
    console.error('[solo-program]', err);
    if (err instanceof AiTimeout) return json({ error: 'ai_timeout' }, 504);
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

/**
 * "logged: <workout name> on <date>" / "skipped: <workout name> on <date>"
 * lines for the last 14 days, or '' when there is nothing to show.
 *
 * client_workout_logs carries `workout_id`, `client_workout_id`,
 * `created_at` and `exercises` (jsonb) — workout_id is a direct FK to
 * workouts, so names are resolved straight from it rather than through
 * client_workout_id -> client_workouts -> workout_id (same target, one
 * fewer hop). client_workouts.status distinguishes completed assignments
 * from ones that were assigned and never logged (skipped).
 */
async function buildRecentHistoryBlock(admin: any, clientId: string): Promise<string> {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  const [{ data: logs }, { data: assigned }] = await Promise.all([
    admin
      .from('client_workout_logs')
      .select('workout_id, client_workout_id, created_at')
      .eq('client_id', clientId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('client_workouts')
      .select('id, workout_id, assigned_date, status')
      .eq('client_id', clientId)
      .is('trainer_id', null)
      .gte('assigned_date', since.slice(0, 10))
      .lte('assigned_date', new Date().toISOString().slice(0, 10))
      .limit(60),
  ]);

  const workoutIds = new Set<string>();
  for (const l of logs ?? []) if (l.workout_id) workoutIds.add(l.workout_id);
  for (const a of assigned ?? []) if (a.workout_id) workoutIds.add(a.workout_id);
  if (workoutIds.size === 0) return '';

  const { data: names } = await admin.from('workouts').select('id, name').in('id', Array.from(workoutIds));
  const nameById = new Map<string, string>((names ?? []).map((n: any) => [n.id, n.name]));

  const loggedByClientWorkoutId = new Set((logs ?? []).map((l: any) => l.client_workout_id).filter(Boolean));

  const lines: string[] = [];
  for (const l of logs ?? []) {
    const nm = nameById.get(l.workout_id) ?? 'workout';
    lines.push(`logged: ${nm} on ${String(l.created_at).slice(0, 10)}`);
  }
  for (const a of assigned ?? []) {
    const wasLogged = loggedByClientWorkoutId.has(a.id) || a.status === 'completed';
    if (wasLogged) continue;
    const nm = nameById.get(a.workout_id) ?? 'workout';
    lines.push(`skipped: ${nm} on ${a.assigned_date}`);
  }

  return lines.slice(0, 40).join('\n');
}
