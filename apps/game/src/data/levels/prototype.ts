import { FACTOR_NEUTRAL_INDEX } from '../../sim/balance.ts';
import type { LevelDef } from '../../sim/level.ts';

/** Hand-built prototype level used for the M1 core-loop test. */
export const PROTOTYPE_LEVEL: LevelDef = {
  id: 'prototype',
  number: 1,
  world: 'desert',
  seed: 1337,
  scrollSpeed: 9,
  length: 560,
  segments: [
    {
      type: 'gates',
      at: 40,
      gates: [
        { op: 'units', value: 3 },
        { op: 'units', value: -2 },
      ],
    },
    { type: 'wave', at: 85, groups: [{ kind: 'runner', count: 12, pattern: 'grid', width: 6 }] },
    {
      type: 'gates',
      at: 125,
      gates: [
        { op: 'factor', value: FACTOR_NEUTRAL_INDEX + 1 },
        { op: 'units', value: 4 },
      ],
    },
    { type: 'wave', at: 170, groups: [{ kind: 'runner', count: 24, pattern: 'grid', hpScale: 1.2 }] },
    {
      type: 'gates',
      at: 215,
      gates: [
        { op: 'units', value: -6 },
        { op: 'factor', value: FACTOR_NEUTRAL_INDEX - 1 },
      ],
    },
    {
      type: 'wave',
      at: 260,
      groups: [
        { kind: 'tank', count: 1, x: 0, hpScale: 1.8 },
        { kind: 'runner', count: 24, pattern: 'wedge', hpScale: 1.2 },
      ],
    },
    {
      type: 'gates',
      at: 305,
      gates: [
        { op: 'damage', value: 10 },
        { op: 'fireRate', value: 10 },
      ],
    },
    { type: 'wave', at: 345, groups: [{ kind: 'runner', count: 50, pattern: 'grid', hpScale: 1.5 }] },
    {
      type: 'gates',
      at: 390,
      gates: [
        { op: 'factor', value: FACTOR_NEUTRAL_INDEX },
        { op: 'units', value: 1 },
      ],
    },
    {
      type: 'wave',
      at: 440,
      groups: [
        { kind: 'tank', count: 3, pattern: 'line', width: 6, hpScale: 2 },
        { kind: 'runner', count: 60, pattern: 'scatter', hpScale: 2 },
      ],
    },
    { type: 'wave', at: 505, groups: [{ kind: 'runner', count: 90, pattern: 'grid', hpScale: 3 }] },
  ],
};
