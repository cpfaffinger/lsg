import {
  BoxGeometry,
  Color,
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
import type { WeaponId } from '../../sim/types.ts';
import { PALETTE } from '../palette.ts';

const CAPACITY = 1500;

/** Tracer look per weapon: colour (above 1 glows through bloom), width and length. */
const TRACERS: Record<Exclude<WeaponId, 'rifle'>, { color: Color; width: number; length: number }> = {
  spread: { color: new Color(3, 1.3, 0.35), width: 1.5, length: 0.7 },
  laser: { color: new Color(0.4, 2.6, 3.2), width: 1.1, length: 5 },
  rocket: { color: new Color(3.2, 0.8, 0.3), width: 3.4, length: 1.5 },
};

/** Squad bullets as stretched glowing boxes, enemy shots as orbs. */
export class ProjectileView {
  private readonly bullets: InstancedMesh;
  private readonly orbs: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private readonly rifleColor = new Color(PALETTE.projectile).multiplyScalar(2.6);

  constructor(scene: Scene) {
    const bulletGeometry = new BoxGeometry(0.13, 0.13, 1);
    const bulletMaterial = new MeshBasicMaterial({ toneMapped: false });
    this.bullets = new InstancedMesh(bulletGeometry, bulletMaterial, CAPACITY);
    this.bullets.setColorAt(0, this.rifleColor);
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

  /** Rifle tracers follow the squad skin. */
  setColor(hex: number): void {
    this.rifleColor.setHex(hex).multiplyScalar(2.6);
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
        const tracer = p.weapon === 'rifle' || p.weapon === 'enemy' ? null : TRACERS[p.weapon];
        const width = tracer?.width ?? 1;
        this.scale.set(width, width, tracer?.length ?? 1.1);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.bullets.setColorAt(bullets, tracer?.color ?? this.rifleColor);
        this.bullets.setMatrixAt(bullets++, this.matrix);
      }
    }
    this.bullets.count = bullets;
    this.orbs.count = orbs;
    this.bullets.instanceMatrix.needsUpdate = true;
    if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;
    this.orbs.instanceMatrix.needsUpdate = true;
  }
}
