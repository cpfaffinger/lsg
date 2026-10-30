import type { AdminAuditResponse, AdminBackup, AdminStats } from '@lsg/shared';
import { useEffect, useState } from 'preact/hooks';
import { api, errorMessage, formatBytes, formatDate } from '../api.ts';
import { ActionFeedback, Card, Notice, useAction } from '../components.tsx';

const CAMPAIGN_LEVELS = 30;

export function StatsPage() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<AdminStats>('GET', '/api/admin/stats').then(setData, (e: unknown) => setError(errorMessage(e)));
  }, []);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <p class="muted">Loading…</p>;
  const max = Math.max(1, ...Object.values(data.levelCompletions));
  return (
    <div class="stack">
      <Card title="Totals (signed-in players only)">
        <dl class="facts">
          <dt>Accounts</dt>
          <dd>{data.users.users.toLocaleString()}</dd>
          <dt>Runs played</dt>
          <dd>{data.totalRuns.toLocaleString()}</dd>
          <dt>Enemies defeated</dt>
          <dd>{data.totalKills.toLocaleString()}</dd>
          <dt>Best endless run</dt>
          <dd>{data.endlessBest.toLocaleString()} m</dd>
        </dl>
        <p class="muted small">
          Numbers are aggregated from cloud saves. LSG does not track individual play sessions.
        </p>
      </Card>
      <Card title="Players who completed each level">
        <div class="bars" role="img" aria-label="Level completion chart">
          {Array.from({ length: CAMPAIGN_LEVELS }, (_, i) => {
            const count = data.levelCompletions[String(i + 1)] ?? 0;
            return (
              <div class="bar" key={i} title={`Level ${i + 1}: ${count}`}>
                <div class="bar-fill" style={{ height: `${(count / max) * 100}%` }} />
                <span class="bar-label">{i + 1}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminAuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<AdminAuditResponse>('GET', `/api/admin/audit?page=${page}`).then(setData, (e: unknown) =>
      setError(errorMessage(e)),
    );
  }, [page]);
  if (error) return <Notice tone="bad">{error}</Notice>;
  if (!data) return <p class="muted">Loading…</p>;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <Card title="Audit log">
      <table class="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((e) => (
            <tr key={e.id}>
              <td class="small">{formatDate(e.at)}</td>
              <td>{e.actor}</td>
              <td>
                <code>{e.action}</code>
                {e.details ? <div class="muted small">{JSON.stringify(e.details)}</div> : null}
              </td>
              <td class="small">{e.target ?? '–'}</td>
              <td class="small">{e.ip ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="row pager">
        <button class="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Newer
        </button>
        <span class="muted small">
          Page {page} of {pages}
        </span>
        <button class="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)}>
          Older
        </button>
      </div>
    </Card>
  );
}

export function BackupsPage() {
  const [backups, setBackups] = useState<AdminBackup[] | null>(null);
  const action = useAction();
  const load = async () => setBackups(await api<AdminBackup[]>('GET', '/api/admin/backups'));
  useEffect(() => {
    void load();
  }, []);
  return (
    <Card
      title="Database backups"
      actions={
        <button
          class="btn primary small"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              const created = await api<AdminBackup>('POST', '/api/admin/backups');
              await load();
              return `Backup ${created.name} created.`;
            })
          }
        >
          Create backup now
        </button>
      }
    >
      <p class="muted small">
        A consistent snapshot is created automatically every day; the newest 14 are kept in{' '}
        <code>data/backups</code> next to docker-compose.yml. Copy that folder together with{' '}
        <code>data/secret.key</code> for an off-site backup.
      </p>
      <ActionFeedback error={action.error} message={action.message} />
      {backups && (
        <table class="table">
          <thead>
            <tr>
              <th>File</th>
              <th>Created</th>
              <th>Size</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.name}>
                <td>
                  <code>{b.name}</code>
                </td>
                <td class="small">{formatDate(b.createdAt)}</td>
                <td class="small">{formatBytes(b.sizeBytes)}</td>
                <td>
                  <a class="btn small" href={`/api/admin/backups/${b.name}`}>
                    Download
                  </a>
                </td>
              </tr>
            ))}
            {backups.length === 0 && (
              <tr>
                <td colSpan={4} class="muted">
                  No backups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </Card>
  );
}
