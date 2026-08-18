import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'

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
    await requireCaller(req);
    const { prompt, context } = await req.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
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
    });

    // Build context sections
    let contextBlock = '';

    if (context?.clientName) {
      contextBlock += `\nClient Name: ${context.clientName}`;
    }
    if (context?.clientGoals) {
      contextBlock += `\nClient Goals: ${context.clientGoals}`;
    }
    if (context?.clientStatus) {
      contextBlock += `\nClient Status: ${context.clientStatus}`;
    }
    if (context?.recentWorkouts && context.recentWorkouts.length > 0) {
      contextBlock += `\nRecent Workouts Assigned: ${context.recentWorkouts.join(', ')}`;
    }
    if (context?.recentSessions && context.recentSessions.length > 0) {
      contextBlock += `\nRecent Sessions: ${context.recentSessions.map((s: any) => `${s.date} - ${s.type} (${s.status})`).join('; ')}`;
    }
    if (context?.progressLogs && context.progressLogs.length > 0) {
      const latest = context.progressLogs[0];
      contextBlock += `\nLatest Progress: Weight ${latest.weight || 'N/A'}kg, Body Fat ${latest.body_fat || 'N/A'}%`;
    }
    if (context?.trainerWorkouts && context.trainerWorkouts.length > 0) {
      contextBlock += `\nAvailable Workout Templates: ${context.trainerWorkouts.join(', ')}`;
    }
    if (context?.trainerPlans && context.trainerPlans.length > 0) {
      contextBlock += `\nSubscription Plans: ${context.trainerPlans.join(', ')}`;
    }
    if (context?.activeClientCount) {
      contextBlock += `\nActive Clients: ${context.activeClientCount}`;
    }

    const systemPrompt = `
You are an elite personal training AI assistant embedded in FitLink, a coaching platform.
You help trainers make better programming decisions, answer fitness questions, and provide actionable coaching advice.

${contextBlock ? `CONTEXT ABOUT THE TRAINER'S SITUATION:\n${contextBlock}\n` : ''}

TRAINER'S QUESTION:
"${prompt.trim()}"

RESPONSE GUIDELINES:
- Be concise and actionable. Trainers are busy.
- If recommending exercises or workouts, be specific with sets, reps, and rest periods.
- If asked about a specific client, use the context data provided.
- If asked about programming, consider progressive overload, periodization, and recovery.
- Use bullet points for readability.
- Keep responses under 250 words unless the question requires more detail.
- Be professional but conversational — like a fellow experienced coach.
- If you don't have enough context to give a great answer, say what additional info you'd need.
`;

    const result = await model.generateContent(systemPrompt);
    const response = result.response;
    const text = response.text().trim();

    return new Response(JSON.stringify({ response: text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders, { req, endpoint: 'coach-assistant' });
    console.error('Error in coach assistant:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
