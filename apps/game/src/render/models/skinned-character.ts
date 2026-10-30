import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  type InstancedBufferAttribute,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  RGBADepthPacking,
  RGBAFormat,
  Vector4,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { mediaUrl } from '../../media.ts';
import { sharedAnimationUniforms } from './animated-material.ts';

const CHARACTER_IDS = ['soldier', 'enemy', 'hazmat', 'yeti', 'blob', 'orc', 'demon', 'dragon'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

interface BakedHeader {
  vertices: number;
  triangles: number[];
  bones: number;
  frames: number;
  fps: number;
  clips: Record<string, { start: number; frames: number }>;
  attachments: string[];
  sizes: number[];
}

export interface CharacterAsset {
  header: BakedHeader;
  /** Geometry per level of detail: 0 detailed, 1 distant. Vertex data is shared. */
  geometries: [BufferGeometry, BufferGeometry];
  boneTexture: DataTexture;
}

const assets = new Map<CharacterId, CharacterAsset>();

function srgbToLinear(byte: number): number {
  const c = byte / 255;
  return c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parse(buffer: ArrayBuffer): CharacterAsset {
  const headerLength = new DataView(buffer).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength))) as BakedHeader;
  let offset = 4 + headerLength;
  const take = <T>(make: (start: number, bytes: number) => T, index: number): T => {
    const bytes = header.sizes[index] ?? 0;
    const value = make(offset, bytes);
    offset += bytes + ((4 - (bytes % 4)) % 4);
    return value;
  };
  const positions = take((o, b) => new Float32Array(buffer, o, b / 4), 0);
  const normals = take((o, b) => new Int8Array(buffer, o, b), 1);
  const colorBytes = take((o, b) => new Uint8Array(buffer, o, b), 2);
  const surfaces = take((o, b) => new Uint8Array(buffer, o, b), 3);
  const skins = take((o, b) => new Uint8Array(buffer, o, b), 4);
  const lod0 = take((o, b) => new Uint16Array(buffer, o, b / 2), 5);
  const lod1 = take((o, b) => new Uint16Array(buffer, o, b / 2), 6);
  const bones = take((o, b) => new Float32Array(buffer, o, b / 4), 7);

  // Colours are stored sRGB encoded so dark tones survive eight bits; shading needs them linear.
  const colors = new Float32Array(header.vertices * 3);
  const attach = new Float32Array(header.vertices);
  for (let i = 0; i < header.vertices; i++) {
    colors[i * 3] = srgbToLinear(colorBytes[i * 4] ?? 0);
    colors[i * 3 + 1] = srgbToLinear(colorBytes[i * 4 + 1] ?? 0);
    colors[i * 3 + 2] = srgbToLinear(colorBytes[i * 4 + 2] ?? 0);
    attach[i] = colorBytes[i * 4 + 3] ?? 0;
  }

  const build = (indices: Uint16Array): BufferGeometry => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 4, true));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('aAttach', new BufferAttribute(attach, 1));
    geometry.setAttribute('aSurface', new BufferAttribute(surfaces, 4, true));
    geometry.setAttribute('aSkin', new BufferAttribute(skins, 4));
    geometry.setIndex(new BufferAttribute(indices, 1));
    return geometry;
  };

  const boneTexture = new DataTexture(bones, header.bones * 3, header.frames, RGBAFormat, FloatType);
  boneTexture.minFilter = NearestFilter;
  boneTexture.magFilter = NearestFilter;
  boneTexture.needsUpdate = true;
  return { header, geometries: [build(lod0), build(lod1)], boneTexture };
}

/** Loads all baked characters. Must finish before the scene is created. */
export async function preloadCharacters(): Promise<void> {
  await Promise.all(
    CHARACTER_IDS.map(async (id) => {
      const response = await fetch(mediaUrl(`models/${id}.bin`));
      assets.set(id, parse(await response.arrayBuffer()));
    }),
  );
}

export function character(id: CharacterId): CharacterAsset {
  const asset = assets.get(id);
  if (!asset) throw new Error(`Character ${id} is not loaded`);
  return asset;
}

/** A geometry for one instanced mesh; it shares the vertex data of the character. */
export function instanceGeometry(
  id: CharacterId,
  detail: 0 | 1,
  params: InstancedBufferAttribute,
): BufferGeometry {
  const source = character(id).geometries[detail === 1 ? 0 : 1];
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, attribute);
  }
  geometry.setIndex(source.index);
  geometry.setAttribute('iParams', params);
  return geometry;
}

