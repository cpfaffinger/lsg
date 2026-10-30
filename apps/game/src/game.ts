import { GameLoop } from './core/game-loop.ts';
import { InputController } from './core/input.ts';
import { detectInitialQuality, QUALITY_PRESETS } from './core/quality.ts';
import { StateMachine } from './core/state-machine.ts';
import { PROTOTYPE_LEVEL } from './data/levels/prototype.ts';
import { onLocaleChange, t } from './i18n/i18n.ts';
import { SceneRenderer } from './render/scene-renderer.ts';
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

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    const quality = QUALITY_PRESETS[detectInitialQuality(navigator)];
    this.renderer = new SceneRenderer(canvas, quality);
    this.input = new InputController(canvas);
    this.world = new WorldView(this.renderer.scene);
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
      if (document.hidden && this.states.current === 'playing') this.pause();
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

  /**
   * Development helper: advances the running simulation by `seconds`, steering towards
   * `targetX` (or the best upcoming gate when omitted). Used for automated visual checks.
   */
  debugAdvance(seconds: number, targetX?: number): { units: number; status: string; distance: number } {
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
    }
    return { units: this.sim.units, status: this.sim.status, distance: Math.round(this.sim.distance) };
  }

  private registerStates(): void {
    this.states.register('menu', {
      enter: () => {
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

  private newRun(): void {
    this.sim = new Simulation(this.level, DEFAULT_MODIFIERS);
    this.resultShown = false;
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
      switch (event.type) {
        case 'unitsLost':
          this.renderer.rig.shake(Math.min(0.5, 0.08 + event.count * 0.02));
          break;
        case 'explosion':
          this.renderer.rig.shake(0.35);
          break;
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
