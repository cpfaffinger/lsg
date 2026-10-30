import { createEmptySave } from '@lsg/shared';
import { describe, expect, it } from 'vitest';
import { modifiersFor, rewardFor, starsFor, upgradeCost } from './economy.ts';

const stats = {
  kills: 100,
  coins: 120,
  peakUnits: 50,
  unitsLost: 10,
  gatesPassed: 6,
  elapsed: 80,
  bestCombo: 30,
};

describe('economy', () => {
  it('prices upgrades on a growing curve and stops at the max level', () => {
    const first = upgradeCost('damage', 0) ?? 0;
    const tenth = upgradeCost('damage', 9) ?? 0;
    expect(first).toBeGreaterThan(0);
    expect(tenth).toBeGreaterThan(first * 5);
    expect(upgradeCost('speed', 5)).toBeNull();
  });

  it('turns upgrades into run modifiers', () => {
    const save = createEmptySave();
    save.upgrades.squad = 4;
    save.upgrades.damage = 5;
    const mods = modifiersFor(save);
    expect(mods.startUnits).toBe(7);
    expect(mods.damageMultiplier).toBeCloseTo(1.4);
  });

  it('awards stars by kept squad share', () => {
    expect(starsFor(false, 10, 10)).toBe(0);
    expect(starsFor(true, 9, 10)).toBe(3);
    expect(starsFor(true, 6, 10)).toBe(2);
    expect(starsFor(true, 1, 10)).toBe(1);
  });

  it('gives a first-clear bonus only once and pays only new stars', () => {
    const save = createEmptySave();
    const first = rewardFor(save, 3, true, 45, stats, 1);
    expect(first.firstClear).toBe(true);
    expect(first.newStars).toBe(3);
    save.levels['3'] = { stars: 3, bestUnits: 45, completions: 1 };
    const again = rewardFor(save, 3, true, 45, stats, 1);
    expect(again.firstClear).toBe(false);
    expect(again.starBonus).toBe(0);
    expect(again.total).toBeLessThan(first.total);
  });

  it('pays only kill coins for a lost run', () => {
    const reward = rewardFor(createEmptySave(), 3, false, 0, stats, 1);
    expect(reward.total).toBe(stats.coins);
  });
});
