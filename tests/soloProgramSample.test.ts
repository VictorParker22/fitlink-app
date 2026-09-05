import {
  normalizeName,
  dedupePreferMedia,
  sampleBalanced,
  equipmentFor,
  formatForPrompt,
  type LibraryRow,
} from '../supabase/functions/solo-program/sample';

function row(name: string, muscle: string, extra: Partial<LibraryRow> = {}): LibraryRow {
  return { id: `${name}-${muscle}`, name, muscle_group: muscle, category: 'strength', equipment: 'dumbbell', ...extra };
}

describe('normalizeName', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeName('Push-Up')).toBe(normalizeName('push up'));
    expect(normalizeName('  Barbell   Curl ')).toBe('barbell curl');
    expect(normalizeName(null)).toBe('');
  });
});

describe('dedupePreferMedia', () => {
  it('keeps the row with a demo image over its media-less twin', () => {
    const legacy = row('Leg Press', 'Quadriceps', { id: 'legacy', image_url: null, instructions_len: 0 });
    const imported = row('leg press', 'Glutes', { id: 'imported', image_url: 'https://x/y.gif', instructions_len: 800 });
    const out = dedupePreferMedia([legacy, imported]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('imported');
  });
});

describe('sampleBalanced', () => {
  const groups = ['Abs', 'Biceps', 'Triceps', 'Delts', 'Forearms', 'Pectorals', 'Glutes', 'Hamstrings', 'Quads', 'Lats', 'Upper Back'];
  const big = groups.flatMap((g) => Array.from({ length: g === 'Hamstrings' ? 6 : 60 }, (_, i) => row(`${g} ${i}`, g)));

  it('respects the target and includes every group', () => {
    const out = sampleBalanced(big, { target: 100, seed: 'a' });
    expect(out.length).toBe(100);
    const present = new Set(out.map((r) => r.muscle_group));
    for (const g of groups) expect(present.has(g)).toBe(true);
  });

  it('gives small leg groups their floor and caps the arm groups', () => {
    const out = sampleBalanced(big, { target: 230, seed: 'a' });
    const count = (g: string) => out.filter((r) => r.muscle_group === g).length;
    expect(count('Hamstrings')).toBe(6); // all six, floor is 8 but only 6 exist
    expect(count('Abs')).toBeLessThanOrEqual(20);
    expect(count('Biceps')).toBeLessThanOrEqual(20);
    expect(count('Glutes')).toBeGreaterThanOrEqual(8);
  });

  it('is deterministic for the same seed and varies across seeds', () => {
    const a = sampleBalanced(big, { target: 50, seed: 'client-2026-09-05' }).map((r) => r.id);
    const b = sampleBalanced(big, { target: 50, seed: 'client-2026-09-05' }).map((r) => r.id);
    const c = sampleBalanced(big, { target: 50, seed: 'client-2026-09-06' }).map((r) => r.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('equipmentFor', () => {
  it('excludes barbells, machines and cables at home', () => {
    const home = equipmentFor('home');
    expect(home).not.toContain('barbell');
    expect(home).not.toContain('machine');
    expect(home).not.toContain('cable');
    expect(home).toContain('bodyweight');
  });
  it('falls back to the full gym for unknown settings', () => {
    expect(equipmentFor('somewhere')).toContain('machine');
  });
});

describe('formatForPrompt', () => {
  it('lists up to three secondary muscles and a dash when none', () => {
    expect(formatForPrompt(row('Hip Thrust', 'Glutes', { secondary_muscles: ['hamstrings', 'quads', 'calves', 'abs'], equipment: 'barbell' })))
      .toBe('Hip Thrust | strength | Glutes | hamstrings, quads, calves | barbell');
    expect(formatForPrompt(row('Plank', 'Abs', { secondary_muscles: null, equipment: 'bodyweight' })))
      .toBe('Plank | strength | Abs | - | bodyweight');
  });
});
