import { isGateBeneficial } from '../sim/gates.ts';
import type { SimEvent, WeaponId } from '../sim/types.ts';
import type { AudioManager } from './audio-manager.ts';
import type { SfxId } from './sfx-bank.ts';

const SHOT_SOUND: Record<WeaponId, { id: SfxId; volume: number }> = {
  rifle: { id: 'shot', volume: 0.2 },
  spread: { id: 'shotSpread', volume: 0.24 },
  laser: { id: 'shotLaser', volume: 0.22 },
  rocket: { id: 'shotRocket', volume: 0.4 },
};

/** Maps simulation events to sound effects. */
export class AudioDirector {
  private readonly audio: AudioManager;

  constructor(audio: AudioManager) {
    this.audio = audio;
  }

  handle(events: readonly SimEvent[]): void {
    if (!this.audio.ready) return;
    for (const event of events) {
      switch (event.type) {
        case 'shot':
          this.audio.play(SHOT_SOUND[event.weapon].id, {
            volume: SHOT_SOUND[event.weapon].volume,
            jitter: 0.06,
          });
          break;
        case 'enemyHit':
          this.audio.play('hit', { volume: 0.22, jitter: 0.15 });
          break;
        case 'enemyKilled':
          if (event.kind === 'tank' || event.kind === 'miniboss' || event.kind === 'boss') {
            this.audio.play('killBig', { volume: event.kind === 'boss' ? 1 : 0.7 });
          } else {
            this.audio.play('kill', { volume: 0.4, jitter: 0.12 });
          }
          if (event.coins > 0) this.audio.play('coin', { volume: 0.18 });
          break;
        case 'gateHit':
          this.audio.play('gateHit', { volume: 0.18, jitter: 0.1 });
          break;
        case 'gateStep':
          this.audio.play('gateStep', {
            volume: 0.32,
            rate: 1 + Math.min(1, Math.abs(event.value) * 0.025),
            jitter: 0,
          });
          break;
        case 'gatePassed':
          this.audio.play(isGateBeneficial(event.op, event.value) ? 'gateGood' : 'gateBad', {
            volume: 0.7,
            jitter: 0,
          });
          break;
        case 'unitsLost':
          this.audio.play('unitsLost', { volume: 0.5 });
          break;
        case 'explosion':
          this.audio.play('explosion', { volume: 0.8, jitter: 0.1 });
          break;
        case 'enemyShot':
          this.audio.play('enemyShot', { volume: 0.3 });
          break;
        case 'bossSpawned':
          this.audio.play('bossRoar', {
            volume: event.kind === 'boss' ? 0.9 : 0.6,
            rate: event.kind === 'boss' ? 1 : 1.3,
            jitter: 0,
          });
          if (event.kind === 'boss') this.audio.setMood('boss');
          break;
        case 'bossPhase':
          this.audio.play('bossRoar', { volume: 0.6, rate: 1.15, jitter: 0 });
          break;
        case 'levelComplete':
          this.audio.play('win', { volume: 0.8, jitter: 0 });
          this.audio.setMood('result');
          break;
        case 'levelFailed':
          this.audio.play('lose', { volume: 0.8, jitter: 0 });
          this.audio.setMood('result');
          break;
        case 'obstacleHit':
          this.audio.play('hit', { volume: 0.12, rate: 0.6 });
          break;
      }
    }
  }
}
