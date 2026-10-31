import { expectedLoadout } from '../../apps/game/src/data/levels/campaign.ts';
import { FACTOR_STEPS } from '../../apps/game/src/sim/balance.ts';
import { resolveGatePass } from '../../apps/game/src/sim/gates.ts';
import type { LevelDef } from '../../apps/game/src/sim/level.ts';
import { Simulation } from '../../apps/game/src/sim/simulation.ts';
import { DEFAULT_MODIFIERS, type Gate, type RunModifiers } from '../../apps/game/src/sim/types.ts';

const DT = 1 / 60;

/** What a player who spends their coins brings to a campaign level. */
export function expectedModifiers(level: number): RunModifiers {
  const loadout = expectedLoadout(level);
  return {
    ...DEFAULT_MODIFIERS,
    startUnits: loadout.startUnits,
    damageMultiplier: loadout.damage,
    fireRateMultiplier: loadout.fireRate,
  };
}

/** Value of walking through a gate pair at squad position `x`, in "effective units". */
function passScore(sim: Simulation, pair: readonly Gate[], x: number): number {
  const target = sim.gateTarget();
  const { next } = resolveGatePass(target, x, pair);
  const power = (t: typeof target) => t.units * (1 + t.damageBonus / 100) * (1 + t.fireRateBonus / 100);
  return power(next) - power(target);
}

/** Best steering target for a gate pair: straight through either gate, the middle or an edge. */
function bestGateX(sim: Simulation, pair: readonly Gate[]): number {
  const limit = 5 - sim.halfWidth;
  const options = [...pair.map((g) => g.x), 0, -limit, limit].map((x) =>
    Math.max(-limit, Math.min(limit, x)),
  );
  return options.reduce((a, b) => (passScore(sim, pair, b) > passScore(sim, pair, a) ? b : a));
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
  /**
   * Distance at which the bot commits to a gate; varies reaction time between bot variants.
   * Defaults: 18 for "good", 45 for "average".
   */
  lookaheadOverride?: number,
) {
  const sim = new Simulation(level, modifiers);
  const timeline: { t: number; distance: number; units: number }[] = [];
  const losses: Record<string, number> = {};
  let bossStart = -1;
  let bossSeconds = 0;
  const decided = new Map<number, number>();
  let rngState = level.seed + (lookaheadOverride ?? 0);
  const random = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };
  let lastSample = -1;
  let step = 0;
  for (let t = 0; t < 600 && sim.status === 'running'; t += DT, step++) {
    const lookahead = lookaheadOverride ?? (skill === 'good' ? 18 : 45);
    const upcoming = sim.gates.filter((g) => g.alive && g.z < 0 && g.z > -lookahead);
    let targetX = 0;
    if (upcoming.length > 0) {
      const pairId = upcoming.reduce((a, b) => (b.z > a.z ? b : a)).pairId;
      const pair = upcoming.filter((g) => g.pairId === pairId);
      let choice = decided.get(pairId);
      // Good players keep correcting; re-evaluating a few times per second is enough for that.
      if (choice === undefined || (skill === 'good' && step % 6 === 0)) {
        if (skill === 'poor') choice = pair[Math.floor(random() * pair.length)]?.x ?? 0;
        else choice = bestGateX(sim, pair);
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
    // Dragon fire flies straight down the lane in a wall; any player heads for the opening.
    const flames = sim.projectiles
      .filter((p) => p.alive && p.owner === 'enemy' && p.vx === 0 && p.z > -16 && p.z < 1)
      .map((p) => p.x)
      .sort((a, b) => a - b);
    if (flames.length > 2 && skill !== 'poor') {
      let best = 0;
      let opening = 0;
      [-5, ...flames, 5].forEach((x, i, all) => {
        const width = (all[i + 1] ?? x) - x;
        if (width > best) {
          best = width;
          opening = x + width / 2;
        }
      });
      targetX = opening;
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
