import type { AdminOverview } from '@lsg/shared';
import { useEffect, useState } from 'preact/hooks';
import { api, errorMessage, formatBytes, formatDate, formatDuration } from '../api.ts';
import { Badge, Card, Notice } from '../components.tsx';

const WARNINGS: Record<string, { text: string; link: string; action: string }> = {
  public_url_not_set: {
    text: 'The public address of the game is not set. Google sign-in and secure cookies depend on it.',
    link: '#/settings',
    action: 'Set public URL',
  },
  public_url_not_https: {
    text: 'The public address does not use HTTPS. Google sign-in requires HTTPS (TLS is terminated by your proxy, e.g. Cloudflare).',
    link: '#/settings',
    action: 'Check public URL',
  },
  localhost_only: {
    text: 'The public address points to localhost. Players on other devices cannot sign in.',
    link: '#/settings',
    action: 'Set public URL',
  },
  google_inactive: {
    text: 'Google sign-in is not active. Players can still play as guests.',
    link: '#/google',
    action: 'Open setup assistant',
  },
  maintenance_mode: {
    text: 'Maintenance mode is on: new sign-ins are blocked.',
    link: '#/settings',
    action: 'Game settings',
  },
  no_backup: { text: 'No database backup exists yet.', link: '#/backups', action: 'Create backup' },
};

export function DashboardPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminOverview>('GET', '/api/admin/overview').then(setData, (e: unknown) => setError(errorMessage(e)));
  }, []);

  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <p class="muted">Loading…</p>;

  return (
    <div class="stack">
      {data.warnings.length > 0 && (
        <Card title="Needs attention" tone="warn">
          <ul class="warning-list">
            {data.warnings.map((w) => {
              const info = WARNINGS[w] ?? { text: w, link: '#/', action: 'Open' };
              return (
                <li key={w}>
                  <span>{info.text}</span>
                  <a class="btn small" href={info.link}>
                    {info.action}
                  </a>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <div class="grid">
        <Card title="Players">
          <div class="kpis">
            <Kpi label="Accounts" value={data.users.users} />
            <Kpi label="Active today" value={data.users.activeToday} />
            <Kpi label="Active 7 days" value={data.users.activeWeek} />
            <Kpi label="New 7 days" value={data.users.newWeek} />
          </div>
        </Card>
        <Card title="Sign-in">
          <p>
            Google sign-in:{' '}
            {data.google.active ? <Badge tone="ok">active</Badge> : <Badge tone="warn">inactive</Badge>}
          </p>
          <p class="muted small">
            Public URL: <code>{data.publicUrl.url}</code> ({data.publicUrl.source})
          </p>
          {data.google.lastTest && (
            <p class="small">
              Last test:{' '}
              {data.google.lastTest.ok ? <Badge tone="ok">ok</Badge> : <Badge tone="bad">failed</Badge>}{' '}
              {formatDate(data.google.lastTest.at)}
            </p>
          )}
        </Card>
        <Card title="Server">
          <dl class="facts">
            <dt>Version</dt>
            <dd>{data.version}</dd>
            <dt>Node.js</dt>
            <dd>{data.nodeVersion}</dd>
            <dt>Uptime</dt>
            <dd>{formatDuration(data.uptimeSeconds)}</dd>
            <dt>Database</dt>
            <dd>
              {formatBytes(data.databaseBytes)}, schema v{data.schemaVersion}
            </dd>
            <dt>Last backup</dt>
            <dd>{data.lastBackup ? formatDate(data.lastBackup.createdAt) : 'none'}</dd>
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Kpi(props: { label: string; value: number }) {
  return (
    <div class="kpi">
      <span class="kpi-value">{props.value.toLocaleString()}</span>
      <span class="kpi-label">{props.label}</span>
    </div>
  );
}
