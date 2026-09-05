// ============================================================
// sample — which library exercises the corner may write into a week.
//
// Pure TypeScript (no Deno APIs, no imports) so jest can load it from
// tests/soloProgramSample.test.ts and the edge function can import it.
//
// The pool is drawn from the global library rows that carry a demo image
// and instructions, filtered to the equipment the athlete actually has,
// de-duplicated by name (a legacy row without media loses to its ExerciseDB
// twin), then sampled so the prompt is balanced across muscle groups rather
// than 60% arms and core. ~230 lines keeps the prompt cheap and the model
// accurate about exact names.
// ============================================================

export interface LibraryRow {
  id: string;
  name: string;
  category?: string | null;
  muscle_group?: string | null;
  secondary_muscles?: string[] | null;
  equipment?: string | null;
  difficulty?: string | null;
  image_url?: string | null;
  /** Length only; the HTML itself is never selected into the pool. */
  instructions_len?: number | null;
}

/** Equipment values (exercises.equipment) an athlete has in each setting. */
export const EQUIPMENT_BY_LOCATION: Record<string, string[]> = {
  gym: ['bodyweight', 'dumbbell', 'barbell', 'cable', 'machine', 'kettlebell', 'bands', 'other'],
  coach_location: ['bodyweight', 'dumbbell', 'barbell', 'cable', 'kettlebell', 'bands', 'other'],
  home: ['bodyweight', 'dumbbell', 'bands'],
  outdoors: ['bodyweight', 'bands'],
  flexible: ['bodyweight', 'dumbbell', 'bands'],
};

export function equipmentFor(location: string | null | undefined): string[] {
  return EQUIPMENT_BY_LOCATION[String(location ?? '')] ?? EQUIPMENT_BY_LOCATION.gym;
}

/** "Push-Up" and "push up" are the same exercise to the model and to us. */
export function normalizeName(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** One row per normalized name; the one with media (then longer copy) wins. */
export function dedupePreferMedia<T extends LibraryRow>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const key = normalizeName(r.name);
    if (!key) continue;
    const cur = best.get(key);
    if (!cur) { best.set(key, r); continue; }
    const score = (x: T) => (x.image_url ? 2 : 0) + ((x.instructions_len ?? 0) > 0 ? 1 : 0) + Math.min(1, (x.instructions_len ?? 0) / 4000);
    if (score(r) > score(cur)) best.set(key, r);
  }
  return Array.from(best.values());
}

// Groups that are small in the library but essential for a balanced week get
// a floor; groups that dominate the library get a ceiling.
const FLOOR_GROUPS = new Set(['hamstrings', 'quads', 'calves', 'glutes', 'lats', 'upper back', 'spine', 'cardiovascular system', 'adductors', 'abductors']);
const CAP_GROUPS = new Set(['abs', 'biceps', 'triceps', 'forearms', 'delts']);
const FLOOR = 8;
const CAP = 20;

/** Deterministic PRNG (mulberry32) so the same seed samples the same pool. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Balanced sample: every muscle group present, small groups guaranteed a
 * floor, large groups capped, filled round-robin to `target`, stable order
 * (category, muscle group, name) so the prompt reads as a catalogue.
 */
export function sampleBalanced<T extends LibraryRow>(rows: T[], opts: { target?: number; seed?: string } = {}): T[] {
  const target = Math.max(1, opts.target ?? 230);
  const rand = rng(opts.seed ?? 'solo');
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const g = String(r.muscle_group ?? 'other').trim().toLowerCase() || 'other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }
  const queues = new Map<string, T[]>();
  for (const [g, list] of groups) queues.set(g, shuffle(list, rand));

  const picked: T[] = [];
  const taken = new Map<string, number>();
  const take = (g: string) => {
    const q = queues.get(g);
    if (!q || q.length === 0) return false;
    const limit = CAP_GROUPS.has(g) ? CAP : Infinity;
    if ((taken.get(g) ?? 0) >= limit) return false;
    picked.push(q.shift()!);
    taken.set(g, (taken.get(g) ?? 0) + 1);
    return true;
  };

  // Floors first so a tiny hamstring group is never crowded out.
  for (const g of queues.keys()) {
    if (!FLOOR_GROUPS.has(g)) continue;
    for (let i = 0; i < FLOOR && picked.length < target; i++) if (!take(g)) break;
  }
  // Round-robin the rest.
  let progressed = true;
  const order = Array.from(queues.keys()).sort();
  while (picked.length < target && progressed) {
    progressed = false;
    for (const g of order) {
      if (picked.length >= target) break;
      if (take(g)) progressed = true;
    }
  }

  return picked.sort((a, b) =>
    String(a.category ?? '').localeCompare(String(b.category ?? '')) ||
    String(a.muscle_group ?? '').localeCompare(String(b.muscle_group ?? '')) ||
    String(a.name).localeCompare(String(b.name)));
}

/** One catalogue line for the prompt. */
export function formatForPrompt(r: LibraryRow): string {
  const secondary = (r.secondary_muscles ?? []).filter(Boolean).slice(0, 3).join(', ') || '-';
  return `${r.name} | ${r.category ?? ''} | ${r.muscle_group ?? ''} | ${secondary} | ${r.equipment ?? ''}`;
}
