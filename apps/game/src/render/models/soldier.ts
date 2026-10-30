import type { BufferGeometry } from 'three';
import { ModelBuilder, PART } from './model-builder.ts';
import { capsule, cyl, rbox, sphere, type Detail } from './shapes.ts';

const SKIN = 0xd9a07a;
const GUNMETAL = 0x2a2f38;
const DARK = 0x3a3f4a;
const BOOT = 0x22252b;
const VISOR = 0x5ff3ff;

/**
 * Stylised soldier, about 1.05 units tall, facing -Z (towards the enemies).
 * Team-coloured parts follow the selected skin; the visor glows.
 */
export function buildSoldier(detail: Detail = 1): BufferGeometry {
  const b = new ModelBuilder();
  const team = (shade: number) => ({ color: shade, team: true, roughness: 0.55, metalness: 0.15 });

  // Legs with boots, rotating around the hips.
  const hip: [number, number, number] = [-0.085, 0.46, 0];
  b.add(
    rbox(0.12, 0.4, 0.14, 0.04, detail),
    { ...team(0x8a8a8a), part: PART.legLeft, pivot: hip },
    { position: [-0.085, 0.26, 0] },
  );
  b.add(
    rbox(0.14, 0.1, 0.22, 0.035, detail),
    { color: BOOT, part: PART.legLeft, pivot: hip, roughness: 0.8 },
    { position: [-0.085, 0.05, -0.03] },
  );
  b.mirror(
    rbox(0.12, 0.4, 0.14, 0.04, detail),
    { ...team(0x8a8a8a), part: PART.legLeft, pivot: hip },
    { position: [-0.085, 0.26, 0] },
  );
  b.mirror(
    rbox(0.14, 0.1, 0.22, 0.035, detail),
    { color: BOOT, part: PART.legLeft, pivot: hip, roughness: 0.8 },
    { position: [-0.085, 0.05, -0.03] },
  );
  if (detail) {
    // Knee pads.
    b.add(
      rbox(0.1, 0.08, 0.04, 0.02, detail),
      { color: DARK, part: PART.legLeft, pivot: hip, roughness: 0.5 },
      { position: [-0.085, 0.28, -0.075] },
    );
    b.mirror(
      rbox(0.1, 0.08, 0.04, 0.02, detail),
      { color: DARK, part: PART.legLeft, pivot: hip, roughness: 0.5 },
      { position: [-0.085, 0.28, -0.075] },
    );
  }

  // Torso: belt, body, armoured vest, backpack.
  b.add(rbox(0.3, 0.08, 0.18, 0.03, detail), { color: DARK, roughness: 0.7 }, { position: [0, 0.47, 0] });
  b.add(rbox(0.3, 0.32, 0.19, 0.06, detail), team(0xffffff), { position: [0, 0.66, 0] });
  b.add(rbox(0.32, 0.22, 0.07, 0.03, detail), team(0x6a6a6a), { position: [0, 0.68, -0.09] });
  b.add(
    rbox(0.24, 0.27, 0.12, 0.04, detail),
    { color: DARK, roughness: 0.75 },
    { position: [0, 0.68, 0.15] },
  );
  if (detail) {
    b.add(
      cyl(0.008, 0.008, 0.3, detail),
      { color: GUNMETAL, metalness: 0.6, roughness: 0.4 },
      { position: [0.08, 0.95, 0.18] },
    );
    b.add(sphere(0.02, detail), { color: 0xff5040, emissive: 1 }, { position: [0.08, 1.1, 0.18] });
    // Pouches on the vest.
    b.add(rbox(0.08, 0.07, 0.04, 0.015, detail), { color: DARK }, { position: [-0.08, 0.6, -0.135] });
    b.add(rbox(0.08, 0.07, 0.04, 0.015, detail), { color: DARK }, { position: [0.08, 0.6, -0.135] });
  }

  // Shoulders and arms reaching forward to the rifle.
  const shoulder: [number, number, number] = [-0.19, 0.78, 0];
  b.add(
    sphere(0.08, detail),
    { ...team(0xb0b0b0), part: PART.armLeft, pivot: shoulder },
    { position: [-0.19, 0.79, 0], scale: [1.1, 0.8, 1] },
  );
  b.add(
    capsule(0.048, 0.24, detail),
    { ...team(0x9a9a9a), part: PART.armLeft, pivot: shoulder },
    { position: [-0.17, 0.7, -0.12], rotation: [-1.05, 0, 0.25] },
  );
  b.add(
    sphere(0.038, detail),
    { color: 0x2a2d33, part: PART.armLeft, pivot: shoulder, roughness: 0.8 },
    { position: [-0.1, 0.66, -0.27] },
  );
  b.mirror(
    sphere(0.08, detail),
    { ...team(0xb0b0b0), part: PART.armLeft, pivot: shoulder },
    { position: [-0.19, 0.79, 0], scale: [1.1, 0.8, 1] },
  );
  b.mirror(
    capsule(0.048, 0.24, detail),
    { ...team(0x9a9a9a), part: PART.armLeft, pivot: shoulder },
    { position: [-0.17, 0.7, -0.12], rotation: [-1.05, 0, 0.25] },
  );
  b.mirror(
    sphere(0.038, detail),
    { color: 0x2a2d33, part: PART.armLeft, pivot: shoulder, roughness: 0.8 },
    { position: [-0.1, 0.66, -0.27] },
  );

  // Rifle held at chest height, recoils along +Z.
  const grip: [number, number, number] = [0, 0.68, -0.15];
  const gun = { color: GUNMETAL, part: PART.weapon, pivot: grip, metalness: 0.75, roughness: 0.35 };
  b.add(rbox(0.06, 0.08, 0.4, 0.015, detail), gun, { position: [0.02, 0.69, -0.28] });
  b.add(cyl(0.016, 0.016, 0.22, detail), gun, {
    position: [0.02, 0.705, -0.58],
    rotation: [Math.PI / 2, 0, 0],
  });
  b.add(rbox(0.04, 0.1, 0.06, 0.01, detail), gun, { position: [0.02, 0.61, -0.25], rotation: [0.25, 0, 0] });
  if (detail) {
    b.add(
      rbox(0.035, 0.04, 0.12, 0.01, detail),
      { ...gun, color: 0x15181d },
      { position: [0.02, 0.755, -0.27] },
    );
    b.add(
      cyl(0.012, 0.012, 0.02, detail),
      { ...gun, color: 0x7fe0ff, emissive: 0.8 },
      { position: [0.02, 0.755, -0.335], rotation: [Math.PI / 2, 0, 0] },
    );
  }

  // Head, helmet and glowing visor.
  const neck: [number, number, number] = [0, 0.84, 0];
  b.add(
    sphere(0.1, detail),
    { color: SKIN, part: PART.head, pivot: neck, roughness: 0.7 },
    { position: [0, 0.93, 0] },
  );
  b.add(
    sphere(0.125, detail, Math.PI * 0.56),
    { ...team(0xd8d8d8), part: PART.head, pivot: neck, roughness: 0.4, metalness: 0.25 },
    { position: [0, 0.94, 0.005], scale: [1, 0.95, 1.08] },
  );
  b.add(
    rbox(0.19, 0.045, 0.06, 0.02, detail),
    { color: VISOR, part: PART.head, pivot: neck, emissive: 1, roughness: 0.2 },
    { position: [0, 0.94, -0.085] },
  );
  return b.build();
}
