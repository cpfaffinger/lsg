import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator, SIM_DT } from './game-loop.ts';

describe('FixedStepAccumulator', () => {
  it('runs one step per sim interval and keeps the remainder', () => {
    const acc = new FixedStepAccumulator();
    let steps = 0;
    acc.advance(SIM_DT * 2.5, () => steps++);
    expect(steps).toBe(2);
    expect(acc.alpha).toBeCloseTo(0.5, 5);
  });

  it('clamps very long frames', () => {
    const acc = new FixedStepAccumulator();
    const steps = acc.advance(10, () => undefined);
    expect(steps).toBe(Math.floor(0.25 / SIM_DT));
  });

  it('honours the time scale for slow motion', () => {
    const acc = new FixedStepAccumulator();
    acc.timeScale = 0.5;
    const steps = acc.advance(SIM_DT * 4, () => undefined);
    expect(steps).toBe(2);
  });
});
