import {
  AdditiveBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  type Blending,
  type Scene,
} from 'three';

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  sizeStart: number;
  sizeEnd: number;
  /** Linear RGB, may exceed 1 for HDR glow with bloom. */
  r: number;
  g: number;
  b: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

const vertexShader = /* glsl */ `
  attribute vec4 aPosSize;   // xyz = position, w = size
  attribute vec4 aColor;     // rgb + alpha
  varying vec4 vColor;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vColor = aColor;
    vUv = uv;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = aPosSize.xyz + (right * position.x + up * position.y) * aPosSize.w;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  varying vec4 vColor;
  varying vec2 vUv;
  uniform float uSoftness;
  #include <fog_pars_fragment>
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float falloff = 1.0 - smoothstep(1.0 - uSoftness, 1.0, d);
    float core = pow(max(0.0, 1.0 - d), 2.0);
    float a = vColor.a * mix(falloff, core, uSoftness * 0.5);
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor.rgb, a);
    #include <fog_fragment>
  }
`;

/**
 * CPU-simulated, GPU-billboarded particles. All particles of one system share a blend mode;
 * use one additive system for sparks/fire and one alpha system for smoke/dust.
 */
export class ParticleSystem {
  readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private capacity: number;
  private count = 0;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly color: Float32Array;
  private readonly physics: Float32Array;
  private readonly posSizeAttr: InstancedBufferAttribute;
  private readonly colorAttr: InstancedBufferAttribute;
  /** Effective capacity limit set by the quality level. */
  budget: number;

  constructor(scene: Scene, capacity: number, blending: Blending = AdditiveBlending, softness = 0.6) {
    this.capacity = capacity;
    this.budget = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity * 2);
    this.color = new Float32Array(capacity * 4);
    this.physics = new Float32Array(capacity * 2);

    const base = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('uv', base.getAttribute('uv'));
    this.posSizeAttr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.colorAttr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.posSizeAttr.setUsage(DynamicDrawUsage);
    this.colorAttr.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aPosSize', this.posSizeAttr);
    geometry.setAttribute('aColor', this.colorAttr);
    geometry.instanceCount = 0;

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: UniformsUtils.merge([UniformsLib.fog, { uSoftness: { value: softness } }]),
      transparent: true,
      depthWrite: false,
      blending,
      fog: true,
      toneMapped: blending !== AdditiveBlending,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = blending === NormalBlending ? 2 : 3;
    scene.add(this.mesh);
  }

  get alive(): number {
    return this.count;
  }

  spawn(p: ParticleSpawn): void {
    const limit = Math.min(this.capacity, this.budget);
    let i = this.count;
    if (i >= limit) {
      // Recycle a random slot so new effects stay visible under heavy load.
      i = Math.floor(Math.random() * limit);
    } else {
      this.count++;
    }
    const i3 = i * 3;
    this.pos[i3] = p.x;
    this.pos[i3 + 1] = p.y;
    this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx;
    this.vel[i3 + 1] = p.vy;
    this.vel[i3 + 2] = p.vz;
    this.life[i] = p.life;
    this.maxLife[i] = p.life;
    this.size[i * 2] = p.sizeStart;
    this.size[i * 2 + 1] = p.sizeEnd;
    this.color[i * 4] = p.r;
    this.color[i * 4 + 1] = p.g;
    this.color[i * 4 + 2] = p.b;
    this.color[i * 4 + 3] = p.alpha ?? 1;
    this.physics[i * 2] = p.gravity ?? 0;
    this.physics[i * 2 + 1] = p.drag ?? 0;
  }

  update(dt: number): void {
    const posSize = this.posSizeAttr.array as Float32Array;
    const colors = this.colorAttr.array as Float32Array;
    let i = 0;
    while (i < this.count) {
      this.life[i] = (this.life[i] ?? 0) - dt;
      if ((this.life[i] ?? 0) <= 0) {
        this.removeAt(i);
        continue;
      }
      const i3 = i * 3;
      const gravity = this.physics[i * 2] ?? 0;
      const drag = Math.max(0, 1 - (this.physics[i * 2 + 1] ?? 0) * dt);
      this.vel[i3 + 1] = (this.vel[i3 + 1] ?? 0) - gravity * dt;
      this.vel[i3] = (this.vel[i3] ?? 0) * drag;
      this.vel[i3 + 1] = (this.vel[i3 + 1] ?? 0) * drag;
      this.vel[i3 + 2] = (this.vel[i3 + 2] ?? 0) * drag;
      this.pos[i3] = (this.pos[i3] ?? 0) + (this.vel[i3] ?? 0) * dt;
      this.pos[i3 + 1] = Math.max(0.02, (this.pos[i3 + 1] ?? 0) + (this.vel[i3 + 1] ?? 0) * dt);
      this.pos[i3 + 2] = (this.pos[i3 + 2] ?? 0) + (this.vel[i3 + 2] ?? 0) * dt;
      const t = 1 - (this.life[i] ?? 0) / (this.maxLife[i] || 1);
      const size = (this.size[i * 2] ?? 0) + ((this.size[i * 2 + 1] ?? 0) - (this.size[i * 2] ?? 0)) * t;
      const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
      const i4 = i * 4;
      posSize[i4] = this.pos[i3] ?? 0;
      posSize[i4 + 1] = this.pos[i3 + 1] ?? 0;
      posSize[i4 + 2] = this.pos[i3 + 2] ?? 0;
      posSize[i4 + 3] = size;
      colors[i4] = this.color[i4] ?? 0;
      colors[i4 + 1] = this.color[i4 + 1] ?? 0;
      colors[i4 + 2] = this.color[i4 + 2] ?? 0;
      colors[i4 + 3] = (this.color[i4 + 3] ?? 0) * fade;
      i++;
    }
    this.mesh.geometry.instanceCount = this.count;
    this.posSizeAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  /** Moves all particles along z, e.g. to keep ground effects in sync with the scrolling lane. */
  scroll(dz: number): void {
    for (let i = 0; i < this.count; i++) this.pos[i * 3 + 2] = (this.pos[i * 3 + 2] ?? 0) + dz;
  }

  clear(): void {
    this.count = 0;
    this.mesh.geometry.instanceCount = 0;
  }

  private removeAt(i: number): void {
    const last = this.count - 1;
    if (i !== last) {
      this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
      this.size.copyWithin(i * 2, last * 2, last * 2 + 2);
      this.color.copyWithin(i * 4, last * 4, last * 4 + 4);
      this.physics.copyWithin(i * 2, last * 2, last * 2 + 2);
      this.life[i] = this.life[last] ?? 0;
      this.maxLife[i] = this.maxLife[last] ?? 0;
    }
    this.count--;
  }
}
