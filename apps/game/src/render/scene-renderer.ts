import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { QualitySettings } from '../core/quality.ts';
import { LANE_HALF_WIDTH, LANE_WIDTH } from '../sim/world.ts';
import { CameraRig } from './camera-rig.ts';

/** Owns the WebGL renderer, the scene graph and the camera. */
export class SceneRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly rig = new CameraRig();
  private readonly sun: DirectionalLight;
  private quality: QualitySettings;
  private readonly canvas: HTMLCanvasElement;
  /** Placeholder squad marker for M0. */
  readonly placeholder: Mesh;

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
    this.scene.fog = new Fog(sky, 60, 140);

    const hemi = new HemisphereLight(0xbcd4ff, 0x2a2238, 1.1);
    this.scene.add(hemi);

    this.sun = new DirectionalLight(0xfff1dd, 2.4);
    this.sun.position.set(-8, 20, 10);
    this.sun.target.position.set(0, 0, -10);
    this.scene.add(this.sun, this.sun.target);

    this.buildLane();

    this.placeholder = new Mesh(
      new BoxGeometry(1.4, 1.4, 1.4),
      new MeshStandardMaterial({ color: 0x3fa9ff, roughness: 0.4, metalness: 0.2 }),
    );
    this.placeholder.position.set(0, 0.7, 0);
    this.placeholder.castShadow = true;
    this.scene.add(this.placeholder);

    this.applyQuality(quality);
  }

  private buildLane(): void {
    const ground = new Mesh(
      new PlaneGeometry(LANE_WIDTH, 300),
      new MeshStandardMaterial({ color: 0x2b3245, roughness: 0.85, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -120;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const surroundings = new Mesh(
      new PlaneGeometry(200, 300),
      new MeshStandardMaterial({ color: 0x151a28, roughness: 1 }),
    );
    surroundings.rotation.x = -Math.PI / 2;
    surroundings.position.set(0, -0.05, -120);
    this.scene.add(surroundings);

    const edgeMaterial = new MeshStandardMaterial({
      color: 0x6ad1ff,
      emissive: 0x2a8cff,
      emissiveIntensity: 1.4,
    });
    for (const side of [-1, 1]) {
      const edge = new Mesh(new BoxGeometry(0.25, 0.3, 300), edgeMaterial);
      edge.position.set(side * (LANE_HALF_WIDTH + 0.125), 0.15, -120);
      this.scene.add(edge);
    }
  }

  applyQuality(quality: QualitySettings): void {
    this.quality = quality;
    const ratio = Math.min(window.devicePixelRatio * quality.resolutionScale, quality.maxPixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = quality.shadows;
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    const cam = this.sun.shadow.camera;
    cam.left = -14;
    cam.right = 14;
    cam.top = 30;
    cam.bottom = -30;
    cam.near = 1;
    cam.far = 80;
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

  render(frameDt: number): void {
    this.rig.update(frameDt, true);
    this.renderer.render(this.scene, this.rig.camera);
  }

  get currentQuality(): QualitySettings {
    return this.quality;
  }
}
