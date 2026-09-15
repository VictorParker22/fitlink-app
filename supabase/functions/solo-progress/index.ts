// ============================================================
// solo-progress — the corner reads the athlete's progress.
//
// Two reads, both stored in client_progress_reads (service role only):
//   mode 'week'    — the card at the top of the Progress tab: what the last
//                    28 days say, tied to the Solo block (week, split, goal).
//   mode 'checkin' — the reply to a Sunday check-in, also written to
//                    client_checkins.corner_reply.
//
// Doctrine (same as every Solo builder):
// - The FACTS are computed here from the athlete's own rows (sessions,
//   workout logs, habits, check-ins, weigh-ins) plus the Apple Health / Health
//   Connect numbers the app sends (clamped). The model writes sentences, never
//   numbers of its own: numbersNotInContext() rejects a draft that states a
//   number the facts do not contain, one rewrite is tried, then a deterministic
//   read built from the same facts lands. A read is ALWAYS returned.
// - Solo only (trainer_id NULL): a coached athlete has a coach's note instead.
// - Paid boundary: premium_until (402). Rate-limited like every builder; a
//   fresh 'week' read is served from the table for 12 hours unless forced.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts';
import { guardRate, clampText } from '../_shared/rateLimit.ts';
import { withRetry, AiTimeout, PROMPT_VERSION, clampStr, parseJson, report, numbersNotInContext, FAST_JSON, REPLY_TIMEOUT_MS } from '../_shared/ai.ts';
import { internalError } from '../_shared/http.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

const PERSONAS: Record<string, string> = {
  reyes: `You are Reyes, the athlete's corner. The quiet cornerman: short sentences, zero hype, total calm. You state what the numbers say, then exactly one instruction.`,
  imani: `You are Imani, the athlete's corner. The scientist: you explain the WHY in plain language — stimulus, recovery, adaptation. Warm but precise.`,
  dane: `You are Dane, the athlete's corner. The fire: loud on PRs, direct about skipped sessions, never cruel. Short punchy lines.`,
  sol: `You are Sol, the athlete's corner. The steady hand: patient, kind, immovable on habits. You protect sleep and consistency over intensity and never shame a bad week — you re-plan it.`,
};
const PERSONA_NAMES: Record<string, string> = { reyes: 'Reyes', imani: 'Imani', dane: 'Dane', sol: 'Sol' };

const READ_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    body: { type: 'string' },
    next: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'body', 'next'],
} as const;

type Facts = Record<string, string | number | boolean | null>;

const FRESH_MS = 12 * 3600 * 1000;
const DAY = 86_400_000;

