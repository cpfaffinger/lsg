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
import type { EnemyKind, SimEvent } from '../../sim/types.ts';
import { createAnimatedMaterials, STILL } from '../models/animated-material.ts';
import { buildShieldPlate, ENEMY_MODELS } from '../models/enemies.ts';
import type { Detail } from '../models/shapes.ts';
import { createSkinnedMaterials, instanceGeometry } from '../models/skinned-character.ts';

const CAPACITY: Record<EnemyKind, number> = {
  runner: 600,
  tank: 40,
  shooter: 80,
  splitter: 80,
  shield: 80,
  miniboss: 4,
  boss: 2,
};

const BIG_KINDS: ReadonlySet<EnemyKind> = new Set(['boss', 'miniboss', 'tank']);

/** How long a killed enemy stays visible and how far the hit flings it back. */
const DEATHS: Record<EnemyKind, { seconds: number; knock: number; hop: number; tilt: number }> = {
  runner: { seconds: 0.34, knock: 2.6, hop: 0.55, tilt: 1.5 },
  shooter: { seconds: 0.34, knock: 2.2, hop: 0.5, tilt: 1.5 },
  shield: { seconds: 0.4, knock: 1.8, hop: 0.4, tilt: 1.4 },
  splitter: { seconds: 0.26, knock: 1.2, hop: 0.7, tilt: 0.6 },
  tank: { seconds: 0.55, knock: 1.2, hop: 0.2, tilt: 1.45 },
  miniboss: { seconds: 0.9, knock: 1.4, hop: 0.2, tilt: 1.45 },
  boss: { seconds: 1.7, knock: 1.5, hop: 0, tilt: 1.3 },
};
/** Falling figures at once; a big volley kills more than anyone can follow. */
const MAX_FALLING = 140;

interface FallingEnemy {
  kind: EnemyKind;
  x: number;
  z: number;
  yaw: number;
  seed: number;
  age: number;
}

/** Enemies further away than this (along -z) use the low-detail model. */
const LOD_DISTANCE = 42;

interface KindMeshes {
  near: InstancedMesh;
  far: InstancedMesh;
  nearPlate: InstancedMesh | null;
  farPlate: InstancedMesh | null;
  nearParams: InstancedBufferAttribute;
  farParams: InstancedBufferAttribute;
  nearCount: number;
  farCount: number;
}

/** Instanced, skeletally animated enemies with two levels of detail per kind. */
export class EnemyView {
  private readonly kinds = new Map<EnemyKind, KindMeshes>();
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private readonly tilt = new Quaternion();
  private readonly side = new Vector3(1, 0, 0);
  private readonly falling: FallingEnemy[] = [];
  private lastSim: Simulation | null = null;
  private lastDistance = 0;
  /** Scales the LOD switch distance (quality setting). */
  lodBias = 1;

  constructor(scene: Scene) {
    const plateMaterials = createAnimatedMaterials(STILL);
    for (const kind of Object.keys(CAPACITY) as EnemyKind[]) {
      const model = ENEMY_MODELS[kind];
      const materials = createSkinnedMaterials(model.id);
      const make = (detail: Detail) => {
        const capacity = CAPACITY[kind];
        const params = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
        params.setUsage(DynamicDrawUsage);
        const geometry = instanceGeometry(model.id, detail, params);
        const mesh = new InstancedMesh(geometry, materials.material, capacity);
        mesh.customDepthMaterial = materials.depth;
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.castShadow = detail === 1;
        mesh.frustumCulled = false;
        mesh.count = 0;
        scene.add(mesh);
        let plate: InstancedMesh | null = null;
        if (kind === 'shield') {
          // The plate moves with its bearer, so it shares the instance data of the character.
          const size = 1 / model.scale;
          const plateGeometry = buildShieldPlate(detail).scale(size, size, size);
          plateGeometry.setAttribute('iParams', params);
          plate = new InstancedMesh(plateGeometry, plateMaterials.material, capacity);
          plate.customDepthMaterial = plateMaterials.depth;
          plate.instanceMatrix = mesh.instanceMatrix;
          plate.castShadow = detail === 1;
          plate.frustumCulled = false;
          plate.count = 0;
          scene.add(plate);
        }
        return { mesh, params, plate };
      };
      const near = make(1);
      const far = make(0);
      this.kinds.set(kind, {
        near: near.mesh,
        far: far.mesh,
        nearPlate: near.plate,
        farPlate: far.plate,
        nearParams: near.params,
        farParams: far.params,
        nearCount: 0,
        farCount: 0,
      });
    }
  }

