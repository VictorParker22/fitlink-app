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
    const { prompt, availableMeals } = await req.json();

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

CRITICAL INSTRUCTION:
You MUST prioritize using the exact meals from the coach's library above if they fit the diet's macros. 
Use their EXACT name and macros.
If, and only if, the existing meals do not fulfill the prompt's requirements, you may invent new meals.
When inventing new meals, the meal name MUST describe the actual food being eaten (e.g., "3 Scrambled Eggs and Half Avocado", "Grilled Chicken Breast with Sweet Potato", "1 cup Oatmeal with Blueberries").
NEVER use abstract names like "Lean Start Breakfast", "Healthy Lunch", or "Pre-workout Snack". Name the actual food.
Provide accurate macronutrient data for a single standard serving of the food, and then specify how many servings the person should eat to hit the target.

You MUST respond with a JSON object exactly matching this schema:
{
  "name": string,           // A punchy, professional diet name (e.g. "Lean Summer Cut")
  "description": string,    // Brief description of the diet's goal and style (1-2 sentences)
  "category": string,       // MUST be one of: ["balanced", "high-protein", "keto", "vegan", "weight-loss", "custom"]
  "targets": {
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number
  },
  "meals": [
    {
      "name": string,       // e.g. "Chicken Breast & Sweet Potato"
      "meal_time": string,  // MUST be one of: ["breakfast", "lunch", "dinner", "snack"]
      "category": string,   // e.g. "Protein", "Carbs", "Fats", "Vegetables", "Mixed"
      "calories": number,   // Calories for 1 standard serving of this combined meal
      "protein": number,    // Protein (g) for 1 standard serving
      "carbs": number,      // Carbs (g) for 1 standard serving
      "fat": number,        // Fat (g) for 1 standard serving
      "servings": number    // How many servings the client should eat of this meal in the plan (e.g., 1, 1.5, 2)
    }
  ]
}

Rules:
- The sum of (meal.calories * meal.servings) across all meals MUST roughly equal the targets.calories.
- Generate at least 3-5 realistic meals covering Breakfast, Lunch, Dinner, and optionally Snacks.
- Use accurate macronutrient ratios. 1g Protein = 4 kcal, 1g Carbs = 4 kcal, 1g Fat = 9 kcal.
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
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders);
    console.error('Error generating diet:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
