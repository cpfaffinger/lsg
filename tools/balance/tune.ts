/**
 * Campaign tuner.
 *
 * Phase 1: for every level, binary-search the highest wave difficulty at which three competent
 * bot variants all win while keeping a target share of their squad, and an average bot (who
 * commits to gates early and ignores gate shooting) still wins too.
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

/** Three competent players with different reaction distances; all of them must pass. */
const VARIANTS = [12, 18, 26];

/** Share of the peak squad a competent player should still have at the end. Lower = harder. */
function targetSurvival(level: number): number {
  return 0.7 - ((level - 1) / (CAMPAIGN_LENGTH - 1)) * 0.35;
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

function tuneDifficulty(level: number, bossHp: number | undefined): number {
  const good = (d: number) => evaluate(level, d, bossHp).survival >= targetSurvival(level);
  let lo = 0.03;
  let hi = 1.2;
  const requireAverage = averageWins(level, lo, bossHp);
  if (!requireAverage) console.warn(`level ${level}: average bot cannot win even at difficulty ${lo}`);
  const passes = (d: number) => good(d) && (!requireAverage || averageWins(level, d, bossHp));
  if (!passes(lo)) console.warn(`level ${level}: not winnable even at difficulty ${lo}`);
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (passes(mid)) lo = mid;
    else hi = mid;
  }
  // Outcomes are not perfectly monotonic: step down until the value and a margin below pass.
  for (const factor of [0.92, 0.85, 0.78, 0.7, 0.6, 0.5, 0.4, 0.3]) {
    const value = Number((lo * factor).toFixed(3));
    if (passes(value) && passes(value * 0.9)) return value;
  }
  return Number((lo * 0.3).toFixed(3));
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
  // Waves first against a weak provisional boss (independent of earlier tuning runs), then the
  // boss, then waves again with that boss, then the boss once more for the final wave strength.
  let d = tuneDifficulty(level, isFinale ? 1 : undefined);
  if (isFinale) {
    bossHp[level] = tuneBoss(level, d);
    d = tuneDifficulty(level, bossHp[level]);
    bossHp[level] = tuneBoss(level, d);
  }
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
