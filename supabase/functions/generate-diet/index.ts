import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { guardRate, clampText } from '../_shared/rateLimit.ts'
import { withRetry, AiTimeout, PROMPT_VERSION, clampInt, clampStr, pickEnum, parseJson, report } from '../_shared/ai.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORIES = ['balanced', 'high-protein', 'keto', 'vegan', 'weight-loss', 'custom'] as const;
const MEAL_TIMES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

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
    const rl = await guardRate(caller.admin, caller.id, { bucket: 'generate-diet', limit: 30, windowSeconds: 3600, daily: 60 }, corsHeaders);
    if (rl) return rl;

    let { prompt, availableMeals } = await req.json();

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

    const mealListStr = (availableMeals || [])
      .slice(0, 50) // Limit to 50 meals to save tokens
      .map((m: any) => `- ${m.name} (${m.calories}kcal, ${m.protein}g P, ${m.carbs}g C, ${m.fat}g F)`)
      .join('\n');

    const systemPrompt = `
You are a professional sports nutritionist and fitness coach creating a detailed diet plan.

The coach has requested a diet plan with the following prompt:
"${prompt.trim()}"

Here is the coach's existing library of saved meals:
${mealListStr || "(No saved meals yet)"}

CRITICAL INSTRUCTIONS:
1. Each entry in "meals" is ONE food or ONE dish — never a whole meal made of several dishes.
   A meal slot (e.g. breakfast) is built from several entries that share the same meal_time.
   RIGHT: three entries for breakfast — "Rolled oats", "Whole milk", "Blueberries".
   WRONG: one entry "Oatmeal with milk and blueberries plus a black coffee".
   A single composed dish that is eaten as one thing ("Chicken burrito bowl", "Greek yoghurt with honey") is fine as one entry.
2. Prefer the coach's library above. When a library food fits, use its EXACT name and EXACT macros.
   Only add a food that is not in the library when the library cannot cover the prompt.
3. Name the actual food, never the slot. RIGHT: "Grilled chicken breast", "Basmati rice, cooked", "2 whole eggs".
   WRONG: "Lean start breakfast", "Healthy lunch", "Pre-workout snack".
4. Macros are for ONE realistic serving of that food (a standard portion: 100 g cooked rice, 1 medium banana,
   30 g whey, 1 tbsp olive oil, one egg). Then set "servings" so the day lands on the targets.
   Servings must be between 0.25 and 6, in steps of 0.25.
5. "meal_time" MUST be exactly one of "breakfast", "lunch", "dinner", "snack" — lower-case, nothing else.
   Snacks between meals and around training all use "snack".
6. Respect every restriction in the prompt (allergies, "no dairy", vegan, budget, cooking time). Never include a food the prompt rules out.

You MUST respond with a JSON object exactly matching this schema:
{
  "name": string,           // A short, professional plan name (e.g. "Lean Summer Cut")
  "description": string,    // Brief description of the plan's goal and style (1-2 sentences)
  "category": string,       // MUST be one of: ["balanced", "high-protein", "keto", "vegan", "weight-loss", "custom"]
  "targets": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number
  },
  "meals": [
    {
      "name": string,       // ONE food or dish, e.g. "Grilled chicken breast"
      "meal_time": string,  // MUST be one of: ["breakfast", "lunch", "dinner", "snack"]
      "category": string,   // e.g. "Protein", "Carbs", "Fats", "Vegetables", "Mixed"
      "calories": number,   // Calories for 1 serving of this food
      "protein": number,    // Protein (g) for 1 serving
      "carbs": number,      // Carbs (g) for 1 serving
      "fat": number,        // Fat (g) for 1 serving
      "servings": number    // How many servings in the plan (0.25 – 6, steps of 0.25)
    }
  ]
}

Rules:
- The sum of (meal.calories * meal.servings) across all entries MUST land within 5% of targets.calories, and protein within 10% of targets.protein.
- Cover breakfast, lunch and dinner. Add snacks when the calories or the prompt call for them.
- Return between 6 and 16 entries in total, 1 to 4 per meal_time, listed in the order they are eaten through the day.
- Macros must be internally consistent: calories ≈ 4 × protein + 4 × carbs + 9 × fat (within 10%).
`;

    const result = await withRetry(() => model.generateContent(systemPrompt), { timeoutMs: 20000, label: 'generate-diet' });
    const response = result.response;
    const text = response.text().trim();

    const raw = parseJson(text);
    if (!raw) {
      return new Response(JSON.stringify({ error: 'bad_generation' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      });
    }

    // Up to 16 foods: one food per entry, several per slot, so a full day
    // with snacks needs more than the old 12-meal ceiling.
    const meals = (Array.isArray(raw.meals) ? raw.meals : [])
      .slice(0, 16)
      .map((m: any) => ({
        name: clampStr(m?.name, 80, 'Meal'),
        meal_time: pickEnum(m?.meal_time, MEAL_TIMES, 'snack'),
        category: clampStr(m?.category, 30, 'Mixed'),
        calories: clampInt(m?.calories, 0, 3000, 0),
        protein: clampInt(m?.protein, 0, 400, 0),
        carbs: clampInt(m?.carbs, 0, 600, 0),
        fat: clampInt(m?.fat, 0, 300, 0),
        // Quarter-serving steps, matching the builder's stepper.
        servings: Math.round(Math.min(10, Math.max(0.25, Number.isFinite(Number(m?.servings)) ? Number(m.servings) : 1)) * 4) / 4,
      }))
      .filter((m: any) => m.name);

    const targets = raw.targets ?? {};
    const data = {
      name: clampStr(raw.name, 60, 'Custom Diet'),
      description: clampStr(raw.description, 300, ''),
      category: pickEnum(raw.category, CATEGORIES, 'custom'),
      targets: {
        calories: clampInt(targets.calories, 0, 8000, 2000),
        protein: clampInt(targets.protein, 0, 600, 150),
        carbs: clampInt(targets.carbs, 0, 900, 200),
        fat: clampInt(targets.fat, 0, 400, 70),
      },
      meals,
      prompt_version: PROMPT_VERSION,
    };

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders, { req, endpoint: 'generate-diet' });
    report(error, { fn: 'generate-diet' });
    console.error('Error generating diet:', error);
    if (error instanceof AiTimeout) {
      return new Response(JSON.stringify({ error: 'ai_timeout' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 504,
      });
    }
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
