import { mediaUrl } from '../media.ts';
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { EnemyKind } from '../sim/types.ts';
import {
  createAnimatedMaterials,
  sharedAnimationUniforms,
  WALK,
  type AnimationProfile,
} from '../render/models/animated-material.ts';
import { buildEnemy, ENEMY_ANIMATION } from '../render/models/enemies.ts';
import { buildSoldier } from '../render/models/soldier.ts';

/**
 * Development-only turntable for the procedural models (open the game with ?viewer).
 * ?viewer=far shows the low-detail variants.
 */
export async function startModelViewer(canvas: HTMLCanvasElement): Promise<void> {
  const detail = new URLSearchParams(location.search).get('viewer') === 'far' ? 0 : 1;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  const scene = new Scene();
  scene.background = new Color(0x1b2233);
  const hdr = await new HDRLoader().loadAsync(mediaUrl('hdri/studio_small_08_1k.hdr'));
  hdr.mapping = EquirectangularReflectionMapping;
  scene.environment = new PMREMGenerator(renderer).fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.8;
  scene.add(new HemisphereLight(0xcfe3ff, 0x3a3020, 0.5));
  const sun = new DirectionalLight(0xffffff, 2.5);
  sun.position.set(-6, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 10, bottom: -6 });
  scene.add(sun);
  const floor = new Mesh(
    new PlaneGeometry(60, 30),
    new MeshStandardMaterial({ color: 0x40485c, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const entries: {
    name: string;
    geometry: BufferGeometry;
    profile: AnimationProfile;
    gait: number;
    x: number;
    size: number;
    team?: number;
  }[] = [
    {
      name: 'soldier',
      geometry: buildSoldier(detail),
      profile: WALK,
      gait: 11,
      x: -11,
      size: 1,
      team: 0x2f8cff,
    },
    {
      name: 'soldier2',
      geometry: buildSoldier(detail),
      profile: WALK,
      gait: 11,
      x: -9.8,
      size: 1,
      team: 0xc0303e,
    },
  ];
  const kinds: EnemyKind[] = ['runner', 'shooter', 'shield', 'splitter', 'tank', 'miniboss', 'boss'];
  const spacing = [1.4, 1.6, 1.9, 2.2, 3.2, 5, 6.5];
  let x = -8.2;
  kinds.forEach((kind, i) => {
    x += (spacing[i] ?? 2) / 2;
    entries.push({
      name: kind,
      geometry: buildEnemy(kind, detail),
      profile: ENEMY_ANIMATION[kind].profile,
      gait: ENEMY_ANIMATION[kind].gait,
      x,
      size: spacing[i] ?? 2,
    });
    x += (spacing[i] ?? 2) / 2;
  });
  for (const entry of entries) {
    const materials = createAnimatedMaterials(entry.profile, entry.team ?? 0xffffff);
    entry.geometry.setAttribute(
      'iParams',
      new InstancedBufferAttribute(new Float32Array([0, entry.gait, 0, 0]), 4),
    );
    const mesh = new InstancedMesh(entry.geometry, materials.material, 1);
    mesh.customDepthMaterial = materials.depth;
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(entry.x, 0, 0));
    mesh.castShadow = true;
    scene.add(mesh);
  }

  const focusName = new URLSearchParams(location.search).get('focus');
  const focus = entries.find((e) => e.name === focusName) ?? null;
  const camera = new PerspectiveCamera(35, 1, 0.1, 200);
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);
  let angle = 0.35;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    sharedAnimationUniforms.uTime.value += dt;
    angle += dt * 0.15;
    if (focus) {
      const d = focus.size * 1.8 + 1.5;
      camera.position.set(focus.x + Math.sin(angle * 3) * d, focus.size * 0.6 + 0.6, Math.cos(angle * 3) * d);
      camera.lookAt(focus.x, focus.size * 0.45, 0);
    } else {
      camera.position.set(4 + Math.sin(angle) * 8, 6, 24 + Math.cos(angle) * 3);
      camera.lookAt(4, 2, 0);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
