import { formatNumber, t } from '../i18n/i18n.ts';
import type { RunStats } from '../sim/types.ts';

export interface ScreenAction {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

/** Full-screen overlays (title, pause, level result) rendered as accessible DOM. */
export class Screens {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'screen-layer';
    parent.appendChild(this.root);
  }

  hide(): void {
    this.root.replaceChildren();
    this.root.classList.remove('active');
  }

  private show(content: HTMLElement): void {
    this.root.replaceChildren(content);
    this.root.classList.add('active');
    content.querySelector<HTMLButtonElement>('button.primary')?.focus({ preventScroll: true });
  }

  private panel(
    title: string,
    subtitle: string | null,
    actions: ScreenAction[],
    body?: HTMLElement,
  ): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'screen-panel interactive';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const heading = document.createElement('h1');
    heading.textContent = title;
    panel.appendChild(heading);
    if (subtitle) {
      const sub = document.createElement('p');
      sub.className = 'screen-subtitle';
      sub.textContent = subtitle;
      panel.appendChild(sub);
    }
    if (body) panel.appendChild(body);
    const buttons = document.createElement('div');
    buttons.className = 'screen-actions';
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = action.primary ? 'btn primary' : 'btn';
      button.textContent = action.label;
      button.addEventListener('click', action.onClick);
      buttons.appendChild(button);
    }
    panel.appendChild(buttons);
    return panel;
  }

  showTitle(levelNumber: number, onPlay: () => void): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'title-screen';
    const logo = document.createElement('div');
    logo.className = 'logo';
    logo.textContent = t('app.title');
    const tagline = document.createElement('div');
    tagline.className = 'tagline';
    tagline.textContent = t('app.tagline');
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'btn primary big interactive';
    play.textContent = t('menu.playLevel', { n: levelNumber });
    play.addEventListener('click', onPlay);
    const hint = document.createElement('div');
    hint.className = 'start-hint';
    hint.textContent = t('app.controlsHint');
    wrapper.append(logo, tagline, play, hint);
    this.show(wrapper);
  }

  showPause(onResume: () => void, onQuit: () => void): void {
    this.show(
      this.panel(t('pause.title'), null, [
        { label: t('pause.resume'), primary: true, onClick: onResume },
        { label: t('pause.quit'), onClick: onQuit },
      ]),
    );
  }

  showResult(won: boolean, stats: RunStats, actions: ScreenAction[]): void {
    const body = document.createElement('dl');
    body.className = 'result-stats';
    const rows: [string, string][] = [
      [t('result.kills'), formatNumber(stats.kills)],
      [t('result.peakSquad'), formatNumber(stats.peakUnits)],
      [t('result.coins'), formatNumber(stats.coins)],
    ];
    for (const [label, value] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      body.append(dt, dd);
    }
    this.show(
      this.panel(
        won ? t('result.wonTitle') : t('result.lostTitle'),
        won ? t('result.wonSubtitle') : t('result.lostSubtitle'),
        actions,
        body,
      ),
    );
  }
}
