/** Simulation runs at a fixed rate for deterministic gameplay; rendering interpolates. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** Prevents the "spiral of death" after long frames (tab switch, debugger). */
const MAX_FRAME_TIME = 0.25;

export interface LoopCallbacks {
  /** Advances the simulation by exactly `dt` seconds. */
  update(dt: number): void;
  /** Renders a frame; `alpha` in [0,1) is the interpolation factor between the last two sim steps. */
  render(alpha: number, frameDt: number): void;
}

/**
 * Pure accumulator logic, separated from requestAnimationFrame so it can be unit tested.
 * Returns the number of simulation steps executed.
 */
export class FixedStepAccumulator {
  private accumulator = 0;
  timeScale = 1;

  advance(frameTime: number, step: (dt: number) => void): number {
    this.accumulator += Math.min(frameTime, MAX_FRAME_TIME) * this.timeScale;
    let steps = 0;
    while (this.accumulator >= SIM_DT) {
      step(SIM_DT);
      this.accumulator -= SIM_DT;
      steps++;
    }
    return steps;
  }

  get alpha(): number {
    return this.accumulator / SIM_DT;
  }
}

export class GameLoop {
  private readonly accumulator = new FixedStepAccumulator();
  private lastTime = 0;
  private handle = 0;
  private running = false;
  private readonly callbacks: LoopCallbacks;

  constructor(callbacks: LoopCallbacks) {
    this.callbacks = callbacks;
  }

  set timeScale(value: number) {
    this.accumulator.timeScale = value;
  }

  get timeScale(): number {
    return this.accumulator.timeScale;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.handle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const frameTime = (now - this.lastTime) / 1000;
    this.lastTime = now;
    this.accumulator.advance(frameTime, (dt) => this.callbacks.update(dt));
    this.callbacks.render(this.accumulator.alpha, frameTime);
    this.handle = requestAnimationFrame(this.tick);
  };
}
