import type { BufferGeometry } from 'three';
import type { EnemyKind } from '../../sim/types.ts';
import { ModelBuilder } from './model-builder.ts';
import { cyl, torus, type Detail } from './shapes.ts';
import type { CharacterId } from './skinned-character.ts';

const METAL = { metalness: 0.6, roughness: 0.38 };

/** Character, size and height above the ground of every enemy kind. */
export const ENEMY_MODELS: Record<EnemyKind, { id: CharacterId; scale: number; lift: number }> = {
  runner: { id: 'enemy', scale: 0.56, lift: 0 },
  shooter: { id: 'hazmat', scale: 0.62, lift: 0 },
  shield: { id: 'orc', scale: 0.56, lift: 0 },
  splitter: { id: 'blob', scale: 0.4, lift: 0 },
  tank: { id: 'yeti', scale: 0.92, lift: 0 },
  miniboss: { id: 'demon', scale: 1.45, lift: 0 },
  boss: { id: 'dragon', scale: 2.1, lift: 0 },
};

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
