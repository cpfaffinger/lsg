import { createEmptySave, sanitizeSave, type SaveData, type UpgradeId } from '@lsg/shared';
import { get, set } from 'idb-keyval';
import type { RunStats } from '../sim/types.ts';
import { cosmeticById } from './cosmetics.ts';
import { rewardFor, upgradeCost, type RunReward } from './economy.ts';

const IDB_KEY = 'lsg.save.v1';
const LS_KEY = 'lsg.save.v1';

type Listener = (save: SaveData) => void;

/**
 * Local player progress. IndexedDB is the primary store (robust, large); localStorage is a
 * fallback for browsers or modes where IndexedDB is unavailable. Every change bumps the
 * revision so the cloud sync can detect conflicts.
 */
export class ProgressStore {
  private save: SaveData = createEmptySave();
  private readonly listeners = new Set<Listener>();
  private persistTimer: number | null = null;

  async load(): Promise<void> {
    let raw: unknown = await get(IDB_KEY).catch(() => null);
    if (!raw) {
      try {
        const text = localStorage.getItem(LS_KEY);
        raw = text ? JSON.parse(text) : null;
      } catch {
        raw = null;
      }
    }
    this.save = raw ? sanitizeSave(raw) : createEmptySave();
    this.notify();
  }

  get data(): Readonly<SaveData> {
    return this.save;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replaces the whole save (used by cloud sync). */
  replace(save: SaveData): void {
    this.save = sanitizeSave(save);
    this.persist();
    this.notify();
  }

  private mutate(change: (save: SaveData) => void): void {
    const next = structuredClone(this.save);
    change(next);
    next.revision += 1;
    next.updatedAt = new Date().toISOString();
    this.save = next;
    this.persist();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.save);
  }

  private persist(): void {
    if (this.persistTimer !== null) return;
    // Coalesce bursts of changes into one write.
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      const snapshot = this.save;
      set(IDB_KEY, snapshot).catch(() => undefined);
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
      } catch {
        // Quota exceeded or blocked: IndexedDB copy still exists.
      }
    }, 50);
  }

  recordCampaignRun(
    levelNumber: number,
    won: boolean,
    finalUnits: number,
    stats: RunStats,
    coinMultiplier: number,
  ): RunReward {
    const reward = rewardFor(this.save, levelNumber, won, finalUnits, stats, coinMultiplier);
    this.mutate((save) => {
      const key = String(levelNumber);
      const record = save.levels[key] ?? { stars: 0, bestUnits: 0, completions: 0 };
      if (won) {
        record.completions += 1;
        record.stars = Math.max(record.stars, reward.stars);
        record.bestUnits = Math.max(record.bestUnits, finalUnits);
        save.levels[key] = record;
        save.stats.wins += 1;
      }
      save.coins += reward.total;
      save.totalCoinsEarned += reward.total;
      save.stats.runs += 1;
      save.stats.kills += stats.kills;
      save.stats.playSeconds += Math.round(stats.elapsed);
    });
    return reward;
  }

  recordEndlessRun(distance: number, stats: RunStats): { coins: number; newBest: boolean } {
    const newBest = distance > this.save.endlessBest;
    const coins = stats.coins;
    this.mutate((save) => {
      save.endlessBest = Math.max(save.endlessBest, Math.round(distance));
      save.coins += coins;
      save.totalCoinsEarned += coins;
      save.stats.runs += 1;
      save.stats.kills += stats.kills;
      save.stats.playSeconds += Math.round(stats.elapsed);
    });
    return { coins, newBest };
  }

  buyUpgrade(id: UpgradeId): boolean {
    const cost = upgradeCost(id, this.save.upgrades[id]);
    if (cost === null || this.save.coins < cost) return false;
    this.mutate((save) => {
      save.coins -= cost;
      save.upgrades[id] += 1;
    });
    return true;
  }

  buyCosmetic(id: string, starCount: number): boolean {
    const def = cosmeticById(id);
    if (def.id !== id || this.save.cosmetics.owned.includes(id)) return false;
    const byStars = def.starsRequired !== null && starCount >= def.starsRequired;
    if (!byStars && (def.cost <= 0 || this.save.coins < def.cost)) return false;
    this.mutate((save) => {
      if (!byStars) save.coins -= def.cost;
      save.cosmetics.owned.push(id);
      save.cosmetics.selected = id;
    });
    return true;
  }

  selectCosmetic(id: string): void {
    if (!this.save.cosmetics.owned.includes(id)) return;
    this.mutate((save) => {
      save.cosmetics.selected = id;
    });
  }

  /** Wipes local progress (settings → reset). */
  reset(): void {
    this.save = createEmptySave();
    this.persist();
    this.notify();
  }
}
