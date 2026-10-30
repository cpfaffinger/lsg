import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  type Effect,
} from 'postprocessing';
import {
  HalfFloatType,
  NoToneMapping,
  ACESFilmicToneMapping,
  Vector2,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { QualitySettings } from '../core/quality.ts';
import type { WorldTheme } from './environment/themes.ts';

/**
 * Post-processing stack: HDR render, bloom on emissive surfaces, colour grading per world,
 * vignette and hit-reactive chromatic aberration, then ACES tone mapping. (Depth-of-field
 * effects were tried and dropped: blurring the squad hurts readability.)
 * Disabled entirely on the lowest quality level (plain forward rendering).
 */
export class PostFX {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: Camera;
  private composer: EffectComposer | null = null;
  private bloom: BloomEffect | null = null;
  private vignette: VignetteEffect | null = null;
  private hue: HueSaturationEffect | null = null;
  private contrast: BrightnessContrastEffect | null = null;
  private chroma: ChromaticAberrationEffect | null = null;
  private quality: QualitySettings | null = null;
  private grading: WorldTheme['grading'] = { saturation: 1, contrast: 1, vignette: 0.4, bloom: 1 };
  private aberration = 0;
  private readonly chromaOffset = new Vector2();

  constructor(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
  }

  get enabled(): boolean {
    return this.composer !== null;
  }

  applyQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.composer?.dispose();
    this.composer = null;
    if (!quality.postProcessing) {
      this.renderer.toneMapping = ACESFilmicToneMapping;
      return;
    }
    // Tone mapping happens in the last effect so bloom works on HDR values.
    this.renderer.toneMapping = NoToneMapping;
    const composer = new EffectComposer(this.renderer, {
      frameBufferType: HalfFloatType,
      multisampling: quality.antialias ? 4 : 0,
    });
    composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: 1.2,
      luminanceSmoothing: 0.25,
      intensity: 1,
      radius: 0.75,
      levels: quality.level === 'ultra' ? 8 : 6,
    });
    this.hue = new HueSaturationEffect({ saturation: 0 });
    this.contrast = new BrightnessContrastEffect({ contrast: 0 });
    this.vignette = new VignetteEffect({ offset: 0.3, darkness: 0.4 });
    this.chroma = new ChromaticAberrationEffect({
      offset: this.chromaOffset,
      radialModulation: true,
      modulationOffset: 0.3,
    });
    const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });

    // Order matters: bloom works on HDR values, tone mapping brings them into 0..1, and only
    // then is colour graded. Grading HDR values first pushed saturated, bright colours (neon,
    // car paint) negative, which tone mapping turned into black NaN pixels.
    const effects: Effect[] = [this.bloom, this.chroma, toneMapping, this.hue, this.contrast, this.vignette];
    composer.addPass(new EffectPass(this.camera, ...effects));
    // An EffectPass may contain only one convolution effect (chromatic aberration already is
    // one), so SMAA gets its own pass at the end of the chain.
    if (!quality.antialias)
      composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.LOW })));
    this.composer = composer;
    this.applyGrading(this.grading);
    const size = this.renderer.getSize(new Vector2());
    composer.setSize(size.x, size.y);
  }

  applyGrading(grading: WorldTheme['grading']): void {
    this.grading = grading;
    if (this.bloom) this.bloom.intensity = grading.bloom * (this.quality?.bloom ? 1 : 0);
    // HueSaturationEffect / BrightnessContrastEffect use offsets around 0.
    if (this.hue) this.hue.saturation = grading.saturation - 1;
    if (this.contrast) this.contrast.contrast = grading.contrast - 1;
    if (this.vignette) this.vignette.darkness = grading.vignette;
  }

  /** Brief colour fringing on heavy hits and explosions. */
  pulse(amount: number): void {
    this.aberration = Math.min(1, this.aberration + amount);
  }

  setSize(width: number, height: number): void {
    this.composer?.setSize(width, height);
  }

  render(dt: number): void {
    if (!this.composer) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.aberration = Math.max(0, this.aberration - dt * 3);
    const strength = this.aberration * this.aberration * 0.006;
    this.chromaOffset.set(strength, strength * 0.6);
    this.composer.render(dt);
  }
}
