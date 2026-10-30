import {
  Color,
  MeshDepthMaterial,
  MeshStandardMaterial,
  RGBADepthPacking,
  Vector4,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/**
 * Shared GLSL for procedural, per-instance character animation.
 * Per-vertex: aPart (part id), aPivot (rotation pivot), aSurface (metalness, roughness, emissive, team).
 * Per-instance: iParams = (phase, gait speed, hit flash, recoil).
 */
const ANIMATION_GLSL = /* glsl */ `
attribute float aPart;
attribute vec3 aPivot;
attribute vec4 aSurface;
attribute vec4 iParams;
uniform float uTime;
uniform vec4 uAnim; // x: leg swing, y: body bob, z: arm swing, w: wobble
varying vec4 vSurface;
varying float vFlash;
varying float vCorePulse;

mat3 lsgRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 lsgRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 lsgRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

void lsgAnimate(inout vec3 p, inout vec3 n) {
  float t = uTime * iParams.y + iParams.x;
  float swing = sin(t);
  int part = int(aPart + 0.5);
  float bob = abs(sin(t)) * uAnim.y;
  mat3 r = mat3(1.0);
  if (part == 1) r = lsgRotX(swing * uAnim.x);
  else if (part == 2) r = lsgRotX(-swing * uAnim.x);
  else if (part == 3) r = lsgRotX(-swing * uAnim.z);
  else if (part == 4) r = lsgRotX(swing * uAnim.z);
  else if (part == 5) r = lsgRotY(sin(t * 0.37) * 0.25) * lsgRotX(sin(t * 0.5) * 0.05);
  else if (part == 6) r = lsgRotX(-iParams.w * 0.25);
  else if (part == 7) r = lsgRotY(uTime * 0.9 + iParams.x);
  if (part != 0 || bob > 0.0) {
    p = r * (p - aPivot) + aPivot;
    n = r * n;
  }
  if (part == 6) p.z += iParams.w * 0.12;
  if (part == 8) {
    float w = 1.0 + sin(uTime * 5.0 + iParams.x + p.y * 4.0) * uAnim.w;
    p = (p - aPivot) * vec3(w, 2.0 - w, w) + aPivot;
  }
  if (part != 1 && part != 2) p.y += bob;
}
`;

export interface AnimationProfile {
  legSwing: number;
  bob: number;
  armSwing: number;
  wobble: number;
}

export const STILL: AnimationProfile = { legSwing: 0, bob: 0, armSwing: 0, wobble: 0.08 };

/** Uniforms shared by all materials, updated once per frame. */
export const sharedAnimationUniforms = { uTime: { value: 0 } };

export interface AnimatedMaterials {
  material: MeshStandardMaterial;
  depth: MeshDepthMaterial;
  teamColor: { value: Color };
  emissiveBoost: { value: number };
}

/**
 * MeshStandardMaterial patched for vertex-coloured, procedurally animated instanced models.
 * Returns a matching depth material so shadows animate too.
 */
export function createAnimatedMaterials(profile: AnimationProfile, teamHex = 0xffffff): AnimatedMaterials {
  const anim = { value: new Vector4(profile.legSwing, profile.bob, profile.armSwing, profile.wobble) };
  const teamColor = { value: new Color(teamHex).convertSRGBToLinear() };
  const emissiveBoost = { value: 2.2 };

  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = sharedAnimationUniforms.uTime;
    shader.uniforms.uAnim = anim;
    shader.uniforms.uTeamColor = teamColor;
    shader.uniforms.uEmissiveBoost = emissiveBoost;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ANIMATION_GLSL}\nuniform vec3 uTeamColor;`)
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = vec3(normal);\nvec3 lsgPosition = vec3(position);\nlsgAnimate(lsgPosition, objectNormal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = lsgPosition;')
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, uTeamColor * vColor.rgb, aSurface.w);\nvSurface = aSurface;\nvFlash = iParams.z;\nvCorePulse = (int(aPart + 0.5) == 9) ? 0.6 + 0.4 * sin(uTime * 5.0 + iParams.x) : 1.0;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec4 vSurface;\nvarying float vFlash;\nvarying float vCorePulse;\nuniform float uEmissiveBoost;',
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurface.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurface.x;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurface.z * uEmissiveBoost * vCorePulse + vec3(vFlash);`,
      );
  };
  material.customProgramCacheKey = () =>
    `lsg-animated-${profile.legSwing}-${profile.bob}-${profile.armSwing}-${profile.wobble}`;

  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  depth.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime = sharedAnimationUniforms.uTime;
    shader.uniforms.uAnim = anim;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${ANIMATION_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed = vec3(position);\nvec3 lsgNormal = vec3(0.0, 1.0, 0.0);\nlsgAnimate(transformed, lsgNormal);',
      );
  };
  depth.customProgramCacheKey = () => `lsg-animated-depth-${profile.legSwing}-${profile.bob}`;

  return { material, depth, teamColor, emissiveBoost };
}
