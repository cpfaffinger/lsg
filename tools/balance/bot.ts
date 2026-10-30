import { FACTOR_STEPS } from '../../apps/game/src/sim/balance.ts';
import { applyGate } from '../../apps/game/src/sim/gates.ts';
import type { LevelDef } from '../../apps/game/src/sim/level.ts';
import { Simulation } from '../../apps/game/src/sim/simulation.ts';
import { DEFAULT_MODIFIERS, type Gate, type RunModifiers } from '../../apps/game/src/sim/types.ts';

const DT = 1 / 60;

/** Value of passing a gate now, measured in "effective units" for a greedy bot. */
function gateScore(sim: Simulation, gate: Gate): number {
  const target = {
    units: sim.units,
    damageBonus: sim.damageBonus,
    fireRateBonus: sim.fireRateBonus,
    weapon: sim.weapon,
  };
  const next = applyGate(target, gate.op, gate.value, gate.weapon);
  const power = (t: typeof target) => t.units * (1 + t.damageBonus / 100) * (1 + t.fireRateBonus / 100);
  return power(next) - power(target);
}

export type BotSkill = 'good' | 'average' | 'poor';

/**
 * Plays a level with a simple strategy. "good" picks the best gate shortly before it arrives,
 * "average" decides earlier (so it cannot react to gate values changing),
 * "poor" picks randomly.
 */
export function playLevel(
  level: LevelDef,
  modifiers: RunModifiers = DEFAULT_MODIFIERS,
  skill: BotSkill = 'good',
  /** Distance at which the bot commits to a gate; varies reaction time between bot variants. */
  goodLookahead = 18,
) {
  const sim = new Simulation(level, modifiers);
  const timeline: { t: number; distance: number; units: number }[] = [];
  const losses: Record<string, number> = {};
  let bossStart = -1;
  let bossSeconds = 0;
  const decided = new Map<number, number>();
  let rngState = level.seed;
  const random = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };
  let lastSample = -1;
  for (let t = 0; t < 600 && sim.status === 'running'; t += DT) {
    const lookahead = skill === 'good' ? goodLookahead : 45;
    const upcoming = sim.gates.filter((g) => g.alive && g.z < 0 && g.z > -lookahead);
    let targetX = 0;
    if (upcoming.length > 0) {
      const pairId = upcoming.reduce((a, b) => (b.z > a.z ? b : a)).pairId;
      const pair = upcoming.filter((g) => g.pairId === pairId);
      let choice = decided.get(pairId);
      if (choice === undefined || skill === 'good') {
        if (skill === 'poor') choice = pair[Math.floor(random() * pair.length)]?.x ?? 0;
        else choice = pair.reduce((a, b) => (gateScore(sim, b) > gateScore(sim, a) ? b : a)).x;
        decided.set(pairId, choice);
      }
      targetX = choice;
    } else {
      // Dodge towards the side with fewer enemies close by.
      const near = sim.enemies.filter((e) => e.alive && e.z > -12 && e.z < 0);
      if (near.length > 0) {
        const avg = near.reduce((s, e) => s + e.x, 0) / near.length;
        targetX = avg > 0 ? -2 : 2;
      }
    }
    // Any player sidesteps walls: move to the free part of the lane when a barrier is close.
    const barrier = sim.obstacles.find((o) => o.alive && o.kind === 'barrier' && o.z > -14 && o.z < 1);
    if (barrier && skill !== 'poor') {
      const clearance = barrier.width / 2 + sim.halfWidth + 0.4;
      const left = barrier.x - clearance;
      const right = barrier.x + clearance;
      const limit = 5 - sim.halfWidth;
      const options = [left, right].filter((x) => Math.abs(x) <= limit);
      if (Math.abs(targetX - barrier.x) < clearance) {
        targetX =
          options.length > 0
            ? options.reduce((a, b) => (Math.abs(b - targetX) < Math.abs(a - targetX) ? b : a))
            : targetX;
      }
    }
    sim.step(DT, { dragWorld: targetX - sim.squadX, axis: 0 });
    for (const event of sim.drainEvents()) {
      if (event.type === 'unitsLost') losses[event.cause] = (losses[event.cause] ?? 0) + event.count;
      if (event.type === 'bossSpawned') bossStart = t;
      if (
        event.type === 'enemyKilled' &&
        (event.kind === 'boss' || event.kind === 'miniboss') &&
        bossStart >= 0
      )
        bossSeconds = t - bossStart;
    }
    const second = Math.floor(t);
    if (second !== lastSample && second % 5 === 0) {
      lastSample = second;
      timeline.push({ t: second, distance: Math.round(sim.distance), units: sim.units });
    }
  }
  return {
    status: sim.status,
    units: sim.units,
    stats: { ...sim.stats },
    distance: Math.round(sim.distance),
    timeline,
    losses,
    bossSeconds,
  };
}

export function describeFactor(index: number): string {
  const f = FACTOR_STEPS[index] ?? 1;
  return f >= 1 ? `x${f}` : `/${Math.round(1 / f)}`;
}
