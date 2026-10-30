import {
  AdditiveBlending,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MultiplyBlending,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type Scene,
} from 'three';

interface GroundMark {
  x: number;
  z: number;
  age: number;
  life: number;
  size: number;
  grow: number;
  color: Color;
}

const ringFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float ring = smoothstep(0.72, 0.9, r) * (1.0 - smoothstep(0.9, 1.0, r));
    gl_FragColor = vec4(vColor.rgb * ring * vColor.a, 1.0);
  }
`;

const scorchFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float mark = (1.0 - smoothstep(0.35, 1.0, r)) * vColor.a;
    // Multiply blending: 1.0 = no change, lower = darker.
    gl_FragColor = vec4(mix(vec3(1.0), vec3(0.18, 0.15, 0.13), mark), 1.0);
  }
`;

const vertexShader = /* glsl */ `
  attribute vec4 aColor;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vUv = uv;
    vColor = aColor;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

class MarkLayer {
  private readonly mesh: InstancedMesh;
  private readonly colors: InstancedBufferAttribute;
  private readonly marks: GroundMark[] = [];
  private readonly capacity: number;
  private readonly fade: 'out' | 'late';
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly scale = new Vector3();

  constructor(
    scene: Scene,
    fragmentShader: string,
    blending: typeof AdditiveBlending | typeof MultiplyBlending,
    capacity: number,
    y: number,
    fade: 'out' | 'late',
  ) {
    this.capacity = capacity;
    this.fade = fade;
    const geometry = new PlaneGeometry(1, 1);
    this.colors = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.colors.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aColor', this.colors);
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending,
      premultipliedAlpha: blending === MultiplyBlending,
    });
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.position.y = y;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  add(mark: GroundMark): void {
    if (this.marks.length >= this.capacity) this.marks.shift();
    this.marks.push(mark);
  }

  clear(): void {
    this.marks.length = 0;
    this.mesh.count = 0;
  }

  update(dt: number, scrollDz: number): void {
    const colors = this.colors.array as Float32Array;
    let write = 0;
    for (const mark of this.marks) {
      mark.age += dt;
      mark.z += scrollDz;
      if (mark.age >= mark.life) continue;
      this.marks[write] = mark;
      const t = mark.age / mark.life;
      const size = mark.size + mark.grow * t;
      const alpha = this.fade === 'out' ? 1 - t : t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      this.position.set(mark.x, 0, mark.z);
      this.scale.set(size, size, 1);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(write, this.matrix);
      colors[write * 4] = mark.color.r;
      colors[write * 4 + 1] = mark.color.g;
      colors[write * 4 + 2] = mark.color.b;
      colors[write * 4 + 3] = alpha;
      write++;
    }
    this.marks.length = write;
    this.mesh.count = write;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colors.needsUpdate = true;
  }
}

/** Expanding shockwave rings and fading scorch marks on the lane. */
export class GroundFx {
  private readonly rings: MarkLayer;
  private readonly scorch: MarkLayer;
  private readonly tmp = new Color();

  constructor(scene: Scene) {
    this.rings = new MarkLayer(scene, ringFragment, AdditiveBlending, 48, 0.08, 'out');
    this.scorch = new MarkLayer(scene, scorchFragment, MultiplyBlending, 40, 0.03, 'late');
  }

  /** `colorHex` is sRGB; intensity > 1 makes the ring bloom. */
  shockwave(x: number, z: number, radius: number, colorHex: number, intensity = 3, life = 0.45): void {
    const color = this.tmp.setHex(colorHex).convertSRGBToLinear().multiplyScalar(intensity).clone();
    this.rings.add({ x, z, age: 0, life, size: radius * 0.3, grow: radius * 2.2, color });
  }

  scorchMark(x: number, z: number, radius: number): void {
    this.scorch.add({ x, z, age: 0, life: 4, size: radius * 1.8, grow: 0, color: new Color(1, 1, 1) });
  }

  clear(): void {
    this.rings.clear();
    this.scorch.clear();
  }

  update(dt: number, scrollDz: number): void {
    this.rings.update(dt, scrollDz);
    this.scorch.update(dt, scrollDz);
  }
}