  /** Killed enemies are flung back for a moment instead of vanishing. */
  handleEvents(events: readonly SimEvent[], squadX: number): void {
    for (const event of events) {
      if (event.type !== 'enemyKilled' || this.falling.length >= MAX_FALLING) continue;
      this.falling.push({
        kind: event.kind,
        x: event.x,
        z: event.z,
        yaw: Math.atan2(squadX - event.x, Math.max(4, -event.z)) * 0.6,
        seed: Math.random() * 6.28,
        age: 0,
      });
    }
  }

  private updateFalling(sim: Simulation, frameDt: number): void {
    if (sim !== this.lastSim) {
      this.lastSim = sim;
      this.lastDistance = sim.distance;
      this.falling.length = 0;
    }
    const scroll = Math.max(0, sim.distance - this.lastDistance);
    this.lastDistance = sim.distance;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const body = this.falling[i];
      if (!body) continue;
      const death = DEATHS[body.kind];
      body.age += frameDt;
      body.z += scroll;
      const t = body.age / death.seconds;
      const entry = this.kinds.get(body.kind);
      if (t >= 1) {
        this.falling.splice(i, 1);
        continue;
      }
      if (!entry || entry.nearCount >= CAPACITY[body.kind]) continue;
      const model = ENEMY_MODELS[body.kind];
      const eased = 1 - (1 - t) * (1 - t);
      this.position.set(body.x, model.lift + death.hop * 4 * t * (1 - t), body.z - death.knock * eased);
      this.quaternion.setFromAxisAngle(this.up, body.yaw);
      this.quaternion.multiply(this.tilt.setFromAxisAngle(this.side, -death.tilt * eased));
      this.scale.setScalar(model.scale * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      const index = entry.nearCount++;
      entry.near.setMatrixAt(index, this.matrix);
      const params = entry.nearParams.array as Float32Array;
      params[index * 4] = body.seed;
      params[index * 4 + 1] = 0;
      params[index * 4 + 2] = (1 - t) * (1 - t) * (BIG_KINDS.has(body.kind) ? 0.5 : 1.4);
      params[index * 4 + 3] = 0;
    }
  }

  update(sim: Simulation, alpha: number, frameDt: number): void {
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
      const model = ENEMY_MODELS[enemy.kind];
      this.position.set(x, model.lift, z);
      this.quaternion.setFromAxisAngle(this.up, yaw);
      this.scale.setScalar(model.scale);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(index, this.matrix);
      params[index * 4] = enemy.seed;
      // Clip 0 is the way in, clip 1 the attack once the enemy has reached its firing position.
      const holding = enemy.holdZ !== null && enemy.z >= enemy.holdZ - 0.1;
      params[index * 4 + 1] = holding ? 1 : 0;
      // Big enemies are hit almost every frame; a strong flash would bleach them white.
      params[index * 4 + 2] = enemy.hitFlash > 0 ? (BIG_KINDS.has(enemy.kind) ? 0.08 : 0.6) : 0;
      params[index * 4 + 3] = 0;
    }
    this.updateFalling(sim, frameDt);
    for (const entry of this.kinds.values()) {
      entry.near.count = entry.nearCount;
      entry.far.count = entry.farCount;
      if (entry.nearPlate) entry.nearPlate.count = entry.nearCount;
      if (entry.farPlate) entry.farPlate.count = entry.farCount;
      entry.near.instanceMatrix.needsUpdate = true;
      entry.far.instanceMatrix.needsUpdate = true;
      entry.nearParams.needsUpdate = true;
      entry.farParams.needsUpdate = true;
    }
  }
}
