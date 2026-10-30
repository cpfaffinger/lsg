export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  level: QualityLevel;
  /** Multiplier applied to devicePixelRatio, capped by maxPixelRatio. */
  resolutionScale: number;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  postProcessing: boolean;
  bloom: boolean;
  ambientOcclusion: boolean;
  depthOfField: boolean;
  /** Upper bound of simultaneously simulated particles. */
  particleBudget: number;
  /** Distance multiplier for level-of-detail switches. */
  lodBias: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: {
    level: 'low',
    resolutionScale: 0.75,
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    antialias: false,
    postProcessing: false,
    bloom: false,
    ambientOcclusion: false,
    depthOfField: false,
    particleBudget: 1500,
    lodBias: 0.6,
  },
  medium: {
    level: 'medium',
    resolutionScale: 1,
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    antialias: false,
    postProcessing: true,
    bloom: true,
    ambientOcclusion: false,
    depthOfField: false,
    particleBudget: 4000,
    lodBias: 0.85,
  },
  high: {
    level: 'high',
    resolutionScale: 1,
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    antialias: true,
    postProcessing: true,
    bloom: true,
    ambientOcclusion: true,
    depthOfField: false,
    particleBudget: 10000,
    lodBias: 1,
  },
  ultra: {
    level: 'ultra',
    resolutionScale: 1,
    maxPixelRatio: 2.5,
    shadows: true,
    shadowMapSize: 4096,
    antialias: true,
    postProcessing: true,
    bloom: true,
    ambientOcclusion: true,
    depthOfField: true,
    particleBudget: 20000,
    lodBias: 1.25,
  },
};

/**
 * Heuristic first guess before the runtime benchmark refines it.
 * Phones and low-core devices start at "medium", desktops at "high".
 */
export function detectInitialQuality(
  nav: Pick<Navigator, 'hardwareConcurrency' | 'userAgent'>,
): QualityLevel {
  const cores = nav.hardwareConcurrency || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  if (mobile) return cores >= 8 ? 'medium' : 'low';
  if (cores >= 12) return 'ultra';
  return cores >= 6 ? 'high' : 'medium';
}

const ORDER: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];

export function stepQuality(level: QualityLevel, direction: -1 | 1): QualityLevel {
  const index = Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(level) + direction));
  return ORDER[index] ?? level;
}