function mondayOf(d: Date): string {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - ((day + 6) % 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
const num = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : null;
};

/** Best completed set weight per exercise per session → lift trends and PRs. */
function liftFacts(logs: any[], names: Record<string, string>) {
  const byEx: Record<string, { date: string; weight: number; grinds: number; failed: number }[]> = {};
  logs.forEach((row) => {
    (row.exercises || []).forEach((ex: any) => {
      if (!ex?.id) return;
      let best = 0; let grinds = 0; let failed = 0;
      (ex.sets || []).forEach((s: any) => {
        if (!s?.completed) return;
        const w = parseFloat(String(s.weight)) || 0;
        if (w > best) best = w;
        if (s.feel === 'grind') grinds++;
        if (s.feel === 'failed') failed++;
      });
      if (best <= 0) return;
      (byEx[ex.id] ||= []).push({ date: row.created_at, weight: best, grinds, failed });
    });
  });
  const lines: string[] = [];
  let up = 0, flat = 0, prs = 0;
  Object.entries(byEx).forEach(([id, pts]) => {
    const name = names[id];
    if (!name || pts.length === 0) return;
    const first = pts[0].weight, last = pts[pts.length - 1].weight;
    const grinds = pts.reduce((s, p) => s + p.grinds + p.failed, 0);
    let max = 0; pts.forEach((p) => { if (p.weight > max) { if (max > 0) prs++; max = p.weight; } });
    if (pts.length >= 2 && last > first) up++; else if (pts.length >= 2) flat++;
    lines.push(`${name}: ${first} → ${last} over ${pts.length} session${pts.length === 1 ? '' : 's'}${grinds > 0 ? `, ${grinds} hard set${grinds === 1 ? '' : 's'}` : ''}`);
  });
  return { lines: lines.slice(0, 8), up, flat, prs };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const caller = await requireCaller(req);
    const admin = caller.admin;

    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, name, premium_until, solo_block, solo_character, trainer_id, weight_unit')
      .eq('auth_user_id', caller.id)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) return json({ error: 'no_client' }, 404);
    if (client.trainer_id) return json({ error: 'not_solo' }, 409);

    const premiumUntil = client.premium_until ? new Date(client.premium_until) : null;
    if (!premiumUntil || premiumUntil.getTime() <= Date.now()) return json({ error: 'premium_required' }, 402);

    const body = await req.json().catch(() => ({}));
    const mode: 'week' | 'checkin' = body?.mode === 'checkin' ? 'checkin' : 'week';
    const force = body?.force === true;
    const now = new Date();
    const weekStart = mondayOf(now);

    // A fresh weekly read is served from the table; a forced refresh or a
    // check-in reply always generates.
    if (mode === 'week' && !force) {
      const { data: existing } = await admin
        .from('client_progress_reads')
        .select('id, headline, body, next, facts, character, created_at')
        .eq('client_id', client.id).eq('kind', 'week')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (existing && Date.now() - new Date(existing.created_at).getTime() < FRESH_MS) {
        return json({ ok: true, cached: true, read: existing });
      }
    }

    const rl = await guardRate(admin, caller.id, { bucket: 'solo-progress', global: 2000, limit: 6, windowSeconds: 3600, daily: 20 }, corsHeaders);
    if (rl) return rl;

    // ── Facts from the athlete's own rows (last 28 days) ─────────────────
    const since = new Date(now.getTime() - 28 * DAY);
    const sinceIso = since.toISOString();
    const [sessionsRes, logsRes, habitsRes, checkinRes, weightsRes] = await Promise.all([
      admin.from('client_workouts').select('status, completed_at, assigned_date, workouts(name)').eq('client_id', client.id).gte('assigned_date', sinceIso.slice(0, 10)),
      admin.from('client_workout_logs').select('exercises, created_at').eq('client_id', client.id).gte('created_at', sinceIso).order('created_at', { ascending: true }),
      admin.from('client_habits').select('date, water, steps, sleep, protein, mindfulness').eq('client_id', client.id).gte('date', sinceIso.slice(0, 10)),
      admin.from('client_checkins').select('week_start, energy_level, sleep_quality, stress_level, workout_adherence, diet_adherence, highlight, struggle, goals_next_week, submitted_at').eq('client_id', client.id).not('submitted_at', 'is', null).order('week_start', { ascending: false }).limit(1).maybeSingle(),
      admin.from('client_progress').select('weight, date, created_at').eq('client_id', client.id).not('weight', 'is', null).gte('created_at', sinceIso).order('created_at', { ascending: true }),
    ]);

    const sessions = sessionsRes.data ?? [];
    const done = sessions.filter((s: any) => s.status === 'completed');
    const block = (client.solo_block ?? {}) as Record<string, any>;
    const blockWeek = Number(block.week);
    const blockDays = Number(block.days);
    const phase = blockWeek === 1 ? 'base' : blockWeek === 2 ? 'build' : blockWeek === 3 ? 'peak' : blockWeek === 4 ? 'deload' : null;
    const plannedThisWeek = Number.isFinite(blockDays) ? blockDays : null;
    const thisWeekDone = done.filter((s: any) => (s.completed_at ?? s.assigned_date ?? '') >= weekStart).length;

    // Exercise names come from the same rows the Progress tab uses.
    const { data: nameRows } = await admin
      .from('client_workouts').select('workouts(workout_exercises(exercises(id, name)))').eq('client_id', client.id).limit(60);
    const names: Record<string, string> = {};
    (nameRows ?? []).forEach((cw: any) => (cw.workouts?.workout_exercises ?? []).forEach((we: any) => { if (we.exercises?.id && we.exercises?.name) names[we.exercises.id] = we.exercises.name; }));
    const lifts = liftFacts(logsRes.data ?? [], names);

    const habitRows = habitsRes.data ?? [];
    const habitDays = habitRows.length;
    const habitCount = (k: string) => habitRows.filter((r: any) => r[k] === true).length;
    const habitsDone = ['water', 'steps', 'sleep', 'protein', 'mindfulness'].reduce((s, k) => s + habitCount(k), 0);

    const weights = weightsRes.data ?? [];
    const firstW = weights[0]?.weight != null ? Number(weights[0].weight) : null;
    const lastW = weights.length > 0 ? Number(weights[weights.length - 1].weight) : null;

    // Health numbers the app sends: its own store, clamped, never trusted as text.
    const h = body?.health && typeof body.health === 'object' ? body.health : {};
    const stepsAvg = num(h.stepsAvg7, 0, 60000);
    const sleepAvgMin = num(h.sleepAvgMin7, 0, 900);
    const restingHr = num(h.restingHr, 25, 140);
    const restingHrDelta = num(h.restingHrDelta28, -40, 40);
    const healthWeight = num(h.weightLbs, 60, 600);
    const ci = checkinRes.data ?? null;

    const facts: Facts = {
      block_week: Number.isFinite(blockWeek) ? blockWeek : null,
      block_phase: phase,
      block_split: block.split ? String(block.split).replace(/_/g, ' ') : null,
      block_goal: block.goal ? String(block.goal) : null,
      sessions_done_28d: done.length,
      sessions_this_week: thisWeekDone,
      sessions_planned_per_week: plannedThisWeek,
      lifts_up: lifts.up,
      lifts_flat: lifts.flat,
      new_bests_28d: lifts.prs,
      habits_done_28d: habitsDone,
      habits_possible_28d: habitDays * 5,
      protein_days_28d: habitCount('protein'),
      sleep_days_28d: habitCount('sleep'),
      steps_avg_7d: stepsAvg,
      sleep_avg_min_7d: sleepAvgMin,
      resting_hr: restingHr,
      resting_hr_change_28d: restingHrDelta,
      weight_first_lbs: firstW,
      weight_last_lbs: healthWeight ?? lastW,
      checkin_energy: ci?.energy_level ?? null,
      checkin_sleep: ci?.sleep_quality ?? null,
      checkin_training: ci?.workout_adherence ?? null,
      checkin_food: ci?.diet_adherence ?? null,
      checkin_highlight: ci?.highlight ? clampText(String(ci.highlight), 240) : null,
      checkin_struggle: ci?.struggle ? clampText(String(ci.struggle), 240) : null,
    };
    // The next planned session, so an empty block still has something to say.
    const upcoming = sessions
      .filter((s: any) => s.status !== 'completed' && s.assigned_date && s.assigned_date >= now.toISOString().slice(0, 10))
      .sort((a: any, b: any) => String(a.assigned_date).localeCompare(String(b.assigned_date)))[0];
    if (upcoming) {
      const d = new Date(`${upcoming.assigned_date}T12:00:00`);
      facts.next_session = `${upcoming.workouts?.name ?? 'a session'} on ${d.toLocaleDateString('en-US', { weekday: 'long' })}`;
    }

    // Human units beside the raw ones, so the model can say "6 h 50" and
    // "7,380" without stating a number the facts do not contain.
    const fmtMin = (m: number) => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`;
    const factLines = Object.entries(facts).filter(([, v]) => v !== null && v !== '').map(([k, v]) => {
      if (k === 'sleep_avg_min_7d' && typeof v === 'number') return `sleep_avg_7d: ${fmtMin(v)} (${v} minutes; the athlete's target is 7 h 00)`;
      if (k === 'steps_avg_7d' && typeof v === 'number') return `steps_avg_7d: ${v.toLocaleString('en-US')} a day (goal 8,000)`;
      return `${k}: ${v}`;
    });
    lifts.lines.forEach((l) => factLines.push(`lift ${l}`));
    const factsText = factLines.join('\n');

    const personaKey = String(client.solo_character || 'reyes');
    const persona = PERSONAS[personaKey] ?? PERSONAS.reyes;
    const personaName = PERSONA_NAMES[personaKey] ?? 'Reyes';

    // ── Deterministic read: always available, used when the model fails ──
    const fallback = buildFallback(facts, lifts, mode, personaName);

    let read = fallback;
    let modelUsed: 'gemini' | 'fallback' = 'fallback';
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (apiKey && factLines.length >= 3) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { ...FAST_JSON, responseSchema: READ_SCHEMA, maxOutputTokens: 600 } as any });
        const task = mode === 'checkin'
          ? `The athlete just sent their Sunday check-in (the checkin_* facts). Reply to it: acknowledge what they said, connect it to what the logs show, and give ONE change for next week.`
          : `Write the read at the top of their Progress tab: what the last four weeks say, tied to where they are in the block (block_week, block_phase), and what next week should do.`;
        const prompt = `${persona}\n\nRules that override everything:\n- Use ONLY the facts below. Never state a number that is not written in the facts (no percentages you compute, no estimates, no unit conversions of your own — the facts already give sleep in hours and steps with commas). If a fact is missing, do not mention that topic.\n- Interpret, do not recite: pick the two or three facts that matter most for this block phase and say what they mean for next week. Never list every fact. Never say "minutes" for sleep; say it as the facts do (e.g. 6 h 50).\n- When sessions_done_28d is 0, this is a fresh start, not a failure: name next_session if present and give one instruction for it.\n- headline: at most 9 words, a plain statement in your voice. body: at most 70 words, two or three sentences, second person. next: 1 to 3 short imperatives (at most 6 words each).\n- You are software, not a medical professional; for pain or injury say to see a professional.\n- No greetings, no sign-off, no emoji, no markdown.\n\n${task}\n\nFacts about ${client.name ?? 'the athlete'} (28 days):\n${factsText}\n\nAnswer as JSON.`;
        const gen = async () => {
          const res = await model.generateContent(prompt);
          return res.response.text();
        };
        let text = await withRetry(gen, { timeoutMs: REPLY_TIMEOUT_MS, retries: 0, label: 'solo-progress' });
        let parsed = parseJson(text);
        let candidate = cleanRead(parsed);
        let flagged = candidate ? numbersNotInContext(`${candidate.headline} ${candidate.body} ${candidate.next.join(' ')}`, factsText) : ['no parse'];
        if (candidate && flagged.length > 0) {
          const fix = `${prompt}\n\nYour previous answer stated number(s) not in the facts: ${flagged.join(', ')}. Rewrite it stating NO number that is not in the facts.\nPrevious answer: ${JSON.stringify(candidate)}\n\nAnswer as JSON.`;
          text = await withRetry(async () => (await model.generateContent(fix)).response.text(), { timeoutMs: REPLY_TIMEOUT_MS, retries: 0, label: 'solo-progress-fix' });
          parsed = parseJson(text);
          candidate = cleanRead(parsed);
          flagged = candidate ? numbersNotInContext(`${candidate.headline} ${candidate.body} ${candidate.next.join(' ')}`, factsText) : ['no parse'];
        }
        if (candidate && flagged.length === 0) { read = candidate; modelUsed = 'gemini'; }
        else console.warn('[solo-progress] model read rejected', { flagged });
      } catch (err) {
        console.warn('[solo-progress] model failed, fallback read', err instanceof AiTimeout ? 'timeout' : String((err as any)?.message ?? err));
        report(err, { fn: 'solo-progress', stage: 'model', prompt_version: PROMPT_VERSION });
      }
    }

    const { data: stored, error: insErr } = await admin.from('client_progress_reads').insert({
      client_id: client.id,
      kind: mode,
      week_start: weekStart,
      character: personaKey.slice(0, 16),
      headline: read.headline,
      body: read.body,
      next: read.next,
      facts,
      model: modelUsed,
    }).select('id, headline, body, next, facts, character, created_at').single();
    if (insErr) throw insErr;

    if (mode === 'checkin') {
      await admin.from('client_checkins').update({ corner_reply: read.body }).eq('client_id', client.id).eq('week_start', weekStart);
    }

    console.log(`[solo-progress] ${mode} model=${modelUsed} facts=${factLines.length}`);
    return json({ ok: true, cached: false, model: modelUsed, read: stored });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    return internalError('solo-progress', err, corsHeaders);
  }
});

