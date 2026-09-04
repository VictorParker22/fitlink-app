/**
 * grounding — client-side copy of supabase/functions/_shared/ai.ts's
 * numbersNotInContext, so the exact same check can be unit tested from the
 * app side without importing a Deno edge function into Jest.
 *
 * Keep this byte-for-byte identical to the edge copy; tests/grounding.test.ts
 * is the guard against drift.
 */

/**
 * Numbers the reply states that the context never mentioned. Ignores small
 * counts (1-12: sets, reps, days) since those are instructions, not data.
 */
export function numbersNotInContext(reply: string, context: string): string[] {
  const inCtx = new Set((context.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));
  const out: string[] = [];
  for (const raw of reply.match(/\d+(?:[.,]\d+)?/g) ?? []) {
    const n = raw.replace(',', '.');
    const val = Number(n);
    if (Number.isFinite(val) && val >= 1 && val <= 12 && !n.includes('.')) continue;
    if (!inCtx.has(n)) out.push(n);
  }
  return Array.from(new Set(out));
}
