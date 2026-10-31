import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LENGTH, campaignLevel } from '../../apps/game/src/data/levels/campaign.ts';
import { endlessLevel } from '../../apps/game/src/data/levels/endless.ts';
import { expectedModifiers, playLevel } from './bot.ts';

describe('campaign', () => {
  it('generates 30 valid, deterministic levels with rising length', () => {
    for (let n = 1; n <= CAMPAIGN_LENGTH; n++) {
      const level = campaignLevel(n);
      expect(level.number).toBe(n);
      expect(level.segments.length).toBeGreaterThan(5);
      for (const segment of level.segments) expect(segment.at).toBeLessThanOrEqual(level.length);
      expect(JSON.stringify(campaignLevel(n, 0.3))).toBe(JSON.stringify(campaignLevel(n, 0.3)));
    }
    expect(campaignLevel(30).length).toBeGreaterThan(campaignLevel(1).length);
  });

  it('places bosses at the end of each world', () => {
    for (const n of [10, 20, 30]) {
      expect(campaignLevel(n).segments.some((s) => s.type === 'boss' && s.kind === 'boss')).toBe(true);
    }
    expect(campaignLevel(5).segments.some((s) => s.type === 'boss' && s.kind === 'miniboss')).toBe(true);
  });

  it.each([1, 10, 20, 30])('level %i can be beaten by a competent player', (n) => {
    const result = playLevel(campaignLevel(n), expectedModifiers(n), 'good');
    expect(result.status).toBe('won');
  });

  it('builds a long endless run', () => {
    const level = endlessLevel();
    expect(level.length).toBeGreaterThan(3000);
    expect(level.segments.some((s) => s.type === 'boss')).toBe(true);
  });
});
