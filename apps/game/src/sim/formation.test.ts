import { describe, expect, it } from 'vitest';
import { formationColumns, formationSlot, MAX_COLUMNS, squadHalfWidth, visibleUnits } from './formation.ts';
import { LANE_HALF_WIDTH } from './world.ts';

describe('formation', () => {
  it('places a single unit at the centre', () => {
    const slot = formationSlot(0, 1, { x: 9, z: 9 });
    expect(slot).toEqual({ x: 0, z: 0 });
  });

  it('never gets wider than the lane', () => {
    expect(formationColumns(5000)).toBe(MAX_COLUMNS);
    expect(squadHalfWidth(5000)).toBeLessThan(LANE_HALF_WIDTH);
  });

  it('caps visible units', () => {
    expect(visibleUnits(5000)).toBeLessThanOrEqual(200);
  });

  it('centres the last partial row', () => {
    // Find a squad size whose last row holds exactly one unit.
    let count = 2;
    while (count % formationColumns(count) !== 1) count++;
    const slot = formationSlot(count - 1, count, { x: 0, z: 0 });
    expect(slot.x).toBeCloseTo(0);
    expect(slot.z).toBeGreaterThan(0);
  });
});
