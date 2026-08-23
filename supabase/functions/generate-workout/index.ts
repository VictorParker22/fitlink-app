import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { guardRate, clampText } from '../_shared/rateLimit.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Was unauthenticated: anyone holding the anon key could burn the
    // Gemini / Spoonacular quota indefinitely. Billing abuse, not data loss —
    // but it is somebody else's invoice.
    const caller = await requireCaller(req);

    // Per-user cap: bounds credit blast radius of an abused account.
    const rl = await guardRate(caller.admin, caller.id, { bucket: 'generate-workout', limit: 30, windowSeconds: 3600 }, corsHeaders);
    if (rl) return rl;

    let { prompt, availableExercises } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    prompt = clampText(prompt, 2000);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });

    // Build a condensed list of available exercises for the AI to pick from
    const exerciseList = (availableExercises || [])
      .slice(0, 200) // Limit to keep prompt size reasonable
      .map((e: any) => `${e.name} [${e.muscle_group}] (${e.equipment || 'bodyweight'})`)
      .join('\n');

    const systemPrompt = `
You are a professional fitness coach creating workout programs for a coaching app.

The coach has described the workout they want:
"${prompt.trim()}"

Here are the AVAILABLE exercises in the database. You MUST pick exercises from this list.
If the exact exercise isn't available, pick the closest match from the list.

AVAILABLE EXERCISES:
${exerciseList}

You MUST respond with a JSON object matching this schema:
{
  "name": string,           // A punchy, professional workout name (2-4 words)
  "description": string,    // Brief description of equipment needed and workout focus (1 sentence)
  "bodyParts": string[],    // Array of target body parts. MUST be from: ["chest", "back", "legs", "arms", "shoulders", "core", "cardio", "fullbody"]
  "equipment": string[],    // Array of equipment needed. MUST be from: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "bands", "kettlebell"]
  "exercises": [
    {
      "exercise_name": string,  // MUST exactly match a name from the available exercises list above
      "sets": number,            // Typically 3-5
      "reps": number,            // Typically 6-15
      "rest_seconds": number     // Typically 30-120
    }
  ]
}

Rules:
- Pick 4-8 exercises that match the coach's request
- Use progressive overload logic: compound movements first, isolation last
- Match the difficulty level if specified (beginner = fewer sets, lower weight exercises; advanced = more volume, complex movements)
- If a time is specified, estimate the number of exercises to fit that time (roughly 5-8 min per exercise including rest)
- ONLY pick exercises that appear in the available exercises list
- Order exercises logically (compound → isolation, larger → smaller muscle groups)
`;

    const result = await model.generateContent(systemPrompt);
    const response = result.response;
    const text = response.text().trim();

    const data = JSON.parse(text);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders, { req, endpoint: 'generate-workout' });
    console.error('Error generating workout:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