function cleanRead(parsed: any): { headline: string; body: string; next: string[] } | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const headline = clampStr(parsed.headline, 160, '').trim();
  const body = clampStr(parsed.body, 900, '').trim();
  const next = Array.isArray(parsed.next) ? parsed.next.map((n: unknown) => clampStr(n, 60, '').trim()).filter(Boolean).slice(0, 3) : [];
  if (!headline || !body) return null;
  return { headline, body, next };
}

/** A read with no model: plain sentences from the same facts. */
function buildFallback(f: Facts, lifts: { up: number; flat: number; prs: number }, mode: 'week' | 'checkin', name: string) {
  const parts: string[] = [];
  const next: string[] = [];
  const done = Number(f.sessions_done_28d ?? 0);
  const week = f.sessions_this_week != null && f.sessions_planned_per_week != null ? `${f.sessions_this_week} of ${f.sessions_planned_per_week} sessions this week` : null;
  let headline = done > 0 ? `${done} session${done === 1 ? '' : 's'} in four weeks.` : 'Nothing logged yet.';
  if (week) parts.push(`${week[0].toUpperCase()}${week.slice(1)}.`);
  if (lifts.up > 0) parts.push(`${lifts.up} lift${lifts.up === 1 ? ' has' : 's have'} gone up${lifts.flat > 0 ? `, ${lifts.flat} stayed level` : ''}.`);
  else if (lifts.flat > 0) parts.push(`${lifts.flat} lift${lifts.flat === 1 ? ' is' : 's are'} level; keep the load and add a rep.`);
  if (f.habits_possible_28d && Number(f.habits_possible_28d) > 0) parts.push(`Habits ${f.habits_done_28d} of ${f.habits_possible_28d}.`);
  if (f.steps_avg_7d != null) parts.push(`Steps averaged ${f.steps_avg_7d} a day.`);
  if (f.block_week != null) { headline = `Week ${f.block_week} of the block${f.block_phase ? `, ${f.block_phase}` : ''}.`; }
  if (mode === 'checkin' && f.checkin_struggle) parts.unshift(`You said: "${f.checkin_struggle}".`);
  if (lifts.flat > 0) next.push('Add a rep before adding load');
  if (f.protein_days_28d != null && Number(f.protein_days_28d) < 20) next.push('Protein every day');
  if (f.sleep_avg_min_7d != null && Number(f.sleep_avg_min_7d) < 420) next.push('Protect sleep this week');
  if (next.length === 0) next.push('Keep the plan as written');
  const body = parts.length > 0 ? parts.join(' ') : `${name} is waiting for your first logged session.`;
  return { headline: headline.slice(0, 160), body: body.slice(0, 900), next };
}
