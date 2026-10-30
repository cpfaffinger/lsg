import { BufferAttribute, Color, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Animation part ids understood by the animated material's vertex shader.
 * Keep in sync with animated-material.ts.
 */
export const PART = {
  body: 0,
  legLeft: 1,
  legRight: 2,
  armLeft: 3,
  armRight: 4,
  head: 5,
  weapon: 6,
  spin: 7,
  wobble: 8,
  core: 9,
} as const;

export type PartId = (typeof PART)[keyof typeof PART];

export interface PartOptions {
  /** sRGB colour. For team parts this is a shade multiplier applied to the team colour. */
  color: number;
  part?: PartId;
  /** Rotation pivot for animated parts (hip, shoulder, turret base...). */
  pivot?: [number, number, number];
  metalness?: number;
  roughness?: number;
  /** Self-illumination strength (0 = none, 1 = glows in its own colour). */
  emissive?: number;
  /** Takes the squad's skin colour (multiplied by `color`). */
  team?: boolean;
}

export interface Transform {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
}

const tmpColor = new Color();
const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();
const tmpPos = new Vector3();
const tmpScale = new Vector3();

/**
 * Collects primitive shapes and merges them into a single geometry with per-vertex
 * colour, surface parameters and animation data, so a whole character is one draw call
 * (and an instanced crowd of them is still one draw call).
 */
export class ModelBuilder {
  private readonly pieces: BufferGeometry[] = [];

  add(geometry: BufferGeometry, options: PartOptions, transform: Transform = {}): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const scale = transform.scale ?? 1;
    tmpPos.set(...(transform.position ?? [0, 0, 0]));
    tmpQuat.setFromEuler(tmpEuler.set(...(transform.rotation ?? [0, 0, 0])));
    if (typeof scale === 'number') tmpScale.setScalar(scale);
    else tmpScale.set(...scale);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    g.applyMatrix4(tmpMatrix);

    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const parts = new Float32Array(count);
    const pivots = new Float32Array(count * 3);
    const surface = new Float32Array(count * 4);
    tmpColor.setHex(options.color).convertSRGBToLinear();
    const pivot = options.pivot ?? [0, 0, 0];
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
      parts[i] = options.part ?? PART.body;
      pivots[i * 3] = pivot[0];
      pivots[i * 3 + 1] = pivot[1];
      pivots[i * 3 + 2] = pivot[2];
      surface[i * 4] = options.metalness ?? 0.1;
      surface[i * 4 + 1] = options.roughness ?? 0.6;
      surface[i * 4 + 2] = options.emissive ?? 0;
      surface[i * 4 + 3] = options.team ? 1 : 0;
    }
    g.setAttribute('color', new BufferAttribute(colors, 3));
    g.setAttribute('aPart', new BufferAttribute(parts, 1));
    g.setAttribute('aPivot', new BufferAttribute(pivots, 3));
    g.setAttribute('aSurface', new BufferAttribute(surface, 4));
    this.pieces.push(g);
    if (g !== geometry) geometry.dispose();
    return this;
  }

  /** Mirrors the last added piece across the X axis (for symmetric limbs), swapping left/right parts. */
  mirror(geometry: BufferGeometry, options: PartOptions, transform: Transform = {}): this {
    const position = transform.position ?? [0, 0, 0];
    const rotation = transform.rotation ?? [0, 0, 0];
    const swap: Partial<Record<number, PartId>> = {
      [PART.legLeft]: PART.legRight,
      [PART.legRight]: PART.legLeft,
      [PART.armLeft]: PART.armRight,
      [PART.armRight]: PART.armLeft,
    };
    const pivot = options.pivot;
    return this.add(
      geometry,
      {
        ...options,
        part: options.part !== undefined ? (swap[options.part] ?? options.part) : undefined,
        pivot: pivot ? [-pivot[0], pivot[1], pivot[2]] : undefined,
      },
      {
        ...transform,
        position: [-position[0], position[1], position[2]],
        rotation: [rotation[0], -rotation[1], -rotation[2]],
      },
    );
  }

  build(): BufferGeometry {
    const merged = mergeGeometries(this.pieces, false);
    if (!merged) throw new Error('Model has no pieces');
    for (const piece of this.pieces) piece.dispose();
    const indexed = mergeVertices(merged, 1e-4);
    merged.dispose();
    indexed.computeBoundingSphere();
    indexed.computeBoundingBox();
    return indexed;
  }
}
