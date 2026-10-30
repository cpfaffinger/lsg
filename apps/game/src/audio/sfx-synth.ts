/**
 * Procedural sound effects rendered into AudioBuffers at startup.
 * No audio files are needed, which keeps the download tiny and avoids licensing questions.
 */

export type SfxId =
  | 'shot'
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

type Generator = (t: number, i: number, rate: number) => number;

/** Deterministic noise so every build sounds identical. */
function makeNoise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

function envelope(t: number, attack: number, decay: number): number {
  if (t < attack) return t / attack;
  return Math.exp(-(t - attack) / decay);
}

/** One-pole filters applied in place. */
function lowpass(data: Float32Array, rate: number, cutoff: (t: number) => number): void {
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    const c = cutoff(i / rate);
    const a = 1 - Math.exp((-2 * Math.PI * c) / rate);
    y += a * ((data[i] ?? 0) - y);
    data[i] = y;
  }
}

function highpass(data: Float32Array, rate: number, cutoff: number): void {
  const a = Math.exp((-2 * Math.PI * cutoff) / rate);
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i] ?? 0;
    const y = a * (prevY + x - prevX);
    prevX = x;
    prevY = y;
    data[i] = y;
  }
}

function render(ctx: BaseAudioContext, duration: number, generator: Generator): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(duration * rate));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = generator(i / rate, i, rate);
  return buffer;
}

function normalize(buffer: AudioBuffer, peak: number): AudioBuffer {
  const data = buffer.getChannelData(0);
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < data.length; i++) data[i] = ((data[i] ?? 0) / max) * peak;
  return buffer;
}

function tone(freq: (t: number) => number, shape: 'sine' | 'square' | 'saw' | 'triangle'): Generator {
  let phase = 0;
  return (t, _i, rate) => {
    phase += freq(t) / rate;
    const p = phase % 1;
    switch (shape) {
      case 'sine':
        return Math.sin(p * Math.PI * 2);
      case 'square':
        return p < 0.5 ? 1 : -1;
      case 'saw':
        return p * 2 - 1;
      case 'triangle':
        return 1 - 4 * Math.abs(p - 0.5);
    }
  };
}

function notes(
  ctx: BaseAudioContext,
  seq: [number, number][],
  step: number,
  shape: 'square' | 'triangle',
): AudioBuffer {
  const total = seq.reduce((max, [, start]) => Math.max(max, start), 0) * step + step * 3;
  return render(ctx, total, (t, i, rate) => {
    let v = 0;
    for (const [midi, start] of seq) {
      const local = t - start * step;
      if (local < 0 || local > step * 3) continue;
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const p = (local * f) % 1;
      const osc = shape === 'square' ? (p < 0.5 ? 1 : -1) * 0.6 : 1 - 4 * Math.abs(p - 0.5);
      v += osc * envelope(local, 0.005, step * 0.9);
    }
    void i;
    void rate;
    return v * 0.5;
  });
}

