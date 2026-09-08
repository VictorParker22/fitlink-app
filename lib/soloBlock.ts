/**
 * soloBlock — reading clients.solo_block on the phone.
 *
 * The block is written only by the corner's builders (solo-program,
 * solo-nutrition). The app reads it to tell the corner where the athlete is
 * in their four-week block and what their nutrition targets are, in the
 * same one-line form the server uses (plan.ts describeBlock).
 */

export interface SoloBlockNutrition {
  built_at: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  rest_calories: number;
  method: string;
}

export interface SoloBlock {
  started?: string;
  week?: number;
  split?: string;
  goal?: string;
  days?: number;
  anchors?: string[];
  rationale?: string;
  nutrition?: SoloBlockNutrition;
}

export function readSoloBlock(raw: unknown): SoloBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as SoloBlock;
}

/** "week 2 of 4 (build), upper lower, 4 days: …" or '' when no block was written. */
export function describeBlock(b: SoloBlock | null | undefined): string {
  if (!b || !Number.isFinite(Number(b.week)) || !b.split) return '';
  const week = Number(b.week);
  const phase = week === 1 ? 'base' : week === 2 ? 'build' : week === 3 ? 'peak' : 'deload';
  return `week ${week} of 4 (${phase}), ${String(b.split).replace(/_/g, ' ')}, ${b.days ?? '?'} days: ${b.rationale ?? ''}`.trim();
}

/** "2,150 kcal and 194 g protein on training days, 1,900 kcal on rest days" or ''. */
export function describeNutrition(b: SoloBlock | null | undefined): string {
  const n = b?.nutrition;
  if (!n || !Number.isFinite(Number(n.calories))) return '';
  const fmt = (x: number) => Math.round(x).toLocaleString('en-US');
  return `${fmt(n.calories)} kcal and ${fmt(n.protein)} g protein on training days, ${fmt(n.rest_calories)} kcal on rest days`;
}
