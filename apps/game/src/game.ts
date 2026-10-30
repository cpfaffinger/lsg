import { totalStars, unlockedLevel, type UpgradeId } from '@lsg/shared';
import { AudioDirector } from './audio/audio-director.ts';
import { AudioManager } from './audio/audio-manager.ts';
import { GameLoop } from './core/game-loop.ts';
import { InputController } from './core/input.ts';
import {
  detectInitialQuality,
  QUALITY_PRESETS,
  type QualityLevel,
  type QualitySettings,
} from './core/quality.ts';
import { QualityGovernor } from './core/quality-governor.ts';
import { SettingsStore } from './core/settings.ts';
import { StateMachine } from './core/state-machine.ts';
import {
  CAMPAIGN_LENGTH,
  campaignLevel,
  FEATURE_UNLOCKS,
  LEVELS_PER_WORLD,
  worldOf,
} from './data/levels/campaign.ts';
import { endlessLevel } from './data/levels/endless.ts';
import { getLocale, onLocaleChange, setLocale, t } from './i18n/i18n.ts';
import { cosmeticById } from './meta/cosmetics.ts';
import { modifiersFor } from './meta/economy.ts';
import { ProgressStore } from './meta/progress-store.ts';
import { EffectsDirector } from './render/fx/effects-director.ts';
import { SceneRenderer } from './render/scene-renderer.ts';
import { WorldView } from './render/world-view.ts';
import { squadDepth } from './sim/formation.ts';
import type { LevelDef } from './sim/level.ts';
import { Simulation } from './sim/simulation.ts';
import { DEFAULT_MODIFIERS, type RunModifiers, type SimEvent } from './sim/types.ts';
import { DebugOverlay } from './ui/debug-overlay.ts';
import { Hud } from './ui/hud.ts';
import { Screens, type LevelTile, type MenuModel } from './ui/screens.ts';

type RunMode =
  { kind: 'campaign'; level: number } | { kind: 'endless' } | { kind: 'custom'; level: LevelDef };
type MenuPage = 'main' | 'levels' | 'shop' | 'settings';

