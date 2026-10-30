import { useEffect, useState } from 'preact/hooks';
import type { HealthResponse } from '@lsg/shared';

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/healthz')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  return (
    <main class="page">
      <h1>LSG Admin</h1>
      <section class="card">
        <h2>Server status</h2>
        {error && <p class="error">API not reachable: {error}</p>}
        {!error && !health && <p>Checking…</p>}
        {health && (
          <dl>
            <dt>Status</dt>
            <dd>{health.status}</dd>
            <dt>Version</dt>
            <dd>{health.version}</dd>
            <dt>Database schema</dt>
            <dd>v{health.database.schemaVersion}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
