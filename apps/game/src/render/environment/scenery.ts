import {
  BoxGeometry,
  BufferAttribute,
  Group,
  Mesh,
  Vector3,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WorldId } from '../../sim/level.ts';
import { Rng } from '../../sim/rng.ts';
import { LANE_HALF_WIDTH } from '../../sim/world.ts';
import { ModelBuilder } from '../models/model-builder.ts';
import { capsule, cone, cyl, dodeca, ico, rbox, sphere, torus } from '../models/shapes.ts';
import { createBuildingMaterial, createStaticMaterial } from '../models/static-material.ts';

/** Length of one scenery strip; two copies leapfrog each other for an endless lane. */
const STRIP_LENGTH = 240;
const EDGE = LANE_HALF_WIDTH + 0.6;

type Builder = ModelBuilder;

function jitterRock(geometry: BufferGeometry, rng: Rng, amount: number): BufferGeometry {
  const position = geometry.getAttribute('position') as BufferAttribute;
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    v.multiplyScalar(1 + (rng.next() - 0.5) * amount);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Picks a side and a distance from the lane for a prop. */
function sideX(rng: Rng, min: number, max: number): number {
  return (rng.chance(0.5) ? -1 : 1) * rng.range(EDGE + min, EDGE + max);
}

// ------------------------------------------------------------------ desert

function desertStrip(rng: Rng, b: Builder): void {
  const sandstone = [0xb8743f, 0xc98a52, 0xa8653a, 0xd39b62];
  for (let z = 0; z < STRIP_LENGTH; z += rng.range(4, 9)) {
    const x = sideX(rng, 0.5, 7);
    const size = rng.range(0.4, 1.4) * (Math.abs(x) > 9 ? 1.6 : 1);
    b.add(
      jitterRock(dodeca(size), rng, 0.35),
      { color: rng.pick(sandstone), roughness: 0.95 },
      {
        position: [x, size * 0.35, -z],
        rotation: [rng.range(0, 3), rng.range(0, 3), 0],
        scale: [1, rng.range(0.5, 0.9), 1],
      },
    );
  }
  for (let z = 0; z < STRIP_LENGTH; z += rng.range(10, 18)) {
    // Saguaro cactus.
    const x = sideX(rng, 1.5, 9);
    const h = rng.range(1.6, 3.2);
    const green = rng.pick([0x4f8a3c, 0x5a9a45, 0x467f36]);
    b.add(capsule(0.22, h, 1), { color: green, roughness: 0.8 }, { position: [x, h / 2 + 0.2, -z] });
    b.add(
      capsule(0.14, h * 0.35, 1),
      { color: green, roughness: 0.8 },
      { position: [x + 0.35, h * 0.62, -z] },
    );
    b.add(capsule(0.14, h * 0.3, 1), { color: green, roughness: 0.8 }, { position: [x - 0.33, h * 0.5, -z] });
    b.add(sphere(0.14, 0), { color: 0xff6fa0, emissive: 0.2 }, { position: [x, h + 0.35, -z] });
  }
  for (let z = 0; z < STRIP_LENGTH; z += rng.range(28, 45)) {
    // Ruined pillars near the road.
    const x = sideX(rng, 1, 4);
    const h = rng.range(1.5, 4);
    b.add(cyl(0.45, 0.5, h, 1), { color: 0xd9b88a, roughness: 0.9 }, { position: [x, h / 2, -z] });
    b.add(rbox(1.2, 0.3, 1.2, 0.05), { color: 0xcfae7e, roughness: 0.9 }, { position: [x, 0.15, -z] });
    if (rng.chance(0.5))
      b.add(
        rbox(1.1, 0.35, 1.1, 0.05),
        { color: 0xcfae7e },
        { position: [x, h + 0.15, -z], rotation: [0, 0.4, 0.15] },
      );
  }
  for (let z = 0; z < STRIP_LENGTH; z += rng.range(35, 60)) {
    // Mesas on the horizon with layered strata.
    const x = (rng.chance(0.5) ? -1 : 1) * rng.range(30, 60);
    const r = rng.range(6, 14);
    let y = 0;
    for (let layer = 0; layer < 4; layer++) {
      const h = rng.range(2, 5);
      const radius = r * (1 - layer * 0.08);
      b.add(
        cyl(radius * 0.95, radius, h, 0),
        { color: layer % 2 ? 0xb06a3c : 0xc98450, roughness: 1 },
        {
          position: [x, y + h / 2, -z],
          rotation: [0, rng.range(0, 3), 0],
        },
      );
      y += h;
    }
  }
}

// ------------------------------------------------------------------ city

function cityStrip(rng: Rng, b: Builder, buildings: BufferGeometry[]): void {
  const facade = [0x2a2c3c, 0x22263a, 0x31283f, 0x1e222d, 0x3a3247];
  for (let z = 0; z < STRIP_LENGTH;) {
    for (const side of [-1, 1]) {
      const width = rng.range(6, 11);
      const depth = rng.range(6, 10);
      const height = rng.range(9, 38);
      const x = side * (EDGE + 3.5 + rng.range(0, 3) + width / 2);
      const g = new BoxGeometry(width, height, depth);
      g.translate(x, height / 2, -z - depth / 2);
      const colors = new Float32Array(g.getAttribute('position').count * 3);
      const c = rng.pick(facade);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = ((c >> 16) & 255) / 255;
        colors[i + 1] = ((c >> 8) & 255) / 255;
        colors[i + 2] = (c & 255) / 255;
      }
      g.setAttribute('color', new BufferAttribute(colors, 3));
      g.deleteAttribute('uv');
      buildings.push(g);
      // Neon signs on the facade facing the lane.
      if (rng.chance(0.6)) {
        const neon = rng.pick([0xff3fd8, 0x3ff0ff, 0xffe14a, 0x7a5cff, 0x48ff8a]);
        const signH = rng.range(1.2, 3);
        b.add(
          rbox(0.15, signH, rng.range(2, 4), 0.05),
          { color: neon, emissive: 2.4, roughness: 0.3 },
          {
            position: [x - side * (width / 2 + 0.1), rng.range(4, Math.min(14, height - 2)), -z - depth / 2],
          },
        );
      }
      // Rooftop antenna with a red light.
      if (rng.chance(0.4)) {
        b.add(
          cyl(0.08, 0.12, 4, 0),
          { color: 0x555a66, metalness: 0.7 },
          { position: [x, height + 2, -z - depth / 2] },
        );
        b.add(
          sphere(0.18, 0),
          { color: 0xff2030, emissive: 3 },
          { position: [x, height + 4.1, -z - depth / 2] },
        );
      }
    }
    z += rng.range(7, 12);
  }
  for (let z = 0; z < STRIP_LENGTH; z += 12) {
    // Street lamps on both sides.
    for (const side of [-1, 1]) {
      const x = side * (EDGE + 0.8);
      b.add(
        cyl(0.07, 0.1, 5, 0),
        { color: 0x2c2f38, metalness: 0.8, roughness: 0.4 },
        { position: [x, 2.5, -z] },
      );
      b.add(
        rbox(1.4, 0.1, 0.12, 0.03, 0),
        { color: 0x2c2f38, metalness: 0.8 },
        { position: [x - side * 0.6, 5, -z] },
      );
      b.add(
        rbox(0.5, 0.08, 0.3, 0.03, 0),
        { color: 0xfff0d0, emissive: 3 },
        { position: [x - side * 1.15, 4.92, -z] },
      );
    }
  }
  for (let z = 6; z < STRIP_LENGTH; z += rng.range(14, 26)) {
    // Parked cars.
    const x = (rng.chance(0.5) ? -1 : 1) * (EDGE + 2.2);
    const paint = rng.pick([0xc0303e, 0x2f8cff, 0xe8e8e8, 0x1b1d26, 0xffb020]);
    b.add(
      rbox(1.8, 0.6, 3.6, 0.2),
      { color: paint, metalness: 0.6, roughness: 0.3 },
      { position: [x, 0.55, -z] },
    );
    b.add(
      rbox(1.5, 0.5, 1.8, 0.2),
      { color: 0x10141c, metalness: 0.4, roughness: 0.15 },
      { position: [x, 1.05, -z + 0.2] },
    );
    for (const dz of [-1.1, 1.1]) {
      for (const dx of [-0.85, 0.85]) {
        b.add(
          cyl(0.32, 0.32, 0.25, 0),
          { color: 0x15161a },
          { position: [x + dx, 0.32, -z + dz], rotation: [0, 0, Math.PI / 2] },
        );
      }
    }
    b.add(
      rbox(0.4, 0.12, 0.05, 0.02, 0),
      { color: 0xfff6d0, emissive: 2 },
      { position: [x - 0.55, 0.65, -z - 1.82] },
    );
    b.add(
      rbox(0.4, 0.12, 0.05, 0.02, 0),
      { color: 0xfff6d0, emissive: 2 },
      { position: [x + 0.55, 0.65, -z - 1.82] },
    );
  }
}

