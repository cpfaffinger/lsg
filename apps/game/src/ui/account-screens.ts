import { t } from '../i18n/i18n.ts';
import type { AccountService } from '../net/account-service.ts';
import { button, h } from './dom.ts';

/** Account overlay: sign-in when signed out, profile and sync controls when signed in. */
export function buildAccountPanel(
  account: AccountService,
  handlers: { close: () => void; rerender: () => void },
): HTMLElement {
  const body = h('div', { class: 'account-body' });
  const actions: HTMLElement[] = [];
  if (!account.user) {
    if (account.config?.maintenanceMode)
      body.append(h('p', { class: 'screen-subtitle', text: t('account.maintenance') }));
    else if (!account.signInAvailable)
      body.append(h('p', { class: 'screen-subtitle', text: t('account.unavailable') }));
    else {
      body.append(
        h('p', { class: 'screen-subtitle', text: t('account.signedOutText') }),
        h('p', { class: 'menu-note', text: t('account.guestNote') }),
      );
      const signIn = button('', () => account.signIn(), 'btn google');
      signIn.append(
        h('span', { class: 'google-mark', attrs: { 'aria-hidden': 'true' } }, 'G'),
        t('account.signInGoogle'),
      );
      actions.push(signIn);
    }
  } else {
    const user = account.user;
    const avatar = user.avatarUrl
      ? h('img', { class: 'avatar', attrs: { src: user.avatarUrl, alt: '', referrerpolicy: 'no-referrer' } })
      : h('div', {
          class: 'avatar placeholder',
          text: (user.displayName ?? user.email ?? '?').slice(0, 1).toUpperCase(),
        });
    body.append(
      h(
        'div',
        { class: 'profile' },
        avatar,
        h(
          'div',
          {},
          h('div', { class: 'muted-label', text: t('account.signedInAs') }),
          h('div', { class: 'profile-name', text: user.displayName ?? user.email ?? '' }),
          user.email && user.displayName ? h('div', { class: 'menu-note left', text: user.email }) : null,
        ),
      ),
      h(
        'div',
        { class: `sync-status ${account.status}` },
        h('span', { class: 'muted-label', text: t('account.syncStatus') }),
        h('span', { text: t(`account.status.${account.status}`) }),
      ),
    );
    if (account.lastSyncAt) {
      body.append(
        h('p', {
          class: 'menu-note left',
          text: t('account.lastSync', { time: new Date(account.lastSyncAt).toLocaleString() }),
        }),
      );
    }
    actions.push(
      button(t('account.syncNow'), () => void account.sync().then(handlers.rerender), 'btn primary'),
      button(t('account.export'), () => window.open(account.exportUrl(), '_blank', 'noopener')),
      button(t('account.signOut'), () => void account.signOut().then(handlers.rerender)),
      button(
        t('account.delete'),
        () => {
          if (!window.confirm(t('account.deleteConfirm'))) return;
          void account.deleteAccount().then((ok) => {
            if (ok) window.alert(t('account.deleted'));
            handlers.rerender();
          });
        },
        'btn danger',
      ),
    );
    body.append(h('p', { class: 'menu-note left', text: t('account.signOutNote') }));
  }
  actions.push(button(t('menu.back'), handlers.close));
  const links = h(
    'div',
    { class: 'legal-links' },
    h('a', { attrs: { href: '#privacy' }, text: t('legal.privacy') }),
    h('a', { attrs: { href: '#imprint' }, text: t('legal.imprint') }),
  );
  return h(
    'div',
    { class: 'screen-panel interactive account-panel', attrs: { role: 'dialog', 'aria-modal': 'true' } },
    h('h1', { text: t('account.title') }),
    body,
    h('div', { class: 'screen-actions' }, ...actions),
    links,
  );
}

/** Plain-text legal document (imprint, privacy policy, credits) in a scrollable panel. */
export function buildLegalPanel(title: string, text: string | null, onClose: () => void): HTMLElement {
  const content = h('div', { class: 'legal-text' });
  for (const paragraph of (text ?? t('legal.offline')).split(/\n{2,}/)) {
    const lines = paragraph.split('\n');
    const p = h('p');
    lines.forEach((line, i) => {
      if (i > 0) p.append(h('br'));
      p.append(line);
    });
    content.append(p);
  }
  return h(
    'div',
    { class: 'screen-panel interactive legal-panel', attrs: { role: 'dialog', 'aria-modal': 'true' } },
    h('h1', { text: title }),
    content,
    h('div', { class: 'screen-actions' }, button(t('legal.close'), onClose, 'btn primary')),
  );
}
