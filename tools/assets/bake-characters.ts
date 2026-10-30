/**
 * Bakes animated glTF characters into compact files for GPU instancing.
 *
 * Every character becomes one binary file with merged, simplified geometry and a bone matrix
 * texture holding its animation clips, so hundreds of soldiers can share one draw call.
 *
 *   node tools/assets/bake-characters.ts
 *
 * Reads assets-src/downloads/models/, writes apps/game/src/media/models/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import type { Bone, BufferAttribute, Material, MeshStandardMaterial, Object3D } from 'three';
import { AnimationMixer, Color, Matrix4, Mesh, SkinnedMesh, Vector3, type BufferGeometry } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface CharacterConfig {
  id: string;
  clips: Record<string, string>;
  /** Weapon node names, in the order the game selects them (1, 2, ...). */
  attachments: string[];
  /** Materials recoloured by the squad skin, with the brightness of the result. */
  team: Record<string, number>;
  /** Materials of rigid body parts (helmet) recoloured by the squad skin. */
  teamRigid: Record<string, number>;
  /** Share of triangles kept for the detailed and the distant model. */
  lods: [number, number];
}

const CHARACTERS: CharacterConfig[] = [
  {
    id: 'soldier',
    clips: { run: 'Run_Gun', hold: 'Idle_Shoot' },
    attachments: ['AK', 'Shotgun', 'Sniper_2', 'RocketLauncher'],
    team: { Character_Main: 0.85, Pants: 0.28 },
    teamRigid: { Black: 0.6, Character_Main: 0.85 },
    lods: [0.34, 0.1],
  },
  {
    id: 'enemy',
    clips: { run: 'Run', hold: 'Punch' },
    attachments: ['Knife_1'],
    team: {},
    teamRigid: {},
    lods: [0.4, 0.12],
  },
  {
    id: 'hazmat',
    clips: { run: 'Run_Gun', hold: 'Idle_Shoot' },
    attachments: ['SMG'],
    team: {},
    teamRigid: {},
    lods: [0.4, 0.12],
  },
  {
    id: 'yeti',
    clips: { run: 'Walk', hold: 'Punch' },
    attachments: [],
    team: {},
    teamRigid: {},
    lods: [0.4, 0.14],
  },
  {
    id: 'blob',
    clips: { run: 'Walk', hold: 'Bite_Front' },
    attachments: [],
    team: {},
    teamRigid: {},
    lods: [0.5, 0.18],
  },
  {
    id: 'orc',
    clips: { run: 'Walk', hold: 'Punch' },
    attachments: [],
    team: {},
    teamRigid: {},
    lods: [0.34, 0.12],
  },
  {
    id: 'demon',
    clips: { run: 'Walk', hold: 'Punch' },
    attachments: [],
    team: {},
    teamRigid: {},
    lods: [0.6, 0.2],
  },
  {
    id: 'dragon',
    clips: { run: 'Fast_Flying', hold: 'Flying_Idle' },
    attachments: [],
    team: {},
    teamRigid: {},
    lods: [0.7, 0.2],
  },
];

const SOURCE = path.resolve('assets-src/downloads/models');
const OUT = path.resolve('apps/game/src/media/models');
const FPS = 60;
/** Fingers and IK helpers are invisible at game scale; their weight moves to the parent bone. */
const DROPPED_BONES = /pinky|middle|index|thumb|fist|poletarget/i;
const MIN_TRIANGLES = 4;

interface Vertex {
  position: Vector3;
  normal: Vector3;
  color: Color;
  attach: number;
  surface: [number, number, number, number];
  bones: [number, number];
  weights: [number, number];
}

interface Part {
  vertices: Vertex[];
  indices: number[];
}

