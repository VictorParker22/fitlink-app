// ============================================================
// solo-corner — the AI corner for Solo mode athletes.
//
// Doctrine (mirrors coach-assistant):
// - Authenticated callers only, and PAID only: clients.premium_until
//   (written solely by revenuecat-webhook) gates every call with a 402.
//   The client paywall is UX; this is the boundary.
// - Grounded, never invented: the reply must build on the context the
//   app sends (real lifts, sessions, check-ins, health). The persona
//   changes DELIVERY only — same brain, same numbers, four voices.
// - Never "your coach": Solo is software and says so when asked, and
//   it recommends a human coach for medical territory.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts';
import { guardRate, clampText } from '../_shared/rateLimit.ts';
import { withRetry, AiTimeout, PROMPT_VERSION, numbersNotInContext, report } from '../_shared/ai.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Persona = delivery register only. Kept server-side so a modified
// client cannot rewrite the guardrails baked into each prompt.
const PERSONAS: Record<string, string> = {
  reyes: `You are Reyes, the athlete's corner. The quiet cornerman: short sentences, zero hype, total calm. You state what the numbers say, then exactly one instruction. You never cheerlead; your praise is one dry line and only when earned.`,
  imani: `You are Imani, the athlete's corner. The scientist: you explain the WHY behind every set in one or two plain-language sentences — stimulus, recovery, adaptation. Warm but precise. No jargon without an immediate translation.`,
  dane: `You are Dane, the athlete's corner. The fire: loud on PRs, direct about excuses, never cruel. Short punchy lines. You celebrate hard numbers hard, and you call a skipped session a skipped session.`,
  sol: `You are Sol, the athlete's corner. The steady hand: patient, kind, immovable on habits. You lower the temperature, protect sleep and consistency above intensity, and never shame a bad week — you re-plan it.`,
};

