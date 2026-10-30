import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { buildServer } from './server.ts';

describe('health endpoint', () => {
  it('reports ok with the current schema version', async () => {
    const config = loadConfig({ LSG_DATA_DIR: '/tmp/lsg-test' });
    const db = openDatabase(':memory:');
    const app = await buildServer({ config, db });
    const response = await app.inject({ method: 'GET', url: '/api/healthz' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.database.schemaVersion).toBeGreaterThan(0);
    await app.close();
  });
});
