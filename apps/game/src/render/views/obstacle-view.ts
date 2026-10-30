import { BoxGeometry, CylinderGeometry, Mesh, MeshStandardMaterial, type Scene } from 'three';
import type { Simulation } from '../../sim/simulation.ts';
import { PALETTE } from '../palette.ts';

/** Barriers (indestructible walls) and explosive barrels. */
export class ObstacleView {
  private readonly scene: Scene;
  private readonly meshes = new Map<number, Mesh>();
  private readonly barrierGeometry = new BoxGeometry(1, 1.4, 1);
  private readonly barrelGeometry = new CylinderGeometry(0.55, 0.55, 1.2, 16);
  private readonly barrierMaterial = new MeshStandardMaterial({
    color: PALETTE.barrier,
    roughness: 0.7,
    metalness: 0.3,
  });
  private readonly barrelMaterial = new MeshStandardMaterial({
    color: PALETTE.barrel,
    roughness: 0.5,
    metalness: 0.4,
    emissive: 0x401000,
  });

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
        mesh = new Mesh(
          isBarrel ? this.barrelGeometry : this.barrierGeometry,
          isBarrel ? this.barrelMaterial : this.barrierMaterial,
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (!isBarrel) mesh.scale.set(obstacle.width, 1, obstacle.depth);
        this.scene.add(mesh);
        this.meshes.set(obstacle.id, mesh);
      }
      const z = obstacle.prevZ + (obstacle.z - obstacle.prevZ) * alpha;
      mesh.position.set(obstacle.x, obstacle.kind === 'barrel' ? 0.6 : 0.7, z);
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.meshes.delete(id);
    }
  }
}
