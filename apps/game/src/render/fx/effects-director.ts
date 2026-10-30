import { AdditiveBlending, NormalBlending, type Scene } from 'three';
import type { QualitySettings } from '../../core/quality.ts';
import { formatCompact } from '../../i18n/i18n.ts';
import { FACTOR_STEPS } from '../../sim/balance.ts';
import { isGateBeneficial } from '../../sim/gates.ts';
import type { WorldId } from '../../sim/level.ts';
import type { Simulation } from '../../sim/simulation.ts';
import type { EnemyKind, SimEvent, WeaponId } from '../../sim/types.ts';
import type { CameraRig } from '../camera-rig.ts';
import { ENEMY_COLORS, PALETTE } from '../palette.ts';
import { DebrisSystem } from './debris-system.ts';
import { FloatingText } from './floating-text.ts';
import { GroundFx } from './ground-fx.ts';
import { ParticleSystem, type ParticleSpawn } from './particle-system.ts';

const DEBRIS_COUNT: Record<EnemyKind, number> = {
  runner: 5,
  shooter: 7,
  shield: 8,
  splitter: 9,
  tank: 16,
  miniboss: 30,
  boss: 60,
};

/** Enemy kinds whose individual hits show damage numbers (runners would only add clutter). */
const MUZZLE_COLORS: Record<WeaponId, number> = {
  rifle: 0xffd27a,
  spread: 0xff9a3c,
  laser: 0x36f5ff,
  rocket: 0xff6a3c,
};

const SHOW_DAMAGE: ReadonlySet<EnemyKind> = new Set([
  'tank',
  'shield',
  'splitter',
  'miniboss',
  'boss',
  'shooter',
]);

function rgb(hex: number, intensity = 1): { r: number; g: number; b: number } {
  // sRGB -> approximately linear, scaled for HDR glow.
  const toLinear = (c: number) => Math.pow(c / 255, 2.2) * intensity;
  return { r: toLinear((hex >> 16) & 255), g: toLinear((hex >> 8) & 255), b: toLinear(hex & 255) };
}

/**
 * Turns simulation events into visual feedback: muzzle flashes, sparks, smoke, debris,
 * floating numbers and camera shake. All effects are pooled and budgeted by quality.
 */
export class EffectsDirector {
  private readonly glow: ParticleSystem;
  private readonly smoke: ParticleSystem;
  private readonly debris: DebrisSystem;
  private readonly text: FloatingText;
  private readonly rig: CameraRig;
  private readonly pendingDamage = new Map<number, { x: number; z: number; amount: number; age: number }>();
  private muzzleBudget = 0;
  reducedMotion = false;

  private readonly ground: GroundFx;
  private world: WorldId = 'desert';
  private ambientTimer = 0;
  private trailTimer = 0;
  /** Skin colour of the squad, used for the shards of lost soldiers. */
  squadColor: number = PALETTE.squad;
  /** Effects scheduled for later (boss death chain explosions). */
  private readonly delayed: { at: number; run: () => void }[] = [];
  private clock = 0;
  /** Called for hits that deserve a chromatic-aberration pulse (0..1). */
  onPulse: ((amount: number) => void) | null = null;

  constructor(scene: Scene, rig: CameraRig, quality: QualitySettings) {
    this.rig = rig;
    this.glow = new ParticleSystem(scene, 20000, AdditiveBlending, 0.8);
    this.smoke = new ParticleSystem(scene, 4000, NormalBlending, 0.9);
    this.debris = new DebrisSystem(scene, 1200);
    this.text = new FloatingText(scene);
    this.ground = new GroundFx(scene);
    this.applyQuality(quality);
  }

  /** A chain of explosions across the boss's body after the killing blow. */
  private bossDeath(x: number, z: number): void {
    for (let i = 1; i <= 7; i++) {
      this.delayed.push({
        at: this.clock + i * 0.1,
        run: () => {
          const ox = x + (Math.random() - 0.5) * 4;
          const oy = 1 + Math.random() * 5;
          const oz = z + (Math.random() - 0.5) * 2;
          this.flash(ox, oy, oz, 0xffb347, 5, 0.2, 6);
          this.sparks(ox, oy, oz, 20, 0xff6a1a, 10, 4);
          this.puff(ox, oy, oz, 4, 0x2e2a30, 3);
          this.debris.burst(ox, oy, oz, 10, 0x3a0f2a, 8, 0.45);
          this.shake(0.4);
        },
      });
    }
    this.delayed.push({
      at: this.clock + 0.85,
      run: () => {
        this.ground.shockwave(x, z, 22, 0xff2050, 5, 1);
        this.flash(x, 3, z, 0xffffff, 18, 0.35, 6);
        this.onPulse?.(1);
        this.shake(1.2);
      },
    });
  }

