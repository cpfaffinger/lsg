import { UPGRADE_MAX_LEVEL, type SaveData, type UpgradeId, type WeaponId } from '@lsg/shared';
import { DEFAULT_MODIFIERS, type RunModifiers, type RunStats } from '../sim/types.ts';

export interface UpgradeDef {
  id: UpgradeId;
  maxLevel: number;
  baseCost: number;
  growth: number;
  /** Effect per level, used for display ("+8 %"). */
  perLevel: number;
  unit: 'units' | 'percent';
}

/** Permanent upgrades bought with in-game coins only. Kept deliberately flat: no grind wall. */
export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  squad: {
    id: 'squad',
    maxLevel: UPGRADE_MAX_LEVEL.squad,
    baseCost: 60,
    growth: 1.42,
    perLevel: 1,
    unit: 'units',
  },
  damage: {
    id: 'damage',
    maxLevel: UPGRADE_MAX_LEVEL.damage,
    baseCost: 45,
    growth: 1.3,
    perLevel: 8,
    unit: 'percent',
  },
  fireRate: {
    id: 'fireRate',
    maxLevel: UPGRADE_MAX_LEVEL.fireRate,
    baseCost: 55,
    growth: 1.33,
    perLevel: 6,
    unit: 'percent',
  },
  coins: {
    id: 'coins',
    maxLevel: UPGRADE_MAX_LEVEL.coins,
    baseCost: 80,
    growth: 1.45,
    perLevel: 10,
    unit: 'percent',
  },
  speed: {
    id: 'speed',
    maxLevel: UPGRADE_MAX_LEVEL.speed,
    baseCost: 70,
    growth: 1.6,
    perLevel: 8,
    unit: 'percent',
  },
};

/** Coin price of a permanent start weapon; gates still hand out every weapon for free. */
export const WEAPON_PRICES: Record<WeaponId, number> = {
  rifle: 0,
  spread: 300,
  laser: 900,
  rocket: 1800,
};

export function upgradeCost(id: UpgradeId, currentLevel: number): number | null {
  const def = UPGRADES[id];
  if (currentLevel >= def.maxLevel) return null;
  return Math.round((def.baseCost * Math.pow(def.growth, currentLevel)) / 5) * 5;
}

/** Turns purchased upgrades into simulation modifiers for the next run. */
export function modifiersFor(save: SaveData): RunModifiers {
  const u = save.upgrades;
  return {
    startUnits: DEFAULT_MODIFIERS.startUnits + u.squad * UPGRADES.squad.perLevel,
    damageMultiplier: 1 + (u.damage * UPGRADES.damage.perLevel) / 100,
    fireRateMultiplier: 1 + (u.fireRate * UPGRADES.fireRate.perLevel) / 100,
    moveSpeedMultiplier: 1 + (u.speed * UPGRADES.speed.perLevel) / 100,
    coinMultiplier: 1 + (u.coins * UPGRADES.coins.perLevel) / 100,
    startWeapon: save.weapons.selected,
  };
}

/**
 * Stars for a won level: one for finishing, two for keeping most of the squad,
 * three for an almost flawless run.
 */
export function starsFor(won: boolean, finalUnits: number, peakUnits: number): number {
  if (!won) return 0;
  const kept = finalUnits / Math.max(1, peakUnits);
  if (kept >= 0.85) return 3;
  if (kept >= 0.5) return 2;
  return 1;
}

export interface RunReward {
  coinsFromKills: number;
  completionBonus: number;
  starBonus: number;
  total: number;
  stars: number;
  firstClear: boolean;
  newStars: number;
}

/** Coins and stars earned by a finished campaign run. */
export function rewardFor(
  save: SaveData,
  levelNumber: number,
  won: boolean,
  finalUnits: number,
  stats: RunStats,
  coinMultiplier: number,
): RunReward {
  const record = save.levels[String(levelNumber)];
  const stars = starsFor(won, finalUnits, stats.peakUnits);
  const firstClear = won && (record?.completions ?? 0) === 0;
  const previousStars = record?.stars ?? 0;
  const newStars = Math.max(0, stars - previousStars);
  const completionBonus = won
    ? Math.round((firstClear ? 40 + levelNumber * 12 : 10 + levelNumber * 3) * coinMultiplier)
    : 0;
  const starBonus = Math.round(newStars * (15 + levelNumber * 4) * coinMultiplier);
  const coinsFromKills = stats.coins;
  return {
    coinsFromKills,
    completionBonus,
    starBonus,
    total: coinsFromKills + completionBonus + starBonus,
    stars,
    firstClear,
    newStars,
  };
}