/** Top-level game controller: owns the loop, the current run, progress and all UI layers. */
export class Game {
  readonly settings = new SettingsStore();
  readonly progress = new ProgressStore();
  readonly audio = new AudioManager();
  private readonly audioDirector = new AudioDirector(this.audio);
  private readonly renderer: SceneRenderer;
  private readonly input: InputController;
  private readonly states = new StateMachine();
  private readonly world: WorldView;
  private readonly effects: EffectsDirector;
  private readonly hud: Hud;
  private readonly screens: Screens;
  private readonly debug: DebugOverlay;
  private readonly loop: GameLoop;
  private sim: Simulation;
  private mode: RunMode = { kind: 'campaign', level: 1 };
  private modifiers: RunModifiers = DEFAULT_MODIFIERS;
  private resultShown = false;
  private restartRequested = false;
  /** Simulation events collected during this frame's steps, consumed by effects and audio. */
  private readonly frameEvents: SimEvent[] = [];
  private lastDistance = 0;
  private menuPage: MenuPage = 'main';
  private shopTab: 'upgrades' | 'skins' = 'upgrades';
  /** Re-renders whatever overlay is open (after a language change or a purchase). */
  private refreshScreen: (() => void) | null = null;
  private lastVibration = 0;
  private overlayOpen = false;
  /** Extra settings UI (e.g. account section) injected by other modules. */
  settingsExtra: (() => HTMLElement | null) | null = null;
  /** Account button shown in the main menu, provided by the sync module. */
  accountButton: { label: () => string | null; open: () => void } | null = null;
  /** Operator announcement for the main menu. */
  announcement: () => string | null = () => null;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    const quality = this.resolveQuality();
    this.renderer = new SceneRenderer(canvas, quality);
    this.input = new InputController(canvas);
    this.world = new WorldView(this.renderer.scene);
    this.effects = new EffectsDirector(this.renderer.scene, this.renderer.rig, quality);
    this.effects.onPulse = (amount) => {
      if (!this.settings.get().reducedMotion) this.renderer.postFx.pulse(amount);
    };
    this.hud = new Hud(ui);
    this.screens = new Screens(ui);
    this.debug = new DebugOverlay(ui);
    this.sim = new Simulation(campaignLevel(1), DEFAULT_MODIFIERS);
    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });

    // Browsers only allow audio after a user gesture.
    const unlockAudio = () => this.audio.unlock();
    this.input.onFirstInteraction = unlockAudio;
    ui.addEventListener('pointerdown', unlockAudio);
    ui.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button'))
        this.audio.play('click', { volume: 0.4, jitter: 0 });
    });

    this.registerStates();
    this.hud.pauseButton.addEventListener('click', () => this.pause());
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (this.states.current === 'playing' && !this.screens.visible) this.pause();
        else if (this.states.current === 'paused') this.resume();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.states.current === 'playing') this.pause();
        this.audio.suspend();
      } else {
        this.audio.resume();
      }
    });
    onLocaleChange(() => {
      this.world.gates.labelRevision++;
      this.hud.refreshTexts();
      document.title = t('app.title');
      this.refreshScreen?.();
    });
    this.settings.subscribe(() => this.applySettings());
    this.progress.subscribe(() => this.applySkin());
  }

  async init(): Promise<void> {
    await this.progress.load();
    this.applySettings();
    this.applySkin();
  }

  start(): void {
    this.states.transition('boot');
    this.states.transition('menu');
    this.loop.start();
  }

  // ------------------------------------------------------------------ settings

  private readonly governor = new QualityGovernor(detectInitialQuality(navigator));

  private resolveQuality(): QualitySettings {
    const setting = this.settings.get().quality;
    return QUALITY_PRESETS[setting === 'auto' ? this.governor.level : setting];
  }

  private setQualityLevel(level: QualityLevel): void {
    const quality = QUALITY_PRESETS[level];
    this.renderer.applyQuality(quality);
    this.effects.applyQuality(quality);
    this.world.squad.setDetail(level === 'low' ? 0 : 1);
    this.world.enemies.lodBias = quality.lodBias;
  }

  private applySettings(): void {
    const s = this.settings.get();
    this.audio.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume, s.muted);
    this.effects.reducedMotion = s.reducedMotion;
    this.debug.visible = s.showFps || new URLSearchParams(location.search).has('debug');
    const quality = this.resolveQuality();
    if (quality.level !== this.renderer.currentQuality.level) {
      this.renderer.applyQuality(quality);
      this.effects.applyQuality(quality);
    }
    this.world.squad.setDetail(quality.level === 'low' ? 0 : 1);
    this.world.enemies.lodBias = quality.lodBias;
    if (s.locale && s.locale !== getLocale()) void setLocale(s.locale);
  }

  private applySkin(): void {
    const skin = cosmeticById(this.progress.data.cosmetics.selected);
    this.world.squad.setColor(skin.body);
    this.effects.squadColor = skin.body;
    this.world.projectiles.setColor(skin.projectile);
  }

  // ------------------------------------------------------------------ states

  private registerStates(): void {
    this.states.register('menu', {
      enter: () => {
        this.audio.setMood('menu');
        this.hud.visible = false;
        this.loop.timeScale = 1;
        // The menu shows the world of the level the player will play next.
        this.prepareRun(
          this.mode.kind === 'campaign' ? { kind: 'campaign', level: this.menuModel().nextLevel } : this.mode,
        );
        this.showMenu('main');
      },
    });
    this.states.register('playing', {
      enter: (previous) => {
        this.screens.hide();
        this.refreshScreen = null;
        this.hud.visible = true;
        this.loop.timeScale = 1;
        if (previous !== 'paused' || this.restartRequested) {
          this.restartRequested = false;
          this.prepareRun(this.mode);
          this.input.consumeDragDelta();
          this.maybeShowUnlock();
        }
        this.audio.setMood(this.sim.bossId !== null ? 'boss' : 'play');
      },
    });
    this.states.register('paused', {
      enter: () => {
        this.loop.timeScale = 0;
        this.screens.showPause({
          resume: () => this.resume(),
          restart: () => {
            this.restartRequested = true;
            this.states.transition('playing');
          },
          quit: () => this.states.transition('menu'),
        });
      },
      exit: () => {
        this.loop.timeScale = 1;
      },
    });
    this.states.register('levelEnd', {
      enter: () => this.finishRun(),
    });
  }

  private prepareRun(mode: RunMode): void {
    this.mode = mode;
    this.modifiers = modifiersFor(this.progress.data);
    const level =
      mode.kind === 'campaign'
        ? campaignLevel(mode.level)
        : mode.kind === 'endless'
          ? endlessLevel()
          : mode.level;
    this.sim = new Simulation(level, this.modifiers);
    this.renderer.setWorld(level.world);
    this.effects.setWorld(level.world);
    this.resultShown = false;
    this.lastDistance = 0;
    this.frameEvents.length = 0;
    this.effects.clear();
  }

  startRun(mode: RunMode): void {
    this.mode = mode;
    if (this.states.current === 'playing') {
      this.restartRequested = true;
      this.states.transition('paused');
    }
    this.states.transition('playing');
  }

  private pause(): void {
    if (this.states.current === 'playing') this.states.transition('paused');
  }

  private resume(): void {
    if (this.states.current === 'paused') this.states.transition('playing');
  }

  /** Shows a short explanation the first time a level introduces a new mechanic. */
  private maybeShowUnlock(): void {
    if (this.mode.kind !== 'campaign') return;
    const levelNumber = this.mode.level;
    const record = this.progress.data.levels[String(levelNumber)];
    if (record && record.completions > 0) return;
    const unlock = FEATURE_UNLOCKS.find(
      (u) => u.level === levelNumber && u.feature !== 'boss' && u.feature !== 'miniboss',
    );
    if (!unlock) return;
    this.loop.timeScale = 0;
    this.screens.showUnlock(unlock.feature, () => {
      this.screens.hide();
      this.loop.timeScale = 1;
    });
  }

  private finishRun(): void {
    this.hud.visible = false;
    const won = this.sim.status === 'won';
    const stats = this.sim.stats;
    if (this.mode.kind === 'endless') {
      const result = this.progress.recordEndlessRun(this.sim.distance, stats);
      const show = () =>
        this.screens.showEndlessResult(this.sim.distance, stats, result.coins, result.newBest, {
          retry: () => this.startRun({ kind: 'endless' }),
          menu: () => this.states.transition('menu'),
        });
      show();
      this.refreshScreen = show;
      return;
    }
    if (this.mode.kind === 'custom') {
      this.states.transition('menu');
      return;
    }
    const levelNumber = this.mode.level;
    const reward = this.progress.recordCampaignRun(
      levelNumber,
      won,
      this.sim.units,
      stats,
      this.modifiers.coinMultiplier,
    );
    const next = levelNumber < CAMPAIGN_LENGTH ? levelNumber + 1 : null;
    const show = () =>
      this.screens.showCampaignResult(won, stats, this.sim.units, reward, {
        next: next ? () => this.startRun({ kind: 'campaign', level: next }) : null,
        retry: () => this.startRun({ kind: 'campaign', level: levelNumber }),
        menu: () => this.states.transition('menu'),
      });
    show();
    this.refreshScreen = show;
  }

  // ------------------------------------------------------------------ menus

  private menuModel(): MenuModel {
    const save = this.progress.data;
    const unlocked = Math.min(CAMPAIGN_LENGTH, unlockedLevel(save));
    return {
      save,
      stars: totalStars(save),
      nextLevel: unlocked,
      campaignComplete: (save.levels[String(CAMPAIGN_LENGTH)]?.completions ?? 0) > 0,
    };
  }

  private levelTiles(): LevelTile[] {
    const save = this.progress.data;
    const unlocked = unlockedLevel(save);
    const tiles: LevelTile[] = [];
    for (let n = 1; n <= CAMPAIGN_LENGTH; n++) {
      const inWorld = n % LEVELS_PER_WORLD;
      tiles.push({
        number: n,
        world: worldOf(n),
        finale: inWorld === 0 ? 'boss' : inWorld === 5 ? 'miniboss' : 'none',
        unlocked: n <= unlocked,
        stars: save.levels[String(n)]?.stars ?? 0,
      });
    }
    return tiles;
  }

  /** Shows a custom overlay (account, legal) on top of the current menu page. */
  showOverlay(content: HTMLElement): void {
    this.overlayOpen = true;
    this.screens.showCustom(content);
  }

  /** Re-renders the current menu page unless an overlay (account, legal) is open. */
  closeOverlayIfMenu(): void {
    if (this.states.current === 'menu' && !this.overlayOpen) this.showMenu(this.menuPage);
  }

  /** Returns to the current menu page (or hides overlays while playing). */
  closeOverlay(): void {
    this.overlayOpen = false;
    if (this.states.current === 'menu') this.showMenu(this.menuPage);
    else if (this.refreshScreen) this.refreshScreen();
    else this.screens.hide();
  }

  get inMenu(): boolean {
    return this.states.current === 'menu';
  }

  showMenu(page: MenuPage): void {
    this.overlayOpen = false;
    this.menuPage = page;
    const render = () => {
      const model = this.menuModel();
      switch (this.menuPage) {
        case 'main':
          this.screens.showMainMenu(model, {
            play: (level) => this.startRun({ kind: 'campaign', level }),
            endless: () => this.startRun({ kind: 'endless' }),
            levels: () => this.showMenu('levels'),
            shop: () => this.showMenu('shop'),
            settings: () => this.showMenu('settings'),
            account: this.accountButton?.label() ? () => this.accountButton?.open() : null,
            accountLabel: this.accountButton?.label() ?? null,
            announcement: this.announcement(),
          });
          break;
        case 'levels':
          this.screens.showLevels(
            model,
            this.levelTiles(),
            (level) => this.startRun({ kind: 'campaign', level }),
            () => this.showMenu('main'),
          );
          break;
        case 'shop':
          this.screens.showShop(model, this.shopTab, {
            buyUpgrade: (id: UpgradeId) => {
              if (this.progress.buyUpgrade(id)) this.audio.play('coin', { volume: 0.6, jitter: 0 });
              render();
            },
            buySkin: (id) => {
              if (this.progress.buyCosmetic(id, model.stars))
                this.audio.play('gateGood', { volume: 0.5, jitter: 0 });
              render();
            },
            selectSkin: (id) => {
              this.progress.selectCosmetic(id);
              render();
            },
            tab: (tab) => {
              this.shopTab = tab;
              render();
            },
            back: () => this.showMenu('main'),
          });
          break;
        case 'settings':
          this.screens.showSettings(this.settings.get(), {
            change: (patch) => this.settings.update(patch),
            reset: () => {
              this.progress.reset();
              this.showMenu('main');
            },
            back: () => this.showMenu('main'),
            extra: this.settingsExtra?.() ?? null,
          });
          break;
      }
    };
    this.refreshScreen = render;
    render();
  }

  // ------------------------------------------------------------------ loop

  private update(dt: number): void {
    const playing = this.states.current === 'playing';
    const dragPx = this.input.consumeDragDelta();
    if (!playing) return;
    this.sim.step(dt, {
      dragWorld: dragPx * this.renderer.worldPerPixel(),
      axis: this.input.keyAxis,
    });
    this.handleEvents(this.sim.drainEvents());
  }

  private vibrate(ms: number): void {
    if (!this.settings.get().haptics || !('vibrate' in navigator)) return;
    // Browsers block vibration until the user has interacted with the page.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const now = performance.now();
    if (now - this.lastVibration < 120) return;
    this.lastVibration = now;
    navigator.vibrate(ms);
  }

  private handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      this.frameEvents.push(event);
      switch (event.type) {
        case 'unitsLost':
          this.vibrate(12);
          break;
        case 'gatePassed':
          this.vibrate(25);
          break;
        case 'bossSpawned':
          if (event.kind === 'boss') this.audio.setMood('boss');
          this.vibrate(60);
          break;
        case 'levelComplete':
        case 'levelFailed':
          // Let the final moment play out in slow motion before the result screen.
          this.loop.timeScale = 0.35;
          window.setTimeout(() => {
            if (!this.resultShown && this.states.current === 'playing') {
              this.resultShown = true;
              this.states.transition('levelEnd');
            }
          }, 900);
          break;
        default:
          break;
      }
    }
  }

  private render(alpha: number, frameDt: number): void {
    this.world.update(this.sim, alpha, frameDt);
    this.renderer.setScroll(this.sim.distance);
    const squadX = this.world.squad.centerX;
    const scrollDz = this.sim.distance - this.lastDistance;
    this.lastDistance = this.sim.distance;
    this.effects.handle(this.frameEvents, squadX);
    this.audioDirector.handle(this.frameEvents);
    this.frameEvents.length = 0;
    this.audio.setIntensity(this.sim.units / 150);
    this.effects.trails(this.sim, frameDt * this.loop.timeScale);
    this.effects.update(frameDt * this.loop.timeScale, Math.max(0, scrollDz));
    this.renderer.rig.followX = squadX * 0.25;
    // Follow the squad's depth and zoom out slightly so even huge squads stay fully in view.
    const depth = squadDepth(this.sim.units);
    this.renderer.rig.targetAnchorZ = depth * 0.7;
    this.renderer.rig.targetZoom = 1 + Math.min(0.3, depth * 0.03);
    this.renderer.render(frameDt, true);
    if (this.states.current === 'playing' && this.settings.get().quality === 'auto') {
      const change = this.governor.sample(frameDt);
      if (change) this.setQualityLevel(change);
    }
    if (!this.hud.root.hidden) this.hud.update(this.sim, this.renderer, squadX, this.mode.kind === 'endless');
    this.debug.update(frameDt, {
      quality: this.renderer.currentQuality.level,
      state: this.states.current ?? '-',
      units: this.sim.units,
      enemies: this.sim.enemies.length,
      projectiles: this.sim.projectiles.length,
      drawCalls: this.renderer.renderer.info.render.calls,
    });
  }

  // ------------------------------------------------------------------ dev helpers

  /** Development helper: starts a specific level, optionally with a custom squad size. */
  debugStartLevel(level: LevelDef, startUnits?: number): void {
    this.mode = { kind: 'custom', level };
    if (this.states.current !== 'playing') this.states.transition('playing');
    this.sim = new Simulation(level, {
      ...this.modifiers,
      startUnits: startUnits ?? this.modifiers.startUnits,
    });
    this.effects.clear();
    this.lastDistance = 0;
  }

  /**
   * Development helper: advances the running simulation by `seconds`, steering towards
   * `targetX` (or the best upcoming gate when omitted). Used for automated visual checks.
   */
  debugAdvance(
    seconds: number,
    targetX?: number,
    renderFrames = false,
  ): { units: number; status: string; distance: number } {
    if (this.states.current === 'menu') this.states.transition('playing');
    this.screens.hide();
    this.loop.timeScale = this.loop.timeScale || 1;
    const dt = 1 / 60;
    for (let time = 0; time < seconds && this.sim.status === 'running'; time += dt) {
      let target = targetX;
      if (target === undefined) {
        const upcoming = this.sim.gates.filter((g) => g.alive && g.z < 0 && g.z > -40);
        target = upcoming.length > 0 ? upcoming.reduce((a, b) => (b.value > a.value ? b : a)).x : 0;
      }
      this.sim.step(dt, { dragWorld: target - this.sim.squadX, axis: 0 });
      this.handleEvents(this.sim.drainEvents());
      if (renderFrames) this.render(1, dt);
    }
    return { units: this.sim.units, status: this.sim.status, distance: Math.round(this.sim.distance) };
  }
}
