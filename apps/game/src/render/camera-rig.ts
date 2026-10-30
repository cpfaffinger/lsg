import { PerspectiveCamera, Vector3 } from 'three';
import { LANE_WIDTH } from '../sim/world.ts';

/**
 * Third-person camera behind and above the squad.
 * Distance adapts to the aspect ratio so the full lane width is always visible,
 * which keeps portrait phones and wide desktop windows equally playable.
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly direction = new Vector3(0, 0.78, 0.62).normalize();
  private readonly target = new Vector3(0, 0, -9);
  private readonly shakeOffset = new Vector3();
  private baseDistance = 20;
  /** Extra zoom-out factor, e.g. when the squad grows large. */
  zoom = 1;
  private shakeStrength = 0;
  private shakeTime = 0;

  constructor() {
    this.camera = new PerspectiveCamera(50, 1, 0.5, 400);
  }

  resize(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    this.camera.aspect = aspect;
    const vFov = (this.camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const visibleWidth = LANE_WIDTH * 1.25;
    const distanceForWidth = visibleWidth / 2 / Math.tan(hFov / 2);
    this.baseDistance = Math.max(18, distanceForWidth);
    this.camera.updateProjectionMatrix();
  }

  /** Adds trauma-style screen shake; strength decays quickly. */
  shake(strength: number): void {
    this.shakeStrength = Math.min(1.5, this.shakeStrength + strength);
  }

  update(dt: number, enableShake: boolean): void {
    this.shakeTime += dt;
    this.shakeStrength = Math.max(0, this.shakeStrength - dt * 2.5);
    const s = enableShake ? this.shakeStrength * this.shakeStrength * 0.6 : 0;
    this.shakeOffset.set(
      Math.sin(this.shakeTime * 47) * s,
      Math.sin(this.shakeTime * 61 + 1.3) * s,
      Math.sin(this.shakeTime * 53 + 2.1) * s * 0.5,
    );
    const distance = this.baseDistance * this.zoom;
    this.camera.position.copy(this.target).addScaledVector(this.direction, distance).add(this.shakeOffset);
    this.camera.lookAt(this.target.x + this.shakeOffset.x * 0.5, this.target.y, this.target.z);
  }
}
