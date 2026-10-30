import fs from 'node:fs';
import {
  totalStars,
  type AdminAuditResponse,
  type AdminBackup,
  type AdminOverview,
  type AdminPlayer,
  type AdminPlayerDetail,
  type AdminPlayersResponse,
  type AdminSettingsResponse,
  type AdminStats,
  type GoogleCheck,
  type GoogleSetupGuide,
  type PublicUrlState,
} from '@lsg/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppContext } from '../context.ts';
import { getSchemaVersion } from '../db/database.ts';
import { badRequest, notFound } from '../http/errors.ts';
import { requestOrigin, normalizePublicUrl } from '../http/request-info.ts';
import { bodyOf, idParam, optionalString, pageParams, requiredBoolean } from '../http/validate.ts';
import type { UserRow } from '../repo/user-repo.ts';
import type { BackupService } from '../services/backups.ts';
import { GOOGLE_SCOPES } from '../services/google-oidc.ts';
import { DEFAULT_IMPRINT, DEFAULT_PRIVACY } from '../services/legal-defaults.ts';
import { beginGoogleFlow, googleSettings } from './google-state.ts';
import { uptimeSeconds } from './public-routes.ts';

/** Google OAuth client IDs look like "<digits>-<hash>.apps.googleusercontent.com". */
const GOOGLE_CLIENT_ID = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

function publicUrlState(ctx: AppContext, request: FastifyRequest): PublicUrlState {
  const info = ctx.publicUrl(request);
  return {
    url: info.url,
    source: info.source,
    stored: ctx.settings.get('public_url'),
    detected: requestOrigin(request),
  };
}

function setupGuide(ctx: AppContext, request: FastifyRequest): GoogleSetupGuide {
  const info = ctx.publicUrl(request);
  const host = new URL(info.url).hostname;
  // The OAuth consent screen wants the registrable domain (e.g. example.com for lsg.example.com).
  const parts = host.split('.');
  const authorizedDomain =
    parts.length > 2 && !/^\d+$/.test(parts.at(-1) ?? '') ? parts.slice(-2).join('.') : host;
  const warnings: string[] = [];
  if (info.source !== 'settings') warnings.push('public_url_not_set');
  if (!info.url.startsWith('https://') && host !== 'localhost' && host !== '127.0.0.1')
    warnings.push('public_url_not_https');
  if (host === 'localhost' || host === '127.0.0.1') warnings.push('localhost_only');
  return {
    publicUrl: info.url,
    publicUrlSource: info.source,
    javascriptOrigin: info.url,
    redirectUri: ctx.googleRedirectUri(request),
    authorizedDomain,
    homePageUrl: `${info.url}/`,
    privacyPolicyUrl: `${info.url}/#privacy`,
    scopes: GOOGLE_SCOPES,
    consoleUrls: {
      credentials: 'https://console.cloud.google.com/apis/credentials',
      consentScreen: 'https://console.cloud.google.com/auth/branding',
      newProject: 'https://console.cloud.google.com/projectcreate',
    },
    warnings,
  };
}

function playerSummary(ctx: AppContext, user: UserRow): AdminPlayer {
  const save = ctx.users.getSave(user.id);
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    banned: user.banned === 1,
    createdAt: user.created_at,
    lastSeenAt: user.last_seen_at,
    progress: save
      ? {
          levelsCompleted: Object.values(save.save.levels).filter((l) => l.completions > 0).length,
          stars: totalStars(save.save),
          coins: save.save.coins,
          endlessBest: save.save.endlessBest,
          runs: save.save.stats.runs,
        }
      : null,
  };
}

