import { BALANCE, ENEMIES, WEAPONS } from './balance.ts';
import {
  formationColumns,
  formationRows,
  formationSlot,
  squadDepth,
  squadHalfWidth,
  type SlotOffset,
} from './formation.ts';
import { addGateHits, applyGate, gateMaxValue, type GateSpec } from './gates.ts';
import type { LevelDef, Segment, WaveGroup } from './level.ts';
import { Rng } from './rng.ts';
import { SpatialGrid } from './spatial-grid.ts';
import {
  DEFAULT_MODIFIERS,
  type Enemy,
  type EnemyKind,
  type Gate,
  type LossCause,
  type Obstacle,
  type ObstacleKind,
  type Projectile,
  type RunModifiers,
  type RunStats,
  type SimEvent,
  type WeaponId,
} from './types.ts';
import { DESPAWN_Z, LANE_HALF_WIDTH, LANE_WIDTH, SPAWN_DISTANCE, SQUAD_Z } from './world.ts';

export type RunStatus = 'running' | 'won' | 'lost';

export interface StepInput {
  /** Horizontal drag since the last step, already converted to world units. */
  dragWorld: number;
  /** Keyboard steering axis in [-1, 1]. */
  axis: number;
}

const MAX_PROJECTILES = 1400;
const ENEMY_PROJECTILE_SPEED = 17;
const SQUAD_FRONT_Z = SQUAD_Z - 0.45;
/** Enemies closer than this are auto-targeted; farther away the squad shoots straight. */
const AIM_RANGE = 34;
const AIM_CONE = 0.55;
const AIM_CANDIDATES = 16;
/** tan(~17°): shots flatter than this hit a shield bearer's front plate. */
const SHIELD_SIDE_SLOPE = 0.3;
const BARREL_EXPLOSION_RADIUS = 3.6;
const BARREL_EXPLOSION_DAMAGE = 450;

/**
 * Deterministic gameplay simulation of one level run. Knows nothing about rendering;
 * views read the public state and drain `events` each frame.
 */
export class Simulation {
  readonly level: LevelDef;
  readonly modifiers: RunModifiers;
  private readonly rng: Rng;

  status: RunStatus = 'running';
  /** Distance travelled along the lane. */
  distance = 0;
  units: number;
  squadX = 0;
  prevSquadX = 0;
  private targetX = 0;
  weapon: WeaponId = 'rifle';
  damageBonus = 0;
  fireRateBonus = 0;
  /** True while the lane scrolls; stops during boss fights. */
  scrolling = true;
  bossId: number | null = null;

  readonly gates: Gate[] = [];
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly obstacles: Obstacle[] = [];
  readonly stats: RunStats = { kills: 0, coins: 0, peakUnits: 0, unitsLost: 0, gatesPassed: 0, elapsed: 0 };

  private readonly pendingEvents: SimEvent[] = [];
  private readonly segments: Segment[];
  private nextSegment = 0;
  private nextId = 1;
  private shotAccumulator = 0;
  private shooterCursor = 0;
  private readonly grid = new SpatialGrid(2);
  private readonly slot: SlotOffset = { x: 0, z: 0 };
  private bossSummonTimer = 0;

  constructor(level: LevelDef, modifiers: RunModifiers = DEFAULT_MODIFIERS) {
    this.level = level;
    this.modifiers = modifiers;
    this.rng = new Rng(level.seed);
    this.units = Math.max(1, Math.round(modifiers.startUnits));
    this.stats.peakUnits = this.units;
    this.segments = [...level.segments].sort((a, b) => a.at - b.at);
  }

  /** Returns and clears all events emitted since the last call. */
  drainEvents(): SimEvent[] {
    const events = this.pendingEvents.slice();
    this.pendingEvents.length = 0;
    return events;
  }

  get progress(): number {
    return Math.min(1, this.distance / Math.max(1, this.level.length));
  }

  get halfWidth(): number {
    return squadHalfWidth(this.units);
  }

