import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../core/game-loop.ts';
import { PROTOTYPE_LEVEL } from '../data/levels/prototype.ts';
import { REPLAY_FORMAT, ReplayRecorder, replaySimulation, type ReplayFile } from './replay.ts';
import { Rng } from './rng.ts';
import { Simulation } from './simulation.ts';
import { DEFAULT_MODIFIERS } from './types.ts';

function playRecorded(): { file: ReplayFile; sim: Simulation } {
  const modifiers = { ...DEFAULT_MODIFIERS, startUnits: 12 };
  const sim = new Simulation(PROTOTYPE_LEVEL, modifiers);
  const recorder = new ReplayRecorder(PROTOTYPE_LEVEL, modifiers, SIM_DT);
  const rng = new Rng(7);
  let drag = 0;
  for (let step = 0; step < 60 * 90 && sim.status === 'running'; step++) {
    if (step % 37 === 0) drag = rng.range(-0.08, 0.08);
    const input = { dragWorld: step % 37 < 20 ? drag : 0, axis: step % 200 < 40 ? 1 : 0 };
    sim.step(SIM_DT, input);
    recorder.record(input, sim, sim.drainEvents());
  }
  const file = recorder.build(sim, { gameVersion: 'test', mode: 'custom', client: null });
  return { file: JSON.parse(JSON.stringify(file)) as ReplayFile, sim };
}

describe('replay', () => {
  it('reruns a recorded run to the identical result after a JSON round trip', () => {
    const { file, sim } = playRecorded();
    expect(file.format).toBe(REPLAY_FORMAT);
    const again = replaySimulation(file);
    expect(again.status).toBe(sim.status);
    expect(again.units).toBe(sim.units);
    expect(again.distance).toBe(sim.distance);
    expect(again.stats).toEqual(sim.stats);
  });

  it('packs identical inputs and logs gates and losses', () => {
    const { file } = playRecorded();
    expect(file.inputs.length).toBeLessThan(file.result.steps / 4);
    expect(file.log.some((entry) => entry.type === 'gate')).toBe(true);
    expect(file.timeline.length).toBeGreaterThan(5);
  });
});