export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext, backups: BackupService): void {
  const actor = (request: FastifyRequest) => ctx.requireAdmin(request).username;

  app.get('/api/admin/overview', async (request): Promise<AdminOverview> => {
    ctx.requireAdmin(request);
    const google = googleSettings(ctx);
    const publicUrl = publicUrlState(ctx, request);
    const warnings = [...setupGuide(ctx, request).warnings];
    if (!google.active) warnings.push('google_inactive');
    if (ctx.settings.getBool('maintenance_mode')) warnings.push('maintenance_mode');
    const lastBackup = backups.list()[0] ?? null;
    if (!lastBackup) warnings.push('no_backup');
    let databaseBytes = 0;
    try {
      databaseBytes = fs.statSync(ctx.config.databaseFile).size;
    } catch {
      databaseBytes = 0;
    }
    return {
      version: ctx.config.version,
      nodeVersion: process.version,
      uptimeSeconds: uptimeSeconds(),
      schemaVersion: getSchemaVersion(ctx.db),
      databaseBytes,
      users: ctx.users.stats(),
      lastBackup,
      publicUrl,
      google,
      warnings,
    };
  });

  // ---------------------------------------------------------------- settings

  app.get('/api/admin/settings', async (request): Promise<AdminSettingsResponse> => {
    ctx.requireAdmin(request);
    return {
      publicUrl: publicUrlState(ctx, request),
      google: googleSettings(ctx),
      game: {
        maintenanceMode: ctx.settings.getBool('maintenance_mode'),
        announcement: ctx.settings.get('announcement'),
      },
      legal: {
        imprint: ctx.settings.get('legal_imprint'),
        privacy: ctx.settings.get('legal_privacy'),
        defaultImprint: DEFAULT_IMPRINT,
        defaultPrivacy: DEFAULT_PRIVACY,
      },
    };
  });

  app.put('/api/admin/settings/public-url', async (request) => {
    ctx.checkCsrf(request);
    const who = actor(request);
    const raw = optionalString(bodyOf(request), 'publicUrl', 300);
    const value = raw === null ? null : normalizePublicUrl(raw);
    if (raw !== null && value === null) throw badRequest('invalid_public_url');
    const previous = ctx.settings.get('public_url');
    ctx.settings.set('public_url', value);
    if (previous !== value) {
      // Redirect URIs depend on the address, so an earlier successful test no longer applies.
      ctx.settings.set('google_last_test', null);
    }
    ctx.audit.log(who, 'settings.public_url', value, { previous }, ctx.ip(request));
    return publicUrlState(ctx, request);
  });

  app.get('/api/admin/google/setup', async (request): Promise<GoogleSetupGuide> => {
    ctx.requireAdmin(request);
    return setupGuide(ctx, request);
  });

  app.put('/api/admin/settings/google', async (request) => {
    ctx.checkCsrf(request);
    const who = actor(request);
    const body = bodyOf(request);
    const clientId = optionalString(body, 'clientId', 200)?.trim() ?? null;
    const clientSecret = optionalString(body, 'clientSecret', 200)?.trim() ?? null;
    const enabled = requiredBoolean(body, 'enabled');
    if (clientId !== null && !GOOGLE_CLIENT_ID.test(clientId)) throw badRequest('invalid_client_id');
    const previousId = ctx.settings.get('google_client_id');
    ctx.settings.set('google_client_id', clientId);
    // An empty secret keeps the stored one so the admin never has to re-enter it.
    if (clientSecret !== null) ctx.settings.set('google_client_secret', clientSecret);
    if (clientId === null) ctx.settings.set('google_client_secret', null);
    if (previousId !== clientId || clientSecret !== null) ctx.settings.set('google_last_test', null);
    const state = googleSettings(ctx);
    if (enabled && (!state.clientId || !state.hasSecret)) throw badRequest('google_incomplete');
    ctx.settings.setBool('google_enabled', enabled);
    ctx.audit.log(
      who,
      'settings.google',
      clientId,
      { enabled, secretChanged: clientSecret !== null },
      ctx.ip(request),
    );
    return googleSettings(ctx);
  });

  app.post('/api/admin/google/check', async (request): Promise<GoogleCheck[]> => {
    ctx.checkCsrf(request);
    ctx.requireAdmin(request);
    const guide = setupGuide(ctx, request);
    const google = googleSettings(ctx);
    const checks: GoogleCheck[] = [
      {
        id: 'public_url',
        ok: guide.publicUrlSource === 'settings',
        message:
          guide.publicUrlSource === 'settings' ? guide.publicUrl : 'Public URL is not set in the settings.',
      },
      {
        id: 'https',
        ok: guide.publicUrl.startsWith('https://') || guide.warnings.includes('localhost_only'),
        message: guide.publicUrl.startsWith('https://')
          ? 'Public URL uses HTTPS.'
          : 'Google requires HTTPS for redirect URIs (except localhost).',
      },
      {
        id: 'client_id',
        ok: !!google.clientId && GOOGLE_CLIENT_ID.test(google.clientId),
        message: google.clientId ? 'Client ID has the expected format.' : 'Client ID is missing.',
      },
      {
        id: 'client_secret',
        ok: google.hasSecret,
        message: google.hasSecret ? 'Client secret is stored.' : 'Client secret is missing.',
      },
    ];
    try {
      const discovery = await ctx.oidc.discovery();
      checks.push({ id: 'discovery', ok: true, message: `Reached Google (${discovery.issuer}).` });
    } catch (error) {
      checks.push({
        id: 'discovery',
        ok: false,
        message: `Cannot reach Google: ${(error as Error).message}`,
      });
    }
    return checks;
  });

  /** Runs a real sign-in round trip with Google without creating a player account. */
  app.get('/api/admin/google/test-login', async (request, reply) => {
    ctx.requireAdmin(request);
    const google = googleSettings(ctx);
    if (!google.clientId || !google.hasSecret) return reply.redirect('/admin/#/google?test=incomplete', 302);
    return beginGoogleFlow(ctx, request, reply, 'test', '/admin/');
  });

  app.put('/api/admin/settings/game', async (request) => {
    ctx.checkCsrf(request);
    const who = actor(request);
    const body = bodyOf(request);
    const maintenanceMode = requiredBoolean(body, 'maintenanceMode');
    const announcement = optionalString(body, 'announcement', 500)?.trim() || null;
    ctx.settings.setBool('maintenance_mode', maintenanceMode);
    ctx.settings.set('announcement', announcement);
    ctx.audit.log(who, 'settings.game', null, { maintenanceMode, announcement }, ctx.ip(request));
    return { ok: true };
  });

  app.put('/api/admin/settings/legal', async (request) => {
    ctx.checkCsrf(request);
    const who = actor(request);
    const body = bodyOf(request);
    ctx.settings.set('legal_imprint', optionalString(body, 'imprint', 20_000)?.trim() || null);
    ctx.settings.set('legal_privacy', optionalString(body, 'privacy', 50_000)?.trim() || null);
    ctx.audit.log(who, 'settings.legal', null, null, ctx.ip(request));
    return { ok: true };
  });

  // ---------------------------------------------------------------- players

  app.get('/api/admin/players', async (request): Promise<AdminPlayersResponse> => {
    ctx.requireAdmin(request);
    const { page, limit, offset } = pageParams(request);
    const query = String((request.query as Record<string, unknown>).query ?? '')
      .trim()
      .slice(0, 100);
    const { users, total } = ctx.users.search(query, limit, offset);
    return { players: users.map((u) => playerSummary(ctx, u)), total, page, pageSize: limit };
  });

  app.get('/api/admin/players/:id', async (request): Promise<AdminPlayerDetail> => {
    ctx.requireAdmin(request);
    const user = ctx.users.byId(idParam(request));
    if (!user) throw notFound();
    const save = ctx.users.getSave(user.id);
    return {
      ...playerSummary(ctx, user),
      save: save?.save ?? null,
      serverRevision: save?.serverRevision ?? 0,
      saveUpdatedAt: save?.updatedAt ?? null,
    };
  });

  app.post('/api/admin/players/:id/ban', async (request) => {
    ctx.checkCsrf(request);
    const who = actor(request);
    const id = idParam(request);
    const banned = requiredBoolean(bodyOf(request), 'banned');
    if (!ctx.users.byId(id)) throw notFound();
    ctx.users.setBanned(id, banned);
    ctx.audit.log(who, banned ? 'player.banned' : 'player.unbanned', String(id), null, ctx.ip(request));
    return { ok: true };
  });

  app.delete('/api/admin/players/:id', async (request) => {
    ctx.checkCsrf(request);
    const who = actor(request);
    const id = idParam(request);
    const user = ctx.users.byId(id);
    if (!user) throw notFound();
    ctx.users.delete(id);
    ctx.audit.log(who, 'player.deleted', String(id), { email: user.email }, ctx.ip(request));
    return { ok: true };
  });

  app.get('/api/admin/players/:id/export', async (request, reply) => {
    const who = actor(request);
    const user = ctx.users.byId(idParam(request));
    if (!user) throw notFound();
    const save = ctx.users.getSave(user.id);
    ctx.audit.log(who, 'player.exported', String(user.id), null, ctx.ip(request));
    reply.header('content-disposition', `attachment; filename="lsg-player-${user.id}.json"`);
    return { exportedAt: new Date().toISOString(), account: user, save: save?.save ?? null };
  });

  // ---------------------------------------------------------------- stats, audit, backups

  app.get('/api/admin/stats', async (request): Promise<AdminStats> => {
    ctx.requireAdmin(request);
    return { users: ctx.users.stats(), ...ctx.users.progressStats() };
  });

  app.get('/api/admin/audit', async (request): Promise<AdminAuditResponse> => {
    ctx.requireAdmin(request);
    const { page, limit, offset } = pageParams(request, 50);
    const { entries, total } = ctx.audit.list(limit, offset);
    return { entries, total, page, pageSize: limit };
  });

  app.get('/api/admin/backups', async (request): Promise<AdminBackup[]> => {
    ctx.requireAdmin(request);
    return backups.list();
  });

  app.post('/api/admin/backups', async (request): Promise<AdminBackup> => {
    ctx.checkCsrf(request);
    const who = actor(request);
    const info = backups.create();
    ctx.audit.log(who, 'backup.created', info.name, null, ctx.ip(request));
    return info;
  });

  app.get('/api/admin/backups/:name', async (request, reply) => {
    const who = actor(request);
    const name = String((request.params as { name?: string }).name ?? '');
    const file = backups.resolve(name);
    if (!file) throw notFound();
    ctx.audit.log(who, 'backup.downloaded', name, null, ctx.ip(request));
    reply.header('content-type', 'application/vnd.sqlite3');
    reply.header('content-disposition', `attachment; filename="${name}"`);
    return reply.send(fs.createReadStream(file));
  });
}
