/**
 * Player progress ("save game"). Shared by the game client (local guest saves) and the API
 * (cloud saves for signed-in players), so both validate and merge with the same rules.
 */

export const SAVE_VERSION = 1;
/** Hard limit for a serialized save; protects the API from oversized payloads. */
export const MAX_SAVE_BYTES = 64 * 1024;

export const UPGRADE_IDS = ['squad', 'damage', 'fireRate', 'coins', 'speed'] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];

export const UPGRADE_MAX_LEVEL: Record<UpgradeId, number> = {
  squad: 12,
  damage: 20,
  fireRate: 15,
  coins: 10,
  speed: 5,
};

export const WEAPON_IDS = ['rifle', 'spread', 'laser', 'rocket'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];
/** Every player owns this weapon. */
export const DEFAULT_WEAPON: WeaponId = 'rifle';

export interface LevelRecord {
  stars: number;
  bestUnits: number;
  completions: number;
}

export interface SaveStats {
  runs: number;
  wins: number;
  kills: number;
  playSeconds: number;
}

export interface SaveData {
  version: number;
  /** Increases with every local change; used to detect sync conflicts. */
  revision: number;
  coins: number;
  totalCoinsEarned: number;
  upgrades: Record<UpgradeId, number>;
  /** Keyed by campaign level number ("1".."30"). */
  levels: Record<string, LevelRecord>;
  endlessBest: number;
  cosmetics: { owned: string[]; selected: string };
  /** Weapons bought in the shop; `selected` is what the squad starts a run with. */
  weapons: { owned: WeaponId[]; selected: WeaponId };
  stats: SaveStats;
  /** ISO timestamp of the last change. */
  updatedAt: string;
}

export const DEFAULT_COSMETIC = 'classic';

export function createEmptySave(now = new Date()): SaveData {
  return {
    version: SAVE_VERSION,
    revision: 0,
    coins: 0,
    totalCoinsEarned: 0,
    upgrades: { squad: 0, damage: 0, fireRate: 0, coins: 0, speed: 0 },
    levels: {},
    endlessBest: 0,
    cosmetics: { owned: [DEFAULT_COSMETIC], selected: DEFAULT_COSMETIC },
    weapons: { owned: [DEFAULT_WEAPON], selected: DEFAULT_WEAPON },
    stats: { runs: 0, wins: 0, kills: 0, playSeconds: 0 },
    updatedAt: now.toISOString(),
  };
}

const COSMETIC_ID = /^[a-z0-9-]{1,32}$/;

