import './styles.css';
import './styles/menus.css';
import { Game } from './game.ts';
import { initLocale, t } from './i18n/i18n.ts';
import { AccountService } from './net/account-service.ts';
import { buildAccountPanel, buildLegalPanel } from './ui/account-screens.ts';
import { button, h } from './ui/dom.ts';
import { showToast } from './ui/toast.ts';

async function boot(): Promise<void> {
  await initLocale();
  const canvas = document.querySelector<HTMLCanvasElement>('#scene');
  const ui = document.querySelector<HTMLDivElement>('#ui');
  if (!canvas || !ui) throw new Error('Missing #scene or #ui element');
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('viewer')) {
    const { startModelViewer } = await import('./dev/model-viewer.ts');
    await startModelViewer(canvas);
    return;
  }

  const game = new Game(canvas, ui);
  await game.init();
  const account = new AccountService(game.progress);
  wireAccount(game, account, ui);
  game.start();
  // Config and session load in the background; the game never waits for the server.
  void account.init().then(() => {
    if (account.loginResult) {
      const ok = account.loginResult === 'ok';
      const key = ['ok', 'cancelled', 'banned', 'unavailable'].includes(account.loginResult)
        ? account.loginResult
        : 'error';
      showToast(ui, t(`account.loginResult.${key}`), ok ? 'ok' : 'bad');
    }
    game.closeOverlayIfMenu();
  });

  if (import.meta.env.DEV) {
    const { STRESS_LEVEL } = await import('./data/levels/stress.ts');
    Object.assign(window, { lsg: game, lsgAccount: account, lsgLevels: { stress: STRESS_LEVEL } });
  }
}

function wireAccount(game: Game, account: AccountService, ui: HTMLElement): void {
  const openAccount = () => {
    const render = () =>
      game.showOverlay(buildAccountPanel(account, { close: () => game.closeOverlay(), rerender: render }));
    render();
  };
  game.accountButton = {
    label: () => {
      if (account.user) return account.user.displayName ?? account.user.email ?? t('account.title');
      return account.signInAvailable ? t('account.signIn') : null;
    },
    open: openAccount,
  };
  game.announcement = () => account.config?.announcement ?? null;
  game.settingsExtra = () =>
    h(
      'div',
      {},
      h('h2', { text: t('account.title') }),
      button(
        account.user ? (account.user.displayName ?? t('account.title')) : t('account.signIn'),
        openAccount,
        'btn',
      ),
      h(
        'div',
        { class: 'legal-links left' },
        h('a', { attrs: { href: '#privacy' }, text: t('legal.privacy') }),
        h('a', { attrs: { href: '#imprint' }, text: t('legal.imprint') }),
        h('a', { attrs: { href: '#credits' }, text: t('legal.credits') }),
      ),
    );
  account.subscribe(() => {
    if (game.inMenu) game.closeOverlayIfMenu();
  });

  // Legal pages are reachable by link (#privacy is also the URL given to Google).
  const showLegalFromHash = async () => {
    const page = location.hash.replace(/^#/, '');
    if (page !== 'privacy' && page !== 'imprint' && page !== 'credits') return;
    const close = () => {
      history.replaceState(null, '', location.pathname + location.search);
      game.closeOverlay();
    };
    if (page === 'credits') {
      game.showOverlay(buildLegalPanel(t('legal.credits'), t('legal.creditsText'), close));
      return;
    }
    const legal = await account.loadLegal();
    game.showOverlay(buildLegalPanel(t(`legal.${page}`), legal ? legal[page] : null, close));
  };
  window.addEventListener('hashchange', () => void showLegalFromHash());
  window.setTimeout(() => void showLegalFromHash(), 0);
  void ui;
}

boot().catch((error: unknown) => {
  console.error(error);
  document.body.textContent = 'LSG failed to start. Please reload the page.';
});
