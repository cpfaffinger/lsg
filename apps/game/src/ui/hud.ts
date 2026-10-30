import { formatCompact, formatNumber, t } from '../i18n/i18n.ts';
import type { SceneRenderer } from '../render/scene-renderer.ts';
import type { Simulation } from '../sim/simulation.ts';
import { SQUAD_Z } from '../sim/world.ts';

const LABEL_POOL = 24;

/** In-game heads-up display: progress, coins, squad counter, boss bar and big-enemy HP labels. */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly progressFill: HTMLDivElement;
  private readonly coins: HTMLSpanElement;
  private readonly levelLabel: HTMLSpanElement;
  private readonly squadBadge: HTMLDivElement;
  private readonly bossBar: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossName: HTMLSpanElement;
  private readonly labels: HTMLDivElement[] = [];
  private readonly projected = { x: 0, y: 0, visible: false };
  private lastUnits = -1;
  private lastCoins = -1;
  private lastProgress = '';
  private readonly textCache: string[] = [];
  private readonly hiddenCache: boolean[] = [];
  readonly pauseButton: HTMLButtonElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud');
    const top = el('div', 'hud-top');
    this.levelLabel = el('span', 'hud-level');
    const progress = el('div', 'hud-progress');
    this.progressFill = el('div', 'hud-progress-fill');
    progress.appendChild(this.progressFill);
    const coinBox = el('div', 'hud-coins');
    coinBox.appendChild(el('span', 'coin-icon'));
    this.coins = el('span', 'hud-coins-value');
    coinBox.appendChild(this.coins);
    this.pauseButton = el('button', 'hud-pause interactive');
    this.pauseButton.type = 'button';
    this.pauseButton.textContent = '❚❚';
    top.append(this.levelLabel, progress, coinBox, this.pauseButton);

    this.bossBar = el('div', 'hud-boss');
    this.bossName = el('span', 'hud-boss-name');
    const bossTrack = el('div', 'hud-boss-track');
    this.bossFill = el('div', 'hud-boss-fill');
    bossTrack.appendChild(this.bossFill);
    this.bossBar.append(this.bossName, bossTrack);
    this.bossBar.hidden = true;

    this.squadBadge = el('div', 'squad-badge');
    for (let i = 0; i < LABEL_POOL; i++) {
      const label = el('div', 'enemy-hp');
      label.hidden = true;
      this.labels.push(label);
      this.root.appendChild(label);
    }
    this.root.append(top, this.bossBar, this.squadBadge);
    parent.appendChild(this.root);
    this.refreshTexts();
  }

  refreshTexts(): void {
    this.pauseButton.setAttribute('aria-label', t('hud.pause'));
    this.bossName.textContent = t('hud.boss');
  }

  set visible(value: boolean) {
    this.root.hidden = !value;
  }

  /** Writes to the DOM only when a value actually changed; layout work dominates HUD cost. */
  private setText(index: number, element: HTMLElement, text: string): void {
    if (this.textCache[index] === text) return;
    this.textCache[index] = text;
    element.textContent = text;
  }

  private setHidden(index: number, element: HTMLElement, hidden: boolean): void {
    if (this.hiddenCache[index] === hidden) return;
    this.hiddenCache[index] = hidden;
    element.hidden = hidden;
  }

  update(sim: Simulation, renderer: SceneRenderer, squadX: number, endless = false): void {
    this.setText(
      LABEL_POOL,
      this.levelLabel,
      endless
        ? t('hud.distance', { distance: Math.round(sim.distance) })
        : t('hud.level', { n: sim.level.number }),
    );
    const progress = `scaleX(${sim.progress.toFixed(3)})`;
    if (progress !== this.lastProgress) {
      this.lastProgress = progress;
      this.progressFill.style.transform = progress;
    }
    if (sim.stats.coins !== this.lastCoins) {
      this.lastCoins = sim.stats.coins;
      this.coins.textContent = formatNumber(sim.stats.coins);
    }

    renderer.project(squadX, 2.1, SQUAD_Z, this.projected);
    this.squadBadge.style.transform = `translate3d(${this.projected.x.toFixed(1)}px, ${this.projected.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    if (sim.units !== this.lastUnits) {
      if (this.lastUnits >= 0) {
        this.squadBadge.classList.remove('bump-up', 'bump-down');
        void this.squadBadge.offsetWidth;
        this.squadBadge.classList.add(sim.units > this.lastUnits ? 'bump-up' : 'bump-down');
      }
      this.lastUnits = sim.units;
      this.squadBadge.textContent = formatCompact(sim.units);
    }

    let used = 0;
    let boss = null;
    for (const enemy of sim.enemies) {
      if (!enemy.alive) continue;
      if (enemy.kind === 'boss') boss = enemy;
      const labelled = enemy.kind === 'tank' || enemy.kind === 'miniboss' || enemy.kind === 'shield';
      if (!labelled || used >= LABEL_POOL || enemy.z < -70) continue;
      const label = this.labels[used++];
      if (!label) continue;
      renderer.project(enemy.x, enemy.radius * 2 + 0.9, enemy.z, this.projected);
      this.setHidden(used - 1, label, !this.projected.visible);
      label.style.transform = `translate3d(${this.projected.x.toFixed(1)}px, ${this.projected.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      this.setText(used - 1, label, formatCompact(Math.ceil(enemy.hp)));
    }
    for (let i = used; i < this.labels.length; i++) {
      const label = this.labels[i];
      if (label) this.setHidden(i, label, true);
    }

    if (this.bossBar.hidden !== (boss === null)) this.bossBar.hidden = boss === null;
    if (boss) this.bossFill.style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp).toFixed(4)})`;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}
