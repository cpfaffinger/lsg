import type { BufferGeometry } from 'three';
import type { EnemyKind } from '../../sim/types.ts';
import { HEAVY, STILL, WALK, type AnimationProfile } from './animated-material.ts';
import { ModelBuilder, PART } from './model-builder.ts';
import { capsule, cone, cyl, ico, rbox, segment, sphere, torus, type Detail } from './shapes.ts';

/** All enemy models face +Z (towards the squad). Units: 1 = one soldier height. */

const JOINT = 0x2b1f24;
const METAL = { metalness: 0.6, roughness: 0.38 };

function runner(d: Detail): BufferGeometry {
  const b = new ModelBuilder();
  const armor = 0xb3262e;
  const hip: [number, number, number] = [-0.13, 0.5, 0];
  // Digitigrade legs.
  const leg = (mirror: boolean) => {
    const add = mirror ? b.mirror.bind(b) : b.add.bind(b);
    add(
      rbox(0.12, 0.3, 0.14, 0.04, d),
      { color: armor, part: PART.legLeft, pivot: hip, ...METAL },
      { position: [-0.13, 0.36, 0.03], rotation: [-0.4, 0, 0] },
    );
    add(
      rbox(0.09, 0.3, 0.1, 0.03, d),
      { color: JOINT, part: PART.legLeft, pivot: hip, roughness: 0.6 },
      { position: [-0.13, 0.15, -0.02], rotation: [0.35, 0, 0] },
    );
    add(
      rbox(0.12, 0.05, 0.2, 0.02, d),
      { color: JOINT, part: PART.legLeft, pivot: hip },
      { position: [-0.13, 0.025, 0.04] },
    );
  };
  leg(false);
  leg(true);
  // Hunched torso and back spikes.
  b.add(
    rbox(0.36, 0.3, 0.42, 0.08, d),
    { color: armor, ...METAL },
    { position: [0, 0.68, 0.02], rotation: [0.35, 0, 0] },
  );
  b.add(rbox(0.3, 0.12, 0.2, 0.04, d), { color: JOINT }, { position: [0, 0.52, -0.05] });
  if (d) {
    for (let i = 0; i < 3; i++) {
      b.add(
        cone(0.05, 0.18, d),
        { color: 0x6a1218, ...METAL },
        { position: [0, 0.86 - i * 0.06, -0.12 - i * 0.1], rotation: [-0.9, 0, 0] },
      );
    }
  }
  // Clawed arms.
  const shoulder: [number, number, number] = [-0.2, 0.72, 0.1];
  b.add(
    capsule(0.045, 0.22, d),
    { color: JOINT, part: PART.armLeft, pivot: shoulder },
    { position: [-0.22, 0.6, 0.2], rotation: [-0.9, 0, 0.2] },
  );
  b.add(
    cone(0.05, 0.14, d),
    { color: 0xe8d9c0, part: PART.armLeft, pivot: shoulder, ...METAL },
    { position: [-0.22, 0.5, 0.33], rotation: [Math.PI / 2 + 0.5, 0, 0] },
  );
  b.mirror(
    capsule(0.045, 0.22, d),
    { color: JOINT, part: PART.armLeft, pivot: shoulder },
    { position: [-0.22, 0.6, 0.2], rotation: [-0.9, 0, 0.2] },
  );
  b.mirror(
    cone(0.05, 0.14, d),
    { color: 0xe8d9c0, part: PART.armLeft, pivot: shoulder, ...METAL },
    { position: [-0.22, 0.5, 0.33], rotation: [Math.PI / 2 + 0.5, 0, 0] },
  );
  // Head with a single glowing eye.
  const neck: [number, number, number] = [0, 0.8, 0.18];
  b.add(
    rbox(0.24, 0.17, 0.24, 0.06, d),
    { color: armor, part: PART.head, pivot: neck, ...METAL },
    { position: [0, 0.86, 0.25] },
  );
  b.add(
    sphere(0.06, d),
    { color: 0xffa030, part: PART.head, pivot: neck, emissive: 1.4 },
    { position: [0, 0.87, 0.37] },
  );
  return b.build();
}

