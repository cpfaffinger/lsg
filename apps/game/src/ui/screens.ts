import { SUPPORTED_LOCALES, UPGRADE_IDS, type Locale, type SaveData, type UpgradeId } from '@lsg/shared';
import type { QualityLevel } from '../core/quality.ts';
import type { Settings } from '../core/settings.ts';
import { formatNumber, t } from '../i18n/i18n.ts';
import { COSMETICS } from '../meta/cosmetics.ts';
import { UPGRADES, upgradeCost, type RunReward } from '../meta/economy.ts';
import type { WorldId } from '../sim/level.ts';
import type { RunStats } from '../sim/types.ts';
import { button, h, hexColor } from './dom.ts';

export interface LevelTile {
  number: number;
  world: WorldId;
  finale: 'none' | 'miniboss' | 'boss';
  unlocked: boolean;
  stars: number;
}

export interface MenuModel {
  save: SaveData;
  stars: number;
  nextLevel: number;
  campaignComplete: boolean;
}

export interface MenuHandlers {
  play: (level: number) => void;
  endless: () => void;
  levels: () => void;
  shop: () => void;
  settings: () => void;
  account?: (() => void) | null;
  accountLabel?: string | null;
}

const WORLDS: WorldId[] = ['desert', 'city', 'station'];

function coinBadge(coins: number): HTMLElement {
  return h(
    'div',
    { class: 'stat-pill', attrs: { 'aria-label': t('result.coins') } },
    h('span', { class: 'coin-icon' }),
    formatNumber(coins),
  );
}

function starBadge(stars: number): HTMLElement {
  return h(
    'div',
    { class: 'stat-pill', attrs: { 'aria-label': t('menu.stars', { count: stars }) } },
    h('span', { class: 'star-icon' }),
    formatNumber(stars),
  );
}

function starRow(count: number, max = 3, animate = false): HTMLElement {
  const row = h('div', { class: animate ? 'star-row big' : 'star-row' });
  for (let i = 0; i < max; i++) {
    const star = h('span', { class: i < count ? 'star filled' : 'star' });
    if (animate && i < count) star.style.animationDelay = `${0.25 + i * 0.3}s`;
    row.append(star);
  }
  return row;
}

