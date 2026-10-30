import { AudioDirector } from './audio/audio-director.ts';
import { AudioManager } from './audio/audio-manager.ts';
import { GameLoop } from './core/game-loop.ts';
import { InputController } from './core/input.ts';
import { detectInitialQuality, QUALITY_PRESETS } from './core/quality.ts';
import { SettingsStore } from './core/settings.ts';
import { StateMachine } from './core/state-machine.ts';
import { PROTOTYPE_LEVEL } from './data/levels/prototype.ts';
import { onLocaleChange, t } from './i18n/i18n.ts';
import { SceneRenderer } from './render/scene-renderer.ts';
import { EffectsDirector } from './render/fx/effects-director.ts';
import { WorldView } from './render/world-view.ts';
import { squadDepth } from './sim/formation.ts';
import type { LevelDef } from './sim/level.ts';
import { Simulation } from './sim/simulation.ts';
import { DEFAULT_MODIFIERS, type SimEvent } from './sim/types.ts';
import { DebugOverlay } from './ui/debug-overlay.ts';
import { Hud } from './ui/hud.ts';
import { Screens } from './ui/screens.ts';

/** Top-level game controller: owns the loop, the current run and all UI layers. */
export class Game {
  private readonly renderer: SceneRenderer;
  private readonly input: InputController;
  private readonly states = new StateMachine();
  private readonly world: WorldView;
  private readonly hud: Hud;
  private readonly screens: Screens;
  private readonly debug: DebugOverlay;
  private readonly loop: GameLoop;
  private sim: Simulation;
  private level: LevelDef = PROTOTYPE_LEVEL;
  private resultShown = false;
  private readonly effects: EffectsDirector;
  /** Simulation events collected during this frame's steps, consumed by the effects. */
  private readonly frameEvents: SimEvent[] = [];
  private lastDistance = 0;
  readonly settings = new SettingsStore();
  readonly audio = new AudioManager();
  private readonly audioDirector = new AudioDirector(this.audio);

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    const quality = QUALITY_PRESETS[detectInitialQuality(navigator)];
    this.renderer = new SceneRenderer(canvas, quality);
    this.input = new InputController(canvas);
    this.world = new WorldView(this.renderer.scene);
    this.effects = new EffectsDirector(this.renderer.scene, this.renderer.rig, quality);
    this.applySettings();
    this.settings.subscribe(() => this.applySettings());
    // Browsers only allow audio after a user gesture.
    const unlockAudio = () => this.audio.unlock();
    this.input.onFirstInteraction = unlockAudio;
    ui.addEventListener('pointerdown', unlockAudio);
    ui.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button'))
        this.audio.play('click', { volume: 0.4, jitter: 0 });
    });
    this.hud = new Hud(ui);
    this.screens = new Screens(ui);
    this.debug = new DebugOverlay(ui);
    this.sim = new Simulation(this.level, DEFAULT_MODIFIERS);

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    });

    this.registerStates();
    this.hud.pauseButton.addEventListener('click', () => this.pause());
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (this.states.current === 'playing') this.pause();
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
    });
  }

  start(): void {
    this.states.transition('boot');
    this.states.transition('menu');
    this.loop.start();
  }

  /** Development helper: starts a specific level, optionally with a custom squad size. */
  debugStartLevel(level: LevelDef, startUnits?: number): void {
    this.level = level;
    if (this.states.current !== 'playing') this.states.transition('playing');
    this.sim = new Simulation(level, {
      ...DEFAULT_MODIFIERS,
      startUnits: startUnits ?? DEFAULT_MODIFIERS.startUnits,
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
    const dt = 1 / 60;
    for (let t = 0; t < seconds && this.sim.status === 'running'; t += dt) {
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

  private registerStates(): void {
    this.states.register('menu', {
      enter: () => {
        this.audio.setMood('menu');
        this.hud.visible = false;
        this.newRun();
        this.screens.showTitle(this.level.number, () => this.states.transition('playing'));
      },
    });
    this.states.register('playing', {
      enter: (previous) => {
        this.screens.hide();
        this.hud.visible = true;
        if (previous !== 'paused') {
          this.newRun();
          this.input.consumeDragDelta();
        }
        this.audio.setMood(this.sim.bossId !== null ? 'boss' : 'play');
        this.loop.timeScale = 1;
      },
    });
    this.states.register('paused', {
      enter: () => {
        this.loop.timeScale = 0;
        this.screens.showPause(
          () => this.resume(),
          () => this.states.transition('menu'),
        );
      },
      exit: () => {
        this.loop.timeScale = 1;
      },
    });
    this.states.register('levelEnd', {
      enter: () => this.showResult(),
    });
  }

  private applySettings(): void {
    const s = this.settings.get();
    this.audio.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume, s.muted);
    this.effects.reducedMotion = s.reducedMotion;
    if (s.showFps) this.debug.visible = true;
  }

  private newRun(): void {
    this.sim = new Simulation(this.level, DEFAULT_MODIFIERS);
    this.resultShown = false;
    this.lastDistance = 0;
    this.frameEvents.length = 0;
    this.effects.clear();
  }

  private pause(): void {
    if (this.states.current === 'playing') this.states.transition('paused');
  }

  private resume(): void {
    if (this.states.current === 'paused') this.states.transition('playing');
  }

  private showResult(): void {
    const won = this.sim.status === 'won';
    this.hud.visible = false;
    this.screens.showResult(won, this.sim.stats, [
      {
        label: won ? t('result.playAgain') : t('result.retry'),
        primary: true,
        onClick: () => this.states.transition('playing'),
      },
      { label: t('result.menu'), onClick: () => this.states.transition('menu') },
    ]);
  }

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

  private handleEvents(events: SimEvent[]): void {
    for (const event of events) {
      this.frameEvents.push(event);
      switch (event.type) {
        case 'levelComplete':
        case 'levelFailed':
          // Let the final moment play out briefly before the result screen.
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
    this.effects.update(frameDt * this.loop.timeScale, Math.max(0, scrollDz));
    this.renderer.rig.followX = squadX * 0.25;
    // Follow the squad's depth and zoom out slightly so even huge squads stay fully in view.
    const depth = squadDepth(this.sim.units);
    this.renderer.rig.targetAnchorZ = depth * 0.7;
    this.renderer.rig.targetZoom = 1 + Math.min(0.3, depth * 0.03);
    this.renderer.render(frameDt, true);
    if (!this.hud.root.hidden) this.hud.update(this.sim, this.renderer, squadX);
    this.debug.update(frameDt, {
      quality: this.renderer.currentQuality.level,
      state: this.states.current ?? '-',
      units: this.sim.units,
      enemies: this.sim.enemies.length,
      projectiles: this.sim.projectiles.length,
      drawCalls: this.renderer.renderer.info.render.calls,
    });
  }
}
