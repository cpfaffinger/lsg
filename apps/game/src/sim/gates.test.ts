import { describe, expect, it } from 'vitest';
import { FACTOR_NEUTRAL_INDEX } from './balance.ts';
import { addGateHits, applyGate, gateMaxValue, gateStepCost, isGateBeneficial } from './gates.ts';
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
