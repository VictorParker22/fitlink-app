import { slotIndexOf, groupRowsBySlot, foodTotals } from '../lib/dietSlots';

describe('slotIndexOf', () => {
  it('prefers slot_index when present', () => {
    expect(slotIndexOf({ slot_index: 2, order_index: 5 })).toBe(2);
    expect(slotIndexOf({ slot_index: 0, order_index: 5 })).toBe(0);
  });

  it('falls back to order_index for legacy rows', () => {
    expect(slotIndexOf({ order_index: 3 })).toBe(3);
    expect(slotIndexOf({ slot_index: null, order_index: 3 })).toBe(3);
    expect(slotIndexOf({ slot_index: undefined, order_index: 1 })).toBe(1);
  });

  it('defaults to 0 when nothing is known', () => {
    expect(slotIndexOf({})).toBe(0);
    expect(slotIndexOf({ order_index: null })).toBe(0);
  });
});

describe('groupRowsBySlot', () => {
  it('groups several foods into one slot, ordered within the slot', () => {
    const rows = [
      { id: 'b', slot_index: 0, order_index: 1 },
      { id: 'a', slot_index: 0, order_index: 0 },
      { id: 'c', slot_index: 1, order_index: 0 },
    ];
    const groups = groupRowsBySlot(rows);
    expect(groups.map((g) => g.slotIndex)).toEqual([0, 1]);
    expect(groups[0].items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(groups[1].items.map((r) => r.id)).toEqual(['c']);
  });

  it('sorts slots ascending even when rows arrive out of order', () => {
    const rows = [
      { id: 'dinner', slot_index: 3, order_index: 0 },
      { id: 'breakfast', slot_index: 0, order_index: 0 },
      { id: 'lunch', slot_index: 1, order_index: 0 },
    ];
    expect(groupRowsBySlot(rows).map((g) => g.items[0].id)).toEqual(['breakfast', 'lunch', 'dinner']);
  });

  it('treats legacy rows (no slot_index) as one food per order_index slot', () => {
    const rows = [
      { id: 'x', order_index: 2 },
      { id: 'y', order_index: 0 },
      { id: 'z', order_index: 1 },
    ];
    const groups = groupRowsBySlot(rows);
    expect(groups.map((g) => g.slotIndex)).toEqual([0, 1, 2]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 1]);
    expect(groups.map((g) => g.items[0].id)).toEqual(['y', 'z', 'x']);
  });

  it('keeps stored order for duplicated legacy order_index values', () => {
    const rows = [
      { id: 'first', order_index: 1 },
      { id: 'second', order_index: 1 },
    ];
    const groups = groupRowsBySlot(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].slotIndex).toBe(1);
    expect(groups[0].items.map((r) => r.id)).toEqual(['first', 'second']);
  });

  it('leaves a gap where a slot has no foods', () => {
    const rows = [
      { id: 'a', slot_index: 0, order_index: 0 },
      { id: 'c', slot_index: 2, order_index: 0 },
    ];
    expect(groupRowsBySlot(rows).map((g) => g.slotIndex)).toEqual([0, 2]);
  });

  it('returns nothing for no rows', () => {
    expect(groupRowsBySlot([])).toEqual([]);
  });
});

describe('foodTotals', () => {
  it('multiplies each food by its servings and sums', () => {
    const totals = foodTotals([
      { calories: 300, protein: 20, carbs: 30, fat: 10, servings: 1 },
      { calories: 100, protein: 5, carbs: 10, fat: 2, servings: 1.5 },
    ]);
    expect(totals).toEqual({ calories: 450, protein: 27.5, carbs: 45, fat: 13 });
  });

  it('treats a missing or zero servings as one serving', () => {
    expect(foodTotals([{ calories: 200, protein: 10, carbs: 20, fat: 5 }]).calories).toBe(200);
    expect(foodTotals([{ calories: 200, protein: 10, carbs: 20, fat: 5, servings: 0 }]).calories).toBe(200);
    expect(foodTotals([{ calories: 200, protein: 10, carbs: 20, fat: 5, servings: null }]).protein).toBe(10);
  });

  it('counts missing macros as zero rather than NaN', () => {
    const totals = foodTotals([{ calories: null, protein: undefined, carbs: 12, fat: 3, servings: 2 }]);
    expect(totals).toEqual({ calories: 0, protein: 0, carbs: 24, fat: 6 });
  });

  it('is zero for an empty slot', () => {
    expect(foodTotals([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});
