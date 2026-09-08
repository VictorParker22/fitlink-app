// ============================================================
// solo-program — the corner writes the athlete's week, inside a 4-week block.
//
// A Solo athlete answered goals, where they train and how many days in
// onboarding. This turns those answers into real workouts (workouts +
// workout_exercises, trainer_id NULL) and assigns them (client_workouts)
// across the next seven days. Same paid boundary as solo-corner:
// premium_until.
//
// How the week is written (2026-09-08, "make it smarter"):
//   1. plan.ts decides the STRUCTURE: the split for the day count, one main
//      lift per session by movement pattern, sets × reps × effort for the
//      goal and for this week of the block (base / build / peak / deload),
//      finishers and mobility where the goal or interests call for them.
//   2. Every slot gets a short list of pattern-matched options from the
//      library rows that carry a demo and instructions, in the athlete's
//      equipment (sample.ts), ranked for the goal and experience.
//   3. The model picks ONE option per slot, names the session, writes a cue
//      per lift and, on a weekly rewrite, one sentence on what changed.
//   4. assemble() validates every pick against its options and fills any gap
//      deterministically. The week is written whether or not the model
//      answered; `model` in the response says which.
//   5. Notes carry the effort (RPE / reps in reserve), a warm-up line on the
//      main lift, the cue, and a load hint from the athlete's own logs.
//
// The block lives in clients.solo_block (written only here and by
// solo-nutrition; the athlete's own row may not change it). A weekly
// rewrite (adapt) moves to the next week; week 4 rolls into a fresh block.
//
// Idempotent: refuses when a program was built in the last 6 days unless
// { rebuild: true } or { adapt: true }.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts';
import { guardRate, clampText } from '../_shared/rateLimit.ts';
import { withRetry, AiTimeout, PROMPT_VERSION, clampInt, clampStr, parseJson, report, FAST_JSON, BUILD_TIMEOUT_MS } from '../_shared/ai.ts';
import { equipmentFor, dedupePreferMedia, type LibraryRow } from './sample.ts';
import {
  blueprint, candidatesFor, assemble, auditWeek, buildProgramPrompt, PROGRAM_SCHEMA,
  goalKeyFrom, tagsFrom, experienceFrom, nextBlock, describeBlock,
  bestSetsById, loadHint, noteFor, repsFor, normalizeName,
  type SoloBlock, type ModelOutput, type GoalKey,
} from './plan.ts';

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

