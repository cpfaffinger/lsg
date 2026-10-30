import { stepQuality, type QualityLevel } from './quality.ts';

const WINDOW_SECONDS = 2;
const LOW_FPS = 45;
const HIGH_FPS = 58;

/**
 * Adaptive quality for the "automatic" setting: measures frame rate during gameplay and steps
 * the quality down when the device cannot keep up. It steps up at most once (after a long
 * stretch of headroom) to avoid oscillating between levels.
 */
export class QualityGovernor {
  private elapsed = 0;
  private frames = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private steppedUp = false;
  level: QualityLevel;

  constructor(initial: QualityLevel) {
    this.level = initial;
  }

  reset(level: QualityLevel): void {
    this.level = level;
    this.elapsed = 0;
    this.frames = 0;
    this.slowWindows = 0;
    this.fastWindows = 0;
  }

  /** Feed one rendered frame; returns a new level when a change is recommended. */
  sample(frameDt: number): QualityLevel | null {
    // Ignore hitches (tab switches, GC pauses) that say nothing about sustained performance.
    if (frameDt > 0.25) return null;
    this.elapsed += frameDt;
    this.frames++;
    if (this.elapsed < WINDOW_SECONDS) return null;
    const fps = this.frames / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;
    if (fps < LOW_FPS) {
      this.slowWindows++;
      this.fastWindows = 0;
    } else if (fps > HIGH_FPS) {
      this.fastWindows++;
      this.slowWindows = 0;
    } else {
      this.slowWindows = 0;
      this.fastWindows = 0;
    }
    if (this.slowWindows >= 2 && this.level !== 'low') {
      this.slowWindows = 0;
      this.level = stepQuality(this.level, -1);
      return this.level;
    }
    if (this.fastWindows >= 15 && !this.steppedUp && this.level !== 'ultra') {
      this.steppedUp = true;
      this.fastWindows = 0;
      this.level = stepQuality(this.level, 1);
      return this.level;
    }
    return null;
  }
}
