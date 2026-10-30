/**
 * Reads a debug file downloaded from the game, reruns it and prints what happened.
 *
 *   npm run replay -- path/to/lsg-replay.json
 */
import fs from 'node:fs';
import { replaySimulation, type ReplayFile } from '../../apps/game/src/sim/replay.ts';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run replay -- <file.json>');
  process.exit(1);
}
const replay = JSON.parse(fs.readFileSync(file, 'utf8')) as ReplayFile;
if (replay.format !== 'lsg-replay') {
  console.error('This is not an LSG debug file.');
  process.exit(1);
}

const { result, modifiers, level, client } = replay;
console.info(`Game ${replay.gameVersion}, recorded ${replay.createdAt}, mode ${replay.mode}`);
console.info(
  `Level ${level.id}, world ${level.world}, ${result.status} after ${result.stats.elapsed.toFixed(1)} s`,
);
console.info(`Modifiers ${JSON.stringify(modifiers)}`);
console.info(`Result ${JSON.stringify(result.stats)}, units ${result.units}`);
if (client) {
  console.info(
    `Client ${client.viewport.join('x')} @${client.devicePixelRatio}, quality ${client.quality}, ` +
      `${client.averageFps} FPS, slow frames ${(client.slowFrameShare * 100).toFixed(1)} %`,
  );
  console.info(`  ${client.userAgent}`);
  if (client.gpu) {
    console.info(`GPU ${client.gpu.renderer} (${client.gpu.vendor}), ${client.gpu.version}`);
    console.info(
      `  max texture ${client.gpu.maxTextureSize}, float targets ${client.gpu.floatRenderTarget}, safe mode ${client.gpu.safeMode}`,
    );
    for (const message of client.gpu.log) console.info(`  ${message}`);
  }
}

const rerun = replaySimulation(replay);
const same =
  rerun.status === result.status &&
  rerun.units === result.units &&
  rerun.stats.kills === result.stats.kills &&
  rerun.stats.coins === result.stats.coins;
console.info(
  same
    ? 'Rerun matches the recording.'
    : `Rerun DIFFERS: ${rerun.status}, ${rerun.units} units, ${rerun.stats.kills} kills. ` +
        'The code changed since this run was recorded, or the browser computes differently.',
);

console.info('\nGates');
for (const e of replay.log) {
  if (e.type !== 'gate') continue;
  const label = e.op === 'weapon' ? `weapon ${e.weapon}` : `${e.op} ${e.value}`;
  console.info(
    `  ${e.t.toFixed(1).padStart(6)} s  squad x ${e.squadX.toFixed(2).padStart(6)}  gate x ${e.gateX.toFixed(2).padStart(6)}  ` +
      `${label.padEnd(16)} ${String(e.passed).padStart(5)} through, became ${String(e.result).padStart(5)}  ` +
      `squad ${e.before} to ${e.after}`,
  );
}

console.info('\nLosses by cause');
const losses = new Map<string, number>();
for (const e of replay.log) if (e.type === 'loss') losses.set(e.cause, (losses.get(e.cause) ?? 0) + e.count);
for (const [cause, count] of losses) console.info(`  ${cause.padEnd(14)} ${count}`);

console.info('\nTimeline');
console.info('       t  distance  units  squad x  weapon   dmg%  rate%  enemies  kills  coins');
for (const s of replay.timeline) {
  if (s.t % 5 >= 1 && s !== replay.timeline[replay.timeline.length - 1]) continue;
  console.info(
    `  ${s.t.toFixed(1).padStart(6)}  ${s.distance.toFixed(0).padStart(8)}  ${String(s.units).padStart(5)}  ` +
      `${s.squadX.toFixed(2).padStart(7)}  ${s.weapon.padEnd(7)} ${String(s.damageBonus).padStart(5)}  ` +
      `${String(s.fireRateBonus).padStart(5)}  ${String(s.enemies).padStart(7)}  ${String(s.kills).padStart(5)}  ` +
      `${String(s.coins).padStart(5)}`,
  );
}
