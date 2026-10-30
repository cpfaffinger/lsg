/**
 * Procedural music: a small step sequencer driving oscillator instruments.
 * Layers fade in and out with the game situation (menu, playing, boss fight),
 * so the soundtrack reacts to the action without any audio files.
 */

export type MusicMood = 'menu' | 'play' | 'boss' | 'result';

interface MoodSettings {
  bpm: number;
  kick: boolean;
  snare: boolean;
  hats: number;
  bass: boolean;
  arp: number;
  pad: boolean;
  lead: boolean;
}

const MOODS: Record<MusicMood, MoodSettings> = {
  menu: { bpm: 100, kick: false, snare: false, hats: 0, bass: true, arp: 2, pad: true, lead: false },
  play: { bpm: 124, kick: true, snare: true, hats: 2, bass: true, arp: 1, pad: true, lead: false },
  boss: { bpm: 140, kick: true, snare: true, hats: 1, bass: true, arp: 1, pad: false, lead: true },
  result: { bpm: 96, kick: false, snare: false, hats: 0, bass: false, arp: 2, pad: true, lead: false },
};

/** A minor: i - VI - III - VII. Each chord as MIDI notes (root first). */
const PROGRESSION: number[][] = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];

const LEAD_MOTIF = [69, -1, 72, 71, 69, -1, 67, 69, 64, -1, 67, 69, 72, 74, 72, -1];
const BASS_STEPS = new Set([0, 3, 6, 8, 11, 14]);
const STEPS_PER_BAR = 16;

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class MusicSequencer {
  private readonly ctx: AudioContext;
  private readonly output: GainNode;
  private readonly noise: AudioBuffer;
  private mood: MusicMood = 'menu';
  private pendingMood: MusicMood | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  /** 0..1, raises filter cutoffs and arp brightness as the squad grows. */
  intensity = 0.3;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.output = ctx.createGain();
    this.output.gain.value = 0.55;
    this.output.connect(destination);
    const length = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let s = 987654321;
    for (let i = 0; i < length; i++) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      data[i] = ((s >>> 0) / 4294967296) * 2 - 1;
    }
  }

  setMood(mood: MusicMood): void {
    if (mood === this.mood && this.pendingMood === null) return;
    // Switch on the next bar so changes stay musical.
    this.pendingMood = mood;
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    const lookahead = 0.15;
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      if (this.step % STEPS_PER_BAR === 0 && this.pendingMood) {
        this.mood = this.pendingMood;
        this.pendingMood = null;
      }
      this.playStep(this.step, this.nextTime);
      const settings = MOODS[this.mood];
      this.nextTime += 60 / settings.bpm / 4;
      this.step = (this.step + 1) % (STEPS_PER_BAR * PROGRESSION.length);
    }
  }

  private playStep(step: number, time: number): void {
    const m = MOODS[this.mood];
    const stepInBar = step % STEPS_PER_BAR;
    const bar = Math.floor(step / STEPS_PER_BAR) % PROGRESSION.length;
    const chord = PROGRESSION[bar] ?? [57, 60, 64];
    const stepDur = 60 / m.bpm / 4;

    if (m.kick && stepInBar % 4 === 0) this.kick(time);
    if (m.snare && (stepInBar === 4 || stepInBar === 12)) this.snare(time);
    if (m.hats > 0 && stepInBar % m.hats === 0) this.hat(time, stepInBar % 4 === 2 ? 0.09 : 0.035);
    if (m.bass && BASS_STEPS.has(stepInBar)) this.bass(time, (chord[0] ?? 57) - 24, stepDur * 2);
    if (m.arp > 0 && stepInBar % m.arp === 0) {
      const pattern = [0, 1, 2, 1];
      const note = (chord[pattern[(stepInBar / m.arp) % pattern.length] ?? 0] ?? 60) + 12;
      this.arp(time, note, stepDur * 1.6);
    }
    if (m.pad && stepInBar === 0) this.pad(time, chord, stepDur * STEPS_PER_BAR);
    if (m.lead) {
      const note = LEAD_MOTIF[stepInBar] ?? -1;
      if (note > 0) this.lead(time, note + (bar === 3 ? 2 : 0), stepDur * 1.8);
    }
  }

  private env(gain: GainNode, time: number, peak: number, attack: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  }

  private kick(time: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    this.env(gain, time, 0.9, 0.002, 0.22);
    osc.connect(gain).connect(this.output);
    osc.start(time);
    osc.stop(time + 0.3);
  }

  private noiseHit(
    time: number,
    filterType: BiquadFilterType,
    freq: number,
    peak: number,
    decay: number,
  ): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    this.env(gain, time, peak, 0.001, decay);
    src.connect(filter).connect(gain).connect(this.output);
    src.start(time, Math.random() * 0.5);
    src.stop(time + decay + 0.05);
  }

  private snare(time: number): void {
    this.noiseHit(time, 'bandpass', 1900, 0.5, 0.14);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(220, time);
    osc.frequency.exponentialRampToValueAtTime(140, time + 0.08);
    this.env(gain, time, 0.25, 0.001, 0.08);
    osc.connect(gain).connect(this.output);
    osc.start(time);
    osc.stop(time + 0.12);
  }

  private hat(time: number, decay: number): void {
    this.noiseHit(time, 'highpass', 7500, 0.16, decay);
  }

  private bass(time: number, midi: number, duration: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToHz(midi);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(300 + this.intensity * 1400, time);
    filter.frequency.exponentialRampToValueAtTime(140, time + duration);
    const gain = this.ctx.createGain();
    this.env(gain, time, 0.42, 0.005, duration);
    osc.connect(filter).connect(gain).connect(this.output);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private arp(time: number, midi: number, duration: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = midiToHz(midi);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200 + this.intensity * 3200;
    const gain = this.ctx.createGain();
    this.env(gain, time, 0.07 + this.intensity * 0.05, 0.004, duration);
    osc.connect(filter).connect(gain).connect(this.output);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private pad(time: number, chord: number[], duration: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700 + this.intensity * 600;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.09, time + 0.6);
    gain.gain.setValueAtTime(0.09, time + duration - 0.4);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.3);
    filter.connect(gain).connect(this.output);
    for (const note of chord) {
      for (const detune of [-8, 8]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToHz(note);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + duration + 0.4);
      }
    }
  }

  private lead(time: number, midi: number, duration: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = midiToHz(midi);
    const vibrato = this.ctx.createOscillator();
    vibrato.frequency.value = 6;
    const vibratoGain = this.ctx.createGain();
    vibratoGain.gain.value = 6;
    vibrato.connect(vibratoGain).connect(osc.detune);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    const gain = this.ctx.createGain();
    this.env(gain, time, 0.11, 0.01, duration);
    osc.connect(filter).connect(gain).connect(this.output);
    osc.start(time);
    vibrato.start(time);
    osc.stop(time + duration + 0.05);
    vibrato.stop(time + duration + 0.05);
  }
}
