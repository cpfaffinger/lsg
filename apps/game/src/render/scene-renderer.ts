import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type DataTexture,
  type Texture,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { QualitySettings } from '../core/quality.ts';
import type { WorldId } from '../sim/level.ts';
import { LANE_HALF_WIDTH, LANE_WIDTH } from '../sim/world.ts';
import { CameraRig } from './camera-rig.ts';
import { PostFX } from './post-fx.ts';
import { Scenery } from './environment/scenery.ts';
import { Sky } from './environment/sky.ts';
import { THEMES, type WorldTheme } from './environment/themes.ts';

const LANE_LENGTH = 320;
const LANE_CENTER_Z = -LANE_LENGTH / 2 + 30;

/** Owns the WebGL renderer, the static world (sky, lane, scenery, lights) and the camera. */
export class SceneRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly rig = new CameraRig();
  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly sky = new Sky();
  readonly postFx: PostFX;
  private readonly scenery: Scenery;
  private readonly laneMaterial: MeshStandardMaterial;
  private readonly groundMaterial: MeshStandardMaterial;
  private readonly edgeMaterial: MeshStandardMaterial;
  private readonly pmrem: PMREMGenerator;
  private readonly textureLoader = new TextureLoader();
  private readonly hdrLoader = new HDRLoader();
  private readonly textures = new Map<string, Promise<Texture>>();
  private readonly environments = new Map<string, Promise<Texture>>();
  private quality: QualitySettings;
  private readonly canvas: HTMLCanvasElement;
  private readonly tmp = new Vector3();
  private theme: WorldTheme = THEMES.desert;
  private laneTileSize = 7;
  /** Called after a world's assets finished loading (for loading indicators). */
  onWorldReady: ((world: WorldId) => void) | null = null;

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
    this.renderer.shadowMap.type = PCFShadowMap;
    this.pmrem = new PMREMGenerator(this.renderer);
    this.postFx = new PostFX(this.renderer, this.scene, this.rig.camera);

    this.scene.fog = new Fog(0x000000, 60, 200);
    this.scene.add(this.sky.mesh);

    this.hemi = new HemisphereLight(0xffffff, 0x444444, 0.6);
    this.scene.add(this.hemi);
    this.sun = new DirectionalLight(0xffffff, 2.5);
    this.scene.add(this.sun, this.sun.target);

    this.laneMaterial = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    this.groundMaterial = new MeshStandardMaterial({ color: 0x777777, roughness: 1 });
    this.edgeMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2,
    });
    this.buildLane();
    this.scenery = new Scenery(this.scene);
    this.applyQuality(quality);
    this.setWorld('desert');
  }

  private buildLane(): void {
    const lane = new Mesh(new PlaneGeometry(LANE_WIDTH, LANE_LENGTH), this.laneMaterial);
    lane.rotation.x = -Math.PI / 2;
    lane.position.z = LANE_CENTER_Z;
    lane.receiveShadow = true;
    this.scene.add(lane);

    const ground = new Mesh(new PlaneGeometry(400, LANE_LENGTH + 200), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.04, LANE_CENTER_Z - 60);
    ground.receiveShadow = true;
    this.scene.add(ground);

    for (const side of [-1, 1]) {
      const curb = new Mesh(
        new BoxGeometry(0.5, 0.22, LANE_LENGTH),
        new MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.6, metalness: 0.4 }),
      );
      curb.position.set(side * (LANE_HALF_WIDTH + 0.25), 0.11, LANE_CENTER_Z);
      curb.receiveShadow = true;
      this.scene.add(curb);
      const glow = new Mesh(new BoxGeometry(0.12, 0.06, LANE_LENGTH), this.edgeMaterial);
      glow.position.set(side * (LANE_HALF_WIDTH + 0.06), 0.24, LANE_CENTER_Z);
      this.scene.add(glow);
    }
  }

  private loadTexture(url: string, srgb: boolean): Promise<Texture> {
    let promise = this.textures.get(url);
    if (!promise) {
      promise = this.textureLoader.loadAsync(url).then((texture) => {
        texture.wrapS = texture.wrapT = RepeatWrapping;
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        if (srgb) texture.colorSpace = SRGBColorSpace;
        return texture;
      });
      this.textures.set(url, promise);
    }
    return promise;
  }

  private loadEnvironment(url: string): Promise<Texture> {
    let promise = this.environments.get(url);
    if (!promise) {
      promise = this.hdrLoader.loadAsync(url).then((hdr: DataTexture) => {
        hdr.mapping = EquirectangularReflectionMapping;
        const env = this.pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        return env;
      });
      this.environments.set(url, promise);
    }
    return promise;
  }

  get world(): WorldId {
    return this.theme.id;
  }

  /** Switches the visual theme. Assets load in the background; colours apply immediately. */
  setWorld(world: WorldId): void {
    const theme = THEMES[world];
    this.theme = theme;
    this.sky.apply(theme);
    const fog = this.scene.fog as Fog;
    fog.color.setHex(theme.fog.color);
    fog.near = theme.fog.near;
    fog.far = theme.fog.far;
    this.sun.color.setHex(theme.sun.color);
    this.sun.intensity = theme.sun.intensity;
    this.sun.position.set(...theme.sun.direction).multiplyScalar(40);
    this.sun.target.position.set(0, 0, -12);
    this.sun.position.add(this.sun.target.position);
    this.hemi.color.setHex(theme.hemisphere.sky);
    this.hemi.groundColor.setHex(theme.hemisphere.ground);
    this.hemi.intensity = theme.hemisphere.intensity;
    this.renderer.toneMappingExposure = theme.exposure;
    this.postFx.applyGrading(theme.grading);
    this.groundMaterial.color.setHex(theme.ground.color);
    this.groundMaterial.roughness = theme.ground.roughness;
    this.edgeMaterial.color.setHex(theme.edge.color);
    this.edgeMaterial.emissive.setHex(theme.edge.color);
    this.edgeMaterial.emissiveIntensity = theme.edge.glow;
    this.laneMaterial.color.set(new Color(theme.lane.tint));
    this.laneMaterial.roughness = theme.lane.roughness;
    this.laneMaterial.metalness = theme.lane.metalness;
    this.laneTileSize = theme.lane.tileSize;
    this.scenery.setWorld(world);

    const textures = Promise.all([
      this.loadTexture(theme.lane.diffuse, true),
      this.loadTexture(theme.lane.normal, false),
    ]).then(([diffuse, normal]) => {
      if (this.theme !== theme) return;
      for (const t of [diffuse, normal])
        t.repeat.set(LANE_WIDTH / theme.lane.tileSize, LANE_LENGTH / theme.lane.tileSize);
      this.laneMaterial.map = diffuse;
      this.laneMaterial.normalMap = normal;
      this.laneMaterial.normalScale = new Vector2(theme.lane.normalScale, theme.lane.normalScale);
      this.laneMaterial.needsUpdate = true;
    });
    const environment = this.loadEnvironment(theme.environment.hdri).then((env) => {
      if (this.theme !== theme) return;
      this.scene.environment = env;
      this.scene.environmentIntensity = theme.environment.intensity;
    });
    Promise.all([textures, environment])
      .then(() => this.onWorldReady?.(world))
      .catch((error: unknown) => console.warn('World assets failed to load', error));
  }

  /** Scrolls lane texture and scenery to match the distance travelled. */
  setScroll(distance: number): void {
    const offset = (distance / this.laneTileSize) % 1;
    if (this.laneMaterial.map) this.laneMaterial.map.offset.y = offset;
    if (this.laneMaterial.normalMap) this.laneMaterial.normalMap.offset.y = offset;
    this.scenery.update(distance);
  }

  applyQuality(quality: QualitySettings): void {
    this.quality = quality;
    const ratio = Math.min(window.devicePixelRatio * quality.resolutionScale, quality.maxPixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = quality.shadows;
    this.sun.castShadow = quality.shadows;
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const cam = this.sun.shadow.camera;
    cam.left = -16;
    cam.right = 16;
    cam.top = 36;
    cam.bottom = -24;
    cam.near = 1;
    cam.far = 120;
    cam.updateProjectionMatrix();
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.postFx.applyQuality(quality);
    this.postFx.applyGrading(this.theme.grading);
    this.resize();
  }

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.postFx?.setSize(width, height);
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
    this.sky.update(this.rig.camera.position, frameDt);
    this.postFx.render(frameDt);
  }

  get currentQuality(): QualitySettings {
    return this.quality;
  }
}
