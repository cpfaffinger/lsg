import type { BufferGeometry } from 'three';
import { ModelBuilder } from './model-builder.ts';
import { cyl, rbox, sphere, torus } from './shapes.ts';

const STEEL = { metalness: 0.8, roughness: 0.35 };

/** Gate structure (pillars, caps, top beam) for a gate of the given width and height. */
export function buildGateFrame(width: number, height: number): BufferGeometry {
  const b = new ModelBuilder();
  const half = width / 2;
  for (const side of [-1, 1]) {
    const x = side * half;
    b.add(
      cyl(0.2, 0.24, height, 1),
      { color: 0x3a4152, ...STEEL },
      { position: [x, height / 2, 0], rotation: [0, Math.PI / 6, 0] },
    );
    b.add(rbox(0.62, 0.22, 0.62, 0.06), { color: 0x2a303d, ...STEEL }, { position: [x, 0.11, 0] });
    b.add(
      cyl(0.3, 0.3, 0.16, 1),
      { color: 0x2a303d, ...STEEL },
      { position: [x, height + 0.08, 0], rotation: [0, Math.PI / 6, 0] },
    );
    b.add(sphere(0.14, 1), { color: 0xffffff, emissive: 1.6 }, { position: [x, height + 0.26, 0] });
  }
  b.add(rbox(width + 0.3, 0.2, 0.26, 0.06), { color: 0x2a303d, ...STEEL }, { position: [0, height, 0] });
  return b.build();
}

/** Thin strips along the pillars and beam that glow in the gate's colour. */
export function buildGateGlow(width: number, height: number): BufferGeometry {
  const b = new ModelBuilder();
  const half = width / 2;
  for (const side of [-1, 1]) {
    b.add(
      rbox(0.07, height - 0.4, 0.07, 0.02, 0),
      { color: 0xffffff },
      { position: [side * (half - side * 0.2), height / 2, 0.16] },
    );
    b.add(
      rbox(0.07, height - 0.4, 0.07, 0.02, 0),
      { color: 0xffffff },
      { position: [side * (half + side * 0.2), height / 2, 0.16] },
    );
  }
  b.add(rbox(width - 0.2, 0.06, 0.06, 0.02, 0), { color: 0xffffff }, { position: [0, height - 0.13, 0.15] });
  return b.build();
}

/** Concrete road barrier with hazard stripes and warning lights; 1 unit wide, scaled per obstacle. */
export function buildBarrier(): BufferGeometry {
  const b = new ModelBuilder();
  b.add(rbox(1, 0.4, 0.75, 0.06), { color: 0x9a9ca3, roughness: 0.95 }, { position: [0, 0.2, 0] });
  b.add(rbox(0.96, 0.65, 0.42, 0.08), { color: 0xa9abb2, roughness: 0.95 }, { position: [0, 0.72, 0] });
  // Hazard stripes facing the squad.
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    b.add(
      rbox(1 / stripes - 0.01, 0.22, 0.02, 0.005, 0),
      { color: i % 2 ? 0x1a1a1a : 0xffc21a, roughness: 0.6, emissive: i % 2 ? 0 : 0.15 },
      {
        position: [-0.5 + (i + 0.5) / stripes, 0.78, 0.22],
      },
    );
  }
  b.add(cyl(0.05, 0.06, 0.1, 0), { color: 0x222222 }, { position: [-0.35, 1.08, 0] });
  b.add(sphere(0.07, 0), { color: 0xff3020, emissive: 2.6 }, { position: [-0.35, 1.17, 0] });
  b.add(cyl(0.05, 0.06, 0.1, 0), { color: 0x222222 }, { position: [0.35, 1.08, 0] });
  b.add(sphere(0.07, 0), { color: 0xff3020, emissive: 2.6 }, { position: [0.35, 1.17, 0] });
  return b.build();
}

/** Explosive oil drum. */
export function buildBarrel(): BufferGeometry {
  const b = new ModelBuilder();
  b.add(
    cyl(0.52, 0.52, 1.1, 1),
    { color: 0xc2342a, metalness: 0.55, roughness: 0.45 },
    { position: [0, 0.6, 0] },
  );
  for (const y of [0.25, 0.6, 0.95]) {
    b.add(
      torus(0.53, 0.035, 1),
      { color: 0x8a2018, metalness: 0.6, roughness: 0.4 },
      { position: [0, y, 0], rotation: [Math.PI / 2, 0, 0] },
    );
  }
  b.add(
    cyl(0.535, 0.535, 0.2, 1, true),
    { color: 0xffc21a, emissive: 0.35, roughness: 0.5 },
    { position: [0, 0.75, 0] },
  );
  b.add(cyl(0.48, 0.48, 0.04, 1), { color: 0x3a3a3a, ...STEEL }, { position: [0, 1.16, 0] });
  b.add(cyl(0.07, 0.07, 0.05, 0), { color: 0x9a9a9a, ...STEEL }, { position: [0.25, 1.2, 0.1] });
  return b.build();
}
