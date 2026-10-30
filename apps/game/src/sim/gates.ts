import { BALANCE, FACTOR_NEUTRAL_INDEX, FACTOR_STEPS } from './balance.ts';
import type { Gate, GateOp, WeaponId } from './types.ts';

export interface GateSpec {
  op: GateOp;
  /** units: signed count; factor: index into FACTOR_STEPS; damage/fireRate: signed percent. */
  value: number;
  weapon?: WeaponId;
}

/** Squad stats that gates can modify. */
export interface GateTarget {
  units: number;
  damageBonus: number;
  fireRateBonus: number;
  weapon: WeaponId;
}

export function gateStepCost(op: GateOp): number {
  switch (op) {
    case 'units':
      return BALANCE.gates.unitsStepCost;
    case 'factor':
      return BALANCE.gates.factorStepCost;
    case 'damage':
    case 'fireRate':
      return BALANCE.gates.percentStepCost;
    case 'weapon':
      return Number.POSITIVE_INFINITY;
  }
}

export function gateMaxValue(op: GateOp): number {
  switch (op) {
    case 'units':
      return BALANCE.gates.maxUnitsValue;
    case 'factor':
      return FACTOR_STEPS.length - 1;
    case 'damage':
    case 'fireRate':
      return BALANCE.gates.maxPercentValue;
    case 'weapon':
      return 0;
  }
}

function valueStep(op: GateOp): number {
  return op === 'damage' || op === 'fireRate' ? BALANCE.gates.percentStep : 1;
}

/** Whether passing the gate in its current state helps the player. */
export function isGateBeneficial(op: GateOp, value: number): boolean {
  if (op === 'weapon') return true;
  if (op === 'factor') return value > FACTOR_NEUTRAL_INDEX;
  return value > 0;
}

/**
 * Adds shot damage to a gate. Returns how many value steps were gained.
 * Gates cap at their maximum value; surplus damage is discarded.
 */
export function addGateDamage(gate: Gate, damage: number): number {
  if (gate.op === 'weapon' || gate.value >= gate.maxValue) return 0;
  gate.progress += damage;
  let steps = 0;
  const step = valueStep(gate.op);
  while (gate.progress >= gate.stepCost && gate.value < gate.maxValue) {
    gate.progress -= gate.stepCost;
    gate.value = Math.min(gate.maxValue, gate.value + step);
    // Skip the useless zero value for unit gates so a red gate flips straight to green.
    if (gate.op === 'units' && gate.value === 0) gate.value = 1;
    steps++;
  }
  if (gate.value >= gate.maxValue) gate.progress = 0;
  return steps;
}

/** Applies a gate to the squad stats and returns the new stats. */
export function applyGate(
  target: GateTarget,
  op: GateOp,
  value: number,
  weapon: WeaponId | null,
): GateTarget {
  const next = { ...target };
  switch (op) {
    case 'units':
      next.units = Math.max(0, target.units + value);
      break;
    case 'factor': {
      const factor = FACTOR_STEPS[Math.max(0, Math.min(FACTOR_STEPS.length - 1, value))] ?? 1;
      if (factor >= 1) next.units = Math.round(target.units * factor);
      // Division gates never wipe out the squad on their own.
      else next.units = Math.max(1, Math.floor(target.units * factor));
      break;
    }
    case 'damage':
      next.damageBonus = Math.max(-50, target.damageBonus + value);
      break;
    case 'fireRate':
      next.fireRateBonus = Math.max(-50, target.fireRateBonus + value);
      break;
    case 'weapon':
      if (weapon) next.weapon = weapon;
      break;
  }
  next.units = Math.min(BALANCE.squad.maxUnits, next.units);
  return next;
}
