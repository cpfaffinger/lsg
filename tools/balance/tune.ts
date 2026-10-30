/**
 * Campaign tuner.
 *
 * Phase 1: for every level, binary-search the highest wave difficulty at which three competent
 * bot variants all win while keeping a target share of their squad, and an average bot (who
 * commits to gates early and ignores gate shooting) wins without losing more than a target share
 * of its soldiers. That share rises level by level and is what makes the campaign feel harder.
 * Phase 2: for boss and mini-boss levels, search the boss HP so the fight lasts about a target
 * duration while all variants still win.
 *
 * Writes apps/game/src/data/levels/tuning.ts.
 *
 *   node tools/balance/tune.ts [--dry] [--from=N] [--to=N]
 */
import fs from 'node:fs';
import path from 'node:path';
import { CAMPAIGN_LENGTH, campaignLevel, expectedLoadout } from '../../apps/game/src/data/levels/campaign.ts';
import { CAMPAIGN_BOSS_HP, CAMPAIGN_DIFFICULTY } from '../../apps/game/src/data/levels/tuning.ts';
import { DEFAULT_MODIFIERS } from '../../apps/game/src/sim/types.ts';
import { playLevel } from './bot.ts';

const dry = process.argv.includes('--dry');
const argNumber = (name: string, fallback: number) => {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? Number(arg.split('=')[1]) : fallback;
};
const from = argNumber('from', 1);
const to = argNumber('to', CAMPAIGN_LENGTH);

/** Wave strength of boss and mini-boss levels relative to what the waves alone would allow. */
const FINALE_WAVE_SHARE = 0.85;

/** Three competent players with different reaction distances; all of them must pass. */
const VARIANTS = [12, 18, 26];

/** Share of the peak squad a competent player should still have at the end. Lower = harder. */
function targetSurvival(level: number): number {
  return 0.7 - ((level - 1) / (CAMPAIGN_LENGTH - 1)) * 0.35;
}

/** Share of all its soldiers the average bot may lose in a level. Higher = harder. */
function targetLossShare(level: number): number {
  return 0.25 + ((level - 1) / (CAMPAIGN_LENGTH - 1)) * 0.3;
}

/** Seconds from boss spawn (including its approach) to its defeat. */
function targetBossSeconds(level: number): number {
  return level % 10 === 0 ? 26 + level * 0.3 : 13 + level * 0.15;
}

function modifiersFor(level: number) {
  const loadout = expectedLoadout(level);
  return { ...DEFAULT_MODIFIERS, startUnits: loadout.startUnits, damageMultiplier: loadout.power };
}

function evaluate(level: number, difficulty: number, bossHp?: number) {
  const def = campaignLevel(level, difficulty, bossHp);
  const runs = VARIANTS.map((lookahead) => playLevel(def, modifiersFor(level), 'good', lookahead));
  const survival = Math.min(
    ...runs.map((r) => (r.status === 'won' ? r.units / Math.max(1, r.stats.peakUnits) : 0)),
  );
  const allWon = runs.every((r) => r.status === 'won');
  const bossSeconds = runs.reduce((sum, r) => sum + r.bossSeconds, 0) / runs.length;
  return { survival, allWon, bossSeconds };
}

function averageWins(level: number, difficulty: number, bossHp?: number): boolean {
  return playLevel(campaignLevel(level, difficulty, bossHp), modifiersFor(level), 'average').status === 'won';
}

/** Share of its soldiers the average bot loses to enemies; a lost level counts as everything. */
function averageLossShare(level: number, difficulty: number, bossHp?: number): number {
  const run = playLevel(campaignLevel(level, difficulty, bossHp), modifiersFor(level), 'average');
  if (run.status !== 'won') return 1;
  // Walls take a fixed slice of a wide squad at any difficulty, so they say nothing about waves.
  const lost = Object.entries(run.losses).reduce((sum, [cause, n]) => sum + (cause === 'barrier' ? 0 : n), 0);
  return lost / Math.max(1, lost + run.units);
}