function int(value: unknown, min: number, max: number, fallback = min): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isWeaponId(value: unknown): value is WeaponId {
  return WEAPON_IDS.includes(value as WeaponId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Turns untrusted input into a valid save: unknown fields are dropped and every number is
 * clamped. Never throws; garbage becomes an empty save.
 */
export function sanitizeSave(input: unknown): SaveData {
  const base = createEmptySave();
  if (!isRecord(input)) return base;
  const save = base;
  save.revision = int(input.revision, 0, Number.MAX_SAFE_INTEGER);
  save.coins = int(input.coins, 0, 1e12);
  save.totalCoinsEarned = int(input.totalCoinsEarned, 0, 1e13);
  save.endlessBest = int(input.endlessBest, 0, 1e9);

  if (isRecord(input.upgrades)) {
    for (const id of UPGRADE_IDS) save.upgrades[id] = int(input.upgrades[id], 0, UPGRADE_MAX_LEVEL[id]);
  }
  if (isRecord(input.levels)) {
    for (const [key, raw] of Object.entries(input.levels)) {
      const n = Number(key);
      if (!Number.isInteger(n) || n < 1 || n > 999 || !isRecord(raw)) continue;
      save.levels[String(n)] = {
        stars: int(raw.stars, 0, 3),
        bestUnits: int(raw.bestUnits, 0, 1e7),
        completions: int(raw.completions, 0, 1e7),
      };
    }
  }
  if (isRecord(input.cosmetics)) {
    const owned = Array.isArray(input.cosmetics.owned)
      ? input.cosmetics.owned.filter((id): id is string => typeof id === 'string' && COSMETIC_ID.test(id))
      : [];
    save.cosmetics.owned = Array.from(new Set([DEFAULT_COSMETIC, ...owned])).slice(0, 64);
    const selected = input.cosmetics.selected;
    save.cosmetics.selected =
      typeof selected === 'string' && save.cosmetics.owned.includes(selected) ? selected : DEFAULT_COSMETIC;
  }
  if (isRecord(input.weapons)) {
    const owned = Array.isArray(input.weapons.owned) ? input.weapons.owned.filter(isWeaponId) : [];
    save.weapons.owned = WEAPON_IDS.filter((id) => id === DEFAULT_WEAPON || owned.includes(id));
    const selected = input.weapons.selected;
    save.weapons.selected =
      isWeaponId(selected) && save.weapons.owned.includes(selected) ? selected : DEFAULT_WEAPON;
  }
  if (isRecord(input.stats)) {
    save.stats = {
      runs: int(input.stats.runs, 0, 1e9),
      wins: int(input.stats.wins, 0, 1e9),
      kills: int(input.stats.kills, 0, 1e12),
      playSeconds: int(input.stats.playSeconds, 0, 1e10),
    };
  }
  if (typeof input.updatedAt === 'string' && !Number.isNaN(Date.parse(input.updatedAt))) {
    save.updatedAt = new Date(input.updatedAt).toISOString();
  }
  return save;
}

/** Highest campaign level the player may start (one after the best completed level). */
export function unlockedLevel(save: SaveData): number {
  let highest = 0;
  for (const [key, record] of Object.entries(save.levels)) {
    if (record.completions > 0) highest = Math.max(highest, Number(key));
  }
  return highest + 1;
}

export function totalStars(save: SaveData): number {
  return Object.values(save.levels).reduce((sum, record) => sum + record.stars, 0);
}

export type MergeMode =
  /** First sign-in on a device that has guest progress: coins from both sides are added. */
  | 'import'
  /** Two devices diverged: progress takes the maximum, coins follow the newer save. */
  | 'conflict';

/**
 * Merges two saves without losing progress. Level records, upgrades, cosmetics and stats take
 * the best of both sides.
 */
export function mergeSaves(a: SaveData, b: SaveData, mode: MergeMode): SaveData {
  const newer = Date.parse(a.updatedAt) >= Date.parse(b.updatedAt) ? a : b;
  const merged = createEmptySave();
  merged.revision = Math.max(a.revision, b.revision) + 1;
  merged.coins = mode === 'import' ? a.coins + b.coins : newer.coins;
  merged.totalCoinsEarned =
    mode === 'import'
      ? a.totalCoinsEarned + b.totalCoinsEarned
      : Math.max(a.totalCoinsEarned, b.totalCoinsEarned);
  merged.endlessBest = Math.max(a.endlessBest, b.endlessBest);
  for (const id of UPGRADE_IDS) merged.upgrades[id] = Math.max(a.upgrades[id], b.upgrades[id]);
  for (const key of new Set([...Object.keys(a.levels), ...Object.keys(b.levels)])) {
    const ra = a.levels[key];
    const rb = b.levels[key];
    merged.levels[key] = {
      stars: Math.max(ra?.stars ?? 0, rb?.stars ?? 0),
      bestUnits: Math.max(ra?.bestUnits ?? 0, rb?.bestUnits ?? 0),
      completions: Math.max(ra?.completions ?? 0, rb?.completions ?? 0),
    };
  }
  merged.cosmetics.owned = Array.from(new Set([...a.cosmetics.owned, ...b.cosmetics.owned]));
  merged.cosmetics.selected = newer.cosmetics.selected;
  merged.weapons.owned = WEAPON_IDS.filter(
    (id) => a.weapons.owned.includes(id) || b.weapons.owned.includes(id),
  );
  merged.weapons.selected = newer.weapons.selected;
  merged.stats = {
    runs: Math.max(a.stats.runs, b.stats.runs),
    wins: Math.max(a.stats.wins, b.stats.wins),
    kills: Math.max(a.stats.kills, b.stats.kills),
    playSeconds: Math.max(a.stats.playSeconds, b.stats.playSeconds),
  };
  merged.updatedAt = new Date().toISOString();
  return merged;
}

/** True if the save contains anything worth keeping. */
export function hasProgress(save: SaveData): boolean {
  return save.stats.runs > 0 || save.coins > 0 || Object.keys(save.levels).length > 0;
}
