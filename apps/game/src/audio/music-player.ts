import { mediaUrl } from '../media.ts';
import type { WorldId } from '../sim/level.ts';

export type MusicMood = 'menu' | 'play' | 'boss' | 'result';
export const MUSIC_STYLES = ['standard', 'synthwave', 'disco', 'edm'] as const;
export type MusicStyle = (typeof MUSIC_STYLES)[number];
type MusicSlot = 'menu' | 'boss' | WorldId;
type MusicTrack = string;

/** Which recording plays where, per style (files in src/media/audio/music). */
const STYLE_TRACKS: Record<MusicStyle, Record<MusicSlot, MusicTrack>> = {
  standard: { menu: 'menu', desert: 'desert', city: 'city', station: 'station', boss: 'boss' },
  synthwave: {
    menu: 'synthwave-2',
    desert: 'synthwave-1',
    city: 'synthwave-3',
    station: 'synthwave-2',
    boss: 'synthwave-3',
  },
  disco: { menu: 'disco-2', desert: 'disco-1', city: 'disco-3', station: 'disco-1', boss: 'disco-3' },
  edm: { menu: 'edm-2', desert: 'edm-4', city: 'edm-1', station: 'edm-3', boss: 'edm-1' },
};

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
  private style: MusicStyle = 'standard';
  private mood: MusicMood = 'menu';
  private world: WorldId = 'desert';

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
    this.mood = mood;
    this.world = world;
    this.setLevel(mood === 'result' ? RESULT_LEVEL : 1);
    if (mood === 'result') return;
    const slot: MusicSlot = mood === 'menu' ? 'menu' : mood === 'boss' ? 'boss' : world;
    this.setTrack(STYLE_TRACKS[this.style][slot]);
  }

  /** Switches the style right away, so the player hears the choice in the settings. */
  setStyle(style: MusicStyle): void {
    if (style === this.style) return;
    this.style = style;
    this.setMood(this.mood === 'result' ? 'menu' : this.mood, this.world);
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
