import { mediaFiles, mediaUrl } from '../media.ts';

export type SfxId =
  | 'shot'
  | 'shotSpread'
  | 'shotLaser'
  | 'shotRocket'
  | 'hit'
  | 'kill'
  | 'killBig'
  | 'gateHit'
  | 'gateStep'
  | 'gateGood'
  | 'gateBad'
  | 'unitsLost'
  | 'explosion'
  | 'enemyShot'
  | 'bossRoar'
  | 'win'
  | 'lose'
  | 'click'
  | 'coin';

/** Every sound has one or more recorded variations, picked at random when played. */
export type SfxBank = Partial<Record<SfxId, AudioBuffer[]>>;

/** Loads all sound effects (files named `<id>-<variation>.wav`). Failed files are skipped. */
export async function loadSfx(ctx: BaseAudioContext): Promise<SfxBank> {
  const bank: SfxBank = {};
  await Promise.all(
    mediaFiles('audio/sfx/').map(async (path) => {
      const id = path.replace(/^.*\//, '').replace(/-\d+\.wav$/, '') as SfxId;
      try {
        const response = await fetch(mediaUrl(path));
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        (bank[id] ??= []).push(buffer);
      } catch {
        // One missing sound must not silence the others.
      }
    }),
  );
  return bank;
}
