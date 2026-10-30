import './styles.css';
import { GameLoop } from './core/game-loop.ts';
import { InputController } from './core/input.ts';
import { detectInitialQuality, QUALITY_PRESETS } from './core/quality.ts';
import { StateMachine } from './core/state-machine.ts';
import { initLocale, t } from './i18n/i18n.ts';
import { SceneRenderer } from './render/scene-renderer.ts';
import { LANE_HALF_WIDTH, LANE_WIDTH } from './sim/world.ts';
import { DebugOverlay } from './ui/debug-overlay.ts';

async function boot(): Promise<void> {
  await initLocale();
  const canvas = document.querySelector<HTMLCanvasElement>('#scene');
  const ui = document.querySelector<HTMLDivElement>('#ui');
  if (!canvas || !ui) throw new Error('Missing #scene or #ui element');

  const quality = QUALITY_PRESETS[detectInitialQuality(navigator)];
  const renderer = new SceneRenderer(canvas, quality);
  const input = new InputController(canvas);
  const debug = new DebugOverlay(ui);
  const states = new StateMachine();

  const hint = document.createElement('div');
  hint.className = 'start-hint';
  hint.textContent = t('app.tapToStart');
  ui.appendChild(hint);

  // M0 placeholder: a cube that follows horizontal input inside the lane.
  let squadX = 0;
  let previousX = 0;
  const keySpeed = 14;

  const loop = new GameLoop({
    update(dt) {
      previousX = squadX;
      const pixelsToWorld = (LANE_WIDTH * 1.25) / input.viewportWidth;
      squadX += input.consumeDragDelta() * pixelsToWorld;
      squadX += input.keyAxis * keySpeed * dt;
      squadX = Math.max(-LANE_HALF_WIDTH + 0.7, Math.min(LANE_HALF_WIDTH - 0.7, squadX));
      states.update(dt);
    },
    render(alpha, frameDt) {
      renderer.placeholder.position.x = previousX + (squadX - previousX) * alpha;
      renderer.render(frameDt);
      debug.update(frameDt, { quality: renderer.currentQuality.level, state: states.current ?? '-' });
    },
  });

  input.onFirstInteraction = () => hint.remove();
  window.addEventListener('resize', () => renderer.resize());

  states.transition('boot');
  states.transition('menu');
  loop.start();
}

boot().catch((error: unknown) => {
  console.error(error);
  document.body.textContent = 'LSG failed to start. Please reload the page.';
});