function surfaceOf(material: MeshStandardMaterial): [number, number, number] {
  const name = material.name.toLowerCase();
  if (name.startsWith('grey') || name.startsWith('lightgrey')) return [0.65, 0.42, 0];
  if (name.startsWith('darkgrey')) return [0.55, 0.5, 0];
  if (name.startsWith('metal') || name.startsWith('gold')) return [0.7, 0.38, 0];
  if (name.startsWith('wood') || name.startsWith('darkwood')) return [0, 0.75, 0];
  if (name.startsWith('red')) return [0.1, 0.4, 0.25];
  if (name.startsWith('skin')) return [0, 0.6, 0];
  return [0, 0.72, 0];
}

function ancestors(object: Object3D): Object3D[] {
  const chain: Object3D[] = [];
  for (let o = object.parent; o; o = o.parent) chain.push(o);
  return chain;
}

function sRgbByte(value: number): number {
  const c = Math.max(0, Math.min(1, value));
  const encoded = c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

async function bake(config: CharacterConfig): Promise<void> {
  const file = fs.readFileSync(path.join(SOURCE, `${config.id}.glb`));
  const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const gltf = await new GLTFLoader().parseAsync(data, '');
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const skinned: SkinnedMesh[] = [];
  const rigid: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof SkinnedMesh) skinned.push(object);
    else if (object instanceof Mesh) rigid.push(object);
  });
  const skeleton = skinned[0]?.skeleton;
  if (!skeleton) throw new Error(`${config.id}: no skeleton`);

  // Bones that survive, and where the dropped ones send their weight.
  const kept = skeleton.bones.filter((bone) => !DROPPED_BONES.test(bone.name));
  const keptIndex = new Map(kept.map((bone, index) => [bone, index]));
  const boneTarget = (object: Object3D): number => {
    for (const candidate of [object, ...ancestors(object)]) {
      const index = keptIndex.get(candidate as Bone);
      if (index !== undefined) return index;
    }
    return 0;
  };

  const parts: Part[] = [];
  const addPart = (mesh: Mesh, attach: number, rigidBone: number | null): void => {
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material;
    const standard = material as MeshStandardMaterial;
    const brightness = (attach === 0 && rigidBone !== null ? config.teamRigid : config.team)[standard.name];
    const team = brightness === undefined ? 0 : 1;
    const surface = surfaceOf(standard);
    const geometry: BufferGeometry = mergeVertices(mesh.geometry.clone(), 1e-4);
    const position = geometry.getAttribute('position') as BufferAttribute;
    const normal = geometry.getAttribute('normal') as BufferAttribute;
    const color = geometry.getAttribute('color') as BufferAttribute | undefined;
    const skinIndex = geometry.getAttribute('skinIndex') as BufferAttribute | undefined;
    const skinWeight = geometry.getAttribute('skinWeight') as BufferAttribute | undefined;
    // Rigid parts follow one bone. The baked matrices expect bind-pose positions, while the
    // scene shows a default pose that can differ, so go through the space of that bone.
    let transform = mesh.matrixWorld;
    if (mesh instanceof SkinnedMesh) {
      transform = mesh.bindMatrix;
    } else if (rigidBone !== null) {
      const bone = kept[rigidBone] as Bone;
      const inverse = skeleton.boneInverses[skeleton.bones.indexOf(bone)] as Matrix4;
      transform = new Matrix4()
        .copy(inverse)
        .invert()
        .multiply(new Matrix4().copy(bone.matrixWorld).invert())
        .multiply(mesh.matrixWorld);
    }
    const normalMatrix = new Matrix4().copy(transform);
    const vertices: Vertex[] = [];
    for (let i = 0; i < position.count; i++) {
      const c = standard.color.clone();
      if (brightness !== undefined) c.setRGB(brightness, brightness, brightness);
      else if (color) c.multiply(new Color(color.getX(i), color.getY(i), color.getZ(i)));
      let bones: [number, number] = [rigidBone ?? 0, 0];
      let weights: [number, number] = [1, 0];
      if (rigidBone === null && skinIndex && skinWeight) {
        const totals = new Map<number, number>();
        for (let k = 0; k < 4; k++) {
          const weight = skinWeight.getComponent(i, k);
          if (weight <= 0) continue;
          const bone = skeleton.bones[skinIndex.getComponent(i, k)];
          if (!bone) continue;
          const target = boneTarget(bone);
          totals.set(target, (totals.get(target) ?? 0) + weight);
        }
        const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
        const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
        bones = [top[0]?.[0] ?? 0, top[1]?.[0] ?? top[0]?.[0] ?? 0];
        weights = [(top[0]?.[1] ?? sum) / sum, (top[1]?.[1] ?? 0) / sum];
      }
      vertices.push({
        position: new Vector3().fromBufferAttribute(position, i).applyMatrix4(transform),
        normal: new Vector3().fromBufferAttribute(normal, i).transformDirection(normalMatrix),
        color: c,
        attach,
        surface: [...surface, team],
        bones,
        weights,
      });
    }
    const indices = geometry.index ? Array.from(geometry.index.array) : vertices.map((_, i) => i);
    // A mirrored transform turns triangles inside out; flip them back so they are not culled.
    if (transform.determinant() < 0) {
      for (let i = 0; i + 2 < indices.length; i += 3) {
        const first = indices[i] as number;
        indices[i] = indices[i + 2] as number;
        indices[i + 2] = first;
      }
    }
    parts.push({ vertices, indices });
  };

  for (const mesh of skinned) addPart(mesh, 0, null);
  const weaponNames = new Set(['Revolver', 'Sniper', 'Revolver_Small', 'Pistol', 'SMG', 'GrenadeLauncher']);
  for (const name of [
    'ShortCannon',
    'Shotgun',
    'Sniper_2',
    'RocketLauncher',
    'AK',
    'Shovel',
    'Knife_1',
    'Knife_2',
  ])
    weaponNames.add(name);
  for (const mesh of rigid) {
    const owner = [mesh, ...ancestors(mesh)].find((o) => weaponNames.has(o.name));
    if (owner) {
      const attach = config.attachments.indexOf(owner.name) + 1;
      if (attach > 0) addPart(mesh, attach, boneTarget(owner));
    } else {
      addPart(mesh, 0, boneTarget(mesh));
    }
  }

  // Simplify part by part so material borders stay crisp, then share one vertex buffer.
  await MeshoptSimplifier.ready;
  const vertices: Vertex[] = [];
  const lodIndices: number[][] = [[], []];
  for (const part of parts) {
    const offset = vertices.length;
    vertices.push(...part.vertices);
    const positions = new Float32Array(part.vertices.flatMap((v) => v.position.toArray()));
    const source = new Uint32Array(part.indices);
    config.lods.forEach((ratio, lod) => {
      const target = Math.max(MIN_TRIANGLES * 3, Math.floor((source.length * ratio) / 3) * 3);
      // Distant models may lose small parts completely; nobody sees them at that size.
      const options = lod === 0 ? (['LockBorder'] as const) : ([] as const);
      const [result] = MeshoptSimplifier.simplify(source, positions, 3, target, lod === 0 ? 0.05 : 0.2, [
        ...options,
      ]);
      for (const index of result) lodIndices[lod]?.push(index + offset);
    });
  }
  const used = new Map<number, number>();
  const compact: Vertex[] = [];
  const remap = (index: number): number => {
    let mapped = used.get(index);
    if (mapped === undefined) {
      mapped = compact.length;
      used.set(index, mapped);
      compact.push(vertices[index] as Vertex);
    }
    return mapped;
  };
  const lods = lodIndices.map((indices) => Uint16Array.from(indices, remap));

  // Animation clips as one texture: three texels (a 3x4 matrix) per bone, one row per frame.
  const mixer = new AnimationMixer(root);
  const clips: Record<string, { start: number; frames: number }> = {};
  const matrices: number[] = [];
  let frameCount = 0;
  const boneMatrix = new Matrix4();
  for (const [key, clipName] of Object.entries(config.clips)) {
    const clip = gltf.animations.find((c) => c.name === clipName || c.name.endsWith(`|${clipName}`));
    if (!clip) throw new Error(`${config.id}: clip ${clipName} not found`);
    const action = mixer.clipAction(clip);
    action.play();
    const frames = Math.max(2, Math.round(clip.duration * FPS));
    clips[key] = { start: frameCount, frames };
    for (let frame = 0; frame < frames; frame++) {
      mixer.setTime((frame / frames) * clip.duration);
      root.updateMatrixWorld(true);
      for (const bone of kept) {
        const inverse = skeleton.boneInverses[skeleton.bones.indexOf(bone)] as Matrix4;
        boneMatrix.multiplyMatrices(bone.matrixWorld, inverse);
        const e = boneMatrix.elements;
        matrices.push(e[0]!, e[4]!, e[8]!, e[12]!, e[1]!, e[5]!, e[9]!, e[13]!, e[2]!, e[6]!, e[10]!, e[14]!);
      }
    }
    frameCount += frames;
    action.stop();
    mixer.uncacheAction(clip);
  }

  const count = compact.length;
  const positions = new Float32Array(count * 3);
  const normals = new Int8Array(count * 4);
  const colors = new Uint8Array(count * 4);
  const surfaces = new Uint8Array(count * 4);
  const skins = new Uint8Array(count * 4);
  compact.forEach((v, i) => {
    v.position.toArray(positions, i * 3);
    normals.set([v.normal.x * 127, v.normal.y * 127, v.normal.z * 127, 0], i * 4);
    colors.set([sRgbByte(v.color.r), sRgbByte(v.color.g), sRgbByte(v.color.b), v.attach], i * 4);
    surfaces.set(
      v.surface.map((s) => Math.round(s * 255)),
      i * 4,
    );
    skins.set(
      [v.bones[0], v.bones[1], Math.round(v.weights[0] * 255), Math.round(v.weights[1] * 255)],
      i * 4,
    );
  });
  const bones = new Float32Array(matrices);

  const chunks = [positions, normals, colors, surfaces, skins, lods[0]!, lods[1]!, bones];
  const header = {
    vertices: count,
    triangles: lods.map((l) => l.length / 3),
    bones: kept.length,
    frames: frameCount,
    fps: FPS,
    clips,
    attachments: config.attachments,
    sizes: chunks.map((c) => c.byteLength),
  };
  const headerBytes = Buffer.from(JSON.stringify(header));
  const pad = (4 - ((headerBytes.length + 4) % 4)) % 4;
  const output: Buffer[] = [Buffer.alloc(4), headerBytes, Buffer.alloc(pad, 0x20)];
  output[0]!.writeUInt32LE(headerBytes.length + pad);
  for (const chunk of chunks) {
    const bytes = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    output.push(bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4));
  }
  const target = path.join(OUT, `${config.id}.bin`);
  fs.writeFileSync(target, Buffer.concat(output));
  const size = Math.round(fs.statSync(target).size / 1024);
  // Heights in the first frame: bind-pose positions are in armature units, not world units.
  const heights = compact.map((v) =>
    [0, 1].reduce((y, slot) => {
      const row = v.bones[slot as 0 | 1] * 12 + 4;
      const m = matrices.slice(row, row + 4) as [number, number, number, number];
      const posed = m[0] * v.position.x + m[1] * v.position.y + m[2] * v.position.z + m[3];
      return y + posed * v.weights[slot as 0 | 1];
    }, 0),
  );
  const low = heights.reduce((a, b) => Math.min(a, b), Infinity);
  const high = heights.reduce((a, b) => Math.max(a, b), -Infinity);
  console.info(
    `${config.id}: ${size} KB, ${header.vertices} vertices, ${header.triangles.join('/')} triangles, ` +
      `${header.bones} bones, ${header.frames} frames, y ${low.toFixed(2)}..${high.toFixed(2)}, ` +
      `weapon bones ${config.attachments.length}`,
  );
}

fs.mkdirSync(OUT, { recursive: true });
for (const config of CHARACTERS) await bake(config);
