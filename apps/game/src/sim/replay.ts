import type { LevelDef } from './level.ts';
import { Simulation, type StepInput } from './simulation.ts';
import type { RunModifiers, RunStats, SimEvent, WeaponId } from './types.ts';

export const REPLAY_FORMAT = 'lsg-replay';
export const REPLAY_VERSION = 1;

/** Consecutive simulation steps with identical input: [steps, dragWorld, axis]. */
export type InputRun = [number, number, number];

export interface ReplaySample {
  /** Seconds since the start of the run. */
  t: number;
  distance: number;
  units: number;
  squadX: number;
  weapon: WeaponId;
  damageBonus: number;
  fireRateBonus: number;
  enemies: number;
  projectiles: number;
  kills: number;
  coins: number;
}

export type ReplayLogEntry = { t: number; distance: number; squadX: number } & (
  | {
      type: 'gate';
      op: string;
      value: number;
      weapon: WeaponId | null;
      gateX: number;
      passed: number;
      result: number;
      before: number;
      after: number;
    }
  | { type: 'loss'; cause: string; count: number; unitsAfter: number }
  | { type: 'boss'; kind: string }
  | { type: 'bossDefeated'; kind: string }
  | { type: 'end'; status: string }
);

export interface ReplayClientInfo {
  userAgent: string;
  viewport: [number, number];
  devicePixelRatio: number;
  quality: string;
  locale: string;
  averageFps: number;
  /** Share of frames slower than 30 FPS. */
  slowFrameShare: number;
}

/** Everything needed to rerun a played level step by step and to read what happened in it. */
export interface ReplayFile {
  format: typeof REPLAY_FORMAT;
  version: typeof REPLAY_VERSION;
  gameVersion: string;
  createdAt: string;
  mode: string;
  /** The level as it was played, so a replay survives later balance changes. */
  level: LevelDef;
  modifiers: RunModifiers;
  dt: number;
  inputs: InputRun[];
  result: { status: string; units: number; distance: number; steps: number; stats: RunStats };
  timeline: ReplaySample[];
  log: ReplayLogEntry[];
  client: ReplayClientInfo | null;
}

const SAMPLE_INTERVAL = 1;

/** Records one run while it is played. Costs next to nothing: a few numbers per step. */
export class ReplayRecorder {
  private readonly level: LevelDef;
  private readonly modifiers: RunModifiers;
  private readonly dt: number;
  private readonly inputs: InputRun[] = [];
  private readonly timeline: ReplaySample[] = [];
  private readonly log: ReplayLogEntry[] = [];
  private steps = 0;
  private nextSample = 0;
  private closed = false;

  constructor(level: LevelDef, modifiers: RunModifiers, dt: number) {
    this.level = level;
    this.modifiers = modifiers;
    this.dt = dt;
  }

  /** Call once per step, after the simulation advanced, with the events of that step. */
  record(input: StepInput, sim: Simulation, events: readonly SimEvent[]): void {
    if (this.closed) return;
    this.steps++;
    const last = this.inputs[this.inputs.length - 1];
    if (last && last[1] === input.dragWorld && last[2] === input.axis) last[0]++;
    else this.inputs.push([1, input.dragWorld, input.axis]);

    for (const event of events) this.logEvent(event, sim);
    if (sim.stats.elapsed >= this.nextSample) {
      this.nextSample += SAMPLE_INTERVAL;
      this.sample(sim);
    }
    if (sim.status !== 'running') {
      this.closed = true;
      this.sample(sim);
    }
  }

  private sample(sim: Simulation): void {
    this.timeline.push({
      t: round(sim.stats.elapsed),
      distance: round(sim.distance),
      units: sim.units,
      squadX: round(sim.squadX),
      weapon: sim.weapon,
      damageBonus: sim.damageBonus,
      fireRateBonus: sim.fireRateBonus,
      enemies: sim.enemies.filter((e) => e.alive).length,
      projectiles: sim.projectiles.length,
      kills: sim.stats.kills,
      coins: sim.stats.coins,
    });
  }

  private logEvent(event: SimEvent, sim: Simulation): void {
    const base = { t: round(sim.stats.elapsed), distance: round(sim.distance), squadX: round(sim.squadX) };
    switch (event.type) {
      case 'gatePassed':
        this.log.push({
          ...base,
          type: 'gate',
          op: event.op,
          value: event.value,
          weapon: event.weapon,
          gateX: event.x,
          passed: event.passed,
          result: event.result,
          before: event.before,
          after: event.after,
        });
        break;
      case 'unitsLost':
        this.log.push({
          ...base,
          type: 'loss',
          cause: event.cause,
          count: event.count,
          unitsAfter: sim.units,
        });
        break;
      case 'bossSpawned':
        this.log.push({ ...base, type: 'boss', kind: event.kind });
        break;
      case 'enemyKilled':
        if (event.kind === 'boss' || event.kind === 'miniboss')
          this.log.push({ ...base, type: 'bossDefeated', kind: event.kind });
        break;
      case 'levelComplete':
      case 'levelFailed':
        this.log.push({ ...base, type: 'end', status: event.type });
        break;
      default:
        break;
    }
  }

  build(
    sim: Simulation,
    meta: { gameVersion: string; mode: string; client: ReplayClientInfo | null },
  ): ReplayFile {
    return {
      format: REPLAY_FORMAT,
      version: REPLAY_VERSION,
      gameVersion: meta.gameVersion,
      createdAt: new Date().toISOString(),
      mode: meta.mode,
      level: this.level,
      modifiers: this.modifiers,
      dt: this.dt,
      inputs: this.inputs,
      result: {
        status: sim.status,
        units: sim.units,
        distance: sim.distance,
        steps: this.steps,
        stats: { ...sim.stats },
      },
      timeline: this.timeline,
      log: this.log,
      client: meta.client,
    };
  }
}

/** Reruns a recorded run. Same code version and same engine give the identical result. */
export function replaySimulation(file: ReplayFile): Simulation {
  const sim = new Simulation(file.level, file.modifiers);
  for (const [steps, dragWorld, axis] of file.inputs) {
    for (let i = 0; i < steps; i++) sim.step(file.dt, { dragWorld, axis });
  }
  sim.drainEvents();
  return sim;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
