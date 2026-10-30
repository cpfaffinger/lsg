export type WeaponId = 'rifle' | 'spread' | 'laser' | 'rocket';

export type EnemyKind = 'runner' | 'tank' | 'shooter' | 'splitter' | 'shield' | 'miniboss' | 'boss';

/**
 * Gate operations.
 * - units: signed count added to the squad (negative = red gate). Shooting raises the value.
 * - factor: multiplies the squad. Value is an index into FACTOR_STEPS. Shooting raises it.
 * - damage / fireRate: signed percentage bonus for the rest of the run.
 * - weapon: switches the weapon; shooting it has no effect.
 */
export type GateOp = 'units' | 'factor' | 'damage' | 'fireRate' | 'weapon';

export interface Gate {
  id: number;
  pairId: number;
  op: GateOp;
  value: number;
  weapon: WeaponId | null;
  x: number;
  z: number;
  prevZ: number;
  width: number;
  /** Hits accumulated towards the next value step. */
  progress: number;
  maxValue: number;
  /** Seconds since the last hit, for "pop" feedback in the view. */
  hitTimer: number;
  alive: boolean;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  hp: number;
  maxHp: number;
  radius: number;
  /** Speed towards the squad (+z) in units per second, relative to the squad. */
  speed: number;
  /** Lateral steering towards the squad, 0 = straight. */
  homing: number;
  /** Squad units killed on contact. */
  crush: number;
  coins: number;
  /** z position where ranged enemies stop to shoot; null = keep walking. */
  holdZ: number | null;
  fireCooldown: number;
  /** Seconds remaining of the white hit flash. */
  hitFlash: number;
  /** Generic per-kind state (boss phase, splitter generation, ...). */
  phase: number;
  /** Animation phase offset so crowds don't move in lockstep. */
  seed: number;
  alive: boolean;
}

export type ProjectileOwner = 'squad' | 'enemy';

export interface Projectile {
  id: number;
  owner: ProjectileOwner;
  weapon: WeaponId | 'enemy';
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  vx: number;
  vz: number;
  damage: number;
  /** Remaining enemies this projectile can pass through. */
  pierce: number;
  /** Area-of-effect radius on impact; 0 = single target. */
  aoe: number;
  life: number;
  /** Enemy ids already hit (only used by piercing projectiles). */
  hitIds: number[] | null;
  alive: boolean;
}

export type ObstacleKind = 'barrier' | 'barrel';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  z: number;
  prevZ: number;
  width: number;
  depth: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
  alive: boolean;
}

export type SimEvent =
  | { type: 'shot'; x: number; z: number; weapon: WeaponId }
  | { type: 'enemyHit'; id: number; x: number; z: number; damage: number; kind: EnemyKind }
  | {
      type: 'enemyKilled';
      id: number;
      kind: EnemyKind;
      x: number;
      z: number;
      coins: number;
      byContact: boolean;
    }
  | { type: 'gateHit'; id: number; x: number; z: number }
  | { type: 'gateStep'; id: number; value: number; op: GateOp }
  | {
      type: 'gatePassed';
      op: GateOp;
      value: number;
      weapon: WeaponId | null;
      before: number;
      after: number;
      x: number;
    }
  | { type: 'unitsLost'; count: number; x: number; z: number }
  | { type: 'explosion'; x: number; z: number; radius: number }
  | { type: 'enemyShot'; x: number; z: number }
  | { type: 'obstacleHit'; id: number; x: number; z: number }
  | { type: 'bossSpawned'; id: number }
  | { type: 'bossPhase'; id: number; phase: number }
  | { type: 'levelComplete' }
  | { type: 'levelFailed' };

export interface RunModifiers {
  startUnits: number;
  damageMultiplier: number;
  fireRateMultiplier: number;
  moveSpeedMultiplier: number;
  coinMultiplier: number;
}

export const DEFAULT_MODIFIERS: RunModifiers = {
  startUnits: 3,
  damageMultiplier: 1,
  fireRateMultiplier: 1,
  moveSpeedMultiplier: 1,
  coinMultiplier: 1,
};

export interface RunStats {
  kills: number;
  coins: number;
  peakUnits: number;
  unitsLost: number;
  gatesPassed: number;
  elapsed: number;
}
