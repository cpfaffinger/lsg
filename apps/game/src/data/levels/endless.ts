import type { LevelDef } from '../../sim/level.ts';
import { hashString } from '../../sim/rng.ts';
import { FEATURE_UNLOCKS } from './campaign.ts';
import { generateLevel, type Feature } from './generator.ts';

/** Long enough that nobody reaches the end: the rising pressure ends every run first. */
const CHUNKS = 24;
/** Campaign level whose mechanics the first chunk uses, and how many levels each chunk adds. */
const FIRST_LEVEL_SHOWN = 8;
const LEVELS_PER_CHUNK = 3;
const PRESSURE_PER_CHUNK = 1.8;

/**
 * Endless mode: a very long generated run whose difficulty climbs steadily.
 * Built in chunks so later sections get harder without one huge planning pass.
 */
export function endlessLevel(seedText = 'lsg-endless'): LevelDef {
  const seed = hashString(seedText);
  const segments: LevelDef['segments'] = [];
  let offset = 0;
  let startUnits = 6;
  let power = 1;
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    // The run opens like the early campaign and adds a mechanic every few hundred metres.
    const reached = FIRST_LEVEL_SHOWN + chunk * LEVELS_PER_CHUNK;
    const features = new Set<Feature>(
      FEATURE_UNLOCKS.filter((u) => u.level <= reached && u.feature !== 'boss' && u.feature !== 'miniboss').map(
        (u) => u.feature,
      ),
    );
    const part = generateLevel({
      id: `endless-${chunk}`,
      number: 0,
      world: 'station',
      seed: seed + chunk * 7919,
      beats: 6,
      scrollSpeed: 10,
      difficulty: 0.25 + chunk * 0.06,
      features,
      startUnits,
      power,
      finale: chunk % 3 === 2 ? 'miniboss' : 'none',
    });
    // Enemies count on an ever smaller squad, so they outgrow any squad sooner or later.
    const pressure = PRESSURE_PER_CHUNK ** chunk;
    const planned = (units: number | undefined) => Math.max(1, (units ?? 1) / pressure);
    for (const segment of part.segments) {
      const at = segment.at + offset;
      if (segment.type === 'wave') {
        const groups = segment.groups.map((g) => ({ ...g, expectedUnits: planned(g.expectedUnits) }));
        segments.push({ ...segment, at, groups });
      } else if (segment.type === 'boss') {
        segments.push({ ...segment, at, expectedUnits: planned(segment.expectedUnits) });
      } else {
        segments.push({ ...segment, at });
      }
    }
    offset += part.length;
    startUnits *= 1.9;
    power *= 1.3;
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
