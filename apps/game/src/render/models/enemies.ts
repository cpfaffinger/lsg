import type { BufferGeometry } from 'three';
import type { EnemyKind } from '../../sim/types.ts';
import type { AnimationProfile } from './animated-material.ts';
import { ModelBuilder, PART } from './model-builder.ts';
import { cyl, rbox, sphere, torus, type Detail } from './shapes.ts';
import type { CharacterId } from './skinned-character.ts';

const METAL = { metalness: 0.6, roughness: 0.38 };

/** Character, size and height above the ground of every enemy kind; null = procedural model. */
export const ENEMY_MODELS: Record<EnemyKind, { id: CharacterId | null; scale: number; lift: number }> = {
  runner: { id: 'enemy', scale: 0.56, lift: 0 },
  shooter: { id: 'hazmat', scale: 0.62, lift: 0 },
  shield: { id: 'orc', scale: 0.56, lift: 0 },
  splitter: { id: 'blob', scale: 0.4, lift: 0 },
  bomber: { id: null, scale: 1, lift: 0 },
  tank: { id: 'yeti', scale: 0.92, lift: 0 },
  miniboss: { id: 'demon', scale: 1.45, lift: 0 },
  boss: { id: 'dragon', scale: 2.1, lift: 0 },
};

/** The bomber's waddle; its legs swing at the gait speed of its instance. */
export const BOMBER_WALK: AnimationProfile = { legSwing: 0.9, bob: 0.08, armSwing: 0, wobble: 0.08 };

/** A walking bomb: dark round body, burning fuse, angry eyes. Faces +Z, in world units. */
export function buildBomber(detail: Detail): BufferGeometry {
  const b = new ModelBuilder();
  b.add(sphere(0.44, detail), { color: 0x23252e, ...METAL }, { position: [0, 0.68, 0] });
  b.add(torus(0.44, 0.03, detail), { color: 0xffb020, emissive: 1.4 }, { rotation: [Math.PI / 2, 0, 0], position: [0, 0.68, 0] });
  b.add(cyl(0.05, 0.07, 0.3, 0), { color: 0xc8b48a }, { position: [0.08, 1.2, 0], rotation: [0, 0, -0.3] });
  b.add(sphere(0.13, 0), { color: 0xffc040, emissive: 3, part: PART.core }, { position: [0.14, 1.38, 0] });
  for (const side of [-1, 1]) {
    b.add(sphere(0.08, 0), { color: 0xff3020, emissive: 2.4 }, { position: [side * 0.17, 0.8, 0.38] });
    b.add(
      rbox(0.18, 0.2, 0.3, 0.03, detail),
      { color: 0x3a3032, part: side < 0 ? PART.legLeft : PART.legRight, pivot: [side * 0.2, 0.34, 0] },
      { position: [side * 0.2, 0.12, 0.04] },
    );
  }
  return b.build();
}

/** The energy shield carried in front of a shield bearer. Faces +Z, in world units. */
export function buildShieldPlate(detail: Detail): BufferGeometry {
  const b = new ModelBuilder();
  b.add(
    cyl(0.62, 0.62, 0.08, 0),
    { color: 0x2c3366, ...METAL },
    { position: [0, 0.8, 0.42], rotation: [Math.PI / 2, 0, Math.PI / 6], scale: [1, 1, 1.15] },
  );
  b.add(
    torus(0.6, 0.035, detail),
    { color: 0x6f8dff, emissive: 2.2 },
    { position: [0, 0.8, 0.47], scale: [1, 1.15, 1] },
  );
  b.add(
    cyl(0.5, 0.5, 0.02, 0),
    { color: 0x5a7bff, emissive: 0.5, roughness: 0.15 },
    { position: [0, 0.8, 0.47], rotation: [Math.PI / 2, 0, Math.PI / 6], scale: [1, 1, 1.15] },
  );
  return b.build();
}