/**
 * Per-vertex: aSkin = (bone 0, bone 1, weight 0, weight 1), aAttach = weapon id (0 = body).
 * Per-instance: iParams = (time offset, clip 0 or 1, hit flash, recoil).
 * vShade darkens the feet and varies each figure a little, so crowds keep their depth.
 * uAttach selects the visible weapon; other weapons collapse to a point.
 */
const SKINNING_GLSL = /* glsl */ `
attribute vec4 aSkin;
attribute float aAttach;
attribute vec4 aSurface;
attribute vec4 iParams;
uniform sampler2D uBones;
uniform float uTime;
uniform float uAttach;
uniform vec4 uClips[2]; // start frame, frame count, frames per second, unused
varying vec4 vSurface;
varying float vFlash;
varying float vShade;

mat4 lsgBone(float bone, int frame) {
  int b = int(bone + 0.5) * 3;
  vec4 r0 = texelFetch(uBones, ivec2(b, frame), 0);
  vec4 r1 = texelFetch(uBones, ivec2(b + 1, frame), 0);
  vec4 r2 = texelFetch(uBones, ivec2(b + 2, frame), 0);
  return mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
}

mat4 lsgSkinMatrix() {
  vec4 clip = uClips[int(iParams.y + 0.5)];
  float t = (uTime + iParams.x) * clip.z;
  int frame = int(clip.x + mod(t, clip.y));
  float w0 = aSkin.z / 255.0;
  float w1 = aSkin.w / 255.0;
  return lsgBone(aSkin.x, frame) * w0 + lsgBone(aSkin.y, frame) * w1;
}

vec3 lsgPlace(vec3 p) {
  bool hidden = aAttach > 0.5 && abs(aAttach - uAttach) > 0.5;
  if (hidden) return vec3(0.0);
  if (aAttach > 0.5) p.z -= iParams.w * 0.14;
  return p;
}
`;

export interface SkinnedMaterials {
  material: MeshStandardMaterial;
  depth: MeshDepthMaterial;
  teamColor: { value: Color };
  /** Visible weapon (1 based); 0 shows none. */
  attach: { value: number };
}

function clipUniform(asset: CharacterAsset): { value: Vector4[] } {
  const { clips, fps } = asset.header;
  const run = clips.run ?? { start: 0, frames: 1 };
  const hold = clips.hold ?? run;
  return {
    value: [new Vector4(run.start, run.frames, fps, 0), new Vector4(hold.start, hold.frames, fps, 0)],
  };
}

/** Standard material with instanced skeletal animation read from the bone texture. */
export function createSkinnedMaterials(id: CharacterId, teamHex = 0xffffff): SkinnedMaterials {
  const asset = character(id);
  const bones = { value: asset.boneTexture };
  const clips = clipUniform(asset);
  const attach = { value: 1 };
  const teamColor = { value: new Color(teamHex).convertSRGBToLinear() };

  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, {
      uTime: sharedAnimationUniforms.uTime,
      uBones: bones,
      uClips: clips,
      uAttach: attach,
      uTeamColor: teamColor,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SKINNING_GLSL}\nuniform vec3 uTeamColor;`)
      .replace(
        '#include <beginnormal_vertex>',
        `mat4 lsgSkin = lsgSkinMatrix();\nvec3 objectNormal = normalize(mat3(lsgSkin) * normal.xyz);`,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = (lsgSkin * vec4(lsgPlace(position), 1.0)).xyz;
        float lsgHeight = (instanceMatrix * vec4(transformed, 1.0)).y;
        vShade = mix(0.5, 1.0, smoothstep(0.0, 0.85, lsgHeight)) * (0.9 + fract(iParams.x * 7.31) * 0.2);`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, uTeamColor * vColor.rgb, aSurface.w);\nvSurface = aSurface;\nvFlash = iParams.z;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec4 vSurface;\nvarying float vFlash;\nvarying float vShade;',
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vShade;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = max(0.05, vSurface.y);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurface.x;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float lsgRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += diffuseColor.rgb * (vSurface.z * 2.0 + lsgRim * 0.8) + vec3(vFlash);`,
      );
  };
  material.customProgramCacheKey = () => `lsg-skinned-${id}`;

  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, {
      uTime: sharedAnimationUniforms.uTime,
      uBones: bones,
      uClips: clips,
      uAttach: attach,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SKINNING_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = (lsgSkinMatrix() * vec4(lsgPlace(position), 1.0)).xyz;',
      );
  };
  depth.customProgramCacheKey = () => `lsg-skinned-depth-${id}`;

  return { material, depth, teamColor, attach };
}
