import { describe, it, expect } from 'vitest';
import { formatSlotTime, mapSlotRow, buildSlotTimeline, slotFromTime } from './daySlots';

const row = (over = {}) => ({
  id: 's1', label: 'Morning Fuel', slot_time: '08:30:00', sort_order: 0,
  target_calories: null, target_protein_g: null, target_carbs_g: null, target_fat_g: null,
  ...over,
});

describe('formatSlotTime', () => {
  it('formats a Postgres time string as 12-hour', () => {
    expect(formatSlotTime('08:30:00')).toBe('8:30am');
    expect(formatSlotTime('16:15:00')).toBe('4:15pm');
  });
});

describe('mapSlotRow', () => {
  it('maps snake_case columns to camelCase, trimming seconds off slot_time', () => {
    expect(mapSlotRow(row())).toEqual({
      id: 's1', label: 'Morning Fuel', slotTime: '08:30', sortOrder: 0,
      targetCalories: null, targetProtein: null, targetCarbs: null, targetFat: null,
    });
  });
  it('keeps null targets null rather than coercing to 0', () => {
    expect(mapSlotRow(row({ target_calories: 400, target_protein_g: 30 })).targetCalories).toBe(400);
    expect(mapSlotRow(row()).targetFat).toBeNull();
  });
});

const slot = (over = {}) => ({ id: 's1', label: 'Morning Fuel', slotTime: '08:30', sortOrder: 0, ...over });
const item = (over = {}) => ({ id: 'i1', name: 'Oats', cal: 400, slotId: 's1', ...over });

describe('buildSlotTimeline', () => {
  it('sorts slots by time and buckets items by slotId', () => {
    const slots = [slot({ id: 's2', label: 'Pre-Workout', slotTime: '16:15' }), slot({ id: 's1', label: 'Morning Fuel', slotTime: '08:30' })];
    const items = [item({ id: 'a', slotId: 's2' }), item({ id: 'b', slotId: 's1' })];
    const segs = buildSlotTimeline(slots, items);
    expect(segs.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(segs[0].items.map((i) => i.id)).toEqual(['b']);
    expect(segs[1].items.map((i) => i.id)).toEqual(['a']);
  });

  it('puts items with no matching slot into a trailing unsorted segment', () => {
    const segs = buildSlotTimeline([slot()], [item({ slotId: 's1' }), item({ id: 'orphan', slotId: 'deleted-slot' }), item({ id: 'blank', slotId: null })]);
    expect(segs).toHaveLength(2);
    expect(segs[1]).toMatchObject({ type: 'unsorted', id: 'unsorted' });
    expect(segs[1].items.map((i) => i.id)).toEqual(['orphan', 'blank']);
  });

  it('omits the unsorted segment entirely when everything has a home', () => {
    const segs = buildSlotTimeline([slot()], [item({ slotId: 's1' })]);
    expect(segs).toHaveLength(1);
  });

  it('returns an empty array for a day with no slots and no items', () => {
    expect(buildSlotTimeline([], [])).toEqual([]);
  });

  it('breaks same-time ties by sortOrder', () => {
    const slots = [slot({ id: 's2', slotTime: '08:30', sortOrder: 1 }), slot({ id: 's1', slotTime: '08:30', sortOrder: 0 })];
    const segs = buildSlotTimeline(slots, []);
    expect(segs.map((s) => s.id)).toEqual(['s1', 's2']);
  });
});

describe('slotFromTime', () => {
  const slots = [slot({ id: 's1', slotTime: '08:30' }), slot({ id: 's2', slotTime: '12:45' }), slot({ id: 's3', slotTime: '16:15' })];

  it('picks the latest slot at or before the given time', () => {
    expect(slotFromTime(slots, new Date(2026, 0, 1, 13, 0)).id).toBe('s2');
    expect(slotFromTime(slots, new Date(2026, 0, 1, 16, 15)).id).toBe('s3');
    expect(slotFromTime(slots, new Date(2026, 0, 1, 23, 0)).id).toBe('s3');
  });

  it('wraps to the first slot when now is earlier than all of them', () => {
    expect(slotFromTime(slots, new Date(2026, 0, 1, 6, 0)).id).toBe('s1');
  });

  it('returns null for a day with no slots', () => {
    expect(slotFromTime([], new Date())).toBeNull();
  });
});
