import type { Locale } from '@lsg/shared';
import type { MusicStyle } from '../audio/music-player.ts';
import type { QualityLevel } from './quality.ts';

export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  musicStyle: MusicStyle;
  muted: boolean;
  /** 'auto' lets the runtime benchmark choose. */
  quality: QualityLevel | 'auto';
  locale: Locale | null;
  reducedMotion: boolean;
  haptics: boolean;
  /** Adds symbols to gate colours for colour-blind players. */
  colorblind: boolean;
  showFps: boolean;
}

const STORAGE_KEY = 'lsg.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.8,
  sfxVolume: 0.8,
  musicVolume: 0.6,
  musicStyle: 'standard',
  muted: false,
  quality: 'auto',
  locale: null,
  reducedMotion: false,
  haptics: true,
  colorblind: false,
  showFps: false,
};

type Listener = (settings: Settings) => void;

/** Player preferences persisted in localStorage (they are per device, not synced). */
export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.value = { ...DEFAULT_SETTINGS };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.value = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      // Ignore unreadable storage; defaults apply.
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !this.hasStored()) {
      this.value.reducedMotion = true;
    }
  }

  private hasStored(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }

  get(): Readonly<Settings> {
    return this.value;
  }

  update(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.value));
    } catch {
      // Storage full or blocked; settings still apply for this session.
    }
    for (const listener of this.listeners) listener(this.value);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
