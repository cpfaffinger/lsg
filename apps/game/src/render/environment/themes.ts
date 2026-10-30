import { mediaUrl } from '../../media.ts';
import type { WorldId } from '../../sim/level.ts';

export interface WorldTheme {
  id: WorldId;
  sky: { top: number; horizon: number; bottom: number; sunColor: number; sunSize: number; stars: number };
  fog: { color: number; near: number; far: number };
  sun: { color: number; intensity: number; direction: [number, number, number] };
  hemisphere: { sky: number; ground: number; intensity: number };
  /** Image-based lighting from an HDRI (CC0, see docs/ASSETS.md). */
  environment: { hdri: string; intensity: number };
  exposure: number;
  lane: {
    diffuse: string;
    normal: string;
    tint: number;
    tileSize: number;
    roughness: number;
    metalness: number;
    normalScale: number;
  };
  ground: { color: number; roughness: number };
  edge: { color: number; glow: number };
  /** Colour grading hints used by the post-processing stack. */
  grading: { saturation: number; contrast: number; vignette: number; bloom: number };
}

export const THEMES: Record<WorldId, WorldTheme> = {
  desert: {
    id: 'desert',
    sky: { top: 0x2f7fd6, horizon: 0xf7d29a, bottom: 0xe7b97e, sunColor: 0xfff1c8, sunSize: 0.035, stars: 0 },
    fog: { color: 0xf0cf9e, near: 70, far: 230 },
    sun: { color: 0xffe2b0, intensity: 2.6, direction: [-0.45, 0.75, 0.35] },
    hemisphere: { sky: 0xbfe0ff, ground: 0xc79a62, intensity: 0.6 },
    environment: { hdri: mediaUrl('hdri/goegap_1k.hdr'), intensity: 0.6 },
    exposure: 0.95,
    lane: {
      diffuse: mediaUrl('textures/aerial_beach_01/diff_1k.jpg'),
      normal: mediaUrl('textures/aerial_beach_01/nor_1k.jpg'),
      tint: 0xf0d2a8,
      tileSize: 7,
      roughness: 0.95,
      metalness: 0,
      normalScale: 1.2,
    },
    ground: { color: 0xc9925a, roughness: 1 },
    edge: { color: 0xffb347, glow: 1.8 },
    grading: { saturation: 1.12, contrast: 1.05, vignette: 0.35, bloom: 0.7 },
  },
  city: {
    id: 'city',
    sky: {
      top: 0x05040f,
      horizon: 0x3a1a5c,
      bottom: 0x120a24,
      sunColor: 0xd6e4ff,
      sunSize: 0.02,
      stars: 0.4,
    },
    fog: { color: 0x1d1033, near: 55, far: 190 },
    sun: { color: 0x9db8ff, intensity: 0.8, direction: [0.35, 0.8, 0.25] },
    hemisphere: { sky: 0x6a4cff, ground: 0x1a1020, intensity: 0.5 },
    environment: { hdri: mediaUrl('hdri/shanghai_bund_1k.hdr'), intensity: 0.55 },
    exposure: 1.05,
    lane: {
      diffuse: mediaUrl('textures/asphalt_02/diff_1k.jpg'),
      normal: mediaUrl('textures/asphalt_02/nor_1k.jpg'),
      tint: 0xa8a8c0,
      tileSize: 6,
      roughness: 0.55,
      metalness: 0.15,
      normalScale: 0.9,
    },
    ground: { color: 0x15121f, roughness: 0.8 },
    edge: { color: 0xff3fd8, glow: 3 },
    grading: { saturation: 1.2, contrast: 1.1, vignette: 0.45, bloom: 0.95 },
  },
  station: {
    id: 'station',
    sky: { top: 0x020208, horizon: 0x101a3a, bottom: 0x05060f, sunColor: 0xbfe9ff, sunSize: 0.05, stars: 1 },
    fog: { color: 0x0a1024, near: 60, far: 210 },
    sun: { color: 0xd8f0ff, intensity: 2.4, direction: [0.5, 0.7, -0.2] },
    hemisphere: { sky: 0x8fd6ff, ground: 0x10142a, intensity: 0.5 },
    environment: { hdri: mediaUrl('hdri/studio_small_08_1k.hdr'), intensity: 0.9 },
    exposure: 1.05,
    lane: {
      diffuse: mediaUrl('textures/blue_metal_plate/diff_1k.jpg'),
      normal: mediaUrl('textures/blue_metal_plate/nor_1k.jpg'),
      tint: 0xb0c4e8,
      tileSize: 5,
      roughness: 0.4,
      metalness: 0.65,
      normalScale: 1,
    },
    ground: { color: 0x0c1022, roughness: 0.6 },
    edge: { color: 0x3fe6ff, glow: 2.6 },
    grading: { saturation: 1.05, contrast: 1.12, vignette: 0.5, bloom: 1 },
  },
};
