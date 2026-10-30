import {
  CanvasTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Scene,
} from 'three';

/** Characters available in the glyph atlas. */
const GLYPHS = '0123456789+-−×÷%KMB.,!';
const CELL_W = 48;
const CELL_H = 72;
/** Glyph advance relative to its height. */
const ADVANCE = 0.47;

interface FloatingEntry {
  text: string;
  x: number;
  y: number;
  z: number;
  vy: number;
  r: number;
  g: number;
  b: number;
  scale: number;
  life: number;
  maxLife: number;
  start: number;
}

const vertexShader = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec4 aGlyphOffsetScale; // x = glyph index, y = x offset (em), z = scale, w = alpha
  attribute vec3 aColor;
  uniform float uGlyphCount;
  uniform float uAspect;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float s = aGlyphOffsetScale.z;
    vec2 local = vec2((position.x * uAspect + aGlyphOffsetScale.y) * s, position.y * s);
    vec3 world = aCenter + right * local.x + up * local.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    vUv = vec2((aGlyphOffsetScale.x + uv.x) / uGlyphCount, uv.y);
    vColor = vec4(aColor, aGlyphOffsetScale.w);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    vec4 texel = texture2D(uAtlas, vUv);
    // Atlas: red = fill, green = outline.
    // Brighter than 1.0 so the text stays white after the tone-mapping pass.
    vec3 color = mix(vec3(0.02, 0.02, 0.03), vColor.rgb * 2.4, texel.r);
    float alpha = max(texel.r, texel.g) * vColor.a;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

function buildAtlas(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * GLYPHS.length;
  canvas.height = CELL_H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(CELL_H * 0.78)}px "Segoe UI", system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    // Outline in the green channel, fill in the red channel, so one texture serves both.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < GLYPHS.length; i++) {
      const ch = GLYPHS[i] ?? '';
      const cx = i * CELL_W + CELL_W / 2;
      const cy = CELL_H / 2 + 2;
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#00ff00';
      ctx.strokeText(ch, cx, cy);
      ctx.fillStyle = '#ff0000';
      ctx.fillText(ch, cx, cy);
    }
  }
  // Channels are masks (fill/outline), so the texture must not be colour-space converted.
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * Batched floating numbers ("+12", "x2", damage values). Every glyph is one instance of a
 * camera-facing quad, so hundreds of numbers cost a single draw call.
 */
export class FloatingText {
  private readonly entries: FloatingEntry[] = [];
  private readonly capacity: number;
  private readonly centerAttr: InstancedBufferAttribute;
  private readonly glyphAttr: InstancedBufferAttribute;
  private readonly colorAttr: InstancedBufferAttribute;
  private readonly geometry: InstancedBufferGeometry;
  private time = 0;

  constructor(scene: Scene, capacity = 900) {
    this.capacity = capacity;
    const base = new PlaneGeometry(1, 1);
    base.translate(0.5, 0, 0);
    this.geometry = new InstancedBufferGeometry();
    this.geometry.index = base.index;
    this.geometry.setAttribute('position', base.getAttribute('position'));
    this.geometry.setAttribute('uv', base.getAttribute('uv'));
    this.centerAttr = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.glyphAttr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.colorAttr = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    for (const attr of [this.centerAttr, this.glyphAttr, this.colorAttr]) attr.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('aCenter', this.centerAttr);
    this.geometry.setAttribute('aGlyphOffsetScale', this.glyphAttr);
    this.geometry.setAttribute('aColor', this.colorAttr);
    this.geometry.instanceCount = 0;
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uAtlas: { value: buildAtlas() },
        uGlyphCount: { value: GLYPHS.length },
        uAspect: { value: CELL_W / CELL_H },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new Mesh(this.geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    scene.add(mesh);
  }

  /** Adds a floating label. `colorHex` is sRGB. */
  spawn(
    text: string,
    x: number,
    y: number,
    z: number,
    colorHex: number,
    scale = 0.7,
    life = 0.8,
    vy = 2.2,
  ): void {
    if (this.entries.length > this.capacity / 2) this.entries.shift();
    const r = ((colorHex >> 16) & 255) / 255;
    const g = ((colorHex >> 8) & 255) / 255;
    const b = (colorHex & 255) / 255;
    this.entries.push({ text, x, y, z, vy, r, g, b, scale, life, maxLife: life, start: this.time });
  }

  update(dt: number, scrollDz: number): void {
    this.time += dt;
    const centers = this.centerAttr.array as Float32Array;
    const glyphs = this.glyphAttr.array as Float32Array;
    const colors = this.colorAttr.array as Float32Array;
    let instance = 0;
    let write = 0;
    for (const entry of this.entries) {
      entry.life -= dt;
      if (entry.life <= 0) continue;
      this.entries[write++] = entry;
      entry.y += entry.vy * dt;
      entry.vy *= 1 - 2.5 * dt;
      entry.z += scrollDz;
      const age = this.time - entry.start;
      // Pop in with a slight overshoot, then fade out over the last 40 %.
      const pop = age < 0.12 ? 0.4 + (age / 0.12) * 0.85 : 1.25 - Math.min(0.25, (age - 0.12) * 2);
      const t = entry.life / entry.maxLife;
      const alpha = Math.min(1, t / 0.4);
      const scale = entry.scale * pop;
      const width = entry.text.length * ADVANCE;
      for (let i = 0; i < entry.text.length && instance < this.capacity; i++) {
        const glyph = GLYPHS.indexOf(entry.text[i] ?? '');
        if (glyph < 0) continue;
        centers[instance * 3] = entry.x;
        centers[instance * 3 + 1] = entry.y;
        centers[instance * 3 + 2] = entry.z;
        glyphs[instance * 4] = glyph;
        glyphs[instance * 4 + 1] = i * ADVANCE - width / 2;
        glyphs[instance * 4 + 2] = scale;
        glyphs[instance * 4 + 3] = alpha;
        colors[instance * 3] = entry.r;
        colors[instance * 3 + 1] = entry.g;
        colors[instance * 3 + 2] = entry.b;
        instance++;
      }
    }
    this.entries.length = write;
    this.geometry.instanceCount = instance;
    this.centerAttr.needsUpdate = true;
    this.glyphAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  clear(): void {
    this.entries.length = 0;
    this.geometry.instanceCount = 0;
  }
}
