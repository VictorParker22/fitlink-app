import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { guardRate, clampText } from '../_shared/rateLimit.ts'
import { withRetry, AiTimeout, PROMPT_VERSION, clampStr, pickEnum, parseJson, report, FAST_JSON, BUILD_TIMEOUT_MS } from '../_shared/ai.ts'
import { internalError } from '../_shared/http.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORIES = ['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Cardio', 'Full Body', 'Flexibility'] as const;
const MUSCLE_GROUPS = [
  'Pectorals', 'Latissimus Dorsi', 'Quadriceps', 'Hamstrings', 'Glutes',
  'Biceps', 'Triceps', 'Deltoids', 'Trapezius', 'Abs', 'Obliques', 'Calves', 'Cardiovascular'
] as const;
const EQUIPMENT_OPTIONS = ['Barbell', 'Dumbbell', 'Machine', 'Cables', 'Kettlebell', 'Bands', 'Bodyweight', 'Plate', 'None'] as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Was unauthenticated: anyone holding the anon key could burn the
    // Gemini / Spoonacular quota indefinitely. Billing abuse, not data loss —
    // but it is somebody else's invoice.
    const caller = await requireCaller(req);
    // Coaches only. This builds a coach's library; an athlete account is
    // free to create in bulk and would otherwise burn the model budget.
    {
      const { data: coachRow } = await caller.admin.from('trainers').select('id').eq('id', caller.id).maybeSingle();
      if (!coachRow) {
        return new Response(JSON.stringify({ error: 'coaches_only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Per-user cap: bounds credit blast radius of an abused account.
    const rl = await guardRate(caller.admin, caller.id, { bucket: 'generate-exercise', global: 1500, limit: 40, windowSeconds: 3600, daily: 80 }, corsHeaders);
    if (rl) return rl;

    let { name } = await req.json();

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return new Response(JSON.stringify({ error: 'Exercise name is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    name = clampText(name, 2000);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { ...FAST_JSON, maxOutputTokens: 2000 } as any,
    });

    const prompt = `
You are a professional fitness coach writing exercise descriptions for a coaching app.

Exercise Name: "${name}"

You MUST output your response in JSON format matching the following schema:
{
  category: string; // MUST be one of: ${JSON.stringify(CATEGORIES)}
  muscle_group: string; // MUST be one of: ${JSON.stringify(MUSCLE_GROUPS)}
  equipment: string; // MUST be one of: ${JSON.stringify(EQUIPMENT_OPTIONS)}
  instructions: string; // HTML string. See structure below.
}

For the "instructions" field, write in this exact structure using clean HTML:

1. A single opening sentence identifying what the exercise is and what it targets.
2. A numbered list of clear, concise steps to perform the movement (typically 4-6 steps).
3. A short closing line starting with "When done correctly, you should feel..." describing the sensation in the target muscle.

Rules:
- Use <p> for the opening sentence and closing line.
- Use <ol> and <li> for the steps.
- Keep the entire response under 120 words.
- Be direct and professional. No filler, no motivational language, no exclamation marks.
- If you do not know the exercise, estimate based on the name.
`;

    const result = await withRetry(() => model.generateContent(prompt), { timeoutMs: BUILD_TIMEOUT_MS, label: 'generate-exercise' });
    const response = await result.response;
    const text = response.text().trim();

    const raw = parseJson(text);
    if (!raw) {
      return new Response(JSON.stringify({ error: 'bad_generation' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    const data = {
      category: pickEnum(raw.category, CATEGORIES, 'Full Body'),
      muscle_group: pickEnum(raw.muscle_group, MUSCLE_GROUPS, 'Cardiovascular'),
      equipment: pickEnum(raw.equipment, EQUIPMENT_OPTIONS, 'None'),
      instructions: clampStr(raw.instructions, 1500, ''),
      prompt_version: PROMPT_VERSION,
    };

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders, { req, endpoint: 'generate-exercise' });
    report(error, { fn: 'generate-exercise' });
    console.error('Error generating exercise details:', error);
    if (error instanceof AiTimeout) {
      return new Response(JSON.stringify({ error: 'ai_timeout' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 504,
      });
    }
    return internalError('generate-exercise', error, corsHeaders);
  }
});