  get damagePerShot(): number {
    const weapon = WEAPONS[this.weapon];
    return (
      BALANCE.squad.baseDamage *
      weapon.damageMultiplier *
      this.modifiers.damageMultiplier *
      Math.max(0.5, 1 + this.damageBonus / 100)
    );
  }

  get fireRate(): number {
    const weapon = WEAPONS[this.weapon];
    return (
      BALANCE.squad.baseFireRate *
      weapon.fireRateMultiplier *
      this.modifiers.fireRateMultiplier *
      Math.max(0.5, 1 + this.fireRateBonus / 100)
    );
  }

  /**
   * Advances the run. After the run has ended the world keeps moving (so the final moment
   * can play out in slow motion), but stats and the result no longer change.
   */
  step(dt: number, input: StepInput): void {
    const running = this.status === 'running';
    if (running) this.stats.elapsed += dt;
    this.updateSquadMovement(dt, input);

    const scrollDelta = this.scrolling ? this.level.scrollSpeed * dt : 0;
    this.distance += scrollDelta;
    this.spawnSegments();

    this.updateGates(dt, scrollDelta);
    this.updateObstacles(dt, scrollDelta);
    this.updateEnemies(dt, scrollDelta);
    this.fire(dt);
    this.updateProjectiles(dt);
    this.compact();
    if (running) this.checkEnd();
  }

  // ---------------------------------------------------------------- squad

  private updateSquadMovement(dt: number, input: StepInput): void {
    this.prevSquadX = this.squadX;
    const limit = Math.max(0, LANE_HALF_WIDTH - this.halfWidth);
    this.targetX +=
      input.dragWorld + input.axis * BALANCE.squad.keySpeed * this.modifiers.moveSpeedMultiplier * dt;
    this.targetX = clamp(this.targetX, -limit, limit);
    const follow = 1 - Math.exp(-BALANCE.squad.followSharpness * this.modifiers.moveSpeedMultiplier * dt);
    this.squadX += (this.targetX - this.squadX) * follow;
    this.squadX = clamp(this.squadX, -limit, limit);
  }

  private loseUnits(count: number, x: number, z: number, cause: LossCause): void {
    const lost = Math.min(this.units, Math.max(0, Math.round(count)));
    if (lost <= 0) return;
    this.units -= lost;
    this.stats.unitsLost += lost;
    this.emit({ type: 'unitsLost', count: lost, x, z, cause });
  }

  private squadContains(x: number, radius: number): boolean {
    return Math.abs(x - this.squadX) <= this.halfWidth + radius;
  }

  private fire(dt: number): void {
    if (this.units <= 0) return;
    const weapon = WEAPONS[this.weapon];
    const shooters = Math.min(this.units, BALANCE.squad.shooterCap);
    // Units beyond the shooter cap still contribute damage through the scale factor.
    const damageScale = this.units / shooters;
    this.shotAccumulator += shooters * this.fireRate * dt;
    if (this.shotAccumulator >= 1) this.collectAimCandidates();
    const cols = formationColumns(this.units);
    const frontSlots = Math.min(shooters, cols * Math.min(3, formationRows(this.units)));
    while (this.shotAccumulator >= 1) {
      this.shotAccumulator -= 1;
      if (this.projectiles.length >= MAX_PROJECTILES) continue;
      const index = this.shooterCursor % Math.max(1, frontSlots);
      this.shooterCursor = (this.shooterCursor + 7) % 9973;
      formationSlot(index, this.units, this.slot);
      const ox = this.squadX + this.slot.x;
      const oz = SQUAD_Z + this.slot.z - 0.6;
      const damage = this.damagePerShot * damageScale;
      const aim = this.pickAimAngle(ox, oz, damage * weapon.spreadCount, weapon.speed);
      for (let i = 0; i < weapon.spreadCount; i++) {
        const spread =
          weapon.spreadCount === 1
            ? 0
            : -weapon.spreadAngle + (2 * weapon.spreadAngle * i) / (weapon.spreadCount - 1);
        const angle = aim + spread;
        this.projectiles.push({
          id: this.nextId++,
          owner: 'squad',
          weapon: this.weapon,
          x: ox,
          z: oz,
          prevX: ox,
          prevZ: oz,
          vx: Math.sin(angle) * weapon.speed,
          vz: -Math.cos(angle) * weapon.speed,
          damage,
          pierce: weapon.pierce,
          aoe: weapon.aoe,
          life: weapon.range / weapon.speed,
          hitIds: weapon.pierce > 0 ? [] : null,
          alive: true,
        });
      }
      this.emit({ type: 'shot', x: ox, z: oz, weapon: this.weapon });
    }
  }

