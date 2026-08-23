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
- Stay on training, nutrition, recovery, and habits. Decline everything else briefly and steer back.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const caller = await requireCaller(req);

    // Paid boundary: clients.premium_until, service-role read.
    const { data: clientRow } = await caller.admin
      .from('clients')
      .select('id, premium_until, solo_character, name')
      .eq('auth_user_id', caller.id)
      .maybeSingle();

    const premiumUntil = clientRow?.premium_until ? new Date(clientRow.premium_until) : null;
    if (!premiumUntil || premiumUntil.getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: 'premium_required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 402,
      });
    }

    const { message, history, context, character } = await req.json();
    if (!message || typeof message !== 'string' || message.trim() === '') {
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
    if (context && typeof context === 'object') {
      for (const [k, v] of Object.entries(context)) {
        if (v === null || v === undefined || String(v).trim() === '') continue;
        contextBlock += `\n${k}: ${String(v).slice(0, 400)}`;
      }
    }

    // Short rolling history keeps the thread coherent without letting the
    // request grow unboundedly.
    const turns = Array.isArray(history)
      ? history.slice(-12).map((h: any) =>
          `${h.role === 'athlete' ? 'Athlete' : 'You'}: ${String(h.content).slice(0, 600)}`
        ).join('\n')
      : '';

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `${persona}\n${SHARED_RULES}\n\nAthlete${clientRow?.name ? ` (${clientRow.name})` : ''} data:${contextBlock || '\n(no data available yet)'}\n\nRecent conversation:\n${turns || '(first message)'}\n\nAthlete: ${message.trim()}\n\nReply as the corner:`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error('[solo-corner]', err);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
