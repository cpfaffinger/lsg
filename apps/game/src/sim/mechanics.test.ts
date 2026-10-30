import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../core/game-loop.ts';
import type { LevelDef, Segment } from './level.ts';
import { Simulation } from './simulation.ts';
import { DEFAULT_MODIFIERS, type SimEvent, type WeaponId } from './types.ts';

function level(segments: Segment[], length = 200): LevelDef {
  return { id: 'm', number: 1, world: 'desert', seed: 7, scrollSpeed: 9, length, segments };
}

function run(sim: Simulation, seconds: number, targetX = 0): SimEvent[] {
  const events: SimEvent[] = [];
  for (let t = 0; t < seconds && sim.status === 'running'; t += SIM_DT) {
    sim.step(SIM_DT, { dragWorld: targetX - sim.squadX, axis: 0 });
    events.push(...sim.drainEvents());
  }
  return events;
}

const units = (n: number) => ({ ...DEFAULT_MODIFIERS, startUnits: n });

describe('enemy mechanics', () => {
  it('shooters stop at range and fire at the squad', () => {
    const sim = new Simulation(
      level([{ type: 'wave', at: 60, groups: [{ kind: 'shooter', count: 1, hpScale: 1000 }] }]),
      units(30),
    );
    const events = run(sim, 12);
    const shooter = sim.enemies.find((e) => e.kind === 'shooter');
    expect(shooter?.z).toBeCloseTo(-26, 0);
    expect(events.some((e) => e.type === 'enemyShot')).toBe(true);
    expect(events.some((e) => e.type === 'unitsLost')).toBe(true);
  });

  it('runners wound the squad instead of trading one for one', () => {
    const sim = new Simulation(
      level([{ type: 'wave', at: 40, groups: [{ kind: 'runner', count: 10, hpScale: 1000 }] }]),
      units(40),
    );
    const events = run(sim, 8);
    const lost = events.reduce((sum, e) => sum + (e.type === 'unitsLost' ? e.count : 0), 0);
    expect(lost).toBeGreaterThan(0);
    expect(lost).toBeLessThanOrEqual(4);
  });

  it('tiny squads fire faster per soldier than big ones', () => {
    const shotsPerSoldier = (count: number) => {
      const sim = new Simulation(
        level([{ type: 'wave', at: 40, groups: [{ kind: 'tank', count: 1, hpScale: 1000 }] }]),
        units(count),
      );
      const events = run(sim, 4);
      return events.filter((e) => e.type === 'shot').length / count;
    };
    expect(shotsPerSoldier(3)).toBeGreaterThan(shotsPerSoldier(12) * 1.3);
  });

  it('splitters break into runners when shot', () => {
    const sim = new Simulation(
      level([{ type: 'wave', at: 50, groups: [{ kind: 'splitter', count: 1 }] }]),
      units(10),
    );
    const events = run(sim, 10);
    const kills = events.filter((e) => e.type === 'enemyKilled');
    expect(kills.filter((e) => e.type === 'enemyKilled' && e.kind === 'splitter')).toHaveLength(1);
    expect(
      kills.filter((e) => e.type === 'enemyKilled' && e.kind === 'runner').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('shields absorb most straight rifle damage but not spread shots', () => {
    const damageWith = (weapon: WeaponId) => {
      const sim = new Simulation(
        level([
          { type: 'gates', at: 5, gates: [{ op: 'weapon', value: 0, weapon }] },
          { type: 'wave', at: 70, groups: [{ kind: 'shield', count: 1, hpScale: 1000 }] },
        ]),
        units(5),
      );
      const events = run(sim, 9);
      return events.reduce((sum, e) => (e.type === 'enemyHit' ? sum + e.damage : sum), 0);
    };
    const rifle = damageWith('rifle');
    const spread = damageWith('spread');
    expect(rifle).toBeGreaterThan(0);
    expect(spread).toBeGreaterThan(rifle);
  });

  it('a boss stops the lane, changes phases, summons minions and can be defeated', () => {
    const sim = new Simulation(level([{ type: 'boss', at: 40, kind: 'boss', hpScale: 0.3 }], 40), units(150));
    const events = run(sim, 120);
    expect(events.some((e) => e.type === 'bossSpawned')).toBe(true);
    expect(events.filter((e) => e.type === 'bossPhase').length).toBeGreaterThanOrEqual(2);
    expect(events.some((e) => e.type === 'enemyKilled' && e.kind === 'boss')).toBe(true);
    expect(sim.status).toBe('won');
  });

  it('a boss that reaches the squad wipes it out', () => {
    const sim = new Simulation(level([{ type: 'boss', at: 40, kind: 'boss', hpScale: 100 }], 40), units(3));
    run(sim, 240);
    expect(sim.status).toBe('lost');
  });
});

describe('obstacles and weapons', () => {
  it('barrels explode when shot and damage nearby enemies', () => {
    const sim = new Simulation(
      level([
        { type: 'obstacle', at: 60, kind: 'barrel', x: 0 },
        { type: 'wave', at: 62, groups: [{ kind: 'tank', count: 1, x: 0, hpScale: 10 }] },
      ]),
      units(20),
    );
    const events = run(sim, 6);
    expect(events.some((e) => e.type === 'explosion')).toBe(true);
  });

  it('barriers kill the units that run into them', () => {
    const sim = new Simulation(
      level([{ type: 'obstacle', at: 30, kind: 'barrier', x: 0, width: 3 }], 60),
      units(40),
    );
    run(sim, 8, 0);
    expect(sim.units).toBeLessThan(40);
    expect(sim.units).toBeGreaterThan(0);
  });

  it('dodging a barrier keeps the squad intact', () => {
    const sim = new Simulation(
      level([{ type: 'obstacle', at: 30, kind: 'barrier', x: -3, width: 3 }], 60),
      units(5),
    );
    run(sim, 8, 3);
    expect(sim.units).toBe(5);
  });

  it('rockets deal area damage and lasers pierce', () => {
    for (const weapon of ['rocket', 'laser'] as WeaponId[]) {
      const sim = new Simulation(
        level([
          { type: 'gates', at: 5, gates: [{ op: 'weapon', value: 0, weapon }] },
          { type: 'wave', at: 60, groups: [{ kind: 'runner', count: 30, pattern: 'grid', width: 4 }] },
        ]),
        units(10),
      );
      const events = run(sim, 9);
      expect(sim.weapon).toBe(weapon);
      if (weapon === 'rocket') expect(events.some((e) => e.type === 'explosion')).toBe(true);
      expect(events.filter((e) => e.type === 'enemyKilled').length).toBeGreaterThan(5);
    }
  });
});