// ------------------------------------------------------------------ station

function stationStrip(rng: Rng, b: Builder): void {
  const hull = [0x8a93a8, 0x6f7891, 0x9aa3b8];
  for (let z = 0; z < STRIP_LENGTH; z += 8) {
    for (const side of [-1, 1]) {
      const x = side * (EDGE + 1.6);
      // Wall segment with a glowing strip and a window opening above.
      b.add(
        rbox(1.2, 3.2, 7.6, 0.15),
        { color: rng.pick(hull), metalness: 0.7, roughness: 0.35 },
        { position: [x, 1.6, -z - 4] },
      );
      b.add(
        rbox(0.12, 0.12, 7.2, 0.04, 0),
        { color: 0x3fe6ff, emissive: 2.6 },
        { position: [x - side * 0.62, 2.5, -z - 4] },
      );
      b.add(
        rbox(1.2, 0.6, 7.6, 0.15),
        { color: 0x5b6378, metalness: 0.8, roughness: 0.3 },
        { position: [x, 7.6, -z - 4] },
      );
      // Window frame pillar.
      b.add(
        rbox(1.3, 8.2, 0.6, 0.12),
        { color: 0x4d5468, metalness: 0.8, roughness: 0.3 },
        { position: [x, 4.1, -z] },
      );
      if (rng.chance(0.35)) {
        // Console with a glowing screen.
        const screen = rng.pick([0x3fe6ff, 0x48ff8a, 0xffb020]);
        b.add(
          rbox(0.8, 1, 1.4, 0.08),
          { color: 0x2c3244, metalness: 0.6 },
          { position: [x - side * 1.1, 0.5, -z - rng.range(2, 6)] },
        );
        b.add(
          rbox(0.05, 0.5, 1.1, 0.02, 0),
          { color: screen, emissive: 2 },
          { position: [x - side * 1.53, 0.85, -z - 4] },
        );
      }
    }
  }
  for (let z = 0; z < STRIP_LENGTH; z += 40) {
    // Tall pylons beside the lane with glowing beacons (nothing crosses above the lane,
    // which would block the camera's view).
    for (const side of [-1, 1]) {
      const x = side * (EDGE + 3.4);
      b.add(
        rbox(1, 12, 1, 0.2),
        { color: 0x4d5468, metalness: 0.85, roughness: 0.3 },
        { position: [x, 6, -z] },
      );
      b.add(
        rbox(1.6, 0.4, 1.6, 0.1),
        { color: 0x5b6378, metalness: 0.85, roughness: 0.3 },
        { position: [x, 12.2, -z] },
      );
      b.add(sphere(0.35, 0), { color: 0x3fe6ff, emissive: 3 }, { position: [x, 12.7, -z] });
      b.add(
        rbox(0.1, 9, 0.1, 0.03, 0),
        { color: 0x3fe6ff, emissive: 2.2 },
        { position: [x - side * 0.52, 6, -z] },
      );
    }
  }
  for (let z = 4; z < STRIP_LENGTH; z += rng.range(9, 16)) {
    // Cargo crates and pipes outside the walls.
    const x = (rng.chance(0.5) ? -1 : 1) * (EDGE + rng.range(4, 9));
    const s = rng.range(1, 2.2);
    b.add(
      rbox(s, s, s, 0.08),
      { color: rng.pick([0xffb020, 0x3d4459, 0xc0303e]), metalness: 0.4, roughness: 0.5 },
      {
        position: [x, s / 2, -z],
        rotation: [0, rng.range(0, 1.5), 0],
      },
    );
  }
  for (let z = 0; z < STRIP_LENGTH; z += 60) {
    // Distant structures: rings and antennas floating in space.
    const x = (rng.chance(0.5) ? -1 : 1) * rng.range(30, 50);
    b.add(
      torus(rng.range(6, 10), 0.6, 0),
      { color: 0x6f7891, metalness: 0.9, roughness: 0.3 },
      {
        position: [x, rng.range(10, 25), -z],
        rotation: [rng.range(0, 1), rng.range(0, 3), 0],
      },
    );
    b.add(ico(1.2, 0), { color: 0x3fe6ff, emissive: 2 }, { position: [x, rng.range(10, 25), -z - 10] });
    b.add(
      cone(1.2, 6, 0),
      { color: 0x9aa3b8, metalness: 0.8 },
      { position: [-x, rng.range(8, 20), -z - 25], rotation: [0.4, 0, 0.3] },
    );
  }
}

