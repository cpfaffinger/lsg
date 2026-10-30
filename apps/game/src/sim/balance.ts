import type { EnemyKind, WeaponId } from './types.ts';

/** All tunable gameplay numbers live here so balancing never touches logic code. */
export const BALANCE = {
  squad: {
    unitSpacing: 0.78,
    /** Units beyond this are simulated as a number but not rendered/fired individually. */
    visibleCap: 160,
    /** Maximum number of units that emit projectiles; damage is scaled up for the rest. */
    shooterCap: 48,
    maxUnits: 9999,
    baseDamage: 10,
    /** Shots per second per unit. */
    baseFireRate: 2.6,
    /** Keyboard steering speed in units per second. */
    keySpeed: 15,
    /** How quickly the squad follows the drag target (higher = snappier). */
    followSharpness: 18,
  },
  scrollSpeed: 9,
  /** Seconds between two kills that still continue a combo. */
  comboWindow: 1.2,
  gates: {
    /** Hits for the next +1 on a unit gate: base + perValue * current value. */
    unitsBaseHits: 6,
    unitsHitsPerValue: 3,
    /** Hits for the next multiplier step: base + perStep * steps above x1. */
    factorBaseHits: 140,
    factorHitsPerStep: 220,
    percentBaseHits: 16,
    percentHitsPerValue: 1.6,
    percentStep: 5,
    maxUnitsValue: 99,
    maxPercentValue: 100,
    width: 4.4,
    depth: 0.4,
  },
} as const;

/** Multiplier gate steps. Index 2 is neutral (x1). */
export const FACTOR_STEPS = [1 / 3, 1 / 2, 1, 2, 3, 4] as const;
export const FACTOR_NEUTRAL_INDEX = 2;

export interface WeaponDef {
  id: WeaponId;
  damageMultiplier: number;
  fireRateMultiplier: number;
  speed: number;
  range: number;
  /** Projectiles per shot and their fan angle in radians. */
  spreadCount: number;
  spreadAngle: number;
  pierce: number;
  aoe: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  rifle: {
    id: 'rifle',
    damageMultiplier: 1,
    fireRateMultiplier: 1,
    speed: 48,
    range: 40,
    spreadCount: 1,
    spreadAngle: 0,
    pierce: 0,
    aoe: 0,
  },
  spread: {
    id: 'spread',
    damageMultiplier: 0.55,
    fireRateMultiplier: 0.9,
    speed: 40,
    range: 30,
    spreadCount: 3,
    spreadAngle: 0.22,
    pierce: 0,
    aoe: 0,
  },
  laser: {
    id: 'laser',
    damageMultiplier: 0.7,
    fireRateMultiplier: 1.2,
    speed: 90,
    range: 48,
    spreadCount: 1,
    spreadAngle: 0,
    pierce: 4,
    aoe: 0,
  },
  rocket: {
    id: 'rocket',
    damageMultiplier: 1.6,
    fireRateMultiplier: 0.45,
    speed: 30,
    range: 44,
    spreadCount: 1,
    spreadAngle: 0,
    pierce: 0,
    aoe: 2.4,
  },
};

export interface EnemyDef {
  kind: EnemyKind;
  hp: number;
  radius: number;
  /** Own running speed; total approach speed adds the scroll speed. */
  speed: number;
  homing: number;
  crush: number;
  coins: number;
  /** For ranged enemies: distance in front of the squad where they stop. */
  holdDistance: number | null;
  fireInterval: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  runner: {
    kind: 'runner',
    hp: 20,
    radius: 0.42,
    speed: 3,
    homing: 0.9,
    crush: 1,
    coins: 0.5,
    holdDistance: null,
    fireInterval: 0,
  },
  tank: {
    kind: 'tank',
    hp: 260,
    radius: 0.85,
    speed: 0.6,
    homing: 0.15,
    crush: 6,
    coins: 6,
    holdDistance: null,
    fireInterval: 0,
  },
  shooter: {
    kind: 'shooter',
    hp: 60,
    radius: 0.5,
    speed: 2,
    homing: 0.4,
    crush: 2,
    coins: 3,
    holdDistance: 26,
    fireInterval: 1.8,
  },
  splitter: {
    kind: 'splitter',
    hp: 90,
    radius: 0.62,
    speed: 2,
    homing: 0.5,
    crush: 3,
    coins: 3,
    holdDistance: null,
    fireInterval: 0,
  },
  shield: {
    kind: 'shield',
    hp: 120,
    radius: 0.6,
    speed: 1.5,
    homing: 0.3,
    crush: 3,
    coins: 4,
    holdDistance: null,
    fireInterval: 0,
  },
  miniboss: {
    kind: 'miniboss',
    hp: 2400,
    radius: 1.5,
    speed: 0.5,
    homing: 0.25,
    crush: 25,
    coins: 40,
    holdDistance: 22,
    fireInterval: 1.4,
  },
  boss: {
    kind: 'boss',
    hp: 12000,
    radius: 2.6,
    speed: 0.4,
    homing: 0.2,
    crush: 9999,
    coins: 200,
    holdDistance: 30,
    fireInterval: 1.1,
  },
};
