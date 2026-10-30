import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Scene,
} from 'three';
import { formatGateLabel } from '../../ui/gate-label.ts';
import { isGateBeneficial } from '../../sim/gates.ts';
import type { Simulation } from '../../sim/simulation.ts';
import type { Gate } from '../../sim/types.ts';
import { PALETTE } from '../palette.ts';

const GATE_HEIGHT = 2.6;

interface GateVisual {
  group: Group;
  panel: Mesh<PlaneGeometry, MeshBasicMaterial>;
  label: Mesh<PlaneGeometry, MeshBasicMaterial>;
  frameMaterial: MeshStandardMaterial;
  canvas: HTMLCanvasElement;
  texture: CanvasTexture;
  renderedKey: string;
}

/** Draws gates as glowing frames with a translucent panel and a canvas-rendered value label. */
export class GateView {
  private readonly scene: Scene;
  private readonly visuals = new Map<number, GateVisual>();
  private readonly pool: GateVisual[] = [];
  private readonly postGeometry = new BoxGeometry(0.22, GATE_HEIGHT, 0.22);
  private readonly barGeometry = new BoxGeometry(1, 0.22, 0.22);
  private readonly panelGeometry = new PlaneGeometry(1, 1);
  private readonly labelGeometry = new PlaneGeometry(1, 0.5);
  private readonly tmpColor = new Color();
  /** Bumped when the language changes so labels re-render. */
  labelRevision = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private create(): GateVisual {
    const group = new Group();
    const frameMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.6,
    });
    const left = new Mesh(this.postGeometry, frameMaterial);
    const right = new Mesh(this.postGeometry, frameMaterial);
    const top = new Mesh(this.barGeometry, frameMaterial);
    left.castShadow = right.castShadow = true;
    const panel = new Mesh(
      this.panelGeometry,
      new MeshBasicMaterial({ transparent: true, opacity: 0.32, side: DoubleSide, depthWrite: false }),
    );
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
    group.add(left, right, top, panel, label);
    group.userData = { left, right, top };
    return { group, panel, label, frameMaterial, canvas, texture, renderedKey: '' };
  }

  private layout(visual: GateVisual, gate: Gate): void {
    const { left, right, top } = visual.group.userData as { left: Mesh; right: Mesh; top: Mesh };
    const half = gate.width / 2;
    left.position.set(-half, GATE_HEIGHT / 2, 0);
    right.position.set(half, GATE_HEIGHT / 2, 0);
    top.scale.x = gate.width + 0.22;
    top.position.set(0, GATE_HEIGHT, 0);
    visual.panel.scale.set(gate.width, GATE_HEIGHT, 1);
    visual.panel.position.set(0, GATE_HEIGHT / 2, 0);
    visual.label.scale.set(gate.width * 0.9, gate.width * 0.9, 1);
    visual.label.position.set(0, GATE_HEIGHT * 0.55, 0.05);
  }

  private drawLabel(visual: GateVisual, gate: Gate): void {
    const key = `${gate.op}:${gate.value}:${gate.weapon}:${this.labelRevision}`;
    if (key === visual.renderedKey) return;
    visual.renderedKey = key;
    const ctx = visual.canvas.getContext('2d');
    if (!ctx) return;
    const { main, sub } = formatGateLabel(gate.op, gate.value, gate.weapon);
    ctx.clearRect(0, 0, visual.canvas.width, visual.canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `900 ${sub ? 128 : 150}px "Segoe UI", system-ui, sans-serif`;
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    const mainY = sub ? 100 : 128;
    ctx.strokeText(main, 256, mainY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(main, 256, mainY);
    if (sub) {
      ctx.font = '800 48px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 10;
      ctx.strokeText(sub, 256, 200);
      ctx.fillText(sub, 256, 200);
    }
    visual.texture.needsUpdate = true;
  }

  update(sim: Simulation, alpha: number): void {
    const seen = new Set<number>();
    for (const gate of sim.gates) {
      if (!gate.alive) continue;
      seen.add(gate.id);
      let visual = this.visuals.get(gate.id);
      if (!visual) {
        visual = this.pool.pop() ?? this.create();
        visual.renderedKey = '';
        this.layout(visual, gate);
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
      visual.panel.material.color.copy(this.tmpColor);
      visual.frameMaterial.color.copy(this.tmpColor);
      visual.frameMaterial.emissive.copy(this.tmpColor);
      // "Pop" when hit: label scales up briefly and the panel brightens.
      const pop = Math.max(0, 1 - gate.hitTimer * 8);
      const s = gate.width * 0.9 * (1 + pop * 0.12);
      visual.label.scale.set(s, s, 1);
      visual.panel.material.opacity = 0.3 + pop * 0.25;
    }
    for (const [id, visual] of this.visuals) {
      if (seen.has(id)) continue;
      this.scene.remove(visual.group);
      this.visuals.delete(id);
      this.pool.push(visual);
    }
  }
}
