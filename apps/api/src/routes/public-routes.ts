import type { HealthResponse, LegalResponse, PublicConfigResponse } from '@lsg/shared';
import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.ts';
import { getSchemaVersion } from '../db/database.ts';
import { DEFAULT_IMPRINT, DEFAULT_PRIVACY } from '../services/legal-defaults.ts';
import { googleSettings } from './google-state.ts';

const startedAt = Date.now();

export function registerPublicRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/healthz', async (): Promise<HealthResponse> => {
    let ok = true;
    let schemaVersion = 0;
    try {
      schemaVersion = getSchemaVersion(ctx.db);
    } catch {
      ok = false;
    }
    return {
      status: ok ? 'ok' : 'degraded',
      version: ctx.config.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      database: { ok, schemaVersion },
    };
  });

  app.get('/api/config', async (): Promise<PublicConfigResponse> => {
    const maintenanceMode = ctx.settings.getBool('maintenance_mode');
    return {
      googleLoginEnabled: googleSettings(ctx).active && !maintenanceMode,
      maintenanceMode,
      announcement: ctx.settings.get('announcement'),
    };
  });

  app.get('/api/legal', async (): Promise<LegalResponse> => ({
    imprint: ctx.settings.get('legal_imprint') ?? DEFAULT_IMPRINT,
    privacy: ctx.settings.get('legal_privacy') ?? DEFAULT_PRIVACY,
  }));
}

export function uptimeSeconds(): number {
  return Math.round((Date.now() - startedAt) / 1000);
}
