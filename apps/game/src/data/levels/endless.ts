import type { LevelDef } from '../../sim/level.ts';
import { hashString } from '../../sim/rng.ts';
import { FEATURE_UNLOCKS } from './campaign.ts';
import { generateLevel, type Feature } from './generator.ts';

/**
 * Endless mode: a very long generated run whose difficulty climbs steadily.
 * Built in chunks so later sections get harder without one huge planning pass.
 */
export function endlessLevel(seedText = 'lsg-endless'): LevelDef {
  const features = new Set<Feature>(FEATURE_UNLOCKS.map((u) => u.feature));
  features.delete('boss');
  features.delete('miniboss');
  const seed = hashString(seedText);
  const segments: LevelDef['segments'] = [];
  let offset = 0;
  let startUnits = 6;
  let power = 1;
  for (let chunk = 0; chunk < 12; chunk++) {
    const part = generateLevel({
      id: `endless-${chunk}`,
      number: 0,
      world: 'station',
      seed: seed + chunk * 7919,
      beats: 6,
      scrollSpeed: 10,
      difficulty: Math.min(0.75, 0.3 + chunk * 0.04),
      features,
      startUnits,
      power,
      finale: chunk % 3 === 2 ? 'miniboss' : 'none',
    });
    for (const segment of part.segments) segments.push({ ...segment, at: segment.at + offset });
    offset += part.length;
    startUnits *= 1.6;
    power *= 1.15;
  }
  return {
    id: 'endless',
    number: 0,
    world: 'station',
    seed,
    scrollSpeed: 10,
    length: offset,
    segments,
  };
}
