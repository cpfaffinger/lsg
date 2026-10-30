import { describe, expect, it } from 'vitest';
import { FACTOR_NEUTRAL_INDEX } from './balance.ts';
import {
  addGateHits,
  applyGate,
  gateMaxValue,
  gateStepCost,
  isGateBeneficial,
  resolveGatePass,
} from './gates.ts';
import type { Gate, GateOp } from './types.ts';

function makeGate(op: GateOp, value: number): Gate {
  return {
    id: 1,
    pairId: 1,
    op,
    value,
    weapon: null,
    x: 0,
    z: -10,
    prevZ: -10,
    width: 4,
    progress: 0,
    maxValue: gateMaxValue(op),
    hitTimer: 0,
    alive: true,
  };
}

const base = { units: 10, damageBonus: 0, fireRateBonus: 0, weapon: 'rifle' as const };

describe('gate passage', () => {
  const left = { ...makeGate('factor', FACTOR_NEUTRAL_INDEX + 1), x: -2.5, width: 4.4 };
  const right = { ...makeGate('units', -2), x: 2.5, width: 4.4 };

  it('changes only the soldiers that walked through a gate', () => {
    const target = { ...base, units: 30 };
    const { next, passes } = resolveGatePass(target, 0, [left, right]);
    expect(passes).toHaveLength(2);
    const [doubled, reduced] = passes;
    expect(doubled?.result).toBe((doubled?.passed ?? 0) * 2);
    expect(reduced?.result).toBe((reduced?.passed ?? 0) - 2);
    const beside = 30 - (doubled?.passed ?? 0) - (reduced?.passed ?? 0);
    expect(next.units).toBe(beside + (doubled?.result ?? 0) + (reduced?.result ?? 0));
  });

  it('sends a small squad through one gate completely', () => {
    const { next, passes } = resolveGatePass({ ...base, units: 5 }, -2.5, [left, right]);
    expect(passes.map((p) => p.passed)).toEqual([5]);
    expect(next.units).toBe(10);
  });

  it('leaves soldiers untouched when nobody reaches a gate', () => {
    const { next, passes } = resolveGatePass({ ...base, units: 1 }, 0, [left, right]);
    expect(passes).toHaveLength(0);
    expect(next.units).toBe(1);
  });

  it('scales percent gates with the share of the squad', () => {
    const damage = { ...makeGate('damage', 20), x: -2.5, width: 4.4 };
    const whole = resolveGatePass({ ...base, units: 4 }, -2.5, [damage]);
    expect(whole.next.damageBonus).toBe(20);
    const part = resolveGatePass({ ...base, units: 30 }, -2.5, [damage]);
    expect(part.next.damageBonus).toBeGreaterThan(0);
    expect(part.next.damageBonus).toBeLessThan(20);
  });

  it('needs half of the squad for a weapon gate', () => {
    const weapon = { ...makeGate('weapon', 0), weapon: 'laser' as const, x: 4.5, width: 1 };
    expect(resolveGatePass({ ...base, units: 30 }, 0, [weapon]).next.weapon).toBe('rifle');
    expect(resolveGatePass({ ...base, units: 1 }, 4.5, [weapon]).next.weapon).toBe('laser');
  });

  it('counts huge squads proportionally', () => {
    const huge = resolveGatePass({ ...base, units: 3000 }, 0, [left, right]);
    const passed = huge.passes.reduce((sum, p) => sum + p.passed, 0);
    expect(passed).toBeGreaterThan(2000);
    expect(passed).toBeLessThanOrEqual(3000);
  });
});

describe('gate shooting', () => {
  it('raises a unit gate step by step with growing costs', () => {
    const gate = makeGate('units', 2);
    const hits = gateStepCost('units', 2) + gateStepCost('units', 3) + gateStepCost('units', 4);
    const steps = addGateHits(gate, hits + 1);
    expect(steps).toBe(3);
    expect(gate.value).toBe(5);
    expect(gate.progress).toBeCloseTo(1);
    expect(gateStepCost('units', 10)).toBeGreaterThan(gateStepCost('units', 1));
  });

  it('flips a red unit gate straight from -1 to +1', () => {
    const gate = makeGate('units', -1);
    addGateHits(gate, gateStepCost('units', -1));
    expect(gate.value).toBe(1);
  });

  it('caps at the maximum value', () => {
    const gate = makeGate('factor', 4);
    addGateHits(gate, 1e6);
    expect(gate.value).toBe(gate.maxValue);
  });

  it('ignores hits on weapon gates', () => {
    const gate = makeGate('weapon', 0);
    expect(addGateHits(gate, 1e6)).toBe(0);
  });

  it('needs far more hits for a multiplier than for a few units', () => {
    expect(gateStepCost('factor', FACTOR_NEUTRAL_INDEX)).toBeGreaterThan(gateStepCost('units', 5) * 5);
  });
});

describe('gate effects', () => {
  it('adds and removes units without going negative', () => {
    expect(applyGate(base, 'units', 5, null).units).toBe(15);
    expect(applyGate(base, 'units', -50, null).units).toBe(0);
  });

  it('multiplies and divides, never dividing to zero', () => {
    expect(applyGate(base, 'factor', FACTOR_NEUTRAL_INDEX + 1, null).units).toBe(20);
    expect(applyGate({ ...base, units: 1 }, 'factor', 0, null).units).toBe(1);
    expect(applyGate(base, 'factor', 1, null).units).toBe(5);
  });

  it('stacks damage and fire-rate bonuses with a floor', () => {
    const boosted = applyGate(base, 'damage', 20, null);
    expect(boosted.damageBonus).toBe(20);
    expect(applyGate(base, 'fireRate', -80, null).fireRateBonus).toBe(-50);
  });

  it('switches weapons', () => {
    expect(applyGate(base, 'weapon', 0, 'laser').weapon).toBe('laser');
  });

  it('classifies beneficial gates', () => {
    expect(isGateBeneficial('units', -3)).toBe(false);
    expect(isGateBeneficial('factor', FACTOR_NEUTRAL_INDEX)).toBe(false);
    expect(isGateBeneficial('damage', 5)).toBe(true);
  });
});
