import { Mesh, type BufferGeometry, type Material, type Scene } from 'three';
import type { Simulation } from '../../sim/simulation.ts';
import { buildBarrel, buildBarrier } from '../models/props.ts';
import { createStaticMaterial } from '../models/static-material.ts';

/** Barriers (indestructible walls) and explosive barrels. */
export class ObstacleView {
  private readonly scene: Scene;
  private readonly meshes = new Map<number, Mesh>();
  private readonly barrierGeometry: BufferGeometry = buildBarrier();
  private readonly barrelGeometry: BufferGeometry = buildBarrel();
  private readonly material: Material = createStaticMaterial(2.5);

  constructor(scene: Scene) {
    this.scene = scene;
  }

  update(sim: Simulation, alpha: number): void {
    const seen = new Set<number>();
    for (const obstacle of sim.obstacles) {
      if (!obstacle.alive) continue;
      seen.add(obstacle.id);
      let mesh = this.meshes.get(obstacle.id);
      if (!mesh) {
        const isBarrel = obstacle.kind === 'barrel';
        mesh = new Mesh(isBarrel ? this.barrelGeometry : this.barrierGeometry, this.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (!isBarrel) mesh.scale.set(obstacle.width, 1, Math.max(1, obstacle.depth / 0.75));
        this.scene.add(mesh);
        this.meshes.set(obstacle.id, mesh);
      }
      const z = obstacle.prevZ + (obstacle.z - obstacle.prevZ) * alpha;
      mesh.position.set(obstacle.x, 0, z);
      // Barrels shake when hit.
      mesh.rotation.z =
        obstacle.kind === 'barrel' && obstacle.hitFlash > 0 ? (Math.random() - 0.5) * 0.12 : 0;
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.meshes.delete(id);
    }
  }
}