  setWorld(world: WorldId): void {
    this.world = world;
  }

  /** Atmospheric particles around the visible lane: dust, rain or floating sparks. */
  private ambient(dt: number): void {
    this.ambientTimer += dt;
    const interval = this.world === 'city' ? 0.008 : 0.05;
    while (this.ambientTimer >= interval) {
      this.ambientTimer -= interval;
      const x = (Math.random() - 0.5) * 30;
      const z = -Math.random() * 70 + 6;
      if (this.world === 'desert') {
        this.smoke.spawn({
          x,
          y: Math.random() * 1.5,
          z,
          vx: 2 + Math.random() * 2,
          vy: 0.1,
          vz: 0.5,
          life: 2.5,
          sizeStart: 0.6,
          sizeEnd: 1.6,
          ...rgb(0xe8c48e, 1),
          alpha: 0.18,
        });
      } else if (this.world === 'city') {
        this.glow.spawn({
          x,
          y: 6 + Math.random() * 6,
          z,
          vx: -0.6,
          vy: -26,
          vz: 0,
          life: 0.35,
          sizeStart: 0.05,
          sizeEnd: 0.05,
          ...rgb(0x9fb4ff, 0.6),
          alpha: 0.6,
        });
      } else {
        this.glow.spawn({
          x,
          y: 0.5 + Math.random() * 5,
          z,
          vx: 0,
          vy: 0.3,
          vz: 0.2,
          life: 3,
          sizeStart: 0.08,
          sizeEnd: 0.02,
          ...rgb(0x5ff3ff, 2.5),
        });
      }
    }
  }

  /** Smoke trails behind rockets and a glow core on laser bolts. */
  trails(sim: Simulation, dt: number): void {
    this.trailTimer += dt;
    if (this.trailTimer < 0.03) return;
    this.trailTimer = 0;
    let budget = 40;
    for (const p of sim.projectiles) {
      if (!p.alive || p.owner !== 'squad' || budget <= 0) continue;
      if (p.weapon === 'rocket') {
        budget--;
        this.smoke.spawn({
          x: p.x,
          y: 0.75,
          z: p.z + 0.4,
          vx: (Math.random() - 0.5) * 0.4,
          vy: 0.4,
          vz: 0,
          life: 0.6,
          sizeStart: 0.25,
          sizeEnd: 0.8,
          ...rgb(0xb0a8a0, 1),
          alpha: 0.45,
        });
        this.flash(p.x, 0.75, p.z + 0.3, 0xffa040, 0.6, 0.05, 4);
      }
    }
  }

  applyQuality(quality: QualitySettings): void {
    this.glow.budget = quality.particleBudget;
    this.smoke.budget = Math.round(quality.particleBudget / 5);
    this.debris.budget = Math.round(Math.min(1200, quality.particleBudget / 8));
  }

  clear(): void {
    this.delayed.length = 0;
    this.ground.clear();
    this.glow.clear();
    this.smoke.clear();
    this.debris.clear();
    this.text.clear();
    this.pendingDamage.clear();
  }

