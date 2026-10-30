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
import type { SimEvent } from '../../sim/types.ts';
import { SQUAD_Z } from '../../sim/world.ts';
import type { WeaponId } from '../../sim/types.ts';
import type { Detail } from '../models/shapes.ts';
import {
  createSkinnedMaterials,
  instanceGeometry,
  type SkinnedMaterials,
} from '../models/skinned-character.ts';
import { PALETTE } from '../palette.ts';

const CAP = BALANCE.squad.visibleCap;
/** The model is about 2.1 units tall; soldiers stand about 1.3 units tall in the world. */
const SOLDIER_SCALE = 0.62;
/** From this many visible soldiers on, the simple model is used. */
const CROWD_SIZE = 50;
/** Order of the weapons in the baked soldier model. */
const WEAPON_MODEL: Record<WeaponId, number> = { rifle: 1, spread: 2, laser: 3, rocket: 4 };
/** How fast the recoil kick fades, per second. */
const RECOIL_DECAY = 16;
/** Seconds a lost soldier takes to fall, and how many can fall at once. */
const FALL_SECONDS = 0.42;
const MAX_FALLING = 24;
/** Fallen soldiers shown per event; bigger losses read through the counter. */
const FALLS_PER_LOSS = 6;

interface UnitState {
  x: number;
  z: number;
  scale: number;
  phase: number;
  /** 1 right after this soldier fired, decays to 0. */
  recoil: number;
}

interface FallingSoldier {
  x: number;
  z: number;
  phase: number;
  age: number;
}

/**
 * Renders the squad as one instanced, skeletally animated soldier mesh. Each visible unit
 * eases towards its formation slot, new units pop in, lost units vanish from the back rows.
 */
export class SquadView {
  readonly mesh: InstancedMesh;
  private readonly materials: SkinnedMaterials;
  private readonly params: InstancedBufferAttribute;
  private readonly units: UnitState[] = [];
  private readonly falling: FallingSoldier[] = [];
  private readonly tilt = new Quaternion();
  private readonly fallRotation = new Quaternion();
  private readonly side = new Vector3(1, 0, 0);
  private readonly slot: SlotOffset = { x: 0, z: 0 };
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly scaleVec = new Vector3();
  private detail: Detail = 1;
  private maxDetail: Detail = 1;
  private readonly scene: Scene;

  /** World-space x of the squad centre for the current render frame. */
  centerX = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    // The model looks along +z, the squad runs towards -z.
    this.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    this.materials = createSkinnedMaterials('soldier', PALETTE.squad);
    this.params = new InstancedBufferAttribute(new Float32Array(CAP * 4), 4);
    this.params.setUsage(DynamicDrawUsage);
    this.mesh = this.createMesh(1);
  }

  private createMesh(detail: Detail): InstancedMesh {
    const geometry = instanceGeometry('soldier', detail, this.params);
    const mesh = new InstancedMesh(geometry, this.materials.material, CAP);
    mesh.customDepthMaterial = this.materials.depth;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    return mesh;
  }

  /** Sets the best soldier model the quality setting allows. */
  setDetail(detail: Detail): void {
    this.maxDetail = detail;
  }

  /** Crowds use the simple model: individual details vanish anyway and the triangles add up. */
  private applyDetail(count: number): void {
    const detail: Detail = count > CROWD_SIZE ? 0 : this.maxDetail;
    if (detail === this.detail) return;
    this.detail = detail;
    this.mesh.geometry = instanceGeometry('soldier', detail, this.params);
  }

  /** Recolours the squad (skins). */
  setColor(hex: number): void {
    this.materials.teamColor.value.setHex(hex).convertSRGBToLinear();
  }

  /** Soldiers kick back exactly when the simulation fires their shot; lost ones topple over. */
  handleEvents(events: readonly SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'shot') {
        const unit = this.units[event.slot];
        if (unit) unit.recoil = 1;
      } else if (event.type === 'unitsLost') {
        const shown = Math.min(FALLS_PER_LOSS, event.count, MAX_FALLING - this.falling.length);
        for (let i = 0; i < shown; i++) {
          this.falling.push({
            x: event.x + (Math.random() - 0.5) * 1.6,
            z: Math.max(event.z, SQUAD_Z - 1) + (Math.random() - 0.5) * 0.8,
            phase: Math.random() * 6.28,
            age: 0,
          });
        }
      }
    }
  }

  /** Adds the falling soldiers behind the living ones and returns the new instance count. */
  private placeFalling(count: number, frameDt: number): number {
    const params = this.params.array as Float32Array;
    let index = count;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const body = this.falling[i];
      if (!body) continue;
      body.age += frameDt;
      const t = body.age / FALL_SECONDS;
      if (t >= 1) {
        this.falling.splice(i, 1);
        continue;
      }
      if (index >= CAP) continue;
      const eased = 1 - (1 - t) * (1 - t);
      this.position.set(body.x, 0.3 * 4 * t * (1 - t), body.z + eased * 1.4);
      this.fallRotation.copy(this.tilt.setFromAxisAngle(this.side, eased * 1.5)).multiply(this.quaternion);
      this.scaleVec.setScalar(SOLDIER_SCALE * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3));
      this.matrix.compose(this.position, this.fallRotation, this.scaleVec);
      this.mesh.setMatrixAt(index, this.matrix);
      params[index * 4] = body.phase;
      params[index * 4 + 1] = 0;
      params[index * 4 + 2] = (1 - t) * 0.7;
      params[index * 4 + 3] = 0;
      index++;
    }
    return index;
  }

  update(sim: Simulation, alpha: number, frameDt: number): void {
    const count = visibleUnits(sim.units);
    this.centerX = sim.prevSquadX + (sim.squadX - sim.prevSquadX) * alpha;
    this.materials.attach.value = WEAPON_MODEL[sim.weapon];
    this.applyDetail(count);

    while (this.units.length < count) {
      // New units spawn at the squad centre and grow into their slot.
      this.units.push({ x: 0, z: 0, scale: 0, phase: Math.random() * Math.PI * 2, recoil: 0 });
    }
    if (this.units.length > count) this.units.length = count;

    const ease = 1 - Math.exp(-12 * frameDt);
    const grow = 1 - Math.exp(-10 * frameDt);
    const recoilDecay = Math.exp(-RECOIL_DECAY * frameDt);
    const params = this.params.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const unit = this.units[i];
      if (!unit) continue;
      formationSlot(i, sim.units, this.slot);
      unit.x += (this.slot.x - unit.x) * ease;
      unit.z += (this.slot.z - unit.z) * ease;
      unit.scale += (1 - unit.scale) * grow;
      this.position.set(this.centerX + unit.x, 0, SQUAD_Z + unit.z);
      this.scaleVec.setScalar(unit.scale * SOLDIER_SCALE);
      this.matrix.compose(this.position, this.quaternion, this.scaleVec);
      this.mesh.setMatrixAt(i, this.matrix);
      unit.recoil *= recoilDecay;
      params[i * 4] = unit.phase;
      params[i * 4 + 1] = 0;
      params[i * 4 + 2] = 0;
      params[i * 4 + 3] = unit.recoil;
    }
    this.mesh.count = this.placeFalling(count, frameDt);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.params.needsUpdate = true;
  }
}
