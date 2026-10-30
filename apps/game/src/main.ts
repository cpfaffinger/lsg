import './styles.css';
import './styles/menus.css';
import { Game } from './game.ts';
import { initLocale, t } from './i18n/i18n.ts';
import { AccountService } from './net/account-service.ts';
import { buildAccountPanel, buildLegalPanel } from './ui/account-screens.ts';
import { button, h } from './ui/dom.ts';
import { showToast } from './ui/toast.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

interface CreditEntry {
  name: string;
  authors: string[];
  usedFor: string;
  source: string;
}

let installPrompt: BeforeInstallPromptEvent | null = null;

function hideBootScreen(): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('done');
  window.setTimeout(() => boot.remove(), 500);
}

function supportsWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  await initLocale();
  const canvas = document.querySelector<HTMLCanvasElement>('#scene');
  const ui = document.querySelector<HTMLDivElement>('#ui');
  if (!canvas || !ui) throw new Error('Missing #scene or #ui element');
  if (!supportsWebGL2()) throw new Error('WebGL 2 is not available');
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('viewer')) {
    const { startModelViewer } = await import('./dev/model-viewer.ts');
    hideBootScreen();
    await startModelViewer(canvas);
    return;
  }

  const game = new Game(canvas, ui);
  await game.init();
  const account = new AccountService(game.progress);
  wireAccount(game, account, ui);
  game.start();
  hideBootScreen();
  registerServiceWorker(ui);
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

/** Offline support: precached app shell, "update available" toast, "ready offline" toast. */
function registerServiceWorker(ui: HTMLElement): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({
      onNeedRefresh() {
        const toast = h(
          'div',
          { class: 'toast info update-toast', attrs: { role: 'status' } },
          t('app.updateAvailable'),
        );
        toast.append(button(t('app.update'), () => void update(true), 'btn small primary'));
        ui.append(toast);
      },
      onOfflineReady() {
        showToast(ui, t('app.offlineReady'), 'ok');
      },
    });
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as BeforeInstallPromptEvent;
  });
}

async function loadCredits(): Promise<string> {
  let text = t('legal.creditsText');
  try {
    const response = await fetch('/media/credits.json');
    const entries = (await response.json()) as CreditEntry[];
    text += `\n\n${t('legal.assetsHeading')}\n`;
    text += entries
      .map(
        (e) =>
          `• ${t('legal.assetLine', { name: e.name, authors: e.authors.join(', '), usedFor: e.usedFor })}\n  ${e.source}`,
      )
      .join('\n');
  } catch {
    // Offline before the credits were cached: the general text is enough.
  }
  return text;
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
  game.settingsExtra = () => {
    const appSection = h('div', { class: 'settings-buttons' });
    if (document.fullscreenEnabled) {
      appSection.append(
        button(
          t('settings.fullscreen'),
          () => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else
              void document.documentElement
                .requestFullscreen({ navigationUI: 'hide' })
                .catch(() => undefined);
          },
          'btn',
        ),
      );
    }
    if (installPrompt) {
      appSection.append(
        button(
          t('app.install'),
          () => {
            void installPrompt?.prompt();
            installPrompt = null;
          },
          'btn',
        ),
      );
    }
    return h(
      'div',
      {},
      appSection.childElementCount > 0 ? h('h2', { text: t('settings.app') }) : null,
      appSection.childElementCount > 0 ? appSection : null,
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
  };
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
      game.showOverlay(buildLegalPanel(t('legal.credits'), await loadCredits(), close));
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
  hideBootScreen();
  const message = document.createElement('div');
  message.className = 'fatal-error';
  message.textContent = String(error).includes('WebGL')
    ? 'LSG needs a browser with WebGL 2 (current Chrome, Edge, Firefox or Safari).'
    : 'LSG failed to start. Please reload the page.';
  document.body.replaceChildren(message);
});
