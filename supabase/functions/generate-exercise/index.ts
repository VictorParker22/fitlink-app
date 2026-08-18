import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORIES = ['Chest', 'Back', 'Legs', 'Arms', 'Shoulders', 'Core', 'Cardio', 'Full Body', 'Flexibility'];
const MUSCLE_GROUPS = [
  'Pectorals', 'Latissimus Dorsi', 'Quadriceps', 'Hamstrings', 'Glutes', 
  'Biceps', 'Triceps', 'Deltoids', 'Trapezius', 'Abs', 'Obliques', 'Calves', 'Cardiovascular'
];
const EQUIPMENT_OPTIONS = ['Barbell', 'Dumbbell', 'Machine', 'Cables', 'Kettlebell', 'Bands', 'Bodyweight', 'Plate', 'None'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Was unauthenticated: anyone holding the anon key could burn the
    // Gemini / Spoonacular quota indefinitely. Billing abuse, not data loss —
    // but it is somebody else's invoice.
    await requireCaller(req);
    const { name } = await req.json();

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return new Response(JSON.stringify({ error: 'Exercise name is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
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

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    
    // Parse to ensure it's valid JSON matching the schema
    const data = JSON.parse(text);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders);
    console.error('Error generating exercise details:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
