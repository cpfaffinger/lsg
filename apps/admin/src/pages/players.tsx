import type { AdminPlayerDetail, AdminPlayersResponse } from '@lsg/shared';
import { useEffect, useState } from 'preact/hooks';
import { api, errorMessage, formatDate } from '../api.ts';
import { ActionFeedback, Badge, Card, Notice, useAction } from '../components.tsx';

export function PlayersPage() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminPlayersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminPlayerDetail | null>(null);
  const action = useAction();

  const load = async (q = query, p = page) => {
    try {
      setData(
        await api<AdminPlayersResponse>('GET', `/api/admin/players?query=${encodeURIComponent(q)}&page=${p}`),
      );
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    void load();
  }, [page]);

  const open = async (id: number) => {
    action.clear();
    setSelected(await api<AdminPlayerDetail>('GET', `/api/admin/players/${id}`));
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div class="stack">
      <Card title="Players">
        <form
          class="row"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            void load(query, 1);
          }}
        >
          <input
            class="grow"
            placeholder="Search by e-mail, name or ID"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <button class="btn" type="submit">
            Search
          </button>
        </form>
        {error && <Notice tone="bad">{error}</Notice>}
        {data && (
          <>
            <table class="table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Progress</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div class="player-cell">
                        {p.avatarUrl ? (
                          <img src={p.avatarUrl} alt="" referrerpolicy="no-referrer" />
                        ) : (
                          <span class="avatar-placeholder" />
                        )}
                        <div>
                          <div>
                            {p.displayName ?? '–'} {p.banned && <Badge tone="bad">banned</Badge>}
                          </div>
                          <div class="muted small">{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td class="small">
                      {p.progress
                        ? `${p.progress.levelsCompleted} levels · ${p.progress.stars}★ · ${p.progress.coins.toLocaleString()} coins`
                        : 'no cloud save'}
                    </td>
                    <td class="small">{formatDate(p.lastSeenAt)}</td>
                    <td>
                      <button class="btn small" onClick={() => void open(p.id)}>
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
                {data.players.length === 0 && (
                  <tr>
                    <td colSpan={4} class="muted">
                      No players found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div class="row pager">
              <button class="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span class="muted small">
                Page {page} of {pages} · {data.total} players
              </span>
              <button class="btn small" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </>
        )}
      </Card>

      {selected && (
        <Card
          title={selected.displayName ?? selected.email ?? `Player ${selected.id}`}
          actions={
            <button class="btn small ghost" onClick={() => setSelected(null)}>
              Close
            </button>
          }
        >
          <dl class="facts">
            <dt>ID</dt>
            <dd>{selected.id}</dd>
            <dt>E-mail</dt>
            <dd>{selected.email ?? '–'}</dd>
            <dt>Created</dt>
            <dd>{formatDate(selected.createdAt)}</dd>
            <dt>Last seen</dt>
            <dd>{formatDate(selected.lastSeenAt)}</dd>
            <dt>Cloud save</dt>
            <dd>
              {selected.save
                ? `revision ${selected.serverRevision}, updated ${formatDate(selected.saveUpdatedAt)}`
                : 'none'}
            </dd>
          </dl>
          {selected.save && (
            <details>
              <summary>Save data</summary>
              <pre class="json">{JSON.stringify(selected.save, null, 2)}</pre>
            </details>
          )}
          <ActionFeedback error={action.error} message={action.message} />
          <div class="row">
            <a class="btn small" href={`/api/admin/players/${selected.id}/export`}>
              Export data
            </a>
            <button
              class="btn small"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await api('POST', `/api/admin/players/${selected.id}/ban`, { banned: !selected.banned });
                  await open(selected.id);
                  await load();
                  return selected.banned ? 'Player unbanned.' : 'Player banned and signed out.';
                })
              }
            >
              {selected.banned ? 'Unban' : 'Ban'}
            </button>
            <button
              class="btn small danger"
              disabled={action.busy}
              onClick={() => {
                if (!window.confirm('Delete this player and all their data? This cannot be undone.')) return;
                void action.run(async () => {
                  await api('DELETE', `/api/admin/players/${selected.id}`);
                  setSelected(null);
                  await load();
                  return 'Player deleted.';
                });
              }}
            >
              Delete
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
