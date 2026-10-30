import type { AdminMe } from '@lsg/shared';
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError, onUnauthorized } from './api.ts';
import { AccountPage } from './pages/account.tsx';
import { DashboardPage } from './pages/dashboard.tsx';
import { GooglePage } from './pages/google.tsx';
import { ChangePasswordPage, LoginPage } from './pages/login.tsx';
import { PlayersPage } from './pages/players.tsx';
import { SettingsPage } from './pages/settings.tsx';
import { AuditPage, BackupsPage, StatsPage } from './pages/stats.tsx';

const ROUTES = [
  { path: '/', label: 'Dashboard' },
  { path: '/google', label: 'Google sign-in' },
  { path: '/settings', label: 'Settings' },
  { path: '/players', label: 'Players' },
  { path: '/stats', label: 'Statistics' },
  { path: '/backups', label: 'Backups' },
  { path: '/audit', label: 'Audit log' },
  { path: '/account', label: 'Account' },
] as const;

function parseHash(): { path: string; query: URLSearchParams } {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path = '/', query = ''] = raw.split('?');
  return { path, query: new URLSearchParams(query) };
}

export function App() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [checked, setChecked] = useState(false);
  const [route, setRoute] = useState(parseHash());
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshMe = async () => {
    try {
      setMe(await api<AdminMe>('GET', '/api/admin/me'));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) console.error(error);
      setMe(null);
    } finally {
      setChecked(true);
    }
  };

  useEffect(() => {
    void refreshMe();
    const onHash = () => {
      setRoute(parseHash());
      setMenuOpen(false);
    };
    window.addEventListener('hashchange', onHash);
    const off = onUnauthorized(() => setMe(null));
    return () => {
      window.removeEventListener('hashchange', onHash);
      off();
    };
  }, []);

  if (!checked) return <p class="muted center">Loading…</p>;
  if (!me) return <LoginPage onLogin={(next) => setMe(next)} />;

  const logout = async () => {
    await api('POST', '/api/admin/logout').catch(() => undefined);
    setMe(null);
  };

  let page;
  if (me.mustChangePassword) {
    page = <ChangePasswordPage forced onDone={() => void refreshMe()} />;
  } else {
    switch (route.path) {
      case '/google':
        page = <GooglePage query={route.query} />;
        break;
      case '/settings':
        page = <SettingsPage />;
        break;
      case '/players':
        page = <PlayersPage />;
        break;
      case '/stats':
        page = <StatsPage />;
        break;
      case '/backups':
        page = <BackupsPage />;
        break;
      case '/audit':
        page = <AuditPage />;
        break;
      case '/account':
        page = <AccountPage me={me} onChanged={() => void refreshMe()} />;
        break;
      default:
        page = <DashboardPage />;
    }
  }
  const title = ROUTES.find((r) => r.path === route.path)?.label ?? 'Dashboard';

  return (
    <div class={`layout ${menuOpen ? 'menu-open' : ''}`}>
      <aside class="sidebar">
        <div class="brand">LSG Admin</div>
        <nav>
          {ROUTES.map((r) => (
            <a key={r.path} href={`#${r.path}`} class={route.path === r.path ? 'active' : ''}>
              {r.label}
            </a>
          ))}
        </nav>
        <div class="sidebar-footer">
          <span class="muted small">Signed in as {me.username}</span>
          <button class="btn small ghost" onClick={() => void logout()}>
            Sign out
          </button>
          <a class="muted small" href="/" target="_blank" rel="noreferrer">
            Open game ↗
          </a>
        </div>
      </aside>
      <main class="content">
        <header class="topbar">
          <button
            class="btn small ghost menu-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            ☰
          </button>
          <h1>{me.mustChangePassword ? 'Change password' : title}</h1>
        </header>
        {page}
      </main>
    </div>
  );
}