/**
 * Endless roadside scenery. Two identical strips leapfrog each other as the lane scrolls,
 * each merged into one draw call per material.
 */
export class Scenery {
  private readonly scene: Scene;
  private readonly strips: Group[] = [new Group(), new Group()];
  private readonly propMaterial: Material = createStaticMaterial();
  private readonly buildingMaterial: Material = createBuildingMaterial();
  private world: WorldId | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    for (const strip of this.strips) scene.add(strip);
  }

  setWorld(world: WorldId): void {
    if (world === this.world) return;
    this.world = world;
    for (const strip of this.strips) {
      for (const child of [...strip.children]) {
        strip.remove(child);
        (child as Mesh).geometry.dispose();
      }
    }
    const rng = new Rng(world === 'desert' ? 11 : world === 'city' ? 22 : 33);
    const builder = new ModelBuilder();
    const buildings: BufferGeometry[] = [];
    if (world === 'desert') desertStrip(rng, builder);
    else if (world === 'city') cityStrip(rng, builder, buildings);
    else stationStrip(rng, builder);
    const props = builder.build();
    const buildingGeometry = buildings.length > 0 ? mergeGeometries(buildings) : null;
    for (const g of buildings) g.dispose();
    for (const strip of this.strips) {
      const mesh = new Mesh(props, this.propMaterial);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      strip.add(mesh);
      if (buildingGeometry) {
        const facades = new Mesh(buildingGeometry, this.buildingMaterial);
        facades.frustumCulled = false;
        strip.add(facades);
      }
    }
    void this.scene;
  }

  /** Positions both strips so the scenery appears to move with the travelled distance. */
  update(distance: number): void {
    const offset = distance % STRIP_LENGTH;
    // Strip A covers [offset - L, offset], strip B the next stretch ahead.
    this.strips[0]?.position.set(0, 0, offset + 30);
    this.strips[1]?.position.set(0, 0, offset + 30 - STRIP_LENGTH);
  }
}
