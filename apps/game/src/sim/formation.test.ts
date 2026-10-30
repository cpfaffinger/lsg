import { describe, expect, it } from 'vitest';
import {
  formationColumns,
  formationSlot,
  MAX_COLUMNS,
  shooterStride,
  squadHalfWidth,
  visibleUnits,
} from './formation.ts';
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

  it('lets every soldier fire once per cycle, whatever the squad size', () => {
    for (let count = 1; count <= 200; count++) {
      const stride = shooterStride(count);
      const seen = new Set<number>();
      let cursor = 0;
      for (let i = 0; i < count; i++) {
        seen.add(cursor);
        cursor = (cursor + stride) % count;
      }
      expect(seen.size, `squad of ${count}`).toBe(count);
    }
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
