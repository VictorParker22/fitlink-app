import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

// Deploy: supabase functions deploy food-image
// Secret:  supabase secrets set spooncalc=<your key>   (already set by the user)
//
// Resolves a representative dish photo for a meal name via Spoonacular's
// recipe search. The key stays server-side; the app only ever sees an image
// URL (or null). One request costs ~1 point on the free tier (150/day), so
// the app caches aggressively and persists hits onto the meal row itself —
// this function should only ever be called once per distinct meal name.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const apiKey = Deno.env.get('spooncalc') ?? Deno.env.get('SPOONCALC');
    if (!apiKey) {
      throw new Error('spooncalc secret is not set');
    }

    // Meal names are often comma-separated component lists ("Oats, whey,
    // banana, peanut butter") — the full string matches poorly, the leading
    // components match well. Try the whole name first, then the first two
    // components as a fallback before giving up.
    const attempts = [query.trim()];
    const parts = query.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (parts.length > 1) attempts.push(parts.slice(0, 2).join(' '));

    let imageUrl: string | null = null;
    for (const attempt of attempts) {
      const url = `https://api.spoonacular.com/recipes/complexSearch?query=${encodeURIComponent(attempt)}&number=1&apiKey=${apiKey}`;
      const res = await fetch(url);
      if (res.status === 402) {
        // Daily points exhausted — tell the client so it can back off
        // without caching a permanent null for this meal.
        return new Response(JSON.stringify({ imageUrl: null, quotaExhausted: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      if (!res.ok) continue;
      const data = await res.json();
      const hit = data?.results?.[0]?.image;
      if (hit && typeof hit === 'string') {
        imageUrl = hit;
        break;
      }
    }

    return new Response(JSON.stringify({ imageUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
