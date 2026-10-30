import type { LevelDef, WorldId } from '../../sim/level.ts';
import { hashString } from '../../sim/rng.ts';
import { generateLevel, type Feature } from './generator.ts';
import { CAMPAIGN_BOSS_HP, CAMPAIGN_DIFFICULTY } from './tuning.ts';

export const CAMPAIGN_LENGTH = 30;
export const LEVELS_PER_WORLD = 10;

/** Level at which each mechanic is introduced. The level that unlocks it showcases it. */
export const FEATURE_UNLOCKS: { level: number; feature: Feature }[] = [
  { level: 2, feature: 'factor' },
  { level: 3, feature: 'spread' },
  { level: 4, feature: 'percent' },
  { level: 4, feature: 'tank' },
  { level: 5, feature: 'barrel' },
  { level: 5, feature: 'miniboss' },
  { level: 6, feature: 'shooter' },
  { level: 7, feature: 'laser' },
  { level: 8, feature: 'splitter' },
  { level: 9, feature: 'barrier' },
  { level: 10, feature: 'boss' },
  { level: 11, feature: 'rocket' },
  { level: 12, feature: 'shield' },
];

export function worldOf(levelNumber: number): WorldId {
  if (levelNumber <= LEVELS_PER_WORLD) return 'desert';
  if (levelNumber <= LEVELS_PER_WORLD * 2) return 'city';
  return 'station';
}

/** Expected upgrade progress at a given level, used to size the challenge. */
export function expectedLoadout(levelNumber: number): { startUnits: number; power: number } {
  const progress = levelNumber - 1;
  return {
    startUnits: 3 + Math.floor(progress / 3),
    power: 1 + progress * 0.08,
  };
}

/** Untuned starting point for the difficulty search (see tools/balance/tune.ts). */
export function baseDifficulty(levelNumber: number): number {
  const indexInWorld = (levelNumber - 1) % LEVELS_PER_WORLD;
  const worldIndex = Math.floor((levelNumber - 1) / LEVELS_PER_WORLD);
  return Math.min(0.62, 0.24 + indexInWorld * 0.025 + worldIndex * 0.08);
}

const cache = new Map<number, LevelDef>();

/**
 * Builds campaign level `levelNumber` (1-based). Difficulty comes from the tuning table that
 * tools/balance/tune.ts generates; pass `difficulty` to override it while tuning.
 */
export function campaignLevel(levelNumber: number, difficulty?: number, bossHpScale?: number): LevelDef {
  const n = Math.min(CAMPAIGN_LENGTH, Math.max(1, Math.floor(levelNumber)));
  const tuning = difficulty === undefined && bossHpScale === undefined;
  const cached = tuning ? cache.get(n) : undefined;
  if (cached) return cached;

  const features = new Set<Feature>();
  let spotlight: Feature | undefined;
  for (const unlock of FEATURE_UNLOCKS) {
    if (unlock.level <= n) features.add(unlock.feature);
    if (unlock.level === n && unlock.feature !== 'miniboss' && unlock.feature !== 'boss')
      spotlight = unlock.feature;
  }
  // Bosses only appear as finales; everything else is a regular mechanic.
  features.delete('boss');
  features.delete('miniboss');

  const isBoss = n % LEVELS_PER_WORLD === 0;
  const isMiniboss = n % LEVELS_PER_WORLD === 5;
  const indexInWorld = (n - 1) % LEVELS_PER_WORLD;
  const worldIndex = Math.floor((n - 1) / LEVELS_PER_WORLD);
  const loadout = expectedLoadout(n);

  const level = generateLevel({
    id: `campaign-${n}`,
    number: n,
    world: worldOf(n),
    seed: hashString(`lsg-campaign-${n}`),
    beats: n === 1 ? 5 : Math.min(12, 6 + Math.floor(indexInWorld / 2) + worldIndex),
    scrollSpeed: 9 + worldIndex * 0.6 + indexInWorld * 0.05,
    difficulty: difficulty ?? CAMPAIGN_DIFFICULTY[n - 1] ?? baseDifficulty(n),
    features,
    startUnits: loadout.startUnits,
    power: loadout.power,
    finale: isBoss ? 'boss' : isMiniboss ? 'miniboss' : 'none',
    spotlight,
    bossHpScale: bossHpScale ?? CAMPAIGN_BOSS_HP[n],
  });
  if (tuning) cache.set(n, level);
  return level;
}