  /** Enemies close enough to be auto-targeted this step, nearest first. */
  private readonly aimCandidates: Enemy[] = [];
  /** Damage already sent towards each candidate this step, to avoid overkill. */
  private readonly aimAssigned = new Map<number, number>();

  private collectAimCandidates(): void {
    this.aimCandidates.length = 0;
    this.aimAssigned.clear();
    for (const enemy of this.enemies) {
      if (enemy.alive && enemy.z > SQUAD_Z - AIM_RANGE && enemy.z < SQUAD_Z) this.aimCandidates.push(enemy);
    }
    this.aimCandidates.sort((a, b) => b.z - a.z);
    if (this.aimCandidates.length > AIM_CANDIDATES) this.aimCandidates.length = AIM_CANDIDATES;
  }

  /**
   * Units auto-aim at close threats inside a forward cone, spreading fire across targets.
   * Without a close threat they shoot straight ahead, which is what hits the gates.
   */
  private pickAimAngle(ox: number, oz: number, damage: number, speed: number): number {
    let best: Enemy | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const enemy of this.aimCandidates) {
      if (!enemy.alive) continue;
      const assigned = this.aimAssigned.get(enemy.id) ?? 0;
      if (assigned >= enemy.hp) continue;
      const dz = oz - enemy.z;
      if (dz <= 0) continue;
      const angle = Math.atan2(enemy.x - ox, dz);
      if (Math.abs(angle) > AIM_CONE) continue;
      // Prefer targets that need little turning and are close.
      // Ranged enemies are dangerous, so units prioritise them over closer melee enemies.
      const ranged = enemy.holdZ !== null && enemy.kind !== 'boss' && enemy.kind !== 'miniboss';
      const score = Math.abs(angle) * 6 + dz * 0.08 - (ranged ? 2.5 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    if (!best) return 0;
    this.aimAssigned.set(best.id, (this.aimAssigned.get(best.id) ?? 0) + damage);
    // Lead the target slightly: it walks towards the squad while the bullet flies.
    const dz = oz - best.z;
    const travel = dz / speed;
    const leadZ = best.z + (this.level.scrollSpeed + best.speed) * travel * 0.5;
    return Math.atan2(best.x - ox, Math.max(0.5, oz - leadZ));
  }

  // ---------------------------------------------------------------- spawning

  private spawnSegments(): void {
    while (this.nextSegment < this.segments.length) {
      const segment = this.segments[this.nextSegment];
      if (!segment || segment.at - this.distance > SPAWN_DISTANCE) break;
      this.nextSegment++;
      const z = SQUAD_Z - (segment.at - this.distance);
      switch (segment.type) {
        case 'gates':
          this.spawnGates(segment.gates, z);
          break;
        case 'wave':
          for (const group of segment.groups) this.spawnWaveGroup(group, z);
          break;
        case 'obstacle':
          this.spawnObstacle(segment.kind, segment.x, z, segment.width, segment.hp);
          break;
        case 'boss':
          this.spawnBoss(segment.kind, z, segment.hpScale ?? 1);
          break;
      }
    }
  }

  private spawnGates(specs: GateSpec[], z: number): void {
    const pairId = this.nextId++;
    const count = Math.max(1, specs.length);
    const slotWidth = LANE_WIDTH / count;
    specs.forEach((spec, i) => {
      const x = -LANE_HALF_WIDTH + slotWidth * (i + 0.5);
      this.gates.push({
        id: this.nextId++,
        pairId,
        op: spec.op,
        value: spec.value,
        weapon: spec.weapon ?? null,
        x,
        z,
        prevZ: z,
        width: Math.min(BALANCE.gates.width, slotWidth - 0.5),
        progress: 0,
        maxValue: gateMaxValue(spec.op),
        hitTimer: 10,
        alive: true,
      });
    });
  }

  spawnEnemy(kind: EnemyKind, x: number, z: number, hpScale = 1): Enemy {
    const def = ENEMIES[kind];
    const hp = Math.round(def.hp * hpScale);
    const enemy: Enemy = {
      id: this.nextId++,
      kind,
      x,
      z,
      prevX: x,
      prevZ: z,
      hp,
      maxHp: hp,
      radius: def.radius,
      speed: def.speed,
      homing: def.homing,
      crush: def.crush,
      coins: def.coins,
      holdZ: def.holdDistance === null ? null : SQUAD_Z - def.holdDistance,
      fireCooldown: def.fireInterval * (0.5 + this.rng.next()),
      hitFlash: 0,
      phase: 0,
      seed: this.rng.next() * 100,
      alive: true,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  private spawnWaveGroup(group: WaveGroup, z: number): void {
    const def = ENEMIES[group.kind];
    const width = Math.min(LANE_WIDTH - 1, group.width ?? LANE_WIDTH - 1);
    const centerX = group.x ?? 0;
    const spacing = Math.max(def.radius * 2.3, 0.9);
    const pattern = group.pattern ?? 'grid';
    const hpScale = group.hpScale ?? 1;
    const perRow = Math.max(1, Math.floor(width / spacing));
    for (let i = 0; i < group.count; i++) {
      let x = centerX;
      let dz = 0;
      switch (pattern) {
        case 'grid': {
          const row = Math.floor(i / perRow);
          const inRow = Math.min(perRow, group.count - row * perRow);
          x = centerX + ((i % perRow) - (inRow - 1) / 2) * spacing;
          dz = row * spacing;
          break;
        }
        case 'line':
          x = centerX + (i - (group.count - 1) / 2) * (width / Math.max(1, group.count - 1 || 1));
          if (group.count === 1) x = centerX;
          break;
        case 'column':
          dz = i * spacing * 1.4;
          break;
        case 'wedge': {
          const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
          const first = (row * (row + 1)) / 2;
          x = centerX + (i - first - row / 2) * spacing;
          dz = row * spacing;
          break;
        }
        case 'scatter':
          x = centerX + this.rng.range(-width / 2, width / 2);
          dz = this.rng.range(0, Math.max(4, group.count * 0.35));
          break;
      }
      x = clamp(x, -LANE_HALF_WIDTH + def.radius, LANE_HALF_WIDTH - def.radius);
      this.spawnEnemy(group.kind, x, z - dz, hpScale);
    }
  }

  private spawnObstacle(kind: ObstacleKind, x: number, z: number, width?: number, hp?: number): void {
    const isBarrel = kind === 'barrel';
    const maxHp = hp ?? (isBarrel ? 60 : Number.POSITIVE_INFINITY);
    this.obstacles.push({
      id: this.nextId++,
      kind,
      x,
      z,
      prevZ: z,
      width: width ?? (isBarrel ? 1.2 : 3),
      depth: isBarrel ? 1.2 : 0.6,
      hp: maxHp,
      maxHp,
      hitFlash: 0,
      alive: true,
    });
  }

  private spawnBoss(kind: 'boss' | 'miniboss', z: number, hpScale: number): void {
    const boss = this.spawnEnemy(kind, 0, z, hpScale);
    if (kind === 'boss') {
      this.bossId = boss.id;
      this.bossSummonTimer = 5;
    }
    this.emit({ type: 'bossSpawned', id: boss.id, kind });
  }

  // ---------------------------------------------------------------- gates

  private updateGates(dt: number, scrollDelta: number): void {
    for (const gate of this.gates) {
      if (!gate.alive) continue;
      gate.prevZ = gate.z;
      gate.z += scrollDelta;
      gate.hitTimer += dt;
      if (gate.prevZ < SQUAD_FRONT_Z && gate.z >= SQUAD_FRONT_Z) {
        if (Math.abs(this.squadX - gate.x) <= gate.width / 2) this.passGate(gate);
      }
      if (gate.z > DESPAWN_Z) gate.alive = false;
    }
  }

  private passGate(gate: Gate): void {
    const before = this.units;
    const next = applyGate(
      {
        units: this.units,
        damageBonus: this.damageBonus,
        fireRateBonus: this.fireRateBonus,
        weapon: this.weapon,
      },
      gate.op,
      gate.value,
      gate.weapon,
    );
    this.units = next.units;
    this.damageBonus = next.damageBonus;
    this.fireRateBonus = next.fireRateBonus;
    this.weapon = next.weapon;
    this.stats.gatesPassed++;
    this.stats.peakUnits = Math.max(this.stats.peakUnits, this.units);
    if (this.units < before) this.stats.unitsLost += before - this.units;
    this.emit({
      type: 'gatePassed',
      op: gate.op,
      value: gate.value,
      weapon: gate.weapon,
      before,
      after: this.units,
      x: gate.x,
    });
    for (const other of this.gates) {
      if (other.pairId === gate.pairId) other.alive = false;
    }
  }

  // ---------------------------------------------------------------- obstacles

  private updateObstacles(dt: number, scrollDelta: number): void {
    for (const obstacle of this.obstacles) {
      if (!obstacle.alive) continue;
      obstacle.prevZ = obstacle.z;
      obstacle.z += scrollDelta;
      obstacle.hitFlash = Math.max(0, obstacle.hitFlash - dt);
      const crossedFront =
        obstacle.prevZ + obstacle.depth / 2 < SQUAD_FRONT_Z &&
        obstacle.z + obstacle.depth / 2 >= SQUAD_FRONT_Z;
      if (crossedFront && this.squadContains(obstacle.x, obstacle.width / 2)) {
        if (obstacle.kind === 'barrel') {
          this.explodeBarrel(obstacle);
          this.loseUnits(Math.max(1, this.units * 0.25), obstacle.x, obstacle.z, 'barrel');
        } else {
          this.loseUnits(
            this.units * this.barrierOverlapFraction(obstacle),
            obstacle.x,
            obstacle.z,
            'barrier',
          );
        }
      }
      if (obstacle.z > DESPAWN_Z) obstacle.alive = false;
    }
  }

  /** Fraction of visible units whose formation slots overlap the barrier. */
  private barrierOverlapFraction(obstacle: Obstacle): number {
    const visible = Math.min(this.units, BALANCE.squad.visibleCap);
    if (visible <= 0) return 0;
    let hit = 0;
    const half = obstacle.width / 2 + 0.3;
    for (let i = 0; i < visible; i++) {
      formationSlot(i, this.units, this.slot);
      if (Math.abs(this.squadX + this.slot.x - obstacle.x) <= half) hit++;
    }
    return hit / visible;
  }

  private explodeBarrel(barrel: Obstacle): void {
    barrel.alive = false;
    this.emit({ type: 'explosion', x: barrel.x, z: barrel.z, radius: BARREL_EXPLOSION_RADIUS });
    this.areaDamage(barrel.x, barrel.z, BARREL_EXPLOSION_RADIUS, BARREL_EXPLOSION_DAMAGE);
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemies(dt: number, scrollDelta: number): void {
    const front = SQUAD_FRONT_Z;
    const back = SQUAD_Z + squadDepth(this.units);
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.prevX = enemy.x;
      enemy.prevZ = enemy.z;
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

      if (enemy.kind === 'boss' || enemy.kind === 'miniboss') {
        this.updateBoss(enemy, dt, scrollDelta);
      } else {
        const holding = enemy.holdZ !== null && enemy.z >= enemy.holdZ;
        if (holding && enemy.holdZ !== null) {
          enemy.z = enemy.holdZ;
        } else {
          enemy.z += scrollDelta + enemy.speed * dt;
        }
        enemy.x += clamp(this.squadX - enemy.x, -1, 1) * enemy.homing * dt * 3;
        enemy.x = clamp(enemy.x, -LANE_HALF_WIDTH + enemy.radius, LANE_HALF_WIDTH - enemy.radius);
        if (ENEMIES[enemy.kind].fireInterval > 0 && enemy.z > -SPAWN_DISTANCE * 0.7) {
          enemy.fireCooldown -= dt;
          if (enemy.fireCooldown <= 0) {
            enemy.fireCooldown = ENEMIES[enemy.kind].fireInterval * this.rng.range(0.8, 1.2);
            this.fireEnemyProjectile(enemy.x, enemy.z + enemy.radius, 1);
          }
        }
      }

      // Contact with the squad.
      if (
        enemy.z + enemy.radius >= front &&
        enemy.z - enemy.radius <= back &&
        this.squadContains(enemy.x, enemy.radius)
      ) {
        this.loseUnits(enemy.crush, enemy.x, enemy.z, enemy.kind);
        this.killEnemy(enemy, true);
        continue;
      }
      if (enemy.z - enemy.radius > back + 1 || enemy.z > DESPAWN_Z) enemy.alive = false;
    }
  }

  private updateBoss(boss: Enemy, dt: number, scrollDelta: number): void {
    const def = ENEMIES[boss.kind];
    const holdZ = boss.holdZ ?? SQUAD_Z - 25;
    if (boss.z < holdZ) {
      boss.z += scrollDelta + Math.max(boss.speed, 6) * dt;
      if (boss.z >= holdZ) {
        boss.z = holdZ;
        if (boss.kind === 'boss') this.scrolling = false;
      }
      return;
    }
    // Arena phase: the boss slowly closes in, faster when wounded.
    const hpFraction = boss.hp / boss.maxHp;
    const phase = hpFraction > 0.66 ? 0 : hpFraction > 0.33 ? 1 : 2;
    if (phase !== boss.phase) {
      boss.phase = phase;
      this.emit({ type: 'bossPhase', id: boss.id, phase });
    }
    boss.z += boss.speed * (1 + phase * 0.6) * dt;
    boss.holdZ = boss.z;
    boss.x += Math.sin(this.stats.elapsed * 0.7 + boss.seed) * dt * (1 + phase);
    boss.x = clamp(boss.x, -LANE_HALF_WIDTH + 1.5, LANE_HALF_WIDTH - 1.5);

    boss.fireCooldown -= dt;
    if (boss.fireCooldown <= 0) {
      boss.fireCooldown = def.fireInterval * (phase === 2 ? 0.6 : 1);
      const volley = boss.kind === 'boss' ? 1 + phase * 2 : 1 + phase;
      for (let i = 0; i < volley; i++) {
        const offset = volley === 1 ? 0 : (i - (volley - 1) / 2) * 1.2;
        this.fireEnemyProjectile(boss.x + offset, boss.z + boss.radius, boss.kind === 'boss' ? 2 : 1);
      }
    }
    if (boss.kind === 'boss' && phase >= 1) {
      this.bossSummonTimer -= dt;
      if (this.bossSummonTimer <= 0) {
        this.bossSummonTimer = phase === 2 ? 4 : 6;
        const count = 6 + phase * 4;
        for (let i = 0; i < count; i++) {
          this.spawnEnemy(
            'runner',
            clamp(boss.x + this.rng.range(-4, 4), -4.5, 4.5),
            boss.z + boss.radius + this.rng.range(0, 3),
            1 + this.level.number * 0.08,
          );
        }
      }
    }
  }

  private fireEnemyProjectile(x: number, z: number, damage: number): void {
    if (this.projectiles.length >= MAX_PROJECTILES) return;
    const dx = this.squadX - x;
    const dz = Math.max(1, SQUAD_Z - z);
    const length = Math.hypot(dx, dz);
    this.projectiles.push({
      id: this.nextId++,
      owner: 'enemy',
      weapon: 'enemy',
      x,
      z,
      prevX: x,
      prevZ: z,
      vx: (dx / length) * ENEMY_PROJECTILE_SPEED,
      vz: (dz / length) * ENEMY_PROJECTILE_SPEED,
      damage,
      pierce: 0,
      aoe: 0,
      life: 6,
      hitIds: null,
      alive: true,
    });
    this.emit({ type: 'enemyShot', x, z });
  }

  private damageEnemy(enemy: Enemy, rawDamage: number, projectile: Projectile | null): void {
    if (!enemy.alive) return;
    let damage = rawDamage;
    if (
      enemy.kind === 'shield' &&
      projectile &&
      (projectile.weapon === 'rifle' || projectile.weapon === 'laser') &&
      Math.abs(projectile.vx) < Math.abs(projectile.vz) * SHIELD_SIDE_SLOPE
    ) {
      // The front shield stops most frontal rifle and laser fire. Spread pellets and rockets
      // get around it, as do shots from the side.
      damage *= 0.2;
    }
    enemy.hp -= damage;
    enemy.hitFlash = 0.08;
    this.emit({ type: 'enemyHit', id: enemy.id, x: enemy.x, z: enemy.z, damage, kind: enemy.kind });
    if (enemy.hp <= 0) this.killEnemy(enemy, false);
  }

  private killEnemy(enemy: Enemy, byContact: boolean): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    const coins = byContact ? 0 : Math.round(enemy.coins * this.modifiers.coinMultiplier);
    if (!byContact) {
      this.stats.kills++;
      this.stats.coins += coins;
    }
    this.emit({
      type: 'enemyKilled',
      id: enemy.id,
      kind: enemy.kind,
      x: enemy.x,
      z: enemy.z,
      coins,
      byContact,
    });
    if (enemy.kind === 'splitter' && !byContact) {
      for (let i = 0; i < 3; i++) {
        const child = this.spawnEnemy('runner', clamp(enemy.x + (i - 1) * 0.9, -4.6, 4.6), enemy.z - 0.3);
        child.hp = child.maxHp = Math.round(enemy.maxHp * 0.22);
      }
    }
    if (enemy.kind === 'boss' && enemy.id === this.bossId) {
      this.bossId = null;
      this.scrolling = true;
      // The boss takes its summoned minions with it.
      for (const other of this.enemies) {
        if (other.alive && other.kind === 'runner') this.killEnemy(other, false);
      }
    }
  }

  private areaDamage(x: number, z: number, radius: number, damage: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const d = Math.hypot(enemy.x - x, enemy.z - z);
      if (d <= radius + enemy.radius)
        this.damageEnemy(enemy, damage * (1 - 0.5 * (d / (radius + enemy.radius))), null);
    }
    for (const obstacle of this.obstacles) {
      if (!obstacle.alive || obstacle.kind !== 'barrel') continue;
      if (Math.hypot(obstacle.x - x, obstacle.z - z) <= radius) {
        obstacle.hp = 0;
        this.explodeBarrel(obstacle);
      }
    }
  }

  // ---------------------------------------------------------------- projectiles

  private updateProjectiles(dt: number): void {
    this.grid.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (enemy?.alive) this.grid.insert(i, enemy.x, enemy.z, enemy.radius);
    }
    const back = SQUAD_Z + squadDepth(this.units);

    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.prevX = p.x;
      p.prevZ = p.z;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      if (p.life <= 0 || Math.abs(p.x) > LANE_HALF_WIDTH + 1) {
        if (p.aoe > 0 && p.life <= 0) this.detonate(p);
        p.alive = false;
        continue;
      }
      if (p.owner === 'enemy') {
        if (p.z >= SQUAD_FRONT_Z && p.z <= back && this.squadContains(p.x, 0.15)) {
          p.alive = false;
          this.loseUnits(p.damage, p.x, p.z, 'projectile');
        } else if (p.z > DESPAWN_Z) {
          p.alive = false;
        }
        continue;
      }
      if (this.hitGate(p) || this.hitObstacle(p)) continue;
      this.hitEnemies(p);
    }
  }

  private hitGate(p: Projectile): boolean {
    for (const gate of this.gates) {
      if (!gate.alive) continue;
      const relPrev = p.prevZ - gate.prevZ;
      const relNow = p.z - gate.z;
      if (relPrev > 0 && relNow <= 0 && Math.abs(p.x - gate.x) <= gate.width / 2) {
        p.alive = false;
        gate.hitTimer = 0;
        this.emit({ type: 'gateHit', id: gate.id, x: p.x, z: gate.z });
        if (addGateHits(gate, p.aoe > 0 ? 3 : 1) > 0)
          this.emit({ type: 'gateStep', id: gate.id, value: gate.value, op: gate.op });
        return true;
      }
    }
    return false;
  }

  private hitObstacle(p: Projectile): boolean {
    for (const obstacle of this.obstacles) {
      if (!obstacle.alive) continue;
      const near = obstacle.z + obstacle.depth / 2;
      if (p.prevZ > near - 0.05 && p.z <= near && Math.abs(p.x - obstacle.x) <= obstacle.width / 2) {
        p.alive = false;
        obstacle.hitFlash = 0.08;
        this.emit({ type: 'obstacleHit', id: obstacle.id, x: p.x, z: near });
        if (obstacle.kind === 'barrel') {
          obstacle.hp -= p.damage;
          if (obstacle.hp <= 0) this.explodeBarrel(obstacle);
        } else if (p.aoe > 0) {
          this.detonate(p);
        }
        return true;
      }
    }
    return false;
  }

  private hitEnemies(p: Projectile): void {
    const midX = (p.x + p.prevX) / 2;
    const midZ = (p.z + p.prevZ) / 2;
    const reach = Math.hypot(p.x - p.prevX, p.z - p.prevZ) / 2 + 3;
    this.grid.query(midX, midZ, reach, (index) => {
      const enemy = this.enemies[index];
      if (!enemy?.alive || !p.alive) return !p.alive;
      if (p.hitIds?.includes(enemy.id)) return false;
      if (
        segmentCircleDistanceSq(p.prevX, p.prevZ, p.x, p.z, enemy.x, enemy.z) >
        enemy.radius * enemy.radius
      ) {
        return false;
      }
      if (p.aoe > 0) {
        p.x = enemy.x;
        p.z = enemy.z;
        this.detonate(p);
        p.alive = false;
        return true;
      }
      this.damageEnemy(enemy, p.damage, p);
      if (p.pierce > 0 && p.hitIds) {
        p.pierce--;
        p.hitIds.push(enemy.id);
        return false;
      }
      p.alive = false;
      return true;
    });
  }

  private detonate(p: Projectile): void {
    this.emit({ type: 'explosion', x: p.x, z: p.z, radius: p.aoe });
    this.areaDamage(p.x, p.z, p.aoe, p.damage);
  }

  // ---------------------------------------------------------------- bookkeeping

  private compact(): void {
    compactInPlace(this.gates);
    compactInPlace(this.enemies);
    compactInPlace(this.projectiles);
    compactInPlace(this.obstacles);
    this.stats.peakUnits = Math.max(this.stats.peakUnits, this.units);
  }

  private checkEnd(): void {
    if (this.units <= 0) {
      this.status = 'lost';
      this.emit({ type: 'levelFailed' });
      return;
    }
    const allSpawned = this.nextSegment >= this.segments.length;
    const hostilesLeft = this.enemies.some((e) => e.alive);
    if (allSpawned && !hostilesLeft && this.distance >= this.level.length && this.bossId === null) {
      this.status = 'won';
      this.emit({ type: 'levelComplete' });
    }
  }

  private emit(event: SimEvent): void {
    this.pendingEvents.push(event);
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function compactInPlace<T extends { alive: boolean }>(items: T[]): void {
  let write = 0;
  for (let read = 0; read < items.length; read++) {
    const item = items[read];
    if (item?.alive) items[write++] = item;
  }
  items.length = write;
}

/** Squared distance from point (cx, cz) to the segment (ax, az)-(bx, bz). */
export function segmentCircleDistanceSq(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  let t = lengthSq > 0 ? ((cx - ax) * dx + (cz - az) * dz) / lengthSq : 0;
  t = clamp(t, 0, 1);
  const px = ax + dx * t - cx;
  const pz = az + dz * t - cz;
  return px * px + pz * pz;
}
