import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import type { WorldTheme } from './themes.ts';

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_Position.z = gl_Position.w; // always at the far plane
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunSize;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    vec3 color = h > 0.0
      ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55))
      : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.4));
    // Sun disc with a soft halo.
    float sun = max(dot(dir, uSunDir), 0.0);
    color += uSunColor * (smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, sun) * 4.0 + pow(sun, 64.0) * 0.6);
    // Twinkling stars above the horizon.
    if (uStars > 0.0 && h > 0.02) {
      vec3 cell = floor(dir * 220.0);
      float star = step(0.9975, hash(cell));
      float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 3.1) * 40.0);
      color += vec3(star * twinkle * uStars * smoothstep(0.02, 0.25, h));
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Gradient sky dome with sun and optional stars; follows the camera. */
export class Sky {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;

  constructor() {
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTop: { value: new Color() },
        uHorizon: { value: new Color() },
        uBottom: { value: new Color() },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color() },
        uSunSize: { value: 0.03 },
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(350, 32, 16), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  apply(theme: WorldTheme): void {
    const u = this.mesh.material.uniforms;
    (u.uTop?.value as Color).setHex(theme.sky.top).convertSRGBToLinear();
    (u.uHorizon?.value as Color).setHex(theme.sky.horizon).convertSRGBToLinear();
    (u.uBottom?.value as Color).setHex(theme.sky.bottom).convertSRGBToLinear();
    (u.uSunColor?.value as Color).setHex(theme.sky.sunColor).convertSRGBToLinear();
    (u.uSunDir?.value as Vector3).set(...theme.sun.direction).normalize();
    if (u.uSunSize) u.uSunSize.value = theme.sky.sunSize;
    if (u.uStars) u.uStars.value = theme.sky.stars;
  }

  update(cameraPosition: Vector3, dt: number): void {
    this.mesh.position.copy(cameraPosition);
    const time = this.mesh.material.uniforms.uTime;
    if (time) time.value += dt;
  }
}
