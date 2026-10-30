import {
  ACESFilmicToneMapping,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { QualitySettings } from '../core/quality.ts';
import { LANE_HALF_WIDTH, LANE_WIDTH } from '../sim/world.ts';
import { CameraRig } from './camera-rig.ts';

const LANE_LENGTH = 320;
const LANE_CENTER_Z = -LANE_LENGTH / 2 + 30;
/** World units covered by one repetition of the lane texture. */
const LANE_TILE = 8;

/** Owns the WebGL renderer, the static scene (lane, lights) and the camera. */
export class SceneRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly rig = new CameraRig();
  private readonly sun: DirectionalLight;
  private quality: QualitySettings;
  private readonly canvas: HTMLCanvasElement;
  private laneTexture: CanvasTexture | null = null;
  private readonly tmp = new Vector3();

  constructor(canvas: HTMLCanvasElement, quality: QualitySettings) {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    const sky = new Color(0x0b1020);
    this.scene.background = sky;
    this.scene.fog = new Fog(sky, 70, 170);

    const hemi = new HemisphereLight(0xbcd4ff, 0x2a2238, 1.2);
    this.scene.add(hemi);

    this.sun = new DirectionalLight(0xfff1dd, 2.4);
    this.sun.position.set(-8, 22, 12);
    this.sun.target.position.set(0, 0, -8);
    this.scene.add(this.sun, this.sun.target);

    this.buildLane();
    this.applyQuality(quality);
  }

  private createLaneTexture(): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#2b3245';
      ctx.fillRect(0, 0, 256, 256);
      // Subtle tiles and a centre dash give a sense of speed while scrolling.
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, 256, 256);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(122, 40, 12, 120);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(1, LANE_LENGTH / LANE_TILE);
    texture.anisotropy = 8;
    return texture;
  }

  private buildLane(): void {
    this.laneTexture = this.createLaneTexture();
    const ground = new Mesh(
      new PlaneGeometry(LANE_WIDTH, LANE_LENGTH),
      new MeshStandardMaterial({ map: this.laneTexture, roughness: 0.85, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = LANE_CENTER_Z;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const surroundings = new Mesh(
      new PlaneGeometry(220, LANE_LENGTH),
      new MeshStandardMaterial({ color: 0x151a28, roughness: 1 }),
    );
    surroundings.rotation.x = -Math.PI / 2;
    surroundings.position.set(0, -0.05, LANE_CENTER_Z);
    this.scene.add(surroundings);

    const edgeMaterial = new MeshStandardMaterial({
      color: 0x6ad1ff,
      emissive: 0x2a8cff,
      emissiveIntensity: 1.4,
    });
    for (const side of [-1, 1]) {
      const edge = new Mesh(new BoxGeometry(0.25, 0.3, LANE_LENGTH), edgeMaterial);
      edge.position.set(side * (LANE_HALF_WIDTH + 0.125), 0.15, LANE_CENTER_Z);
      this.scene.add(edge);
    }
  }

  /** Scrolls the lane texture to match the distance travelled. */
  setScroll(distance: number): void {
    if (this.laneTexture) this.laneTexture.offset.y = (distance / LANE_TILE) % 1;
  }

  applyQuality(quality: QualitySettings): void {
    this.quality = quality;
    const ratio = Math.min(window.devicePixelRatio * quality.resolutionScale, quality.maxPixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = quality.shadows;
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    const cam = this.sun.shadow.camera;
    cam.left = -14;
    cam.right = 14;
    cam.top = 40;
    cam.bottom = -20;
    cam.near = 1;
    cam.far = 90;
    cam.updateProjectionMatrix();
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.rig.resize(width, height);
  }

  /** World units per CSS pixel horizontally at the squad's depth (for 1:1 dragging). */
  worldPerPixel(): number {
    const camera = this.rig.camera;
    const distance = camera.position.distanceTo(this.tmp.set(camera.position.x, 0, 0));
    const hFov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const visibleWidth = 2 * distance * Math.tan(hFov / 2);
    return visibleWidth / Math.max(1, this.canvas.clientWidth || window.innerWidth);
  }

  /** Projects a world position to CSS pixel coordinates of the canvas. */
  project(x: number, y: number, z: number, out: { x: number; y: number; visible: boolean }): void {
    this.tmp.set(x, y, z).project(this.rig.camera);
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    out.x = (this.tmp.x * 0.5 + 0.5) * width;
    out.y = (-this.tmp.y * 0.5 + 0.5) * height;
    out.visible = this.tmp.z < 1 && this.tmp.z > -1;
  }

  render(frameDt: number, shake: boolean): void {
    this.rig.update(frameDt, shake);
    this.renderer.render(this.scene, this.rig.camera);
  }

  get currentQuality(): QualitySettings {
    return this.quality;
  }
}
