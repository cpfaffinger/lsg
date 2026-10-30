import type { GateSpec } from './gates.ts';
import type { EnemyKind, ObstacleKind } from './types.ts';

export type WorldId = 'desert' | 'city' | 'station';

export type WavePattern = 'grid' | 'line' | 'scatter' | 'column' | 'wedge';

export interface WaveGroup {
  kind: EnemyKind;
  count: number;
  pattern?: WavePattern;
  /** Multiplies the base HP of the enemy kind. */
  hpScale?: number;
  /** Centre of the group across the lane; default 0. */
  x?: number;
  /** Width of the group across the lane; default: full lane. */
  width?: number;
}

export type Segment =
  | { type: 'gates'; at: number; gates: GateSpec[] }
  | { type: 'wave'; at: number; groups: WaveGroup[] }
  | { type: 'obstacle'; at: number; kind: ObstacleKind; x: number; width?: number; hp?: number }
  | { type: 'boss'; at: number; kind: 'boss' | 'miniboss'; hpScale?: number; variant?: number };

export interface LevelDef {
  id: string;
  /** 1-based campaign number; 0 for endless or test levels. */
  number: number;
  world: WorldId;
  seed: number;
  scrollSpeed: number;
  /** Distance after which the level ends once all enemies are gone (if there is no boss). */
  length: number;
  segments: Segment[];
}