const GOAL_LABEL: Record<GoalKey, string> = {
  strength: 'Get stronger on the big lifts',
  fat_loss: 'Lose fat and keep muscle',
  return: 'Get back into it after a break',
  pain: 'Train around pain',
  general: 'General fitness',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const caller = await requireCaller(req);
    const admin = caller.admin;

    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, name, premium_until, solo_program_built_at, solo_program_request_id, trainer_id, solo_block, weight_unit')
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

    if (!rebuild && !adapt && client.solo_program_built_at) {
      const age = Date.now() - new Date(client.solo_program_built_at).getTime();
      if (age < 6 * 24 * 3600 * 1000) return json({ ok: true, skipped: 'recent' });
    }

    // Counted only when a generation is about to run (a duplicate or a
    // fresh-enough week above costs nothing). 4 an hour absorbs a retry
    // after a failure.
    const rl = await guardRate(admin, caller.id, { bucket: 'solo-program', global: 500, limit: 4, windowSeconds: 3600, daily: 10 }, corsHeaders);
    if (rl) return rl;

    // Intake from auth metadata (written by the onboarding draft).
    const { data: userRes } = await admin.auth.admin.getUserById(caller.id);
    const meta = (userRes?.user?.user_metadata ?? {}) as Record<string, any>;
    const intake = meta.onboarding_intake ?? {};
    const goals: string[] = Array.isArray(intake.goals) ? intake.goals.slice(0, 6).map((g: unknown) => clampText(String(g ?? ''), 40)) : [];
    const location: string = String(intake.location ?? body?.location ?? 'gym');
    const trainingDays = parseTrainingDays(meta.intake_training_days ?? intake.training_days);
    const daysRaw = Number(body?.days ?? meta.intake_days ?? (trainingDays.length || 3));
    const days = clampInt(daysRaw, 2, 6, 3);
    const experienceRaw = clampText(String(body?.experience ?? meta.intake_experience ?? 'not stated'), 80);
    const limitation = clampText(String(body?.limitation ?? meta.intake_limitation ?? ''), 200);
    const goal = goalKeyFrom(meta.intake_goal_key, meta.intake_goal, goals);
    const tags = tagsFrom(goals);
    const experience = experienceFrom(experienceRaw);
    const unit = client.weight_unit === 'kg' ? 'kg' : 'lbs';

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
    const library = dedupePreferMedia(all);

    // Where this build sits in the block.
    const today = new Date().toISOString().slice(0, 10);
    const prevBlock = (client.solo_block ?? null) as SoloBlock | null;
    const mode: 'first' | 'rebuild' | 'adapt' = !client.solo_program_built_at ? 'first' : adapt ? 'adapt' : 'rebuild';
    const nb = nextBlock(prevBlock, goal, days, today, mode);
    const anchors = nb.fresh ? [] : (prevBlock?.anchors ?? []);
    const plan = blueprint({ days, goal, tags, experience, week: nb.week, limitation });

    // Options per slot. Sessions are built in order so the default pick of
    // an earlier session's main lift is pushed down in a later one: the
    // week varies even when the model says nothing.
    const seed = `${client.id}:${nb.started}:${nb.week}`;
    const used = new Set<string>();
    const candidates = new Map<string, LibraryRow[][]>();
    for (const s of plan.sessions) {
      const lists = s.slots.map((slot) => candidatesFor(library, slot, { goal, experience, anchors, used, seed, limit: 8 }));
      candidates.set(s.key, lists);
      // Every slot's default pick is pushed down for later sessions. Main
      // lifts still repeat when the model wants them to (the options stay
      // legal; only their order moves), which is how a squat trains twice a
      // week while the core and accessory work varies.
      lists.forEach((l) => { if (l[0]) used.add(normalizeName(l[0].name)); });
    }
    console.log('[solo-program] library', all.length, 'deduped', library.length, 'equipment', equipment.join(','), 'block', nb.week, plan.split, goal, experience);

    // Last 14 days of completed (and skipped) work, and the best logged set
    // per exercise for the load hints.
    const [historyBlock, logs] = await Promise.all([
      buildRecentHistoryBlock(admin, client.id),
      admin.from('client_workout_logs').select('exercises').eq('client_id', client.id).gte('created_at', new Date(Date.now() - 42 * 24 * 3600 * 1000).toISOString()).order('created_at', { ascending: false }).limit(60),
    ]);
    const best = bestSetsById((logs.data ?? []) as any[]);

    // The model's part. A failure here is logged and the week is still
    // written from the options alone.
    let output: ModelOutput | null = null;
    let modelUsed: 'gemini' | 'fallback' = 'fallback';
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (apiKey) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { ...FAST_JSON, responseSchema: PROGRAM_SCHEMA, maxOutputTokens: 4000 } as any });
        const prompt = buildProgramPrompt(plan, candidates, {
          name: clampText(String(client.name ?? ''), 40) || null,
          goalLabel: clampText(String(meta.intake_goal ?? ''), 80) || GOAL_LABEL[goal],
          goals,
          experienceLabel: experienceRaw,
          setting: LOCATION_EQUIPMENT[location] ?? LOCATION_EQUIPMENT.gym,
          limitation,
          historyBlock,
          adapt,
        });
        const t0 = Date.now();
        const result = await withRetry(() => model.generateContent(prompt), { timeoutMs: BUILD_TIMEOUT_MS, label: 'solo-program' });
        const parsed = parseJson(result.response.text());
        console.log('[solo-program] generation ms', Date.now() - t0, 'prompt chars', prompt.length, 'parsed', !!parsed);
        if (parsed && Array.isArray(parsed.sessions)) { output = parsed as ModelOutput; modelUsed = 'gemini'; }
      } catch (err) {
        report(err, { fn: 'solo-program', stage: 'model' });
        console.error('[solo-program] model failed, writing the week from the plan alone:', (err as any)?.message ?? err);
      }
    }

    const week = assemble(plan, candidates, output);
    const audit = auditWeek(week);
    const fallbacks = week.reduce((a, s) => a + s.exercises.filter((e) => e.fallback).length, 0);
    console.log('[solo-program] assembled', week.length, 'sessions, model', modelUsed, 'fallback picks', fallbacks, 'audit', audit.ok ? 'ok' : audit.problems.join('; '));

    // Rebuild/adapt: clear this athlete's future solo assignments first.
    if (rebuild || adapt) {
      // Future, not-yet-done assignments only: a session the athlete already
      // completed today (adapt runs automatically on open) must survive.
      await admin.from('client_workouts').delete().eq('client_id', client.id).is('trainer_id', null).gt('assigned_date', today);
      await admin.from('client_workouts').delete().eq('client_id', client.id).is('trainer_id', null).eq('assigned_date', today).neq('status', 'completed');
    }

    // On the athlete's chosen weekdays from the next occurrence, or spread
    // across the next 7 days from tomorrow when none were chosen.
    const slots = spreadDays(days, trainingDays);
    const created: { id: string; name: string; date: string }[] = [];
    const anchorsOut: string[] = [];
    for (let i = 0; i < week.length; i++) {
      const w = week[i];
      const { data: wRow, error: wErr } = await admin
        .from('workouts')
        .insert({
          trainer_id: null,
          name: w.name,
          description: w.description,
          category: w.category,
          estimated_duration: clampInt(w.estimated_duration, 20, 90, 45),
        })
        .select('id')
        .single();
      if (wErr || !wRow) { console.error('[solo-program] workout insert', wErr?.message); continue; }

      const rows = w.exercises.map((ex, order) => {
        if (ex.slot.role === 'main' || ex.slot.role === 'secondary') anchorsOut.push(normalizeName(ex.row.name));
        return {
          workout_id: wRow.id,
          exercise_id: ex.row.id,
          order_index: order,
          sets: clampInt(ex.slot.sets, 1, 6, 3),
          reps: clampStr(repsFor(ex), 12, '8-10'),
          rest_seconds: clampInt(ex.slot.rest, 0, 240, 75),
          notes: noteFor(ex, plan.phase, loadHint(best.get(ex.row.id), ex.slot, plan.phase, unit)),
        };
      });
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
      created.push({ id: wRow.id, name: w.name, date });
    }

    if (created.length === 0) return json({ error: 'bad_generation' }, 502);

    const block: SoloBlock = {
      started: nb.started,
      week: nb.week,
      split: plan.split,
      goal,
      days,
      anchors: Array.from(new Set(anchorsOut)).slice(0, 16),
      rationale: plan.rationale,
      ...(prevBlock?.nutrition ? { nutrition: prevBlock.nutrition } : {}),
    };
    console.log('[solo-program] wrote', created.length, 'workouts; block week', block.week, 'anchors', block.anchors.length);
    await admin.from('clients').update({
      solo_program_built_at: new Date().toISOString(),
      solo_block: block,
      ...(requestId ? { solo_program_request_id: requestId } : {}),
    }).eq('id', client.id);

    // The adaptation note is spoken by the corner; keep it one clean
    // sentence. Without the model, say what the block did.
    const phaseSentence: Record<string, string> = {
      base: 'A fresh block starts this week: same split, moderate effort, and the loads you set now are what next week builds on.',
      build: 'Same lifts as last week, one step heavier or one more rep where you completed everything.',
      peak: 'This is the heaviest week of the block: fewer reps, top loads, longer rests.',
      deload: 'Deload week: same lifts at two-thirds effort so the next block starts fresh.',
    };
    const changes = adapt ? (clampStr(output?.changes, 320) || phaseSentence[plan.phase]) : '';
    return json({
      ok: true,
      created,
      prompt_version: PROMPT_VERSION,
      model: modelUsed,
      block: describeBlock(block),
      ...(changes ? { changes } : {}),
    });
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    report(err, { fn: 'solo-program' });
    console.error('[solo-program]', err);
    if (err instanceof AiTimeout) return json({ error: 'ai_timeout' }, 504);
    return json({ error: 'Something went wrong' }, 500);
  }
});

