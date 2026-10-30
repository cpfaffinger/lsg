import { t } from '../i18n/i18n.ts';

/** Small FPS / quality readout, toggled with F3 or ?debug in the URL. */
export class DebugOverlay {
  private readonly element: HTMLDivElement;
  private frames = 0;
  private elapsed = 0;
  private fps = 0;
  visible: boolean;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'debug-overlay';
    parent.appendChild(this.element);
    this.visible = new URLSearchParams(location.search).has('debug');
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.visible = !this.visible;
      }
    });
  }

  get currentFps(): number {
    return this.fps;
  }

  update(frameDt: number, extra: Record<string, string | number>): void {
    this.frames++;
    this.elapsed += frameDt;
    if (this.elapsed >= 0.5) {
      this.fps = Math.round(this.frames / this.elapsed);
      this.frames = 0;
      this.elapsed = 0;
      if (this.visible) {
        const lines = [t('debug.fps', { fps: this.fps })];
        for (const [key, value] of Object.entries(extra)) lines.push(`${key}: ${value}`);
        this.element.textContent = lines.join('\n');
      }
    }
    this.element.hidden = !this.visible;
  }
}
