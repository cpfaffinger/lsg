/**
 * Balance probe: plays levels with bots of different skill and prints the outcome.
 *
 *   node tools/balance/probe.ts [levelId|all] [--timeline]
 */
import { PROTOTYPE_LEVEL } from '../../apps/game/src/data/levels/prototype.ts';
import type { LevelDef } from '../../apps/game/src/sim/level.ts';
import { playLevel, type BotSkill } from './bot.ts';

const args = process.argv.slice(2);
const showTimeline = args.includes('--timeline');
const filter = args.find((a) => !a.startsWith('--')) ?? 'all';

const levels: LevelDef[] = [PROTOTYPE_LEVEL];

for (const level of levels) {
  if (filter !== 'all' && filter !== level.id) continue;
  const results = (['good', 'average', 'poor'] as BotSkill[]).map((skill) => ({
    skill,
    ...playLevel(level, undefined, skill),
  }));
  const line = results
    .map(
      (r) =>
        `${r.skill}: ${r.status.padEnd(4)} units=${String(r.units).padStart(4)} peak=${r.stats.peakUnits} kills=${r.stats.kills} dist=${r.distance}`,
    )
    .join(' | ');
  console.info(`${level.id.padEnd(12)} ${line}`);
  if (showTimeline) {
    for (const r of results)
      console.info(`  ${r.skill}: ${r.timeline.map((p) => `${p.distance}:${p.units}`).join(' ')}`);
  }
}
