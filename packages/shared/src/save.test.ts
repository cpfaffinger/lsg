import { describe, expect, it } from 'vitest';
import { createEmptySave, hasProgress, mergeSaves, sanitizeSave, totalStars, unlockedLevel } from './save.ts';

describe('sanitizeSave', () => {
  it('turns garbage into an empty save', () => {
    expect(sanitizeSave('nope').coins).toBe(0);
    expect(sanitizeSave(null).levels).toEqual({});
  });

  it('clamps values and drops invalid entries', () => {
    const save = sanitizeSave({
      coins: -5,
      upgrades: { squad: 999, damage: 2.7, hack: 5 },
      levels: { '3': { stars: 9, bestUnits: 50, completions: 1 }, abc: { stars: 1 }, '0': {} },
      cosmetics: { owned: ['neon', '<script>'], selected: 'gold' },
      updatedAt: 'not a date',
    });
    expect(save.coins).toBe(0);
    expect(save.upgrades.squad).toBe(12);
    expect(save.upgrades.damage).toBe(2);
    expect(Object.keys(save.levels)).toEqual(['3']);
    expect(save.levels['3']?.stars).toBe(3);
    expect(save.cosmetics.owned).toEqual(['classic', 'neon']);
    expect(save.cosmetics.selected).toBe('classic');
  });
});

describe('progress helpers', () => {
  it('unlocks the level after the best completed one', () => {
    const save = createEmptySave();
    expect(unlockedLevel(save)).toBe(1);
    save.levels['1'] = { stars: 2, bestUnits: 10, completions: 1 };
    save.levels['2'] = { stars: 3, bestUnits: 10, completions: 2 };
    expect(unlockedLevel(save)).toBe(3);
    expect(totalStars(save)).toBe(5);
    expect(hasProgress(save)).toBe(true);
  });
});

describe('mergeSaves', () => {
  const a = createEmptySave(new Date('2026-01-01T00:00:00Z'));
  a.coins = 100;
  a.upgrades.damage = 3;
  a.levels['1'] = { stars: 1, bestUnits: 5, completions: 1 };
  const b = createEmptySave(new Date('2026-02-01T00:00:00Z'));
  b.coins = 40;
  b.upgrades.squad = 2;
  b.levels['1'] = { stars: 3, bestUnits: 2, completions: 4 };
  b.levels['2'] = { stars: 1, bestUnits: 9, completions: 1 };

  it('adds coins when importing guest progress', () => {
    const merged = mergeSaves(a, b, 'import');
    expect(merged.coins).toBe(140);
    expect(merged.upgrades).toMatchObject({ damage: 3, squad: 2 });
    expect(merged.levels['1']).toEqual({ stars: 3, bestUnits: 5, completions: 4 });
    expect(merged.levels['2']?.stars).toBe(1);
  });

  it('keeps the newer coin balance on conflicts', () => {
    expect(mergeSaves(a, b, 'conflict').coins).toBe(40);
    expect(mergeSaves(a, b, 'conflict').revision).toBeGreaterThan(0);
  });
});