function tuneDifficulty(level: number, bossHp: number | undefined, share = 1): number {
  const good = (d: number) => evaluate(level, d, bossHp).survival >= targetSurvival(level);
  const lo = 0.03;
  const hi = 1.2;
  // More waves mean more shots at gates, so a slightly harder level can be easier to win.
  const requireAverage = [lo, 0.1, 0.2, 0.3].some((d) => averageWins(level, d, bossHp));
  if (!requireAverage) console.warn(`level ${level}: average bot cannot win`);
  const passes = (d: number) =>
    good(d) && (!requireAverage || averageLossShare(level, d, bossHp) <= targetLossShare(level));
  // Outcomes are not monotonic, so a bisection can fall into a pocket: walk down from the top
  // and take the first value that passes together with a margin below it.
  for (let d = hi; d >= lo; d -= 0.02) {
    const value = Number(d.toFixed(3));
    const final = Number((value * share).toFixed(3));
    if (passes(value) && passes(value * 0.92) && passes(final)) return final;
  }
  console.warn(`level ${level}: not winnable even at difficulty ${lo}`);
  return lo;
}

function tuneBoss(level: number, difficulty: number): number {
  const target = targetBossSeconds(level);
  // Log-scale search for the HP that gives the target fight length.
  let lo = Math.log(0.2);
  let hi = Math.log(2000);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const result = evaluate(level, difficulty, Math.exp(mid));
    if (result.allWon && result.bossSeconds < target) lo = mid;
    else hi = mid;
  }
  let hp = Math.exp(lo);
  // Make sure every variant (and the average bot) still wins; shave HP until they do.
  // The boss may cost part of the squad, but a competent player must not scrape through.
  const minSurvival = targetSurvival(level) * 0.5;
  const wins = (value: number) => {
    const result = evaluate(level, difficulty, value);
    return result.allWon && result.survival >= minSurvival && averageWins(level, difficulty, value);
  };
  for (let i = 0; i < 40 && hp > 0.2 && !wins(hp); i++) hp *= 0.85;
  return Number(hp.toFixed(3));
}

const difficulty = [...CAMPAIGN_DIFFICULTY];
const bossHp: Record<number, number> = { ...CAMPAIGN_BOSS_HP };
for (let level = from; level <= to; level++) {
  const isFinale = level % 10 === 0 || level % 10 === 5;
  // Waves first against a weak provisional boss, independent of earlier tuning runs. Finales then
  // keep some slack in the waves: the fight is the point of the level, not what comes before it.
  const d = tuneDifficulty(level, isFinale ? 1 : undefined, isFinale ? FINALE_WAVE_SHARE : 1);
  if (isFinale) bossHp[level] = tuneBoss(level, d);
  difficulty[level - 1] = d;
  const check = evaluate(level, d, isFinale ? bossHp[level] : undefined);
  console.info(
    `level ${String(level).padStart(2)}: difficulty ${d.toFixed(3)} survival ${check.survival.toFixed(2)}` +
      (isFinale ? ` boss hp x${bossHp[level]} fight ${check.bossSeconds.toFixed(1)}s` : ''),
  );
}

if (!dry) {
  const file = path.resolve('apps/game/src/data/levels/tuning.ts');
  const body = `// Generated by tools/balance/tune.ts. Do not edit by hand; rerun the tuner instead.
/** Wave/boss difficulty per campaign level (index 0 = level 1). */
export const CAMPAIGN_DIFFICULTY: readonly number[] = [
${difficulty.map((v, i) => `  ${v}, // level ${i + 1}`).join('\n')}
];

/** Boss / mini-boss HP multipliers per campaign level number. */
export const CAMPAIGN_BOSS_HP: Readonly<Record<number, number>> = {
${Object.entries(bossHp)
  .map(([level, hp]) => `  ${level}: ${hp},`)
  .join('\n')}
};
`;
  fs.writeFileSync(file, body);
  console.info(`wrote ${file}`);
}