// Weekday keys as onboarding stores them (intake_training_days), Sunday first
// to line up with Date#getUTCDay().
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/**
 * Metadata is athlete-written data: accept only known keys, once each, in
 * week order, and never more than seven. Anything else is [] (no preference).
 */
function parseTrainingDays(raw: unknown): WeekdayKey[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<WeekdayKey>();
  for (const v of raw.slice(0, 14)) {
    const key = String(v ?? '').trim().toLowerCase().slice(0, 3) as WeekdayKey;
    if ((WEEKDAY_KEYS as readonly string[]).includes(key)) seen.add(key);
  }
  return WEEKDAY_KEYS.filter((k) => seen.has(k));
}

/**
 * ISO dates for `days` sessions.
 *
 * With chosen weekdays: each session lands on the next occurrence of those
 * days starting tomorrow, in order, wrapping into the following week when
 * there are more sessions than chosen days (three sessions on Tue/Thu on a
 * Monday → Tue, Thu, next Tue).
 *
 * Without: spread evenly over the next 7 days, from tomorrow.
 */
function spreadDays(days: number, trainingDays: WeekdayKey[] = []): string[] {
  const out: string[] = [];
  if (trainingDays.length > 0) {
    const wanted = new Set<number>(trainingDays.map((k) => WEEKDAY_KEYS.indexOf(k)));
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    // Walk day by day from tomorrow; at most `days` weeks are ever needed.
    for (let offset = 1; out.length < days && offset <= 7 * days + 7; offset++) {
      const probe = new Date(d.getTime() + offset * 24 * 3600 * 1000);
      if (wanted.has(probe.getUTCDay())) out.push(probe.toISOString().slice(0, 10));
    }
    return out;
  }
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
 * workouts, so names are resolved straight from it. client_workouts.status
 * distinguishes completed assignments from ones that were assigned and
 * never logged (skipped).
 */
async function buildRecentHistoryBlock(admin: any, clientId: string): Promise<string> {
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const sinceIso = since.toISOString();
  const sinceDate = sinceIso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: logs }, { data: assigned }] = await Promise.all([
    admin.from('client_workout_logs').select('workout_id, client_workout_id, created_at').eq('client_id', clientId).gte('created_at', sinceIso).order('created_at', { ascending: true }).limit(40),
    admin.from('client_workouts').select('id, workout_id, assigned_date, status').eq('client_id', clientId).is('trainer_id', null).gte('assigned_date', sinceDate).lt('assigned_date', today).order('assigned_date', { ascending: true }).limit(40),
  ]);

  const ids = new Set<string>();
  for (const l of logs ?? []) if (l.workout_id) ids.add(l.workout_id);
  for (const a of assigned ?? []) if (a.workout_id) ids.add(a.workout_id);
  if (ids.size === 0) return '';
  const { data: names } = await admin.from('workouts').select('id, name').in('id', Array.from(ids));
  const nameById = new Map<string, string>((names ?? []).map((w: any) => [w.id, w.name]));
  const loggedByClientWorkoutId = new Set<string>((logs ?? []).map((l: any) => l.client_workout_id).filter(Boolean));

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
