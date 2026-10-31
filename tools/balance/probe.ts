/**
 * Balance probe: plays levels with bots of different skill and prints the outcome.
 *
 *   node tools/balance/probe.ts [all|campaign|<levelNumber>|prototype] [--timeline]
 */
import { CAMPAIGN_LENGTH, campaignLevel } from '../../apps/game/src/data/levels/campaign.ts';
import { PROTOTYPE_LEVEL } from '../../apps/game/src/data/levels/prototype.ts';
import type { LevelDef } from '../../apps/game/src/sim/level.ts';
import { DEFAULT_MODIFIERS, type RunModifiers } from '../../apps/game/src/sim/types.ts';
import { expectedModifiers, playLevel, type BotSkill } from './bot.ts';

const args = process.argv.slice(2);
const showTimeline = args.includes('--timeline');
const filter = args.find((a) => !a.startsWith('--')) ?? 'campaign';

const entries: { level: LevelDef; modifiers: RunModifiers }[] = [];
if (filter === 'prototype' || filter === 'all')
  entries.push({ level: PROTOTYPE_LEVEL, modifiers: DEFAULT_MODIFIERS });
for (let n = 1; n <= CAMPAIGN_LENGTH; n++) {
  if (filter !== 'all' && filter !== 'campaign' && filter !== String(n)) continue;
  entries.push({ level: campaignLevel(n), modifiers: expectedModifiers(n) });
}

const wins: Record<BotSkill, number> = { good: 0, average: 0, poor: 0 };
for (const { level, modifiers } of entries) {
  const results = (['good', 'average', 'poor'] as BotSkill[]).map((skill) => ({
    skill,
    ...playLevel(level, modifiers, skill),
  }));
  for (const r of results) if (r.status === 'won') wins[r.skill]++;
  const line = results
    .map(
      (r) =>
        `${r.skill[0]}:${r.status === 'won' ? 'W' : 'L'} ${String(r.units).padStart(4)}/${String(r.stats.peakUnits).padStart(4)}`,
    )
    .join('  ');
  const boss = level.segments.find((s) => s.type === 'boss');
  console.info(
    `${level.id.padEnd(12)} ${level.world.padEnd(7)} len=${String(level.length).padStart(4)} ${boss ? (boss.type === 'boss' ? boss.kind.padEnd(8) : '') : '        '} ${line}  kills=${results[0]?.stats.kills}`,
  );
  if (showTimeline) {
    for (const r of results) {
      console.info(`    ${r.skill}: ${r.timeline.map((p) => `${p.distance}:${p.units}`).join(' ')}`);
      console.info(`      losses: ${JSON.stringify(r.losses)}`);
    }
  }
}
console.info(
  `wins: good ${wins.good}/${entries.length}, average ${wins.average}/${entries.length}, poor ${wins.poor}/${entries.length}`,
);
