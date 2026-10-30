import './styles.css';
import { Game } from './game.ts';
import { initLocale } from './i18n/i18n.ts';

async function boot(): Promise<void> {
  await initLocale();
  const canvas = document.querySelector<HTMLCanvasElement>('#scene');
  const ui = document.querySelector<HTMLDivElement>('#ui');
  if (!canvas || !ui) throw new Error('Missing #scene or #ui element');
  const game = new Game(canvas, ui);
  game.start();
  if (import.meta.env.DEV) {
    (window as unknown as { lsg: Game }).lsg = game;
  }
}

boot().catch((error: unknown) => {
  console.error(error);
  document.body.textContent = 'LSG failed to start. Please reload the page.';
});
