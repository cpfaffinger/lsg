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
  private readonly coinBox: HTMLDivElement;
  private readonly levelLabel: HTMLSpanElement;
  private readonly squadBadge: HTMLDivElement;
  private readonly bossBar: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly bossGhost: HTMLDivElement;
  private readonly screenFlash: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private ghostHp = 1;
  private shownUnits = 0;
  private lastCoinBump = 0;
  private readonly bossName: HTMLSpanElement;
  private readonly comboBox: HTMLDivElement;
  private readonly weaponBadge: HTMLDivElement;
  private lastWeapon = '';
  private lastCombo = 0;
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
    this.coinBox = el('div', 'hud-coins');
    this.coinBox.appendChild(el('span', 'coin-icon'));
    this.coins = el('span', 'hud-coins-value');
    this.coinBox.appendChild(this.coins);
    this.pauseButton = el('button', 'hud-pause interactive');
    this.pauseButton.type = 'button';
    this.pauseButton.textContent = '❚❚';
    top.append(this.levelLabel, progress, this.coinBox, this.pauseButton);

    this.bossBar = el('div', 'hud-boss');
    this.bossName = el('span', 'hud-boss-name');
    const bossTrack = el('div', 'hud-boss-track');
    this.bossGhost = el('div', 'hud-boss-ghost');
    this.bossFill = el('div', 'hud-boss-fill');
    bossTrack.append(this.bossGhost, this.bossFill);
    this.bossBar.append(this.bossName, bossTrack);
    this.bossBar.hidden = true;

    this.weaponBadge = el('div', 'hud-weapon');
    this.comboBox = el('div', 'hud-combo');
    this.comboBox.hidden = true;
    this.squadBadge = el('div', 'squad-badge');
    for (let i = 0; i < LABEL_POOL; i++) {
      const label = el('div', 'enemy-hp');
      label.hidden = true;
      this.labels.push(label);
      this.root.appendChild(label);
    }
    this.screenFlash = el('div', 'hud-flash');
    this.banner = el('div', 'hud-banner');
    this.root.append(
      this.screenFlash,
      top,
      this.bossBar,
      this.weaponBadge,
      this.comboBox,
      this.squadBadge,
      this.banner,
    );
    parent.appendChild(this.root);
    this.refreshTexts();
  }

  refreshTexts(): void {
    this.pauseButton.setAttribute('aria-label', t('hud.pause'));
    this.bossName.textContent = t('hud.boss');
  }

  /** Tints the screen edges for a moment: a gate result or a heavy loss. */
  flash(tone: 'good' | 'bad' | 'weapon'): void {
    this.screenFlash.dataset.tone = tone;
    this.restartAnimation(this.screenFlash, 'active');
  }

  /** Slams a big word onto the screen: a boss arrives or a new weapon is picked up. */
  announce(text: string, tone: 'boss' | 'weapon'): void {
    this.banner.textContent = text;
    this.banner.dataset.tone = tone;
    this.restartAnimation(this.banner, 'active');
  }

  private restartAnimation(element: HTMLElement, className: string): void {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
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

  /** Kill chain counter; pops on every milestone and fades out when the chain breaks. */
  private updateCombo(combo: number): void {
    if (combo === this.lastCombo) return;
    const previous = this.lastCombo;
    this.lastCombo = combo;
    if (combo < COMBO_MIN) {
      this.comboBox.classList.remove('active');
      return;
    }
    this.comboBox.hidden = false;
    this.comboBox.classList.add('active');
    this.comboBox.textContent = t('hud.combo', { n: formatNumber(combo) });
    if (Math.floor(combo / COMBO_MILESTONE) > Math.floor(previous / COMBO_MILESTONE)) {
      this.comboBox.classList.remove('milestone');
      void this.comboBox.offsetWidth;
      this.comboBox.classList.add('milestone');
    }
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
      const now = performance.now();
      if (now - this.lastCoinBump > COIN_BUMP_MS) {
        this.lastCoinBump = now;
        this.restartAnimation(this.coinBox, 'bump');
      }
    }

    this.updateCombo(sim.combo);
    if (sim.weapon !== this.lastWeapon) {
      this.lastWeapon = sim.weapon;
      this.weaponBadge.textContent = t(`weapon.${sim.weapon}`);
      this.weaponBadge.dataset.weapon = sim.weapon;
      this.weaponBadge.classList.remove('changed');
      void this.weaponBadge.offsetWidth;
      this.weaponBadge.classList.add('changed');
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
    }
    // The counter runs up to the new size, which sells a big gate better than a jump.
    if (this.shownUnits !== sim.units) {
      const step = (sim.units - this.shownUnits) * COUNT_RATE;
      this.shownUnits = Math.abs(step) < 1 ? sim.units : Math.round(this.shownUnits + step);
      this.setText(LABEL_POOL + 1, this.squadBadge, formatCompact(this.shownUnits));
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
    if (boss) {
      const hp = Math.max(0, boss.hp / boss.maxHp);
      this.ghostHp = Math.max(hp, this.ghostHp + (hp - this.ghostHp) * GHOST_RATE);
      this.bossFill.style.transform = `scaleX(${hp.toFixed(4)})`;
      this.bossGhost.style.transform = `scaleX(${this.ghostHp.toFixed(4)})`;
    } else {
      this.ghostHp = 1;
    }
  }
}

const COMBO_MIN = 5;
const COMBO_MILESTONE = 25;
const COIN_BUMP_MS = 140;
/** Share of the remaining difference the squad counter and the boss ghost bar cover per frame. */
const COUNT_RATE = 0.22;
const GHOST_RATE = 0.05;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}
