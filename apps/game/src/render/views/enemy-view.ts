import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import type { Simulation } from '../../sim/simulation.ts';
import type { EnemyKind } from '../../sim/types.ts';
import { createAnimatedMaterials } from '../models/animated-material.ts';
import { buildEnemy, ENEMY_ANIMATION } from '../models/enemies.ts';
import type { Detail } from '../models/shapes.ts';
import { createSkinnedMaterials, instanceGeometry, type CharacterId } from '../models/skinned-character.ts';

const CAPACITY: Record<EnemyKind, number> = {
  runner: 600,
  tank: 40,
  shooter: 80,
  splitter: 80,
  shield: 80,
  miniboss: 4,
  boss: 2,
};

/** Enemy kinds played by animated characters, with their size in the world. */
const CHARACTER_KINDS: Partial<Record<EnemyKind, { id: CharacterId; scale: number }>> = {
  runner: { id: 'enemy', scale: 0.56 },
  shooter: { id: 'hazmat', scale: 0.62 },
};

const BIG_KINDS: ReadonlySet<EnemyKind> = new Set(['boss', 'miniboss', 'tank']);

/** Enemies further away than this (along -z) use the low-detail model. */
const LOD_DISTANCE = 42;

interface KindMeshes {
  near: InstancedMesh;
  far: InstancedMesh;
  nearParams: InstancedBufferAttribute;
  farParams: InstancedBufferAttribute;
  nearCount: number;
  farCount: number;
}

/** Instanced, procedurally animated enemies with two levels of detail per kind. */
export class EnemyView {
  private readonly kinds = new Map<EnemyKind, KindMeshes>();
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  /** Scales the LOD switch distance (quality setting). */
  lodBias = 1;

  constructor(scene: Scene) {
    for (const kind of Object.keys(CAPACITY) as EnemyKind[]) {
      const animated = CHARACTER_KINDS[kind];
      const materials = animated
        ? createSkinnedMaterials(animated.id)
        : createAnimatedMaterials(ENEMY_ANIMATION[kind].profile);
      const make = (detail: Detail) => {
        const capacity = CAPACITY[kind];
        const params = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
        params.setUsage(DynamicDrawUsage);
        let geometry;
        if (animated) {
          geometry = instanceGeometry(animated.id, detail, params);
        } else {
          geometry = buildEnemy(kind, detail);
          geometry.setAttribute('iParams', params);
        }
        const mesh = new InstancedMesh(geometry, materials.material, capacity);
        mesh.customDepthMaterial = materials.depth;
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.castShadow = detail === 1;
        mesh.frustumCulled = false;
        mesh.count = 0;
        scene.add(mesh);
        return { mesh, params };
      };
      const near = make(1);
      const far = make(0);
      this.kinds.set(kind, {
        near: near.mesh,
        far: far.mesh,
        nearParams: near.params,
        farParams: far.params,
        nearCount: 0,
        farCount: 0,
      });
    }
  }

  update(sim: Simulation, alpha: number): void {
    for (const entry of this.kinds.values()) {
      entry.nearCount = 0;
      entry.farCount = 0;
    }
    const lodZ = -LOD_DISTANCE * this.lodBias;
    for (const enemy of sim.enemies) {
      if (!enemy.alive) continue;
      const entry = this.kinds.get(enemy.kind);
      if (!entry) continue;
      const x = enemy.prevX + (enemy.x - enemy.prevX) * alpha;
      const z = enemy.prevZ + (enemy.z - enemy.prevZ) * alpha;
      const isFar = z < lodZ && enemy.kind !== 'boss' && enemy.kind !== 'miniboss';
      const index = isFar ? entry.farCount : entry.nearCount;
      if (index >= CAPACITY[enemy.kind]) continue;
      const mesh = isFar ? entry.far : entry.near;
      const params = (isFar ? entry.farParams : entry.nearParams).array as Float32Array;
      if (isFar) entry.farCount++;
      else entry.nearCount++;
      // Face the squad, turning slightly towards it.
      const yaw = Math.atan2(sim.squadX - x, Math.max(4, -z)) * 0.6;
      this.position.set(x, 0, z);
      this.quaternion.setFromAxisAngle(this.up, yaw);
      const animated = CHARACTER_KINDS[enemy.kind];
      this.scale.setScalar(animated?.scale ?? 1);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(index, this.matrix);
      params[index * 4] = enemy.seed;
      // Character enemies pick a clip (0 run, 1 stand and fire), the others a gait speed.
      const holding = enemy.holdZ !== null && enemy.z >= enemy.holdZ - 0.1;
      params[index * 4 + 1] = animated ? (holding ? 1 : 0) : ENEMY_ANIMATION[enemy.kind].gait;
      // Big enemies are hit almost every frame; a strong flash would bleach them white.
      params[index * 4 + 2] = enemy.hitFlash > 0 ? (BIG_KINDS.has(enemy.kind) ? 0.08 : 0.6) : 0;
      params[index * 4 + 3] = 0;
    }
    for (const entry of this.kinds.values()) {
      entry.near.count = entry.nearCount;
      entry.far.count = entry.farCount;
      entry.near.instanceMatrix.needsUpdate = true;
      entry.far.instanceMatrix.needsUpdate = true;
      entry.nearParams.needsUpdate = true;
      entry.farParams.needsUpdate = true;
    }
  }
}
