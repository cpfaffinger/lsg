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
  Vector3,
  WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { sharedAnimationUniforms } from '../render/models/animated-material.ts';
import { ENEMY_MODELS } from '../render/models/enemies.ts';
import {
  createSkinnedMaterials,
  instanceGeometry,
  preloadCharacters,
} from '../render/models/skinned-character.ts';
import type { EnemyKind } from '../sim/types.ts';

/**
 * Development-only turntable for the enemy models (open the game with ?viewer).
 * ?viewer=far shows the low-detail variants, &clip=1 the attack clip.
 */
export async function startModelViewer(canvas: HTMLCanvasElement): Promise<void> {
  await preloadCharacters();
  const query = new URLSearchParams(location.search);
  const detail = query.get('viewer') === 'far' ? 0 : 1;
  const clip = Number(query.get('clip') ?? 0);
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

  const entries: { name: string; x: number; size: number }[] = [];
  const kinds: EnemyKind[] = ['runner', 'shooter', 'shield', 'splitter', 'tank', 'miniboss', 'boss'];
  const spacing = [1.4, 1.6, 1.9, 2.2, 3.2, 5, 6.5];
  let x = -8.2;
  kinds.forEach((kind, i) => {
    const size = spacing[i] ?? 2;
    x += size / 2;
    const model = ENEMY_MODELS[kind];
    const params = new InstancedBufferAttribute(new Float32Array([0, clip, 0, 0]), 4);
    const materials = createSkinnedMaterials(model.id);
    const mesh = new InstancedMesh(instanceGeometry(model.id, detail, params), materials.material, 1);
    mesh.customDepthMaterial = materials.depth;
    mesh.setMatrixAt(
      0,
      new Matrix4().makeTranslation(x, model.lift, 0).scale(new Vector3().setScalar(model.scale)),
    );
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    entries.push({ name: kind, x, size });
    x += size / 2;
  });

  const focusName = query.get('focus');
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
