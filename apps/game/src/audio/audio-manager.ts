import type { WorldId } from '../sim/level.ts';
import { MusicSequencer, type MusicMood } from './music.ts';
import { buildSfx, type SfxId } from './sfx-synth.ts';

interface PlayOptions {
  volume?: number;
  /** Playback rate (pitch). */
  rate?: number;
  /** Random +/- variation applied to the rate for natural repetition. */
  jitter?: number;
}

/** Per-sound limits so rapid-fire events (hundreds of shots per second) stay pleasant. */
const LIMITS: Partial<Record<SfxId, { minInterval: number; maxVoices: number }>> = {
  shot: { minInterval: 0.045, maxVoices: 6 },
  hit: { minInterval: 0.03, maxVoices: 6 },
  kill: { minInterval: 0.035, maxVoices: 6 },
  gateHit: { minInterval: 0.05, maxVoices: 3 },
  enemyShot: { minInterval: 0.08, maxVoices: 4 },
  unitsLost: { minInterval: 0.06, maxVoices: 4 },
  coin: { minInterval: 0.05, maxVoices: 3 },
};

/**
 * Owns the Web Audio graph: master -> compressor -> speakers, with separate SFX and music buses.
 * The context is created on the first user gesture, as browsers require.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private buffers: Record<SfxId, AudioBuffer> | null = null;
  private music: MusicSequencer | null = null;
  private readonly lastPlayed = new Map<SfxId, number>();
  private readonly voices = new Map<SfxId, number>();
  private volumes = { master: 0.8, sfx: 0.8, music: 0.6, muted: false };
  private mood: MusicMood = 'menu';

  get ready(): boolean {
    return this.ctx !== null && this.buffers !== null;
  }

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(compressor);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.applyVolumes();
    this.buffers = buildSfx(ctx);
    this.music = new MusicSequencer(ctx, this.musicBus);
    this.music.setMood(this.mood);
    this.music.setWorld(this.worldId);
    this.music.start();
  }

  setVolumes(master: number, sfx: number, music: number, muted: boolean): void {
    this.volumes = { master, sfx, music, muted };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.muted ? 0 : this.volumes.master, now, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx, now, 0.05);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.8, now, 0.05);
  }

  /** Pauses all audio, e.g. when the tab is hidden. */
  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private worldId: WorldId = 'desert';

  setWorld(world: WorldId): void {
    this.worldId = world;
    this.music?.setWorld(world);
  }

  setMood(mood: MusicMood): void {
    this.mood = mood;
    this.music?.setMood(mood);
  }

  setIntensity(value: number): void {
    if (this.music) this.music.intensity = Math.max(0, Math.min(1, value));
  }

  play(id: SfxId, options: PlayOptions = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.buffers || !this.sfxBus || this.volumes.muted || ctx.state !== 'running') return;
    const limit = LIMITS[id];
    const now = ctx.currentTime;
    if (limit) {
      const last = this.lastPlayed.get(id) ?? -1;
      if (now - last < limit.minInterval) return;
      if ((this.voices.get(id) ?? 0) >= limit.maxVoices) return;
    }
    this.lastPlayed.set(id, now);
    const source = ctx.createBufferSource();
    source.buffer = this.buffers[id];
    const jitter = options.jitter ?? 0.05;
    source.playbackRate.value = (options.rate ?? 1) * (1 + (Math.random() * 2 - 1) * jitter);
    const gain = ctx.createGain();
    gain.gain.value = options.volume ?? 1;
    source.connect(gain).connect(this.sfxBus);
    this.voices.set(id, (this.voices.get(id) ?? 0) + 1);
    source.onended = () => {
      this.voices.set(id, Math.max(0, (this.voices.get(id) ?? 1) - 1));
      gain.disconnect();
    };
    source.start(now);
  }
}