/** Full-screen DOM overlays: menus, pause, results, settings. */
export class Screens {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'screen-layer' });
    parent.appendChild(this.root);
  }

  hide(): void {
    this.root.replaceChildren();
    this.root.classList.remove('active', 'dim');
  }

  get visible(): boolean {
    return this.root.classList.contains('active');
  }

  private show(content: HTMLElement, dim = true): void {
    this.root.replaceChildren(content);
    this.root.classList.add('active');
    this.root.classList.toggle('dim', dim);
    content.querySelector<HTMLButtonElement>('button.primary')?.focus({ preventScroll: true });
  }

  private page(
    title: string,
    onBack: () => void,
    model: MenuModel | null,
    ...body: HTMLElement[]
  ): HTMLElement {
    const header = h(
      'div',
      { class: 'page-header' },
      button(`← ${t('menu.back')}`, onBack, 'btn ghost'),
      h('h1', { text: title }),
      model
        ? h('div', { class: 'page-stats' }, starBadge(model.stars), coinBadge(model.save.coins))
        : h('div'),
    );
    return h('div', { class: 'page interactive' }, header, h('div', { class: 'page-body' }, ...body));
  }

  private panel(
    title: string,
    subtitle: string | null,
    body: HTMLElement | null,
    actions: HTMLElement[],
  ): HTMLElement {
    return h(
      'div',
      { class: 'screen-panel interactive', attrs: { role: 'dialog', 'aria-modal': 'true' } },
      h('h1', { text: title }),
      subtitle ? h('p', { class: 'screen-subtitle', text: subtitle }) : null,
      body,
      h('div', { class: 'screen-actions' }, ...actions),
    );
  }

  showMainMenu(model: MenuModel, handlers: MenuHandlers): void {
    const playLabel = model.campaignComplete
      ? t('menu.replayFinal', { n: model.nextLevel })
      : t('menu.playLevel', { n: model.nextLevel });
    const top = h(
      'div',
      { class: 'menu-top interactive' },
      handlers.account
        ? button(handlers.accountLabel ?? '', handlers.account, 'btn ghost small account-btn')
        : h('div'),
      h('div', { class: 'page-stats' }, starBadge(model.stars), coinBadge(model.save.coins)),
    );
    const content = h(
      'div',
      { class: 'title-screen' },
      top,
      h('div', { class: 'logo', text: t('app.title') }),
      h('div', { class: 'tagline', text: t('app.tagline') }),
      button(playLabel, () => handlers.play(model.nextLevel), 'btn primary big interactive'),
      h(
        'div',
        { class: 'menu-grid interactive' },
        button(t('menu.levels'), handlers.levels, 'btn tile'),
        button(t('menu.shop'), handlers.shop, 'btn tile'),
        button(t('menu.endless'), handlers.endless, 'btn tile'),
        button(t('menu.settings'), handlers.settings, 'btn tile'),
      ),
      model.save.endlessBest > 0
        ? h('div', {
            class: 'menu-note',
            text: t('menu.endlessBest', { distance: formatNumber(model.save.endlessBest) }),
          })
        : null,
      model.campaignComplete ? h('div', { class: 'menu-note', text: t('menu.campaignComplete') }) : null,
      h('div', { class: 'start-hint', text: t('app.controlsHint') }),
    );
    this.show(content, false);
  }

  showLevels(model: MenuModel, tiles: LevelTile[], onPlay: (n: number) => void, onBack: () => void): void {
    const sections = WORLDS.map((world) => {
      const grid = h('div', { class: 'level-grid' });
      for (const tile of tiles.filter((x) => x.world === world)) {
        const label =
          tile.finale === 'boss'
            ? t('levels.boss')
            : tile.finale === 'miniboss'
              ? t('levels.miniboss')
              : null;
        const el = h(
          'button',
          {
            class: `level-tile ${tile.unlocked ? '' : 'locked'} ${tile.finale !== 'none' ? 'finale' : ''}`,
            attrs: {
              'aria-label': `${t('levels.level', { n: tile.number })}${tile.unlocked ? '' : `, ${t('levels.locked')}`}`,
            },
            on: { click: () => tile.unlocked && onPlay(tile.number) },
          },
          h('span', { class: 'level-number', text: String(tile.number) }),
          label ? h('span', { class: 'level-tag', text: label }) : null,
          tile.unlocked ? starRow(tile.stars) : h('span', { class: 'lock-icon', text: '\u{1F512}' }),
        );
        (el as HTMLButtonElement).type = 'button';
        (el as HTMLButtonElement).disabled = !tile.unlocked;
        grid.append(el);
      }
      return h(
        'section',
        { class: `world-section world-${world}` },
        h('h2', { text: t(`worlds.${world}`) }),
        grid,
      );
    });
    this.show(this.page(t('levels.title'), onBack, model, ...sections));
  }

  showShop(
    model: MenuModel,
    tab: 'upgrades' | 'skins',
    handlers: {
      buyUpgrade: (id: UpgradeId) => void;
      buySkin: (id: string) => void;
      selectSkin: (id: string) => void;
      tab: (tab: 'upgrades' | 'skins') => void;
      back: () => void;
    },
  ): void {
    const tabs = h(
      'div',
      { class: 'tabs', attrs: { role: 'tablist' } },
      button(t('shop.upgrades'), () => handlers.tab('upgrades'), `tab ${tab === 'upgrades' ? 'active' : ''}`),
      button(t('shop.skins'), () => handlers.tab('skins'), `tab ${tab === 'skins' ? 'active' : ''}`),
    );
    let body: HTMLElement;
    if (tab === 'upgrades') {
      body = h('div', { class: 'shop-list' });
      for (const id of UPGRADE_IDS) {
        const def = UPGRADES[id];
        const level = model.save.upgrades[id];
        const cost = upgradeCost(id, level);
        const affordable = cost !== null && model.save.coins >= cost;
        const buy =
          cost === null
            ? h('span', { class: 'maxed', text: t('shop.maxed') })
            : button('', () => handlers.buyUpgrade(id), `btn buy ${affordable ? 'primary' : ''}`);
        if (buy instanceof HTMLButtonElement) {
          buy.append(h('span', { class: 'coin-icon' }), formatNumber(cost ?? 0));
          buy.disabled = !affordable;
          buy.setAttribute(
            'aria-label',
            `${t('shop.buy')} ${t(`upgrade.${id}.name`)} ${formatNumber(cost ?? 0)}`,
          );
        }
        const progress = h('div', { class: 'upgrade-progress' });
        progress.append(
          h('div', { class: 'upgrade-progress-fill', style: { width: `${(level / def.maxLevel) * 100}%` } }),
        );
        body.append(
          h(
            'div',
            { class: 'shop-row' },
            h('div', { class: `upgrade-icon upgrade-${id}` }),
            h(
              'div',
              { class: 'shop-info' },
              h('div', { class: 'shop-name', text: t(`upgrade.${id}.name`) }),
              h('div', { class: 'shop-effect', text: t(`upgrade.${id}.effect`, { value: def.perLevel }) }),
              progress,
              h('div', { class: 'shop-level', text: t('shop.level', { level, max: def.maxLevel }) }),
            ),
            buy,
          ),
        );
      }
    } else {
      body = h('div', { class: 'skin-grid' });
      for (const skin of COSMETICS) {
        const owned = model.save.cosmetics.owned.includes(skin.id);
        const selected = model.save.cosmetics.selected === skin.id;
        const byStars = skin.starsRequired !== null && skin.starsRequired > 0;
        let action: HTMLElement;
        if (selected) action = h('span', { class: 'skin-state', text: t('shop.selected') });
        else if (owned) action = button(t('shop.select'), () => handlers.selectSkin(skin.id), 'btn small');
        else if (byStars) {
          const ok = model.stars >= (skin.starsRequired ?? 0);
          const b = button(
            t('shop.unlockStars', { count: skin.starsRequired ?? 0 }),
            () => handlers.buySkin(skin.id),
            `btn small ${ok ? 'primary' : ''}`,
          );
          b.disabled = !ok;
          action = b;
        } else {
          const ok = model.save.coins >= skin.cost;
          const b = button('', () => handlers.buySkin(skin.id), `btn small ${ok ? 'primary' : ''}`);
          b.append(h('span', { class: 'coin-icon' }), formatNumber(skin.cost));
          b.disabled = !ok;
          action = b;
        }
        body.append(
          h(
            'div',
            { class: `skin-card ${selected ? 'selected' : ''}` },
            h('div', {
              class: 'skin-swatch',
              style: {
                background: `linear-gradient(135deg, ${hexColor(skin.body)} 55%, ${hexColor(skin.accent)} 55%)`,
              },
            }),
            h('div', { class: 'shop-name', text: t(`skin.${skin.id}`) }),
            action,
          ),
        );
      }
    }
    this.show(
      this.page(
        t('shop.title'),
        handlers.back,
        model,
        tabs,
        body,
        h('p', { class: 'menu-note', text: t('shop.coinsOnly') }),
      ),
    );
  }

  showSettings(
    settings: Settings,
    handlers: {
      change: (patch: Partial<Settings>) => void;
      reset: () => void;
      back: () => void;
      extra?: HTMLElement | null;
    },
  ): void {
    const slider = (label: string, value: number, onInput: (v: number) => void) => {
      const input = h('input', {
        attrs: { type: 'range', min: '0', max: '100', step: '1', 'aria-label': label },
      });
      input.value = String(Math.round(value * 100));
      input.addEventListener('input', () => onInput(Number(input.value) / 100));
      return h('label', { class: 'setting-row' }, h('span', { text: label }), input);
    };
    const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => {
      const input = h('input', { attrs: { type: 'checkbox' } });
      input.checked = value;
      input.addEventListener('change', () => onChange(input.checked));
      return h('label', { class: 'setting-row toggle' }, h('span', { text: label }), input);
    };
    const select = <T extends string>(
      label: string,
      value: T,
      options: { value: T; label: string }[],
      onChange: (v: T) => void,
    ) => {
      const el = h('select', { attrs: { 'aria-label': label } });
      for (const option of options) {
        const opt = h('option', { text: option.label });
        opt.value = option.value;
        opt.selected = option.value === value;
        el.append(opt);
      }
      el.addEventListener('change', () => onChange(el.value as T));
      return h('label', { class: 'setting-row' }, h('span', { text: label }), el);
    };
    const qualityOptions: { value: QualityLevel | 'auto'; label: string }[] = [
      { value: 'auto', label: t('settings.qualityAuto') },
      ...(['low', 'medium', 'high', 'ultra'] as QualityLevel[]).map((q) => ({
        value: q,
        label: t(`quality.${q}`),
      })),
    ];
    const languageOptions = SUPPORTED_LOCALES.map((l) => ({ value: l, label: t(`language.${l}`) }));
    const resetButton = button(
      t('settings.resetProgress'),
      () => {
        if (window.confirm(t('settings.resetConfirm'))) handlers.reset();
      },
      'btn danger',
    );
    const body = h(
      'div',
      { class: 'settings' },
      h('h2', { text: t('settings.audio') }),
      slider(t('settings.master'), settings.masterVolume, (v) => handlers.change({ masterVolume: v })),
      slider(t('settings.music'), settings.musicVolume, (v) => handlers.change({ musicVolume: v })),
      slider(t('settings.sfx'), settings.sfxVolume, (v) => handlers.change({ sfxVolume: v })),
      toggle(t('settings.mute'), settings.muted, (v) => handlers.change({ muted: v })),
      h('h2', { text: t('settings.graphics') }),
      select(t('settings.quality'), settings.quality, qualityOptions, (v) => handlers.change({ quality: v })),
      toggle(t('settings.showFps'), settings.showFps, (v) => handlers.change({ showFps: v })),
      h('h2', { text: t('settings.language') }),
      select<Locale>(t('settings.language'), (settings.locale ?? 'en') as Locale, languageOptions, (v) =>
        handlers.change({ locale: v }),
      ),
      h('h2', { text: t('settings.accessibility') }),
      toggle(t('settings.reducedMotion'), settings.reducedMotion, (v) =>
        handlers.change({ reducedMotion: v }),
      ),
      toggle(t('settings.colorblind'), settings.colorblind, (v) => handlers.change({ colorblind: v })),
      toggle(t('settings.haptics'), settings.haptics, (v) => handlers.change({ haptics: v })),
      handlers.extra ?? null,
      h('h2', { text: t('settings.data') }),
      resetButton,
    );
    this.show(this.page(t('settings.title'), handlers.back, null, body));
  }

  showPause(handlers: { resume: () => void; restart: () => void; quit: () => void }): void {
    this.show(
      this.panel(t('pause.title'), null, null, [
        button(t('pause.resume'), handlers.resume, 'btn primary'),
        button(t('pause.restart'), handlers.restart),
        button(t('pause.quit'), handlers.quit),
      ]),
    );
  }

  showCampaignResult(
    won: boolean,
    stats: RunStats,
    finalUnits: number,
    reward: RunReward,
    handlers: { next: (() => void) | null; retry: () => void; menu: () => void },
  ): void {
    const rows: [string, string][] = [
      [t('result.kills'), formatNumber(stats.kills)],
      [t('result.peakSquad'), formatNumber(stats.peakUnits)],
    ];
    if (won) rows.push([t('result.finalSquad'), formatNumber(finalUnits)]);
    const statList = h('dl', { class: 'result-stats' });
    for (const [label, value] of rows) statList.append(h('dt', { text: label }), h('dd', { text: value }));
    const coinList = h('dl', { class: 'result-stats coins' });
    const coinRows: [string, number][] = [[t('result.coinsKills'), reward.coinsFromKills]];
    if (reward.completionBonus > 0) coinRows.push([t('result.coinsCompletion'), reward.completionBonus]);
    if (reward.starBonus > 0) coinRows.push([t('result.coinsStars'), reward.starBonus]);
    for (const [label, value] of coinRows) {
      coinList.append(
        h('dt', { text: label }),
        h('dd', {}, h('span', { class: 'coin-icon' }), `+${formatNumber(value)}`),
      );
    }
    coinList.append(
      h('dt', { class: 'total', text: t('result.total') }),
      h('dd', { class: 'total' }, h('span', { class: 'coin-icon' }), `+${formatNumber(reward.total)}`),
    );
    const body = h(
      'div',
      { class: 'result-body' },
      won ? starRow(reward.stars, 3, true) : null,
      statList,
      coinList,
      won ? null : h('p', { class: 'menu-note', text: t('result.upgradeHint') }),
    );
    const actions: HTMLElement[] = [];
    if (won && handlers.next) actions.push(button(t('result.next'), handlers.next, 'btn primary'));
    actions.push(
      button(
        won ? t('result.playAgain') : t('result.retry'),
        handlers.retry,
        won && handlers.next ? 'btn' : 'btn primary',
      ),
    );
    actions.push(button(t('result.menu'), handlers.menu));
    this.show(
      this.panel(
        won ? t('result.wonTitle') : t('result.lostTitle'),
        won ? t('result.wonSubtitle') : t('result.lostSubtitle'),
        body,
        actions,
      ),
    );
  }

  showEndlessResult(
    distance: number,
    stats: RunStats,
    coins: number,
    newBest: boolean,
    handlers: { retry: () => void; menu: () => void },
  ): void {
    const list = h('dl', { class: 'result-stats' });
    const rows: [string, string][] = [
      [t('result.kills'), formatNumber(stats.kills)],
      [t('result.peakSquad'), formatNumber(stats.peakUnits)],
      [t('result.coins'), formatNumber(coins)],
    ];
    for (const [label, value] of rows) list.append(h('dt', { text: label }), h('dd', { text: value }));
    const body = h(
      'div',
      { class: 'result-body' },
      newBest ? h('div', { class: 'new-best', text: t('result.newBest') }) : null,
      list,
    );
    this.show(
      this.panel(
        t('result.endlessTitle'),
        t('result.endlessSubtitle', { distance: formatNumber(Math.round(distance)) }),
        body,
        [button(t('result.retry'), handlers.retry, 'btn primary'), button(t('result.menu'), handlers.menu)],
      ),
    );
  }

  showUnlock(feature: string, onContinue: () => void): void {
    this.show(
      this.panel(t('unlock.title'), t(`unlock.${feature}`), null, [
        button(t('pause.resume'), onContinue, 'btn primary'),
      ]),
    );
  }
}
