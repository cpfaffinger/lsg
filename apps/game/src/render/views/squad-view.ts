import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { BALANCE } from '../../sim/balance.ts';
import { formationSlot, visibleUnits, type SlotOffset } from '../../sim/formation.ts';
import type { Simulation } from '../../sim/simulation.ts';
import { SQUAD_Z } from '../../sim/world.ts';
import { createAnimatedMaterials, WALK, type AnimatedMaterials } from '../models/animated-material.ts';
import { buildSoldier } from '../models/soldier.ts';
import { PALETTE } from '../palette.ts';
import type { Detail } from '../models/shapes.ts';

const CAP = BALANCE.squad.visibleCap;
/** Running cadence in radians per second. */
const GAIT_SPEED = 11;

interface UnitState {
  x: number;
  z: number;
  scale: number;
  phase: number;
}

/**
 * Renders the squad as one instanced, procedurally animated soldier mesh. Each visible unit
 * eases towards its formation slot, new units pop in, lost units vanish from the back rows.
 */
export class SquadView {
  readonly mesh: InstancedMesh;
  private readonly materials: AnimatedMaterials;
  private readonly params: InstancedBufferAttribute;
  private readonly units: UnitState[] = [];
  private readonly slot: SlotOffset = { x: 0, z: 0 };
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scaleVec = new Vector3();
  private time = 0;
  private detail: Detail = 1;
  private readonly scene: Scene;

  /** World-space x of the squad centre for the current render frame. */
  centerX = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this.materials = createAnimatedMaterials(WALK, PALETTE.squad);
    this.params = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    this.params.setUsage(DynamicDrawUsage);
    this.mesh = this.createMesh(1);
  }

  private createMesh(detail: Detail): InstancedMesh {
    const geometry = buildSoldier(detail);
    geometry.setAttribute('iParams', this.params);
    const mesh = new InstancedMesh(geometry, this.materials.material, CAP);
    mesh.customDepthMaterial = this.materials.depth;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  /** Switches between the detailed and the low-poly soldier (quality setting). */
  setDetail(detail: Detail): void {
    if (detail === this.detail) return;
    this.detail = detail;
    const old = this.mesh.geometry;
    const geometry = buildSoldier(detail);
    geometry.setAttribute('iParams', this.params);
    this.mesh.geometry = geometry;
    old.dispose();
  }

  /** Recolours the squad (skins). */
  setColor(hex: number): void {
    this.materials.teamColor.value.setHex(hex).convertSRGBToLinear();
  }

  update(sim: Simulation, alpha: number, frameDt: number): void {
    this.time += frameDt;
    const count = visibleUnits(sim.units);
    this.centerX = sim.prevSquadX + (sim.squadX - sim.prevSquadX) * alpha;

    while (this.units.length < count) {
      // New units spawn at the squad centre and grow into their slot.
      this.units.push({ x: 0, z: 0, scale: 0, phase: Math.random() * Math.PI * 2 });
    }
    if (this.units.length > count) this.units.length = count;

    const ease = 1 - Math.exp(-12 * frameDt);
    const grow = 1 - Math.exp(-10 * frameDt);
    const fireCycle = sim.fireRate * Math.PI * 2;
    const params = this.params.array as Float32Array;
    const firing = sim.status === 'running' && sim.units > 0;
    for (let i = 0; i < count; i++) {
      const unit = this.units[i];
      if (!unit) continue;
      formationSlot(i, sim.units, this.slot);
      unit.x += (this.slot.x - unit.x) * ease;
      unit.z += (this.slot.z - unit.z) * ease;
      unit.scale += (1 - unit.scale) * grow;
      this.position.set(this.centerX + unit.x, 0, SQUAD_Z + unit.z);
      this.scaleVec.setScalar(unit.scale);
      this.matrix.compose(this.position, this.quaternion, this.scaleVec);
      this.mesh.setMatrixAt(i, this.matrix);
      const recoil = firing ? Math.pow(Math.max(0, Math.sin(this.time * fireCycle + unit.phase * 3)), 16) : 0;
      params[i * 4] = unit.phase;
      params[i * 4 + 1] = GAIT_SPEED;
      params[i * 4 + 2] = 0;
      params[i * 4 + 3] = recoil;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.params.needsUpdate = true;
  }
}
