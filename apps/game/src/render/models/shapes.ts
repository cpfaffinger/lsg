import {
  BoxGeometry,
  CapsuleGeometry,
  Quaternion,
  Vector3,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Detail level for generated geometry: 1 = full, 0 = minimal. */
export type Detail = 0 | 1;

/**
 * Rounded box. Small radii are invisible at gameplay distance, so those (and every box in the
 * low-detail variant) become plain 12-triangle boxes.
 */
export const rbox = (w: number, h: number, d: number, radius = 0.03, detail: Detail = 1): BufferGeometry =>
  detail && radius >= 0.05
    ? new RoundedBoxGeometry(w, h, d, 1, Math.min(radius, w / 2, h / 2, d / 2))
    : new BoxGeometry(w, h, d);

export const cyl = (
  top: number,
  bottom: number,
  height: number,
  detail: Detail = 1,
  open = false,
): BufferGeometry => new CylinderGeometry(top, bottom, height, detail ? 10 : 6, 1, open);

export const sphere = (radius: number, detail: Detail = 1, thetaLength = Math.PI): BufferGeometry =>
  new SphereGeometry(radius, detail ? 10 : 7, detail ? 7 : 5, 0, Math.PI * 2, 0, thetaLength);

export const capsule = (radius: number, length: number, detail: Detail = 1): BufferGeometry =>
  new CapsuleGeometry(radius, length, detail ? 2 : 1, detail ? 8 : 6);

export const cone = (radius: number, height: number, detail: Detail = 1): BufferGeometry =>
  new ConeGeometry(radius, height, detail ? 8 : 5);

export const torus = (radius: number, tube: number, detail: Detail = 1, arc = Math.PI * 2): BufferGeometry =>
  new TorusGeometry(radius, tube, detail ? 6 : 3, detail ? 18 : 10, arc);

export const ico = (radius: number, detail: Detail = 1): BufferGeometry =>
  new IcosahedronGeometry(radius, detail ? 1 : 0);
export const octa = (radius: number): BufferGeometry => new OctahedronGeometry(radius, 0);
export const dodeca = (radius: number): BufferGeometry => new DodecahedronGeometry(radius, 0);

const UP = new Vector3(0, 1, 0);

/** Capsule spanning exactly from point a to point b (limbs, struts). */
export function segment(
  a: [number, number, number],
  b: [number, number, number],
  radius: number,
  detail: Detail = 1,
): BufferGeometry {
  const start = new Vector3(...a);
  const end = new Vector3(...b);
  const dir = end.clone().sub(start);
  const length = dir.length();
  const geometry = capsule(radius, Math.max(0.001, length - radius * 2), detail);
  geometry.applyQuaternion(new Quaternion().setFromUnitVectors(UP, dir.normalize()));
  geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
  return geometry;
}