function shooter(d: Detail): BufferGeometry {
  const b = new ModelBuilder();
  const armor = 0x7d3fbf;
  const hip: [number, number, number] = [-0.14, 0.55, 0];
  b.add(
    rbox(0.15, 0.55, 0.17, 0.05, d),
    { color: JOINT, part: PART.legLeft, pivot: hip },
    { position: [-0.14, 0.29, 0] },
  );
  b.add(
    rbox(0.18, 0.08, 0.26, 0.03, d),
    { color: armor, part: PART.legLeft, pivot: hip, ...METAL },
    { position: [-0.14, 0.04, 0.03] },
  );
  b.mirror(
    rbox(0.15, 0.55, 0.17, 0.05, d),
    { color: JOINT, part: PART.legLeft, pivot: hip },
    { position: [-0.14, 0.29, 0] },
  );
  b.mirror(
    rbox(0.18, 0.08, 0.26, 0.03, d),
    { color: armor, part: PART.legLeft, pivot: hip, ...METAL },
    { position: [-0.14, 0.04, 0.03] },
  );
  b.add(rbox(0.46, 0.46, 0.32, 0.09, d), { color: armor, ...METAL }, { position: [0, 0.82, 0] });
  b.add(rbox(0.3, 0.16, 0.06, 0.03, d), { color: 0xc06cff, emissive: 0.9 }, { position: [0, 0.86, 0.17] });
  b.add(sphere(0.14, d), { color: armor, ...METAL }, { position: [-0.27, 1.02, 0], scale: [1.2, 0.8, 1] });
  b.add(sphere(0.14, d), { color: armor, ...METAL }, { position: [0.27, 1.02, 0], scale: [1.2, 0.8, 1] });
  // Left arm hangs, right arm is a cannon.
  const shoulder: [number, number, number] = [-0.3, 0.98, 0];
  b.add(
    capsule(0.06, 0.32, d),
    { color: JOINT, part: PART.armLeft, pivot: shoulder },
    { position: [-0.32, 0.76, 0.02] },
  );
  const gun: [number, number, number] = [0.3, 0.98, 0];
  const cannon = { color: 0x2c2440, part: PART.weapon, pivot: gun, ...METAL };
  b.add(cyl(0.1, 0.12, 0.5, d), cannon, { position: [0.32, 0.9, 0.22], rotation: [Math.PI / 2, 0, 0] });
  b.add(
    cyl(0.07, 0.07, 0.04, d),
    { ...cannon, color: 0xff4fd8, emissive: 2 },
    { position: [0.32, 0.9, 0.48], rotation: [Math.PI / 2, 0, 0] },
  );
  if (d) b.add(torus(0.11, 0.025, d), { ...cannon, color: armor }, { position: [0.32, 0.9, 0.1] });
  // Head with a visor slit.
  const neck: [number, number, number] = [0, 1.05, 0];
  b.add(
    rbox(0.24, 0.22, 0.24, 0.07, d),
    { color: armor, part: PART.head, pivot: neck, ...METAL },
    { position: [0, 1.17, 0.02] },
  );
  b.add(
    rbox(0.2, 0.04, 0.03, 0.01, d),
    { color: 0xff4fd8, part: PART.head, pivot: neck, emissive: 1.8 },
    { position: [0, 1.18, 0.14] },
  );
  return b.build();
}

