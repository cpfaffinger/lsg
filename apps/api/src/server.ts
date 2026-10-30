import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.ts';
import { AppContext } from './context.ts';
import type { Database } from './db/database.ts';
import { registerErrorHandler } from './http/errors.ts';
import { registerAdminAuthRoutes } from './routes/admin-auth-routes.ts';
import { registerAdminRoutes } from './routes/admin-routes.ts';
import { registerPlayerRoutes } from './routes/player-routes.ts';
import { registerPublicRoutes } from './routes/public-routes.ts';
import { BackupService } from './services/backups.ts';
import { ensureInitialAdmin } from './services/bootstrap.ts';
import { GoogleOidc, type OidcProvider } from './services/google-oidc.ts';

export interface ServerDeps {
  config: AppConfig;
  db: Database;
  /** Identity provider; tests inject a fake. */
  oidc?: OidcProvider;
  /** Disable the daily backup timer (tests). */
  scheduleBackups?: boolean;
}

export interface Server {
  app: FastifyInstance;
  ctx: AppContext;
  backups: BackupService;
}

export async function buildServer({
  config,
  db,
  oidc,
  scheduleBackups = false,
}: ServerDeps): Promise<Server> {
  const ctx = new AppContext(config, db, oidc ?? new GoogleOidc());
  const backups = new BackupService(db, config.backupDir);

  const app = Fastify({
    logger: config.isProduction ? { level: 'info' } : { level: 'warn' },
    // Health checks run every 30 s; per-request logs would only add noise.
    disableRequestLogging: true,
    // Proxy headers are evaluated explicitly (see http/request-info.ts), never implicitly.
    trustProxy: false,
    bodyLimit: 512 * 1024,
  });

  registerErrorHandler(app);
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (request) => ctx.ip(request),
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');
  });

  registerPublicRoutes(app, ctx);
  registerPlayerRoutes(app, ctx);
  registerAdminAuthRoutes(app, ctx);
  registerAdminRoutes(app, ctx, backups);

  await ensureInitialAdmin(ctx);

  if (scheduleBackups) {
    backups.startSchedule((info) => ctx.audit.log('system', 'backup.created', info.name));
    const maintenance = setInterval(() => {
      ctx.users.pruneSessions();
      ctx.admins.pruneSessions();
      ctx.audit.prune(365);
    }, 6 * 3600_000);
    maintenance.unref();
    app.addHook('onClose', async () => {
      backups.stop();
      clearInterval(maintenance);
    });
  }

  return { app, ctx, backups };
}
