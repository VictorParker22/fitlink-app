import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Was unauthenticated: anyone holding the anon key could burn the
    // Gemini / Spoonacular quota indefinitely. Billing abuse, not data loss —
    // but it is somebody else's invoice.
    await requireCaller(req);
    const { description } = await req.json();

    if (!description || typeof description !== 'string' || description.trim() === '') {
      return new Response(JSON.stringify({ error: 'Description is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
You are a professional fitness coach rewriting an exercise description for a coaching app.

Rewrite the description below into this exact structure using clean HTML:

1. A single opening sentence identifying what the exercise is and what it targets.
2. A numbered list of clear, concise steps to perform the movement (typically 4-6 steps).
3. A short closing line starting with "When done correctly, you should feel..." describing the sensation in the target muscle.

Rules:
- Use <p> for the opening sentence and closing line.
- Use <ol> and <li> for the steps.
- Keep the entire response under 120 words.
- Be direct and professional. No filler, no motivational language, no exclamation marks.
- Do not wrap the response in markdown code blocks.

Original Description:
${description}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();

    return new Response(JSON.stringify({ rewritten: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders, { req, endpoint: 'rewrite-exercise' });
    console.error('Error rewriting exercise:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
