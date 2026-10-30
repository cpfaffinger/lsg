import type { LevelDef, Segment } from '../../sim/level.ts';

/**
 * Worst-case scene for performance measurements: dense waves of every enemy kind,
 * meant to be played with a large starting squad (see Game.debugStartLevel).
 */
function buildSegments(): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < 12; i++) {
    const at = 40 + i * 30;
    segments.push({
      type: 'wave',
      at,
      groups: [
        { kind: 'runner', count: 90, pattern: 'grid', hpScale: 8 },
        { kind: 'tank', count: 2, pattern: 'line', width: 6, hpScale: 6 },
        { kind: 'shooter', count: 4, pattern: 'line', hpScale: 4 },
      ],
    });
    if (i % 3 === 1) {
      segments.push({ type: 'obstacle', at: at + 12, kind: 'barrel', x: (i % 2) * 6 - 3 });
    }
  }
  return segments;
}

export const STRESS_LEVEL: LevelDef = {
  id: 'stress',
  number: 0,
  world: 'city',
  seed: 4242,
  scrollSpeed: 9,
  length: 420,
  segments: buildSegments(),
};