  private sparks(
    x: number,
    y: number,
    z: number,
    count: number,
    hex: number,
    speed: number,
    intensity = 3,
  ): void {
    const c = rgb(hex, intensity);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      this.glow.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * speed * (0.3 + Math.random()),
        vy: speed * (0.2 + up),
        vz: Math.sin(a) * speed * (0.3 + Math.random()),
        life: 0.18 + Math.random() * 0.22,
        sizeStart: 0.22,
        sizeEnd: 0.04,
        ...c,
        gravity: 18,
        drag: 3,
      });
    }
  }

  private puff(
    x: number,
    y: number,
    z: number,
    count: number,
    hex: number,
    size: number,
    alpha = 0.55,
  ): void {
    const c = rgb(hex, 1);
    for (let i = 0; i < count; i++) {
      const spawn: ParticleSpawn = {
        x: x + (Math.random() - 0.5) * size * 0.6,
        y: y + Math.random() * size * 0.3,
        z: z + (Math.random() - 0.5) * size * 0.6,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 0.8 + Math.random() * 1.4,
        vz: (Math.random() - 0.5) * 1.5,
        life: 0.7 + Math.random() * 0.6,
        sizeStart: size * 0.5,
        sizeEnd: size * 1.6,
        ...c,
        alpha,
        drag: 1.5,
      };
      this.smoke.spawn(spawn);
    }
  }

  private flash(
    x: number,
    y: number,
    z: number,
    hex: number,
    size: number,
    life: number,
    intensity = 4,
  ): void {
    this.glow.spawn({
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      vz: 0,
      life,
      sizeStart: size,
      sizeEnd: size * 0.4,
      ...rgb(hex, intensity),
    });
  }

  private shake(amount: number): void {
    if (!this.reducedMotion) this.rig.shake(amount);
  }

  handle(events: SimEvent[], squadX: number): void {
    // Muzzle flashes are capped per frame: with big squads hundreds of shots happen per second.
    this.muzzleBudget = 24;
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          if (this.muzzleBudget-- > 0) {
            const color = MUZZLE_COLORS[event.weapon];
            this.flash(event.x, 0.78, event.z - 0.5, color, 0.8, 0.06, 4);
          }
          break;
        case 'enemyShot':
          this.flash(event.x, 0.9, event.z, PALETTE.enemyProjectile, 1.1, 0.12, 4);
          break;
        case 'enemyHit': {
          this.sparks(event.x, 0.8, event.z + 0.3, 2, 0xffe08a, 4);
          if (SHOW_DAMAGE.has(event.kind)) {
            const pending = this.pendingDamage.get(event.id);
            if (pending) {
              pending.amount += event.damage;
              pending.x = event.x;
              pending.z = event.z;
            } else {
              this.pendingDamage.set(event.id, { x: event.x, z: event.z, amount: event.damage, age: 0 });
            }
          }
          break;
        }
        case 'enemyKilled': {
          const color = ENEMY_COLORS[event.kind];
          const big = event.kind === 'boss' || event.kind === 'miniboss' || event.kind === 'tank';
          this.debris.burst(
            event.x,
            0.5,
            event.z,
            DEBRIS_COUNT[event.kind],
            color,
            big ? 7 : 4.5,
            big ? 0.4 : 0.22,
          );
          this.flash(event.x, 0.8, event.z, 0xffffff, big ? 4 : 1.4, 0.12, 3);
          if (big) {
            this.ground.shockwave(
              event.x,
              event.z,
              event.kind === 'boss' ? 14 : event.kind === 'miniboss' ? 8 : 3,
              color,
              4,
              0.7,
            );
            this.ground.scorchMark(event.x, event.z, event.kind === 'boss' ? 5 : 2);
            this.onPulse?.(event.kind === 'boss' ? 1 : 0.5);
          }
          if (event.kind === 'boss') this.bossDeath(event.x, event.z);
          this.sparks(event.x, 0.8, event.z, big ? 30 : 6, color, big ? 9 : 5, 4);
          if (big) {
            this.puff(event.x, 0.8, event.z, 12, 0x3a3540, 2.5);
            this.shake(event.kind === 'boss' ? 1.2 : 0.4);
          }
          if (event.coins > 0 && big)
            this.text.spawn(`+${event.coins}`, event.x, 2.5, event.z, 0xffd84a, 0.9, 1);
          break;
        }
        case 'gateHit':
          this.sparks(event.x, 1.2 + Math.random() * 1.2, event.z + 0.2, 2, 0xd8f4ff, 3, 2.5);
          break;
        case 'gateStep':
          break;
        case 'gatePassed': {
          const good = isGateBeneficial(event.op, event.value);
          const color =
            event.op === 'weapon' ? PALETTE.gateWeapon : good ? PALETTE.gateGood : PALETTE.gateBad;
          this.ground.shockwave(event.x, 0, 5, color, 3, 0.5);
          for (let i = 0; i < 40; i++) {
            const a = (i / 40) * Math.PI * 2;
            this.glow.spawn({
              x: event.x + Math.cos(a) * 0.5,
              y: 0.6,
              z: Math.sin(a) * 0.5,
              vx: Math.cos(a) * 7,
              vy: 1 + Math.random() * 2,
              vz: Math.sin(a) * 7,
              life: 0.45,
              sizeStart: 0.35,
              sizeEnd: 0.05,
              ...rgb(color, 3),
              drag: 4,
            });
          }
          if (event.after > event.before) {
            this.sparks(squadX, 1, -1, Math.min(36, 8 + event.after - event.before), color, 6, 3);
          }
          const label = this.gatePassLabel(event);
          if (label) this.text.spawn(label, event.x, 2.6, 0, good ? 0x5dff9b : 0xff6474, 1.3, 1.1, 2.5);
          if (!good) this.shake(0.25);
          break;
        }
        case 'unitsLost':
          this.debris.burst(
            event.x,
            0.5,
            event.z,
            Math.min(16, 2 + event.count * 2),
            this.squadColor,
            4,
            0.18,
          );
          if (event.count >= 5) this.onPulse?.(Math.min(0.6, event.count * 0.04));
          this.text.spawn(`−${formatCompact(event.count)}`, event.x, 2, event.z, 0xff5468, 0.9, 0.8);
          this.shake(Math.min(0.45, 0.06 + event.count * 0.02));
          break;
        case 'explosion': {
          const r = event.radius;
          this.ground.shockwave(event.x, event.z, r, 0xffa040, 3.5);
          this.ground.scorchMark(event.x, event.z, r);
          this.onPulse?.(0.35);
          this.flash(event.x, 1, event.z, 0xffb347, r * 2.6, 0.18, 5);
          for (let i = 0; i < 26; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = r * (1.5 + Math.random() * 2.5);
            this.glow.spawn({
              x: event.x,
              y: 0.6,
              z: event.z,
              vx: Math.cos(a) * s,
              vy: 1 + Math.random() * 4,
              vz: Math.sin(a) * s,
              life: 0.35 + Math.random() * 0.3,
              sizeStart: r * 0.7,
              sizeEnd: r * 0.15,
              ...rgb(i % 3 === 0 ? 0xffe066 : 0xff6a1a, 3.5),
              drag: 3,
            });
          }
          this.puff(event.x, 0.8, event.z, 10, 0x2e2a30, r * 1.4, 0.6);
          this.debris.burst(event.x, 0.4, event.z, 8, 0x3a3033, 6, 0.25);
          this.shake(0.35);
          break;
        }
        case 'obstacleHit':
          this.sparks(event.x, 0.9, event.z, 2, 0xc8d0e0, 3, 2);
          break;
        case 'bossSpawned':
          this.shake(0.8);
          break;
        case 'bossPhase':
          this.shake(0.6);
          break;
        case 'levelComplete':
          for (const color of [0x36e27a, 0x3fa9ff, 0xffd84a, 0xff5ab0]) {
            this.debris.burst(squadX, 1.5, -1, 18, color, 9, 0.16);
          }
          break;
        case 'levelFailed':
          this.shake(0.6);
          break;
      }
    }
  }

  private gatePassLabel(event: Extract<SimEvent, { type: 'gatePassed' }>): string | null {
    switch (event.op) {
      case 'units':
        return event.value >= 0 ? `+${event.value}` : `−${Math.abs(event.value)}`;
      case 'factor': {
        const f = FACTOR_STEPS[event.value] ?? 1;
        return f >= 1 ? `×${f}` : `÷${Math.round(1 / f)}`;
      }
      case 'damage':
      case 'fireRate':
        return event.value >= 0 ? `+${event.value}%` : `−${Math.abs(event.value)}%`;
      case 'weapon':
        return null;
    }
  }

  update(dt: number, scrollDz: number): void {
    for (const [id, pending] of this.pendingDamage) {
      pending.age += dt;
      if (pending.age >= 0.15) {
        this.text.spawn(
          formatCompact(Math.round(pending.amount)),
          pending.x + (Math.random() - 0.5) * 0.6,
          2.4,
          pending.z,
          0xffffff,
          0.65,
          0.6,
          3,
        );
        this.pendingDamage.delete(id);
      }
    }
    this.clock += dt;
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const item = this.delayed[i];
      if (item && item.at <= this.clock) {
        this.delayed.splice(i, 1);
        item.run();
      }
    }
    this.ambient(dt);
    this.ground.update(dt, scrollDz);
    this.smoke.scroll(scrollDz);
    this.glow.update(dt);
    this.smoke.update(dt);
    this.debris.update(dt, scrollDz);
    this.text.update(dt, scrollDz);
  }
}
