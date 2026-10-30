import { BALANCE, FACTOR_NEUTRAL_INDEX, FACTOR_STEPS } from './balance.ts';
import { formationSlot, visibleUnits } from './formation.ts';
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

/**
 * Number of projectile hits needed to raise a gate from `value` to the next step.
 * Costs grow with the value, so big squads still get strong gates but cannot max them out.
 */
export function gateStepCost(op: GateOp, value: number): number {
  const g = BALANCE.gates;
  switch (op) {
    case 'units':
      return g.unitsBaseHits + g.unitsHitsPerValue * Math.max(0, value);
    case 'factor':
      return g.factorBaseHits + g.factorHitsPerStep * Math.max(0, value - FACTOR_NEUTRAL_INDEX);
    case 'damage':
    case 'fireRate':
      return g.percentBaseHits + g.percentHitsPerValue * Math.max(0, value);
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
 * Registers projectile hits on a gate. Returns how many value steps were gained.
 * Progress counts hits rather than damage so damage upgrades do not trivialise gates.
 * Gates cap at their maximum value; surplus hits are discarded.
 */
export function addGateHits(gate: Gate, hits: number): number {
  if (gate.op === 'weapon' || gate.value >= gate.maxValue) return 0;
  gate.progress += hits;
  let steps = 0;
  const step = valueStep(gate.op);
  while (gate.value < gate.maxValue && gate.progress >= gateStepCost(gate.op, gate.value)) {
    gate.progress -= gateStepCost(gate.op, gate.value);
    gate.value = Math.min(gate.maxValue, gate.value + step);
    // Skip the useless zero value for unit gates so a red gate flips straight to green.
    if (gate.op === 'units' && gate.value === 0) gate.value = 1;
    steps++;
  }
  if (gate.value >= gate.maxValue) gate.progress = 0;
  return steps;
}

export interface GatePass {
  gate: Gate;
  /** Soldiers that walked through this gate. */
  passed: number;
  /** What those soldiers turned into (unit and multiplier gates), otherwise `passed`. */
  result: number;
}

export interface GatePassResult {
  next: GateTarget;
  /** Gates at least one soldier walked through. */
  passes: GatePass[];
}

/**
 * Resolves a gate pair for a squad standing at `squadX`. Every soldier counts for the gate it
 * walks through: a gate changes only its own soldiers, soldiers beside the gates stay as they
 * are. Percent gates scale with the share of the squad that went through; a weapon gate needs
 * at least half of the squad.
 */
export function resolveGatePass(target: GateTarget, squadX: number, gates: readonly Gate[]): GatePassResult {
  const visible = visibleUnits(target.units);
  const counts = gates.map(() => 0);
  const slot = { x: 0, z: 0 };
  for (let i = 0; i < visible; i++) {
    formationSlot(i, target.units, slot);
    const x = squadX + slot.x;
    const index = gates.findIndex((gate) => Math.abs(x - gate.x) <= gate.width / 2);
    const count = counts[index];
    if (count !== undefined) counts[index] = count + 1;
  }

  // Only a part of a huge squad is simulated in formation; the rest follows proportionally.
  const scale = visible > 0 ? target.units / visible : 0;
  const next = { ...target };
  const passes: GatePass[] = [];
  let remaining = target.units;
  gates.forEach((gate, index) => {
    const passed = Math.min(remaining, Math.round((counts[index] ?? 0) * scale));
    if (passed <= 0) return;
    remaining -= passed;
    const share = passed / target.units;
    let result = passed;
    if (gate.op === 'units' || gate.op === 'factor') {
      result = applyGate({ ...target, units: passed }, gate.op, gate.value, null).units;
    } else if (gate.op === 'weapon') {
      if (share >= 0.5 && gate.weapon) next.weapon = gate.weapon;
    } else {
      const applied = applyGate(next, gate.op, Math.round(gate.value * share), null);
      next.damageBonus = applied.damageBonus;
      next.fireRateBonus = applied.fireRateBonus;
    }
    passes.push({ gate, passed, result });
  });
  next.units = Math.min(BALANCE.squad.maxUnits, remaining + passes.reduce((sum, p) => sum + p.result, 0));
  return { next, passes };
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
