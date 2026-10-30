import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';

/**
 * Material for merged, vertex-coloured static geometry built with ModelBuilder
 * (scenery, props). Reads metalness, roughness and glow from the aSurface attribute.
 */
export function createStaticMaterial(emissiveBoost = 2.2): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uEmissiveBoost = { value: emissiveBoost };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSurface;\nvarying vec4 vSurface;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvSurface = aSurface;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec4 vSurface;\nuniform float uEmissiveBoost;',
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurface.y;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurface.x;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSurface.z * uEmissiveBoost;',
      );
  };
  material.customProgramCacheKey = () => `lsg-static-${emissiveBoost}`;
  return material;
}

/**
 * City building facades: lit and dark windows are computed from the object-space position,
 * so any box becomes a skyscraper without textures or UVs.
 */
export function createBuildingMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vObjPos;
varying vec3 vObjNormal;
float lsgHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
vec3 an = abs(vObjNormal);
if (an.y >= 0.5) {
  // Rooftops are visible from the high camera: give them a lighter concrete tone and a
  // subtle panel grid instead of a flat dark face.
  vec2 roof = fract(vObjPos.xz / 3.0);
  float seam = step(0.94, max(roof.x, roof.y));
  diffuseColor.rgb = mix(vec3(0.16, 0.17, 0.21), vec3(0.08, 0.085, 0.1), seam);
} else {
  vec2 facade = an.x > 0.5 ? vObjPos.zy : vObjPos.xy;
  vec2 grid = facade / vec2(1.5, 2.1);
  vec2 cell = floor(grid);
  vec2 f = fract(grid);
  float window = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.78);
  float seed = lsgHash(cell + floor(vObjPos.xz / 9.0) * 7.31);
  float lit = step(0.52, seed);
  vec3 warm = vec3(1.0, 0.72, 0.38);
  vec3 cool = vec3(0.45, 0.75, 1.0);
  vec3 tint = mix(warm, cool, step(0.8, lsgHash(cell * 1.7)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.035, 0.05), window * 0.85);
  totalEmissiveRadiance += window * lit * tint * (1.2 + seed * 1.6);
}`,
      );
  };
  material.customProgramCacheKey = () => 'lsg-building';
  return material;
}