const SHARED_RULES = `
Rules that override everything:
- Ground every statement in the context data provided. Never invent numbers, sessions, or history. If the data doesn't show something, say you can't see it.
- You are software, not a medical professional. For pain beyond normal soreness, injuries, medications, or health conditions: advise seeing a professional, and mention that FitLink can match them with a real human coach.
- Keep replies under 120 words. Concrete adjustments only ("rows +2.5kg", "swap barbell row for chest-supported row"), never vague plans.
- Never claim to be a human or a certified coach. If asked, you are FitLink Solo — software in their corner.
- Stay on training, nutrition, recovery, and habits. Decline everything else briefly and steer back.
- A brand-new athlete has no logs. That is normal, not a problem: never say you "can't see" their training when week_plan or just_built_week is present. Lead with the plan you wrote (name the next session and its day) and give one instruction for it.
- When just_built_week is present, the athlete asked for a program and you have just written it: say so plainly and walk them through the week in one or two sentences.
- When program_build_failed is present, say the week could not be written just now and to ask again in a minute.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const caller = await requireCaller(req);

    // Paid boundary: clients.premium_until, service-role read.
    const { data: clientRow } = await caller.admin
      .from('clients')
      .select('id, premium_until, solo_character, name, solo_summary')
      .eq('auth_user_id', caller.id)
      .maybeSingle();

    const premiumUntil = clientRow?.premium_until ? new Date(clientRow.premium_until) : null;
    if (!premiumUntil || premiumUntil.getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: 'premium_required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 402,
      });
    }

    // Per-user cap even for paying athletes: bounds the credit blast
    // radius of a compromised/abused account.
    const limited = await guardRate(caller.admin, caller.id, { bucket: 'solo-corner', limit: 60, windowSeconds: 3600, daily: 200 }, corsHeaders);
    if (limited) return limited;

    const body = await req.json();
    // mode 'brief': the corner speaks first — one line for today, built
    // from the context alone. No athlete message required.
    const mode = body?.mode === 'brief' ? 'brief' : 'reply';
    const message = mode === 'brief'
      ? "Give me today's brief: one true observation from my data and one instruction for today, under 40 words, spoken aloud."
      : clampText(body?.message, 2000);
    const history = Array.isArray(body?.history) ? body.history : [];
    const context = body?.context;
    const character = body?.character;
    if (!message.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

    const personaKey = String(character || clientRow?.solo_character || 'reyes');
    const persona = PERSONAS[personaKey] ?? PERSONAS.reyes;

    // Context block: whatever real data the app could assemble. Shape is
    // free-form key/values; absent data simply isn't mentioned (§4).
    let contextBlock = '';
    const basedOn: string[] = [];
    if (context && typeof context === 'object') {
      // Cap the NUMBER of keys too — not just each value — so a caller
      // can't bloat the prompt with thousands of entries.
      for (const [k, v] of Object.entries(context).slice(0, 20)) {
        if (v === null || v === undefined || String(v).trim() === '') continue;
        contextBlock += `\n${clampText(k, 60)}: ${clampText(String(v), 400)}`;
        basedOn.push(clampText(k, 60).replace(/_/g, ' '));
      }
    }

    // Rolling memory: a server-written summary of everything older than the
    // recent turns below, so grounding survives past the 12-turn window.
    const memoryBlock = clientRow?.solo_summary ? clampText(String(clientRow.solo_summary), 1200) : '';

    // Short rolling history keeps the thread coherent without letting the
    // request grow unboundedly.
    const turns = Array.isArray(history)
      ? history.slice(-12).map((h: any) =>
          `${h.role === 'athlete' ? 'Athlete' : 'You'}: ${String(h.content).slice(0, 600)}`
        ).join('\n')
      : '';

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `${persona}\n${SHARED_RULES}\n\nWhat you remember about this athlete:\n${memoryBlock || '(nothing yet)'}\n\nAthlete${clientRow?.name ? ` (${clientRow.name})` : ''} data:${contextBlock || '\n(no data available yet)'}\n\nRecent conversation:\n${turns || '(first message)'}\n\nAthlete: ${message.trim()}\n\nReply as the corner:`;

    const groundingSource = `${memoryBlock}\n${contextBlock}`;

    // Grounding check: flag any number the reply states that never appeared
    // in the context it was given, and ask the model to rewrite once rather
    // than ship a hallucinated figure. Returns the (possibly rewritten) reply.
    const groundReply = async (draft: string): Promise<{ reply: string; flagged: string[] }> => {
      const flagged = numbersNotInContext(draft, groundingSource);
      if (flagged.length === 0) return { reply: draft, flagged };
      const fixPrompt = `Your reply below states number(s) that do not appear anywhere in the athlete's data or memory: ${flagged.join(', ')}. Rewrite the reply so it states NO number that isn't in the data/memory provided. Keep the same voice, length limit, and intent. Never mention this correction to the athlete.\n\nWhat you remember about this athlete:\n${memoryBlock || '(nothing yet)'}\n\nAthlete data:${contextBlock || '\n(no data available yet)'}\n\nOriginal reply:\n${draft}\n\nRewritten reply:`;
      try {
        const fixResult = await withRetry(() => model.generateContent(fixPrompt), { timeoutMs: 20000, label: 'solo-corner-fix' });
        return { reply: fixResult.response.text(), flagged };
      } catch (fixErr) {
        // The rewrite call itself failing is not fatal: ship the flagged
        // original rather than error the whole reply, but keep the flag.
        report(fixErr, { fn: 'solo-corner-grounding-fix' });
        return { reply: draft, flagged };
      }
    };

    // Rolling memory: every 8th athlete message, ask the model to fold the
    // old summary + this exchange into a fresh 120-word summary and persist
    // it. Fire-and-forget: must not slow down or fail the athlete's reply.
    const scheduleSummary = (reply: string) => {
      if (!clientRow?.id || mode !== 'reply') return;
      const priorAthleteTurns = history.filter((h: any) => h?.role === 'athlete').length;
      if ((priorAthleteTurns + 1) % 8 !== 0) return;
      const clientId = clientRow.id;
      const oldSummary = memoryBlock;
      const summaryTask = async () => {
        try {
          const summaryModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          const summaryPrompt = `Merge the existing summary and this new exchange into ONE updated summary of this athlete for a coaching AI's long-term memory. Keep concrete facts (goals, equipment, injuries, preferences, patterns) and drop small talk. 120 words maximum, plain prose, no bullet points.\n\nExisting summary:\n${oldSummary || '(none yet)'}\n\nNew exchange:\nAthlete: ${message.trim()}\nCorner: ${reply}\n\nUpdated summary:`;
          const summaryResult = await withRetry(() => summaryModel.generateContent(summaryPrompt), { timeoutMs: 20000, label: 'solo-corner-summary' });
          const summary = summaryResult.response.text().trim().slice(0, 1600);
          const { error: updErr } = await caller.admin
            .from('clients')
            .update({ solo_summary: summary, solo_summary_at: new Date().toISOString() })
            .eq('id', clientId);
          if (updErr) console.error('[solo-corner] summary write failed:', updErr.message);
        } catch (sumErr) {
          console.error('[solo-corner] summary refresh failed:', sumErr);
          report(sumErr, { fn: 'solo-corner-summary' });
        }
      };
      // EdgeRuntime.waitUntil() keeps the worker alive after the Response
      // returns; a plain unawaited promise would be silently killed.
      EdgeRuntime.waitUntil(summaryTask());
    };

    // Streaming path (roast phase 2): tokens reach the phone as they are
    // generated, so the spoken line types in and speech can start on the
    // first sentence. Wire format, text/plain:
    //   line 1:  {"based_on":[...],"mode":..,"prompt_version":..}\n
    //   then:    raw reply text as it streams
    //   tail:    \n{"reply":"<rewritten>","flagged":[...]}\n   only when the
    //            grounding check rewrote the reply; the client replaces what
    //            it showed with the corrected text.
    if (body?.stream === true) {
      const streamResult = await withRetry(() => model.generateContentStream(prompt), { timeoutMs: 20000, label: 'solo-corner-stream' });
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ based_on: basedOn, mode, prompt_version: PROMPT_VERSION })}\n`));
          let full = '';
          try {
            for await (const chunk of streamResult.stream) {
              const piece = chunk.text();
              if (!piece) continue;
              full += piece;
              controller.enqueue(encoder.encode(piece));
            }
            const grounded = await groundReply(full);
            if (grounded.flagged.length > 0) {
              controller.enqueue(encoder.encode(`\n${JSON.stringify({ reply: grounded.reply, flagged: grounded.flagged })}\n`));
            }
            scheduleSummary(grounded.reply);
          } catch (streamErr) {
            report(streamErr, { fn: 'solo-corner-stream' });
            console.error('[solo-corner] stream failed:', streamErr);
            if (!full) controller.enqueue(encoder.encode(`\n${JSON.stringify({ error: 'stream_failed' })}\n`));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
        status: 200,
      });
    }

    const result = await withRetry(() => model.generateContent(prompt), { timeoutMs: 20000, label: 'solo-corner' });
    const grounded = await groundReply(result.response.text());
    const reply = grounded.reply;
    const flagged = grounded.flagged;
    scheduleSummary(reply);

    // `based_on` names the real data the line was built from, so the UI can
    // show it honestly (and show nothing when there was nothing).
    return new Response(JSON.stringify({ reply, based_on: basedOn, mode, prompt_version: PROMPT_VERSION, grounding: { flagged } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    report(err, { fn: 'solo-corner' });
    console.error('[solo-corner]', err);
    if (err instanceof AiTimeout) {
      return new Response(JSON.stringify({ error: 'ai_timeout' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 504,
      });
    }
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
