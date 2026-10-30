import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  TetrahedronGeometry,
  Vector3,
  type Scene,
} from 'three';

interface Shard {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax: number;
  ay: number;
  az: number;
  spin: number;
  size: number;
  life: number;
  maxLife: number;
}

/** Physical low-poly shards that burst out of destroyed enemies, bounce and fade. */
export class DebrisSystem {
  private readonly mesh: InstancedMesh;
  private readonly shards: Shard[] = [];
  private readonly capacity: number;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly axis = new Vector3();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  budget: number;

  constructor(scene: Scene, capacity: number) {
    this.capacity = capacity;
    this.budget = capacity;
    const geometry = new TetrahedronGeometry(0.5, 0);
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.2,
      flatShading: true,
    });
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.color.setHex(0xffffff));
    scene.add(this.mesh);
  }

  burst(x: number, y: number, z: number, count: number, colorHex: number, power: number, size = 0.22): void {
    const limit = Math.min(this.capacity, this.budget);
    for (let n = 0; n < count; n++) {
      if (this.shards.length >= limit) this.shards.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.4 + Math.random() * 0.8);
      const index = this.shards.length;
      this.shards.push({
        x: x + (Math.random() - 0.5) * 0.4,
        y: y + Math.random() * 0.5,
        z: z + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(angle) * speed,
        vy: power * (0.8 + Math.random() * 1.2),
        vz: Math.sin(angle) * speed,
        ax: Math.random() - 0.5,
        ay: Math.random() - 0.5,
        az: Math.random() - 0.5,
        spin: (Math.random() - 0.5) * 18,
        size: size * (0.6 + Math.random() * 0.8),
        life: 0.9 + Math.random() * 0.6,
        maxLife: 1.5,
      });
      this.color.setHex(colorHex).offsetHSL(0, 0, (Math.random() - 0.5) * 0.15);
      this.mesh.setColorAt(index, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, scrollDz: number): void {
    let write = 0;
    for (let read = 0; read < this.shards.length; read++) {
      const s = this.shards[read];
      if (!s) continue;
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vy -= 22 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt + scrollDz;
      if (s.y < s.size * 0.4) {
        s.y = s.size * 0.4;
        s.vy *= -0.35;
        s.vx *= 0.6;
        s.vz *= 0.6;
        s.spin *= 0.6;
      }
      if (write !== read) {
        this.shards[write] = s;
        this.mesh.getColorAt(read, this.color);
        this.mesh.setColorAt(write, this.color);
      }
      const shrink = Math.min(1, s.life / 0.35);
      this.position.set(s.x, s.y, s.z);
      this.axis.set(s.ax, s.ay, s.az).normalize();
      this.quaternion.setFromAxisAngle(this.axis, s.spin * (s.maxLife - s.life));
      this.scale.setScalar(s.size * shrink);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(write, this.matrix);
      write++;
    }
    this.shards.length = write;
    this.mesh.count = write;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.shards.length = 0;
    this.mesh.count = 0;
  }
}