function shield(d: Detail): BufferGeometry {
  const b = new ModelBuilder();
  const armor = 0x4a54a8;
  const hip: [number, number, number] = [-0.18, 0.55, 0];
  b.add(
    rbox(0.22, 0.56, 0.24, 0.07, d),
    { color: JOINT, part: PART.legLeft, pivot: hip },
    { position: [-0.18, 0.28, 0] },
  );
  b.mirror(
    rbox(0.22, 0.56, 0.24, 0.07, d),
    { color: JOINT, part: PART.legLeft, pivot: hip },
    { position: [-0.18, 0.28, 0] },
  );
  b.add(rbox(0.62, 0.54, 0.42, 0.12, d), { color: armor, ...METAL }, { position: [0, 0.84, -0.04] });
  b.add(
    rbox(0.26, 0.2, 0.26, 0.08, d),
    { color: armor, part: PART.head, pivot: [0, 1.1, 0], ...METAL },
    { position: [0, 1.2, -0.02] },
  );
  b.add(
    rbox(0.18, 0.04, 0.02, 0.01, d),
    { color: 0x7fb0ff, part: PART.head, pivot: [0, 1.1, 0], emissive: 1.8 },
    { position: [0, 1.22, 0.12] },
  );
  // Big hexagonal energy shield held in front.
  b.add(
    cyl(0.62, 0.62, 0.08, 0),
    { color: 0x2c3366, ...METAL },
    { position: [0, 0.8, 0.42], rotation: [Math.PI / 2, 0, Math.PI / 6], scale: [1, 1, 1.15] },
  );
  b.add(
    torus(0.6, 0.035, d),
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

function splitter(d: Detail): BufferGeometry {
  const b = new ModelBuilder();
  const blob = {
    color: 0xff7a2a,
    part: PART.wobble,
    pivot: [0, 0.6, 0] as [number, number, number],
    roughness: 0.25,
    emissive: 0.35,
  };
  b.add(ico(0.5, d), blob, { position: [0, 0.6, 0] });
  b.add(ico(0.26, d), { ...blob, color: 0xff9440 }, { position: [0.38, 0.4, 0.1] });
  b.add(ico(0.22, d), { ...blob, color: 0xff6a20 }, { position: [-0.36, 0.36, 0.12] });
  b.add(ico(0.2, d), { ...blob, color: 0xffa050 }, { position: [0.05, 1.0, -0.1] });
  b.add(sphere(0.2, d), { color: 0xffe08a, part: PART.core, emissive: 2.2 }, { position: [0, 0.62, 0.3] });
  if (d) {
    for (const [x, y] of [
      [-0.14, 0.78],
      [0.14, 0.8],
    ] as const) {
      b.add(
        sphere(0.07, d),
        { color: 0x2a0a00, part: PART.wobble, pivot: [0, 0.6, 0], roughness: 0.2 },
        { position: [x, y, 0.42] },
      );
    }
  }
  return b.build();
}

function tank(d: Detail): BufferGeometry {
  const b = new ModelBuilder();
  const armor = 0x6e2a2a;
  // Tracks.
  for (const side of [-1, 1]) {
    b.add(
      rbox(0.36, 0.42, 1.8, 0.12, d),
      { color: 0x1d1d22, roughness: 0.9 },
      { position: [side * 0.62, 0.22, 0] },
    );
    if (d) {
      for (const z of [-0.6, -0.2, 0.2, 0.6]) {
        b.add(
          cyl(0.16, 0.16, 0.38, d),
          { color: 0x3a3a42, ...METAL },
          { position: [side * 0.62, 0.2, z], rotation: [0, 0, Math.PI / 2] },
        );
      }
    }
  }
  // Hull and armour plates.
  b.add(rbox(1.0, 0.42, 1.7, 0.1, d), { color: armor, ...METAL }, { position: [0, 0.55, 0] });
  b.add(rbox(1.5, 0.12, 1.6, 0.05, d), { color: 0x4f1d1d, ...METAL }, { position: [0, 0.78, 0] });
  b.add(
    rbox(1.2, 0.3, 0.2, 0.06, d),
    { color: armor, ...METAL },
    { position: [0, 0.5, 0.92], rotation: [0.5, 0, 0] },
  );
  // Turret with barrel and sensor.
  b.add(cyl(0.42, 0.5, 0.36, d), { color: armor, ...METAL }, { position: [0, 1.02, -0.05] });
  b.add(
    cyl(0.08, 0.1, 1.1, d),
    { color: 0x2a2a30, part: PART.weapon, pivot: [0, 1.05, 0.2], ...METAL },
    { position: [0, 1.05, 0.7], rotation: [Math.PI / 2, 0, 0] },
  );
  b.add(sphere(0.09, d), { color: 0xff3030, emissive: 2 }, { position: [0.24, 1.18, 0.28] });
  if (d)
    b.add(rbox(0.3, 0.12, 0.3, 0.04, d), { color: 0x4f1d1d, ...METAL }, { position: [-0.15, 1.26, -0.2] });
  return b.build();
}

function miniboss(d: Detail): BufferGeometry {
  const b = new ModelBuilder();
  const armor = 0x5a1f7a;
  const gold = 0xd9a520;
  // Four insect legs; diagonal pairs swing together (trot).
  const legs: [number, number, 1 | 2][] = [
    [-1, 1, PART.legLeft],
    [1, -1, PART.legLeft],
    [1, 1, PART.legRight],
    [-1, -1, PART.legRight],
  ];
  for (const [sx, sz, part] of legs) {
    const hip: [number, number, number] = [sx * 0.85, 1.75, sz * 0.75];
    const knee: [number, number, number] = [sx * 1.85, 2.35, sz * 1.15];
    const foot: [number, number, number] = [sx * 2.15, 0.12, sz * 1.35];
    b.add(segment(hip, knee, 0.15, d), { color: armor, part, pivot: hip, ...METAL });
    b.add(sphere(0.2, d), { color: gold, part, pivot: hip, ...METAL }, { position: knee });
    b.add(segment(knee, foot, 0.12, d), { color: JOINT, part, pivot: hip });
    b.add(
      cone(0.16, 0.32, d),
      { color: gold, part, pivot: hip, ...METAL },
      { position: [foot[0], 0.16, foot[2]], rotation: [Math.PI, 0, 0] },
    );
  }
  // Armoured body with a glowing core underneath.
  b.add(sphere(1.1, d), { color: armor, ...METAL }, { position: [0, 1.85, 0], scale: [1.15, 0.6, 1.35] });
  b.add(
    sphere(1.0, d, Math.PI / 2),
    { color: 0x7a2fa0, ...METAL },
    { position: [0, 2.0, 0], scale: [1.05, 0.55, 1.25] },
  );
  b.add(sphere(0.38, d), { color: 0xff40a0, part: PART.core, emissive: 2.4 }, { position: [0, 1.45, 0.2] });
  // Twin cannons on top.
  for (const sx of [-1, 1]) {
    b.add(
      cyl(0.14, 0.16, 1.2, d),
      { color: 0x2c2440, part: PART.weapon, pivot: [sx * 0.45, 2.45, 0], ...METAL },
      { position: [sx * 0.45, 2.45, 0.6], rotation: [Math.PI / 2, 0, 0] },
    );
    b.add(
      cyl(0.1, 0.1, 0.05, d),
      { color: 0xff4fd8, part: PART.weapon, pivot: [sx * 0.45, 2.45, 0], emissive: 2.4 },
      { position: [sx * 0.45, 2.45, 1.21], rotation: [Math.PI / 2, 0, 0] },
    );
  }
  // Eyes.
  for (const sx of [-0.3, 0, 0.3]) {
    b.add(sphere(0.1, d), { color: 0xffd040, emissive: 2.2 }, { position: [sx, 1.95, 1.38] });
  }
  return b.build();
}

function boss(d: Detail): BufferGeometry {
  const b = new ModelBuilder();
  const armor = 0x3a0f2a;
  const plate = 0x5c1a3e;
  const glow = 0xff2050;
  const hip: [number, number, number] = [-0.9, 2.6, 0];
  // Legs.
  b.add(
    rbox(0.9, 1.6, 1.0, 0.25, d),
    { color: plate, part: PART.legLeft, pivot: hip, ...METAL },
    { position: [-0.9, 1.9, 0] },
  );
  b.add(
    rbox(0.75, 1.4, 0.85, 0.2, d),
    { color: JOINT, part: PART.legLeft, pivot: hip },
    { position: [-0.9, 0.75, 0.1] },
  );
  b.add(
    rbox(1.0, 0.35, 1.5, 0.15, d),
    { color: plate, part: PART.legLeft, pivot: hip, ...METAL },
    { position: [-0.9, 0.18, 0.25] },
  );
  b.mirror(
    rbox(0.9, 1.6, 1.0, 0.25, d),
    { color: plate, part: PART.legLeft, pivot: hip, ...METAL },
    { position: [-0.9, 1.9, 0] },
  );
  b.mirror(
    rbox(0.75, 1.4, 0.85, 0.2, d),
    { color: JOINT, part: PART.legLeft, pivot: hip },
    { position: [-0.9, 0.75, 0.1] },
  );
  b.mirror(
    rbox(1.0, 0.35, 1.5, 0.15, d),
    { color: plate, part: PART.legLeft, pivot: hip, ...METAL },
    { position: [-0.9, 0.18, 0.25] },
  );
  // Massive torso with a reactor core.
  b.add(rbox(2.8, 2.2, 1.8, 0.4, d), { color: armor, ...METAL }, { position: [0, 3.9, 0] });
  b.add(rbox(2.2, 1.4, 0.4, 0.2, d), { color: plate, ...METAL }, { position: [0, 4.0, 0.85] });
  b.add(sphere(0.55, d), { color: glow, part: PART.core, emissive: 3 }, { position: [0, 4.05, 1.0] });
  b.add(
    torus(0.62, 0.1, d),
    { color: 0x8a2a50, part: PART.spin, pivot: [0, 4.05, 1.05], ...METAL },
    { position: [0, 4.05, 1.05], rotation: [0, 0, 0] },
  );
  // Shoulders.
  for (const sx of [-1, 1]) {
    b.add(
      sphere(0.95, d),
      { color: plate, ...METAL },
      { position: [sx * 1.75, 4.7, 0], scale: [1, 0.75, 1] },
    );
    if (d)
      b.add(
        cone(0.3, 1.0, d),
        { color: 0xe8d9c0, ...METAL },
        { position: [sx * 1.9, 5.5, -0.1], rotation: [0, 0, -sx * 0.4] },
      );
  }
  // Arms ending in cannons.
  const shoulder: [number, number, number] = [-1.75, 4.6, 0];
  const arm = (mirror: boolean) => {
    const add = mirror ? b.mirror.bind(b) : b.add.bind(b);
    add(
      rbox(0.7, 1.6, 0.8, 0.2, d),
      { color: JOINT, part: PART.armLeft, pivot: shoulder },
      { position: [-1.95, 3.6, 0.2] },
    );
    add(
      cyl(0.45, 0.5, 1.4, d),
      { color: plate, part: PART.armLeft, pivot: shoulder, ...METAL },
      { position: [-1.95, 2.8, 0.75], rotation: [Math.PI / 2, 0, 0] },
    );
    add(
      cyl(0.3, 0.3, 0.08, d),
      { color: glow, part: PART.armLeft, pivot: shoulder, emissive: 3 },
      { position: [-1.95, 2.8, 1.47], rotation: [Math.PI / 2, 0, 0] },
    );
  };
  arm(false);
  arm(true);
  // Head with crest and glowing eyes.
  const neck: [number, number, number] = [0, 5.0, 0];
  b.add(
    rbox(1.0, 0.8, 1.0, 0.25, d),
    { color: plate, part: PART.head, pivot: neck, ...METAL },
    { position: [0, 5.45, 0.2] },
  );
  b.add(
    rbox(0.7, 0.12, 0.06, 0.03, d),
    { color: glow, part: PART.head, pivot: neck, emissive: 3 },
    { position: [0, 5.5, 0.72] },
  );
  b.add(
    cone(0.18, 0.9, d),
    { color: 0xe8d9c0, part: PART.head, pivot: neck, ...METAL },
    { position: [0, 6.1, 0.05], rotation: [-0.3, 0, 0] },
  );
  if (d) {
    for (const sx of [-0.7, 0.7]) {
      b.add(
        cyl(0.18, 0.22, 1.2, d),
        { color: JOINT, ...METAL },
        { position: [sx, 5.0, -1.0], rotation: [-0.4, 0, 0] },
      );
      b.add(
        cyl(0.14, 0.14, 0.05, d),
        { color: 0xff8a30, emissive: 2.5 },
        { position: [sx, 5.55, -1.22], rotation: [-0.4, 0, 0] },
      );
    }
  }
  return b.build();
}

const BUILDERS: Record<EnemyKind, (d: Detail) => BufferGeometry> = {
  runner,
  shooter,
  shield,
  splitter,
  tank,
  miniboss,
  boss,
};

export function buildEnemy(kind: EnemyKind, detail: Detail): BufferGeometry {
  return BUILDERS[kind](detail);
}

export const ENEMY_ANIMATION: Record<EnemyKind, { profile: AnimationProfile; gait: number }> = {
  runner: { profile: WALK, gait: 13 },
  shooter: { profile: { ...WALK, legSwing: 0.45, armSwing: 0.15 }, gait: 8 },
  shield: { profile: HEAVY, gait: 6 },
  splitter: { profile: { ...STILL, wobble: 0.12 }, gait: 1 },
  tank: { profile: { ...STILL, wobble: 0, bob: 0.015 }, gait: 14 },
  miniboss: { profile: { ...HEAVY, legSwing: 0.3 }, gait: 4 },
  boss: { profile: { ...HEAVY, legSwing: 0.18, armSwing: 0.12, bob: 0.06 }, gait: 2.2 },
};
