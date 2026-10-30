import {
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
  type Scene,
} from 'three';
import { isGateBeneficial } from '../../sim/gates.ts';
import type { Simulation } from '../../sim/simulation.ts';
import type { Gate } from '../../sim/types.ts';
import { formatGateLabel } from '../../ui/gate-label.ts';
import { buildGateFrame, buildGateGlow } from '../models/props.ts';
import { createStaticMaterial } from '../models/static-material.ts';
import { PALETTE } from '../palette.ts';

const GATE_HEIGHT = 2.8;

const fieldVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fieldFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPulse;
  uniform vec2 uSize;
  varying vec2 vUv;

  float hexEdge(vec2 p) {
    p *= vec2(1.0, 1.1547);
    vec2 a = mod(p, vec2(1.0, 1.732)) - vec2(0.5, 0.866);
    vec2 b = mod(p + vec2(0.5, 0.866), vec2(1.0, 1.732)) - vec2(0.5, 0.866);
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(g);
    float d = max(q.x * 0.866 + q.y * 0.5, q.y);
    return smoothstep(0.42, 0.5, d);
  }

  void main() {
    vec2 world = vUv * uSize;
    float edge = 1.0 - min(min(vUv.x, 1.0 - vUv.x) * uSize.x, min(vUv.y, 1.0 - vUv.y) * uSize.y) * 2.2;
    edge = clamp(edge, 0.0, 1.0);
    float scan = 0.5 + 0.5 * sin(world.y * 18.0 - uTime * 6.0);
    float sweep = smoothstep(0.0, 0.08, fract(vUv.y - uTime * 0.35)) * smoothstep(0.16, 0.08, fract(vUv.y - uTime * 0.35));
    float hex = hexEdge(world * 2.2 + vec2(0.0, uTime * 0.2));
    // Normal blending keeps the colour saturated on bright ground, where adding light washes out.
    float alpha = 0.5 + edge * edge * 0.35 + hex * 0.12 + scan * 0.04 + sweep * 0.14 + uPulse * 0.2;
    vec3 color = uColor * (0.75 + edge * 1.8 + hex * 0.4 + uPulse * 1.5);
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.95));
  }