export function buildSfx(ctx: BaseAudioContext): Record<SfxId, AudioBuffer> {
  const noise = makeNoise(1234567);

  const shot = render(
    ctx,
    0.09,
    (t) =>
      noise() * envelope(t, 0.001, 0.018) +
      Math.sin(t * 2 * Math.PI * (900 - t * 6000)) * envelope(t, 0.001, 0.02) * 0.5,
  );
  highpass(shot.getChannelData(0), ctx.sampleRate, 700);

  const hitGen = tone((t) => 1400 - t * 9000, 'triangle');
  const hit = render(
    ctx,
    0.05,
    (t, i, r) => hitGen(t, i, r) * envelope(t, 0.001, 0.012) + noise() * envelope(t, 0, 0.006) * 0.4,
  );

  const killGen = tone((t) => 520 - t * 2400, 'square');
  const kill = render(
    ctx,
    0.14,
    (t, i, r) => killGen(t, i, r) * envelope(t, 0.002, 0.04) * 0.6 + noise() * envelope(t, 0.001, 0.03) * 0.5,
  );
  lowpass(kill.getChannelData(0), ctx.sampleRate, (t) => 6000 - t * 30000);

  const killBigGen = tone((t) => 140 - t * 160, 'sine');
  const killBig = render(
    ctx,
    0.6,
    (t, i, r) => killBigGen(t, i, r) * envelope(t, 0.003, 0.18) + noise() * envelope(t, 0.002, 0.12) * 0.8,
  );
  lowpass(killBig.getChannelData(0), ctx.sampleRate, (t) => 3000 * Math.exp(-t * 4) + 200);

  const gateHitGen = tone(() => 2200, 'sine');
  const gateHit = render(ctx, 0.04, (t, i, r) => gateHitGen(t, i, r) * envelope(t, 0.001, 0.01));

  const gateStepGen = tone((t) => (t < 0.05 ? 880 : 1320), 'square');
  const gateStep = render(ctx, 0.12, (t, i, r) => gateStepGen(t, i, r) * envelope(t, 0.002, 0.05) * 0.5);
  lowpass(gateStep.getChannelData(0), ctx.sampleRate, () => 5000);

  const gateGood = notes(
    ctx,
    [
      [72, 0],
      [76, 1],
      [79, 2],
      [84, 3],
    ],
    0.06,
    'square',
  );
  lowpass(gateGood.getChannelData(0), ctx.sampleRate, () => 6000);
  const gateBad = notes(
    ctx,
    [
      [64, 0],
      [60, 1],
      [55, 2],
    ],
    0.09,
    'square',
  );
  lowpass(gateBad.getChannelData(0), ctx.sampleRate, () => 2500);

  const lostGen = tone((t) => 220 - t * 600, 'saw');
  const unitsLost = render(
    ctx,
    0.18,
    (t, i, r) => lostGen(t, i, r) * envelope(t, 0.002, 0.05) * 0.6 + noise() * envelope(t, 0.001, 0.02) * 0.4,
  );
  lowpass(unitsLost.getChannelData(0), ctx.sampleRate, () => 1800);

  const boomGen = tone((t) => 70 - t * 40, 'sine');
  const explosion = render(
    ctx,
    1.1,
    (t, i, r) => noise() * envelope(t, 0.004, 0.3) + boomGen(t, i, r) * envelope(t, 0.002, 0.25) * 0.9,
  );
  lowpass(explosion.getChannelData(0), ctx.sampleRate, (t) => 4000 * Math.exp(-t * 5) + 150);

  const zapGen = tone((t) => 1800 - t * 12000, 'saw');
  const enemyShot = render(ctx, 0.12, (t, i, r) => zapGen(t, i, r) * envelope(t, 0.002, 0.04));
  lowpass(enemyShot.getChannelData(0), ctx.sampleRate, () => 4000);

  const roarA = tone((t) => 55 + Math.sin(t * 30) * 4 + t * 20, 'saw');
  const roarB = tone((t) => 82 + Math.sin(t * 23) * 5 + t * 25, 'saw');
  const bossRoar = render(
    ctx,
    1.6,
    (t, i, r) => (roarA(t, i, r) + roarB(t, i, r) * 0.7 + noise() * 0.3) * envelope(t, 0.15, 0.7),
  );
  lowpass(bossRoar.getChannelData(0), ctx.sampleRate, (t) => 300 + 900 * Math.sin(Math.min(1, t) * Math.PI));

  const win = notes(
    ctx,
    [
      [67, 0],
      [72, 1],
      [76, 2],
      [79, 3],
      [84, 5],
      [79, 6],
      [84, 7],
    ],
    0.11,
    'square',
  );
  lowpass(win.getChannelData(0), ctx.sampleRate, () => 5000);
  const lose = notes(
    ctx,
    [
      [67, 0],
      [63, 2],
      [60, 4],
      [55, 6],
    ],
    0.14,
    'triangle',
  );

  const clickGen = tone(() => 1600, 'sine');
  const click = render(ctx, 0.03, (t, i, r) => clickGen(t, i, r) * envelope(t, 0.001, 0.008));

  const coin = notes(
    ctx,
    [
      [88, 0],
      [93, 1],
    ],
    0.05,
    'square',
  );
  lowpass(coin.getChannelData(0), ctx.sampleRate, () => 7000);

  const all: Record<SfxId, AudioBuffer> = {
    shot,
    hit,
    kill,
    killBig,
    gateHit,
    gateStep,
    gateGood,
    gateBad,
    unitsLost,
    explosion,
    enemyShot,
    bossRoar,
    win,
    lose,
    click,
    coin,
  };
  for (const buffer of Object.values(all)) normalize(buffer, 0.9);
  return all;
}
