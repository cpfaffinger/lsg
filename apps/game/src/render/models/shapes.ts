import {
  CapsuleGeometry,
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

export const rbox = (w: number, h: number, d: number, radius = 0.03, detail: Detail = 1): BufferGeometry =>
  new RoundedBoxGeometry(w, h, d, detail ? 2 : 1, Math.min(radius, w / 2, h / 2, d / 2) * (detail ? 1 : 0.6));

export const cyl = (
  top: number,
  bottom: number,
  height: number,
  detail: Detail = 1,
  open = false,
): BufferGeometry => new CylinderGeometry(top, bottom, height, detail ? 14 : 7, 1, open);

export const sphere = (radius: number, detail: Detail = 1, thetaLength = Math.PI): BufferGeometry =>
  new SphereGeometry(radius, detail ? 16 : 8, detail ? 12 : 6, 0, Math.PI * 2, 0, thetaLength);

export const capsule = (radius: number, length: number, detail: Detail = 1): BufferGeometry =>
  new CapsuleGeometry(radius, length, detail ? 4 : 2, detail ? 10 : 6);

export const cone = (radius: number, height: number, detail: Detail = 1): BufferGeometry =>
  new ConeGeometry(radius, height, detail ? 12 : 6);

export const torus = (radius: number, tube: number, detail: Detail = 1, arc = Math.PI * 2): BufferGeometry =>
  new TorusGeometry(radius, tube, detail ? 8 : 4, detail ? 24 : 12, arc);

export const ico = (radius: number, detail: Detail = 1): BufferGeometry =>
  new IcosahedronGeometry(radius, detail ? 1 : 0);
export const octa = (radius: number): BufferGeometry => new OctahedronGeometry(radius, 0);
export const dodeca = (radius: number): BufferGeometry => new DodecahedronGeometry(radius, 0);
