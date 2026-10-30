import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Simulation } from '../../sim/simulation.ts';
import type { EnemyKind } from '../../sim/types.ts';
import { ENEMY_COLORS, PALETTE } from '../palette.ts';

const CAPACITY: Record<EnemyKind, number> = {
  runner: 600,
  tank: 40,
  shooter: 80,
  splitter: 80,
  shield: 80,
  miniboss: 4,
  boss: 2,
};

function humanoid(radius: number, height: number): BufferGeometry {
  const body = new CapsuleGeometry(radius * 0.55, height * 0.45, 4, 10);
  body.translate(0, height * 0.45, 0);
  const head = new SphereGeometry(radius * 0.42, 10, 8);
  head.translate(0, height * 0.95, 0);
  return mergeGeometries([body, head]);
}

/** Placeholder geometry per enemy kind (replaced by models in the art milestone). */
function geometryFor(kind: EnemyKind): BufferGeometry {
  switch (kind) {
    case 'runner':
      return humanoid(0.42, 1);
    case 'shooter':
      return humanoid(0.5, 1.15);
    case 'splitter': {
      const g = new SphereGeometry(0.62, 14, 10);
      g.translate(0, 0.62, 0);
      return g;
    }
    case 'shield': {
      const body = humanoid(0.55, 1.1);
      const plate = new BoxGeometry(1.2, 1.1, 0.12);
      plate.translate(0, 0.6, 0.55);
      return mergeGeometries([body, plate]);
    }
    case 'tank': {
      const hull = new BoxGeometry(1.6, 0.8, 1.7);
      hull.translate(0, 0.5, 0);
      const turret = new CylinderGeometry(0.45, 0.55, 0.45, 12);
      turret.translate(0, 1.1, 0);
      return mergeGeometries([hull, turret]);
    }
    case 'miniboss': {
      const g = new OctahedronGeometry(1.5, 0);
      g.translate(0, 1.6, 0);
      return g;
    }
    case 'boss': {
      const core = new OctahedronGeometry(2.6, 1);
      core.translate(0, 2.8, 0);
      return core;
    }
  }
}

export class EnemyView {
  private readonly meshes = new Map<EnemyKind, InstancedMesh>();
  private readonly counts = new Map<EnemyKind, number>();
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private readonly color = new Color();
  private readonly flash = new Color(PALETTE.hitFlash);
  private time = 0;

  constructor(scene: Scene) {
    for (const kind of Object.keys(CAPACITY) as EnemyKind[]) {
      const material = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.55,
        metalness: kind === 'tank' || kind === 'boss' || kind === 'miniboss' ? 0.5 : 0.1,
      });
      const mesh = new InstancedMesh(geometryFor(kind), material, CAPACITY[kind]);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, this.color.setHex(ENEMY_COLORS[kind]));
      scene.add(mesh);
      this.meshes.set(kind, mesh);
    }
  }

  update(sim: Simulation, alpha: number, frameDt: number): void {
    this.time += frameDt;
    for (const kind of this.meshes.keys()) this.counts.set(kind, 0);
    for (const enemy of sim.enemies) {
      if (!enemy.alive) continue;
      const mesh = this.meshes.get(enemy.kind);
      if (!mesh) continue;
      const index = this.counts.get(enemy.kind) ?? 0;
      if (index >= CAPACITY[enemy.kind]) continue;
      this.counts.set(enemy.kind, index + 1);
      const x = enemy.prevX + (enemy.x - enemy.prevX) * alpha;
      const z = enemy.prevZ + (enemy.z - enemy.prevZ) * alpha;
      const isWalker = enemy.kind === 'runner' || enemy.kind === 'shooter' || enemy.kind === 'shield';
      const bob = isWalker ? Math.abs(Math.sin(this.time * 9 + enemy.seed)) * 0.1 : 0;
      // Walkers face the squad (+z); bosses rotate slowly for a menacing silhouette.
      const spin = enemy.kind === 'boss' || enemy.kind === 'miniboss' ? this.time * 0.6 + enemy.seed : 0;
      this.position.set(x, bob, z);
      this.quaternion.setFromAxisAngle(this.up, spin);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(index, this.matrix);
      this.color.setHex(ENEMY_COLORS[enemy.kind]);
      if (enemy.hitFlash > 0) this.color.lerp(this.flash, 0.75);
      mesh.setColorAt(index, this.color);
    }
    for (const [kind, mesh] of this.meshes) {
      mesh.count = this.counts.get(kind) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
