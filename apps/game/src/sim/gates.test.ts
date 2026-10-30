import { describe, expect, it } from 'vitest';
import { FACTOR_NEUTRAL_INDEX } from './balance.ts';
import { addGateDamage, applyGate, gateMaxValue, gateStepCost, isGateBeneficial } from './gates.ts';
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
    stepCost: gateStepCost(op),
    maxValue: gateMaxValue(op),
    hitTimer: 0,
    alive: true,
  };
}

const base = { units: 10, damageBonus: 0, fireRateBonus: 0, weapon: 'rifle' as const };

describe('gate shooting', () => {
  it('raises a unit gate by one per step cost', () => {
    const gate = makeGate('units', 2);
    const steps = addGateDamage(gate, gate.stepCost * 3 + 1);
    expect(steps).toBe(3);
    expect(gate.value).toBe(5);
    expect(gate.progress).toBeCloseTo(1);
  });

  it('flips a red unit gate straight from -1 to +1', () => {
    const gate = makeGate('units', -1);
    addGateDamage(gate, gate.stepCost);
    expect(gate.value).toBe(1);
  });

  it('caps at the maximum value', () => {
    const gate = makeGate('factor', 4);
    addGateDamage(gate, gate.stepCost * 10);
    expect(gate.value).toBe(gate.maxValue);
  });

  it('ignores damage on weapon gates', () => {
    const gate = makeGate('weapon', 0);
    expect(addGateDamage(gate, 1e6)).toBe(0);
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