`;

interface GateVisual {
  group: Group;
  field: Mesh<PlaneGeometry, ShaderMaterial>;
  label: Mesh<PlaneGeometry, MeshBasicMaterial>;
  glow: Mesh<BufferGeometry, MeshStandardMaterial>;
  frame: Mesh;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  renderedKey: string;
  width: number;
}

/** Gates: metal pillars with glowing strips, an animated energy field and a value label. */
export class GateView {
  private readonly scene: Scene;
  private readonly visuals = new Map<number, GateVisual>();
  private readonly pool: GateVisual[] = [];
  private readonly frameGeometries = new Map<string, { frame: BufferGeometry; glow: BufferGeometry }>();
  private readonly frameMaterial: Material = createStaticMaterial(2.5);
  private readonly fieldGeometry = new PlaneGeometry(1, 1);
  private readonly labelGeometry = new PlaneGeometry(1, 0.5);
  private readonly tmpColor = new Color();
  private time = 0;
  /** Bumped when the language changes so labels re-render. */
  labelRevision = 0;
  /** Adds ▲/▼ symbols so good and bad gates differ by more than colour. */
  colorblind = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private geometriesFor(width: number): { frame: BufferGeometry; glow: BufferGeometry } {
    const key = width.toFixed(2);
    let entry = this.frameGeometries.get(key);
    if (!entry) {
      entry = { frame: buildGateFrame(width, GATE_HEIGHT), glow: buildGateGlow(width, GATE_HEIGHT) };
      this.frameGeometries.set(key, entry);
    }
    return entry;
  }

  private create(width: number): GateVisual {
    const group = new Group();
    const geometries = this.geometriesFor(width);
    const frame = new Mesh(geometries.frame, this.frameMaterial);
    frame.castShadow = true;
    const glow = new Mesh(
      geometries.glow,
      new MeshStandardMaterial({
        color: 0x000000,
        emissive: 0xffffff,
        emissiveIntensity: 2.5,
        roughness: 0.4,
      }),
    );
    const field = new Mesh(
      this.fieldGeometry,
      new ShaderMaterial({
        vertexShader: fieldVertex,
        fragmentShader: fieldFragment,
        uniforms: {
          uColor: { value: new Color() },
          uTime: { value: 0 },
          uPulse: { value: 0 },
          uSize: { value: [width, GATE_HEIGHT] },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    field.scale.set(width - 0.4, GATE_HEIGHT - 0.25, 1);
    field.position.set(0, (GATE_HEIGHT - 0.25) / 2 + 0.05, 0);
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const label = new Mesh(
      this.labelGeometry,
      new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    // Over-bright so the label stays white after tone mapping.
    label.material.color.setScalar(2.2);
    label.position.set(0, GATE_HEIGHT * 0.55, 0.06);
    label.renderOrder = 4;
    group.add(frame, glow, field, label);
    return { group, field, label, glow, frame, canvas, texture, renderedKey: '', width };
  }

  private drawLabel(visual: GateVisual, gate: Gate): void {
    const good = gate.op === 'weapon' || isGateBeneficial(gate.op, gate.value);
    const key = `${gate.op}:${gate.value}:${gate.weapon}:${this.labelRevision}:${this.colorblind}:${good}`;
    if (key === visual.renderedKey) return;
    visual.renderedKey = key;
    const ctx = visual.canvas.getContext('2d');
    if (!ctx) return;
    const label = formatGateLabel(gate.op, gate.value, gate.weapon);
    const main = this.colorblind && gate.op !== 'weapon' ? `${good ? '▲' : '▼'}${label.main}` : label.main;
    const sub = label.sub;
    ctx.clearRect(0, 0, visual.canvas.width, visual.canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `900 ${sub ? 136 : 176}px "Segoe UI", system-ui, sans-serif`;
    ctx.lineWidth = 30;
    ctx.strokeStyle = 'rgba(0,0,0,0.92)';
    const mainY = sub ? 100 : 128;
    ctx.strokeText(main, 256, mainY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(main, 256, mainY);
    if (sub) {
      ctx.font = '800 50px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 14;
      ctx.strokeText(sub, 256, 200);
      ctx.fillText(sub, 256, 200);
    }
    visual.texture.needsUpdate = true;
  }

  update(sim: Simulation, alpha: number, frameDt = 1 / 60): void {
    this.time += frameDt;
    const seen = new Set<number>();
    for (const gate of sim.gates) {
      if (!gate.alive) continue;
      seen.add(gate.id);
      let visual = this.visuals.get(gate.id);
      if (!visual) {
        const index = this.pool.findIndex((v) => Math.abs(v.width - gate.width) < 0.01);
        visual = index >= 0 ? (this.pool.splice(index, 1)[0] as GateVisual) : this.create(gate.width);
        visual.renderedKey = '';
        this.scene.add(visual.group);
        this.visuals.set(gate.id, visual);
      }
      this.drawLabel(visual, gate);
      const z = gate.prevZ + (gate.z - gate.prevZ) * alpha;
      visual.group.position.set(gate.x, 0, z);
      const color =
        gate.op === 'weapon'
          ? PALETTE.gateWeapon
          : isGateBeneficial(gate.op, gate.value)
            ? PALETTE.gateGood
            : PALETTE.gateBad;
      this.tmpColor.setHex(color);
      visual.glow.material.emissive.copy(this.tmpColor);
      // "Pop" when hit: label scales up briefly and the field flares.
      const pop = Math.max(0, 1 - gate.hitTimer * 8);
      const uniforms = visual.field.material.uniforms;
      (uniforms.uColor?.value as Color).copy(this.tmpColor).convertSRGBToLinear();
      if (uniforms.uTime) uniforms.uTime.value = this.time + gate.id;
      if (uniforms.uPulse) uniforms.uPulse.value = pop;
      const s = gate.width * 0.88 * (1 + pop * 0.14);
      visual.label.scale.set(s, s, 1);
    }
    for (const [id, visual] of this.visuals) {
      if (seen.has(id)) continue;
      this.scene.remove(visual.group);
      this.visuals.delete(id);
      this.pool.push(visual);
    }
  }
}
