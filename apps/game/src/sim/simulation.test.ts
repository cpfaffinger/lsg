import { describe, expect, it } from 'vitest';
import { PROTOTYPE_LEVEL } from '../data/levels/prototype.ts';
import { SIM_DT } from '../core/game-loop.ts';
import type { LevelDef } from './level.ts';
import { segmentCircleDistanceSq, Simulation } from './simulation.ts';
import { DEFAULT_MODIFIERS } from './types.ts';

const idle = { dragWorld: 0, axis: 0 };

function runToEnd(sim: Simulation, steer: (sim: Simulation) => number = () => 0, maxSeconds = 400): void {
  for (let t = 0; t < maxSeconds && sim.status === 'running'; t += SIM_DT) {
    const target = steer(sim);
    sim.step(SIM_DT, { dragWorld: target - sim.squadX, axis: 0 });
  }
}

describe('Simulation', () => {
  it('fires from every soldier of a squad of seven', () => {
    const sim = new Simulation(PROTOTYPE_LEVEL, { ...DEFAULT_MODIFIERS, startUnits: 7 });
    const slots = new Set<number>();
    for (let t = 0; t < 3; t += SIM_DT) {
      sim.step(SIM_DT, idle);
      for (const event of sim.drainEvents()) if (event.type === 'shot') slots.add(event.slot);
    }
    expect(slots.size).toBe(7);
  });

  it('passes the gate the squad is aligned with', () => {
    const level: LevelDef = {
      id: 't',
      number: 0,
      world: 'desert',
      seed: 1,
      scrollSpeed: 10,
      length: 30,
      segments: [
        {
          type: 'gates',
          at: 20,
          gates: [
            { op: 'units', value: 7 },
            { op: 'units', value: -1 },
          ],
        },
      ],
    };
    const sim = new Simulation(level, {
      startUnits: 3,
      damageMultiplier: 0,
      fireRateMultiplier: 1,
      moveSpeedMultiplier: 1,
      coinMultiplier: 1,
    });
    runToEnd(sim, () => -2.5);
    expect(sim.status).toBe('won');
    // The gate started at +7 and grew a little from being shot on the way in.
    expect(sim.units).toBeGreaterThanOrEqual(10);
    expect(sim.stats.gatesPassed).toBe(1);
  });

  it('loses when enemies overrun a tiny squad', () => {
    const level: LevelDef = {
      id: 't',
      number: 0,
      world: 'desert',
      seed: 2,
      scrollSpeed: 10,
      length: 60,
      segments: [
        { type: 'wave', at: 30, groups: [{ kind: 'tank', count: 3, pattern: 'line', hpScale: 50 }] },
      ],
    };
    const sim = new Simulation(level);
    runToEnd(sim);
    expect(sim.status).toBe('lost');
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'levelFailed')).toBe(true);
  });

  it('shooting raises gate values', () => {
    const level: LevelDef = {
      id: 't',
      number: 0,
      world: 'desert',
      seed: 3,
      scrollSpeed: 6,
      length: 80,
      segments: [{ type: 'gates', at: 70, gates: [{ op: 'units', value: -5 }] }],
    };
    const sim = new Simulation(level, {
      startUnits: 20,
      damageMultiplier: 1,
      fireRateMultiplier: 1,
      moveSpeedMultiplier: 1,
      coinMultiplier: 1,
    });
    runToEnd(sim);
    expect(sim.units).toBeGreaterThan(20);
  });

  it('a sensible strategy clears the prototype level', () => {
    const sim = new Simulation(PROTOTYPE_LEVEL);
    // Greedy steering: head for the gate that currently gives the most units, else centre.
    runToEnd(sim, (s) => {
      const upcoming = s.gates.filter((g) => g.alive && g.z < 0 && g.z > -40);
      if (upcoming.length === 0) return 0;
      const score = (g: (typeof upcoming)[number]) =>
        g.op === 'units' ? g.value : g.op === 'factor' ? (g.value - 2) * s.units : 1;
      const best = upcoming.reduce((a, b) => (score(b) > score(a) ? b : a));
      return best.x;
    });
    expect(sim.status).toBe('won');
    expect(sim.stats.kills).toBeGreaterThan(100);
  });

  it('is deterministic for the same seed and inputs', () => {
    const a = new Simulation(PROTOTYPE_LEVEL);
    const b = new Simulation(PROTOTYPE_LEVEL);
    for (let i = 0; i < 2000; i++) {
      const input = { dragWorld: Math.sin(i / 50) * 0.05, axis: 0 };
      a.step(SIM_DT, input);
      b.step(SIM_DT, input);
    }
    expect(a.units).toBe(b.units);
    expect(a.stats).toEqual(b.stats);
    expect(a.squadX).toBe(b.squadX);
  });

  it('idle input keeps the squad centred', () => {
    const sim = new Simulation(PROTOTYPE_LEVEL);
    sim.step(SIM_DT, idle);
    expect(sim.squadX).toBe(0);
  });
});

describe('segmentCircleDistanceSq', () => {
  it('measures the closest approach of a moving projectile', () => {
    expect(segmentCircleDistanceSq(0, 0, 0, -10, 1, -5)).toBeCloseTo(1);
    expect(segmentCircleDistanceSq(0, 0, 0, -10, 0, -12)).toBeCloseTo(4);
  });
});
