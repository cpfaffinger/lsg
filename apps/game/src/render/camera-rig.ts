import { PerspectiveCamera, Vector3 } from 'three';
import { LANE_WIDTH } from '../sim/world.ts';

/** Camera offset and look-at point relative to the squad anchor (0,0,0) before scaling. */
const BASE_OFFSET = new Vector3(0, 11, 10);
const BASE_LOOK_AT = new Vector3(0, 0, -9);
const BASE_DISTANCE = BASE_OFFSET.length();

/**
 * Third-person camera behind and above the squad.
 * The whole rig scales uniformly around the squad anchor so the squad keeps the same
 * screen position, while the scale makes sure the full lane width is visible on
 * narrow portrait phones as well as wide desktop windows.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly position = new Vector3();
  private readonly lookAt = new Vector3();
  private readonly shakeOffset = new Vector3();
  private aspectScale = 1;
  /** Extra zoom-out factor, e.g. when the squad grows large. Smoothed towards `targetZoom`. */
  zoom = 1;
  targetZoom = 1;
  /** Shifts the whole rig towards the camera so deep squads stay in view. Smoothed. */
  anchorZ = 0;
  targetAnchorZ = 0;
  /** Horizontal follow of the squad (fraction of its x position). */
  followX = 0;
  private shakeStrength = 0;
  private shakeTime = 0;

  constructor() {
    this.camera = new PerspectiveCamera(50, 1, 0.5, 400);
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    // Slightly wider vertical FOV on tall screens keeps more of the lane ahead visible.
    this.camera.fov = aspect < 0.75 ? 58 : 50;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const visibleWidth = LANE_WIDTH * 1.2;
    const requiredDistance = visibleWidth / 2 / Math.tan(hFov / 2);
    this.aspectScale = Math.max(1, requiredDistance / BASE_DISTANCE);
    this.camera.updateProjectionMatrix();
  }

  /** Adds trauma-style screen shake; strength decays quickly. */
  shake(strength: number): void {
    this.shakeStrength = Math.min(1.2, this.shakeStrength + strength);
  }

  update(dt: number, enableShake: boolean): void {
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 2);
    this.anchorZ += (this.targetAnchorZ - this.anchorZ) * Math.min(1, dt * 2);
    this.shakeTime += dt;
    this.shakeStrength = Math.max(0, this.shakeStrength - dt * 2.5);
    const s = enableShake ? this.shakeStrength * this.shakeStrength * 0.6 : 0;
    this.shakeOffset.set(
      Math.sin(this.shakeTime * 47) * s,
      Math.sin(this.shakeTime * 61 + 1.3) * s,
      Math.sin(this.shakeTime * 53 + 2.1) * s * 0.5,
    );
    const scale = this.aspectScale * this.zoom;
    this.position.copy(BASE_OFFSET).multiplyScalar(scale).add(this.shakeOffset);
    this.position.x += this.followX;
    this.position.z += this.anchorZ;
    this.lookAt.copy(BASE_LOOK_AT).multiplyScalar(scale);
    this.lookAt.x += this.followX + this.shakeOffset.x * 0.5;
    this.lookAt.z += this.anchorZ;
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookAt);
  }
}
