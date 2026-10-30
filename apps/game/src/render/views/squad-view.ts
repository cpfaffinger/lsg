import {
  CapsuleGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALANCE } from '../../sim/balance.ts';
import { formationSlot, visibleUnits, type SlotOffset } from '../../sim/formation.ts';
import type { Simulation } from '../../sim/simulation.ts';
import { SQUAD_Z } from '../../sim/world.ts';
import { PALETTE } from '../palette.ts';

const CAP = BALANCE.squad.visibleCap;

/**
 * Renders the squad as one instanced mesh. Each visible unit eases towards its formation
 * slot, new units pop in, and lost units are removed from the back rows.
 */
export class SquadView {
  readonly mesh: InstancedMesh;
  private readonly offsets: { x: number; z: number; scale: number }[] = [];
  private readonly slot: SlotOffset = { x: 0, z: 0 };
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scaleVec = new Vector3();
  private readonly dummy = new Object3D();
  private time = 0;
  private shown = 0;

  constructor(scene: Scene) {
    const body = new CapsuleGeometry(0.2, 0.42, 4, 10);
    body.translate(0, 0.42, 0);
    const head = new SphereGeometry(0.16, 12, 8);
    head.translate(0, 0.92, 0);
    const geometry = mergeGeometries([body, head]);
    const material = new MeshStandardMaterial({ color: PALETTE.squad, roughness: 0.45, metalness: 0.15 });
    this.mesh = new InstancedMesh(geometry, material, CAP);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.setColor(PALETTE.squad);
    scene.add(this.mesh);
    this.dummy.matrixAutoUpdate = false;
  }

  /** Recolours the squad (skins). Slight per-unit variation reads as a crowd rather than clones. */
  setColor(hex: number): void {
    const tint = new Color();
    for (let i = 0; i < CAP; i++) {
      tint.setHex(hex).offsetHSL(0, 0, ((i * 37) % 11) / 110 - 0.05);
      this.mesh.setColorAt(i, tint);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** World-space x of the squad centre for the current render frame. */
  centerX = 0;

  update(sim: Simulation, alpha: number, frameDt: number): void {
    this.time += frameDt;
    const count = visibleUnits(sim.units);
    this.centerX = sim.prevSquadX + (sim.squadX - sim.prevSquadX) * alpha;

    while (this.offsets.length < count) {
      // New units spawn at the squad centre and grow into their slot.
      this.offsets.push({ x: 0, z: 0, scale: 0 });
    }
    if (this.offsets.length > count) this.offsets.length = count;

    const ease = 1 - Math.exp(-12 * frameDt);
    const grow = 1 - Math.exp(-10 * frameDt);
    for (let i = 0; i < count; i++) {
      const offset = this.offsets[i];
      if (!offset) continue;
      formationSlot(i, sim.units, this.slot);
      offset.x += (this.slot.x - offset.x) * ease;
      offset.z += (this.slot.z - offset.z) * ease;
      offset.scale += (1 - offset.scale) * grow;
      const bob = Math.abs(Math.sin(this.time * 11 + i * 1.7)) * 0.08;
      this.position.set(this.centerX + offset.x, bob, SQUAD_Z + offset.z);
      this.scaleVec.setScalar(offset.scale);
      this.matrix.compose(this.position, this.quaternion, this.scaleVec);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (count !== this.shown && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.shown = count;
  }
}
