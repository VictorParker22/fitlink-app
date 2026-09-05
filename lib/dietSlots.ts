/**
 * dietSlots — the one place that knows how diet_plan_meals rows fold into
 * meal slots.
 *
 * A slot (Breakfast, Around training, …) holds one or more foods. Each food
 * is a diet_plan_meals row:
 *
 *   slot_index  = the slot: index into week_structure.slotLabels, key of
 *                 diet_plans.swaps (as a string)
 *   order_index = the food's position within the slot
 *
 * Rows written before migration 20260905050000_diet_slot_index have no
 * slot_index (or the column is missing entirely before it is applied). Those
 * rows were one food per slot with order_index as the slot identity, so
 * order_index is the fallback.
 *
 * Pure functions only — shared by the coach builder, the coach detail screen
 * and the athlete's Food tab, and unit-tested in tests/dietSlots.test.ts.
 */

export interface SlotRowLike {
  order_index?: number | null;
  slot_index?: number | null;
}

export interface SlotGroup<T> {
  slotIndex: number;
  items: T[];
}

export interface FoodMacros {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  servings?: number | null;
}

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const isIndex = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The slot a row belongs to: slot_index, else the legacy order_index, else 0. */
export function slotIndexOf(row: SlotRowLike): number {
  if (isIndex(row.slot_index)) return row.slot_index;
  if (isIndex(row.order_index)) return row.order_index;
  return 0;
}

/**
 * Group rows by slot, slots in ascending slot order, foods within a slot in
 * ascending order_index (stable for ties, so duplicated legacy rows keep the
 * order they were stored in).
 */
export function groupRowsBySlot<T extends SlotRowLike>(rows: T[]): SlotGroup<T>[] {
  const bySlot = new Map<number, T[]>();
  rows.forEach((row) => {
    const idx = slotIndexOf(row);
    const list = bySlot.get(idx);
    if (list) list.push(row); else bySlot.set(idx, [row]);
  });
  return Array.from(bySlot.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([slotIndex, items]) => ({
      slotIndex,
      items: items
        .map((row, i) => ({ row, i }))
        .sort((a, b) => {
          const oa = isIndex(a.row.order_index) ? a.row.order_index : 0;
          const ob = isIndex(b.row.order_index) ? b.row.order_index : 0;
          return oa - ob || a.i - b.i;
        })
        .map(({ row }) => row),
    }));
}

/** Sum of (macro × servings) across foods; missing numbers count as 0, missing servings as 1. */
export function foodTotals(items: FoodMacros[]): MacroTotals {
  return items.reduce<MacroTotals>((acc, it) => {
    const sv = isIndex(it.servings) && it.servings! > 0 ? it.servings! : 1;
    acc.calories += (it.calories || 0) * sv;
    acc.protein += (it.protein || 0) * sv;
    acc.carbs += (it.carbs || 0) * sv;
    acc.fat += (it.fat || 0) * sv;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}
