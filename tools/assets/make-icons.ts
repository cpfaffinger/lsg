/**
 * Generates the app icons (PNG) without any image library: a tiny rasteriser with 4x4
 * supersampling and a minimal PNG encoder on top of node:zlib.
 *
 *   node tools/assets/make-icons.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

type RGBA = [number, number, number, number];

const OUT = path.resolve('apps/game/public/icons');

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width: number, height: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Colour of the icon at normalised coordinates (0..1), before rounding/masking. */
function shade(u: number, v: number): RGBA {
  // Night-sky gradient background.
  let r = mix(0x1a, 0x07, v) / 255;
  let g = mix(0x2c, 0x0c, v) / 255;
  let b = mix(0x5c, 0x1c, v) / 255;
  // Lane in perspective: narrow at the horizon (v = 0.28), wide at the bottom.
  const t = clamp01((v - 0.28) / 0.72);
  const halfWidth = mix(0.04, 0.42, t);
  const dx = Math.abs(u - 0.5);
  if (v > 0.28) {
    if (dx < halfWidth) {
      r = mix(0.16, 0.22, t);
      g = mix(0.2, 0.27, t);
      b = mix(0.32, 0.4, t);
      // Centre dashes.
      if (dx < 0.006 + t * 0.01 && Math.floor(t * 9) % 2 === 0) {
        r = g = b = 0.75;
      }
    }
    // Glowing lane edges.
    const edge = Math.abs(dx - halfWidth);
    const glow = Math.exp(-edge * (90 - t * 40));
    r = mix(r, 0.35, glow);
    g = mix(g, 0.9, glow);
    b = mix(b, 1, glow);
  }
  // Gate at the horizon.
  if (v > 0.24 && v < 0.36 && dx < 0.11 && dx > 0.085) {
    r = 0.25;
    g = 1;
    b = 0.55;
  }
  // Three soldiers near the bottom (helmet + body).
  for (const sx of [0.38, 0.5, 0.62]) {
    const vx = (u - sx) / 0.032;
    const vy = (v - 0.705) / 0.011;
    if (vx * vx + vy * vy < 1) return [0.45, 0.97, 1, 1];
    const hx = (u - sx) / 0.045;
    const hy = (v - 0.7) / 0.045;
    if (hx * hx + hy * hy < 1) return [0.18, 0.55, 1, 1];
    const bx = Math.max(Math.abs(u - sx) - 0.02, 0);
    const by = Math.max(Math.abs(v - 0.785) - 0.045, 0);
    if (Math.hypot(bx, by) < 0.015) return [0.12, 0.38, 0.85, 1];
  }
  return [r, g, b, 1];
}

function render(size: number, options: { rounded: boolean; padding: number }): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const samples = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = (x + (sx + 0.5) / samples) / size;
          const py = (y + (sy + 0.5) / samples) / size;
          if (options.rounded) {
            // Rounded square mask.
            const qx = Math.max(Math.abs(px - 0.5) - 0.5 + 0.2, 0);
            const qy = Math.max(Math.abs(py - 0.5) - 0.5 + 0.2, 0);
            if (Math.hypot(qx, qy) > 0.2) continue;
          }
          // Content scaled into the safe zone for maskable icons.
          const u = (px - options.padding) / (1 - options.padding * 2);
          const v = (py - options.padding) / (1 - options.padding * 2);
          const c = shade(u, v);
          r += c[0];
          g += c[1];
          b += c[2];
          a += c[3];
        }
      }
      const n = samples * samples;
      const i = (y * size + x) * 4;
      const alpha = a / n;
      pixels[i] = alpha > 0 ? Math.round((r / (a || 1)) * 255) : 0;
      pixels[i + 1] = alpha > 0 ? Math.round((g / (a || 1)) * 255) : 0;
      pixels[i + 2] = alpha > 0 ? Math.round((b / (a || 1)) * 255) : 0;
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

fs.mkdirSync(OUT, { recursive: true });
const icons = [
  { name: 'icon-192.png', size: 192, rounded: true, padding: 0 },
  { name: 'icon-512.png', size: 512, rounded: true, padding: 0 },
  { name: 'maskable-512.png', size: 512, rounded: false, padding: 0.1 },
  { name: 'apple-touch-icon.png', size: 180, rounded: false, padding: 0 },
  { name: 'favicon-32.png', size: 32, rounded: true, padding: 0 },
];
for (const icon of icons) {
  const png = encodePng(icon.size, icon.size, render(icon.size, icon));
  fs.writeFileSync(path.join(OUT, icon.name), png);
  console.info(`${icon.name}: ${png.length} bytes`);
}
