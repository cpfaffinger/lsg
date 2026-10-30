import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import type { Simulation } from '../../sim/simulation.ts';
import { PALETTE } from '../palette.ts';

const CAPACITY = 1500;

/** Squad bullets as stretched glowing boxes, enemy shots as orbs. */
export class ProjectileView {
  private readonly bullets: InstancedMesh;
  private readonly orbs: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);

  constructor(scene: Scene) {
    const bulletGeometry = new BoxGeometry(0.09, 0.09, 0.7);
    const bulletMaterial = new MeshBasicMaterial({ color: PALETTE.projectile, toneMapped: false });
    this.bullets = new InstancedMesh(bulletGeometry, bulletMaterial, CAPACITY);
    this.bullets.instanceMatrix.setUsage(DynamicDrawUsage);
    this.bullets.frustumCulled = false;
    this.bullets.count = 0;

    const orbMaterial = new MeshBasicMaterial({ color: PALETTE.enemyProjectile, toneMapped: false });
    this.orbs = new InstancedMesh(new SphereGeometry(0.22, 10, 8), orbMaterial, 300);
    this.orbs.instanceMatrix.setUsage(DynamicDrawUsage);
    this.orbs.frustumCulled = false;
    this.orbs.count = 0;
    scene.add(this.bullets, this.orbs);
  }

  update(sim: Simulation, alpha: number): void {
    let bullets = 0;
    let orbs = 0;
    for (const p of sim.projectiles) {
      if (!p.alive) continue;
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const z = p.prevZ + (p.z - p.prevZ) * alpha;
      if (p.owner === 'enemy') {
        if (orbs >= 300) continue;
        this.position.set(x, 0.9, z);
        this.quaternion.identity();
        this.scale.setScalar(1);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.orbs.setMatrixAt(orbs++, this.matrix);
      } else {
        if (bullets >= CAPACITY) continue;
        this.position.set(x, 0.75, z);
        this.quaternion.setFromAxisAngle(this.up, Math.atan2(p.vx, p.vz));
        const size = p.weapon === 'rocket' ? 2.4 : p.weapon === 'laser' ? 1.4 : 1;
        this.scale.set(size, size, p.weapon === 'laser' ? 3 : size);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.bullets.setMatrixAt(bullets++, this.matrix);
      }
    }
    this.bullets.count = bullets;
    this.orbs.count = orbs;
    this.bullets.instanceMatrix.needsUpdate = true;
    this.orbs.instanceMatrix.needsUpdate = true;
  }
}
