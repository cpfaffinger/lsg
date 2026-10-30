import { mediaUrl } from '../media.ts';
import type { WorldId } from '../sim/level.ts';

export type MusicMood = 'menu' | 'play' | 'boss' | 'result';
export type MusicTrack = 'menu' | 'boss' | WorldId;

const CROSSFADE_SECONDS = 1.2;
/** Volume of the running track on the result screen. */
const RESULT_LEVEL = 0.4;
/** Decoded tracks are large, so only a few stay in memory. */
const MAX_DECODED_TRACKS = 3;

interface Playing {
  track: MusicTrack;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Plays looping music tracks with crossfades. Tracks load on demand, world by world. */
export class MusicPlayer {
  private readonly ctx: AudioContext;
  private readonly output: GainNode;
  private readonly decoded = new Map<MusicTrack, Promise<AudioBuffer>>();
  private playing: Playing | null = null;
  private wanted: MusicTrack | null = null;
  private level = 1;

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx = ctx;
    this.output = output;
  }

  private load(track: MusicTrack): Promise<AudioBuffer> {
    let buffer = this.decoded.get(track);
    if (!buffer) {
      buffer = fetch(mediaUrl(`audio/music/${track}.m4a`))
        .then((response) => response.arrayBuffer())
        .then((data) => this.ctx.decodeAudioData(data));
      this.decoded.set(track, buffer);
      for (const key of this.decoded.keys()) {
        if (this.decoded.size <= MAX_DECODED_TRACKS) break;
        if (key !== track && key !== this.playing?.track) this.decoded.delete(key);
      }
    }
    return buffer;
  }

  setMood(mood: MusicMood, world: WorldId): void {
    this.setLevel(mood === 'result' ? RESULT_LEVEL : 1);
    if (mood === 'result') return;
    this.setTrack(mood === 'menu' ? 'menu' : mood === 'boss' ? 'boss' : world);
  }

  private setLevel(level: number): void {
    this.level = level;
    if (this.playing) this.playing.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.3);
  }

  private setTrack(track: MusicTrack): void {
    if (this.wanted === track) return;
    this.wanted = track;
    this.load(track)
      .then((buffer) => {
        // The player may have moved on while this track was loading.
        if (this.wanted === track) this.crossfade(track, buffer);
      })
      .catch(() => {
        this.decoded.delete(track);
        if (this.wanted === track) this.wanted = null;
      });
  }

  private crossfade(track: MusicTrack, buffer: AudioBuffer): void {
    const now = this.ctx.currentTime;
    if (this.playing) {
      const { source, gain } = this.playing;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, CROSSFADE_SECONDS / 4);
      source.stop(now + CROSSFADE_SECONDS * 1.5);
      source.onended = () => gain.disconnect();
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.setTargetAtTime(this.level, now, CROSSFADE_SECONDS / 4);
    source.connect(gain).connect(this.output);
    source.start(now);
    this.playing = { track, source, gain };
  }
}
