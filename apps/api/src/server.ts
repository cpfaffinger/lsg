import Fastify, { type FastifyInstance } from 'fastify';
import type { HealthResponse } from '@lsg/shared';
import type { AppConfig } from './config.ts';
import { getSchemaVersion, type Database } from './db/database.ts';

export interface ServerDeps {
  config: AppConfig;
  db: Database;
}

const startedAt = Date.now();

export async function buildServer({ config, db }: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isProduction ? { level: 'info' } : { level: 'warn' },
    // Health checks run every 30 s; per-request logs would only add noise.
    disableRequestLogging: true,
    trustProxy: false,
    bodyLimit: 512 * 1024,
  });

  app.get('/api/healthz', async (): Promise<HealthResponse> => {
    let ok = true;
    let schemaVersion = 0;
    try {
      schemaVersion = getSchemaVersion(db);
    } catch {
      ok = false;
    }
    return {
      status: ok ? 'ok' : 'degraded',
      version: config.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      database: { ok, schemaVersion },
    };
  });

  return app;
}
