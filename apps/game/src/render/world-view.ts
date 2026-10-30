import type { Scene } from 'three';
import type { Simulation } from '../sim/simulation.ts';
import { sharedAnimationUniforms } from './models/animated-material.ts';
import { EnemyView } from './views/enemy-view.ts';
import { GateView } from './views/gate-view.ts';
import { ObstacleView } from './views/obstacle-view.ts';
import { ProjectileView } from './views/projectile-view.ts';
import { SquadView } from './views/squad-view.ts';

/** Bundles all per-entity views and keeps them in sync with a simulation. */
export class WorldView {
  readonly squad: SquadView;
  readonly enemies: EnemyView;
  readonly projectiles: ProjectileView;
  readonly gates: GateView;
  readonly obstacles: ObstacleView;

  constructor(scene: Scene) {
    this.squad = new SquadView(scene);
    this.enemies = new EnemyView(scene);
    this.projectiles = new ProjectileView(scene);
    this.gates = new GateView(scene);
    this.obstacles = new ObstacleView(scene);
  }

  update(sim: Simulation, alpha: number, frameDt: number): void {
    sharedAnimationUniforms.uTime.value += frameDt;
    this.squad.update(sim, alpha, frameDt);
    this.enemies.update(sim, alpha);
    this.projectiles.update(sim, alpha);
    this.gates.update(sim, alpha, frameDt);
    this.obstacles.update(sim, alpha);
  }
}
