import type { AdminAccount, AdminMe } from '@lsg/shared';
import type { FastifyInstance } from 'fastify';
import { ADMIN_COOKIE, type AppContext } from '../context.ts';
import { badRequest, conflict, forbidden, HttpError, unauthorized } from '../http/errors.ts';
import { bodyOf, idParam, optionalString, requiredString } from '../http/validate.ts';
import type { AdminRow } from '../repo/admin-repo.ts';
import { decrypt, encrypt, hashPassword, verifyPassword } from '../security/crypto.ts';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../security/totp.ts';
import { removeInitialPasswordFile } from '../services/bootstrap.ts';

export const MIN_PASSWORD_LENGTH = 12;

function me(admin: AdminRow): AdminMe {
  return {
    id: admin.id,
    username: admin.username,
    totpEnabled: admin.totp_enabled === 1,
    mustChangePassword: admin.must_change_password === 1,
  };
}

function checkNewPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) throw badRequest('password_too_short');
  if (password.length > 200) throw badRequest('password_too_long');
}

/** Local admin accounts (never Google): sign-in, password, TOTP and additional admins. */
export function registerAdminAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  // A fixed dummy hash keeps response times similar for unknown usernames.
  const dummyHash = hashPassword('timing-equaliser-not-a-real-password');

  app.post(
    '/api/admin/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      ctx.checkCsrf(request);
      const body = bodyOf(request);
      const username = requiredString(body, 'username', 64);
      const password = requiredString(body, 'password', 200);
      const code = optionalString(body, 'code', 12);
      const ip = ctx.ip(request);
      const admin = ctx.admins.byUsername(username);
      const valid = admin ? await verifyPassword(password, admin.password_hash) : (await dummyHash, false);
      if (!admin || !valid) {
        ctx.audit.log(username, 'admin.login_failed', null, null, ip);
        throw unauthorized('invalid_credentials');
      }
      if (admin.totp_enabled && admin.totp_secret_enc) {
        if (!code) throw new HttpError(401, 'totp_required');
        if (!verifyTotp(decrypt(ctx.keys, admin.totp_secret_enc), code)) {
          ctx.audit.log(username, 'admin.login_failed', null, { reason: 'totp' }, ip);
          throw unauthorized('invalid_totp');
        }
      }
      ctx.admins.pruneSessions();
      const token = ctx.admins.createSession(admin.id, ip);
      ctx.admins.touchLogin(admin.id);
      ctx.audit.log(admin.username, 'admin.login', null, null, ip);
      reply.setCookie(ADMIN_COOKIE, token, ctx.adminCookieOptions(request));
      return me(admin);
    },
  );

  app.post('/api/admin/logout', async (request, reply) => {
    ctx.checkCsrf(request);
    const token = request.cookies[ADMIN_COOKIE];
    if (token) ctx.admins.deleteSession(token);
    reply.clearCookie(ADMIN_COOKIE, { path: '/api/admin' });
    return { ok: true };
  });

  app.get('/api/admin/me', async (request) => me(ctx.requireAdmin(request, true)));

  app.post(
    '/api/admin/password',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request) => {
      ctx.checkCsrf(request);
      const admin = ctx.requireAdmin(request, true);
      const body = bodyOf(request);
      const current = requiredString(body, 'currentPassword', 200);
      const next = requiredString(body, 'newPassword', 200);
      if (!(await verifyPassword(current, admin.password_hash))) throw unauthorized('invalid_credentials');
      checkNewPassword(next);
      if (next === current) throw badRequest('password_unchanged');
      ctx.admins.setPassword(admin.id, await hashPassword(next));
      ctx.admins.deleteSessionsFor(admin.id, request.cookies[ADMIN_COOKIE]);
      removeInitialPasswordFile(ctx);
      ctx.audit.log(admin.username, 'admin.password_changed', null, null, ctx.ip(request));
      return { ok: true };
    },
  );

  app.post('/api/admin/totp/setup', async (request) => {
    ctx.checkCsrf(request);
    const admin = ctx.requireAdmin(request);
    if (admin.totp_enabled) throw conflict('totp_already_enabled');
    const secret = generateTotpSecret();
    ctx.admins.setTotp(admin.id, encrypt(ctx.keys, secret), false);
    return { secret, otpauthUrl: otpauthUrl(secret, admin.username) };
  });

  app.post('/api/admin/totp/enable', async (request) => {
    ctx.checkCsrf(request);
    const admin = ctx.requireAdmin(request);
    const code = requiredString(bodyOf(request), 'code', 12);
    if (!admin.totp_secret_enc) throw badRequest('totp_not_set_up');
    if (!verifyTotp(decrypt(ctx.keys, admin.totp_secret_enc), code)) throw badRequest('invalid_totp');
    ctx.admins.setTotp(admin.id, admin.totp_secret_enc, true);
    ctx.audit.log(admin.username, 'admin.totp_enabled', null, null, ctx.ip(request));
    return { ok: true };
  });

  app.post('/api/admin/totp/disable', async (request) => {
    ctx.checkCsrf(request);
    const admin = ctx.requireAdmin(request);
    const password = requiredString(bodyOf(request), 'password', 200);
    if (!(await verifyPassword(password, admin.password_hash))) throw unauthorized('invalid_credentials');
    ctx.admins.setTotp(admin.id, null, false);
    ctx.audit.log(admin.username, 'admin.totp_disabled', null, null, ctx.ip(request));
    return { ok: true };
  });

  app.get('/api/admin/admins', async (request): Promise<AdminAccount[]> => {
    ctx.requireAdmin(request);
    return ctx.admins.list().map((a) => ({
      id: a.id,
      username: a.username,
      totpEnabled: a.totp_enabled === 1,
      createdAt: a.created_at,
      lastLoginAt: a.last_login_at,
    }));
  });

  app.post('/api/admin/admins', async (request) => {
    ctx.checkCsrf(request);
    const admin = ctx.requireAdmin(request);
    const body = bodyOf(request);
    const username = requiredString(body, 'username', 64);
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) throw badRequest('invalid_username');
    const password = requiredString(body, 'password', 200);
    checkNewPassword(password);
    if (ctx.admins.byUsername(username)) throw conflict('username_taken');
    const id = ctx.admins.create(username, await hashPassword(password), true);
    ctx.audit.log(admin.username, 'admin.account_created', username, null, ctx.ip(request));
    return { id };
  });

  app.delete('/api/admin/admins/:id', async (request) => {
    ctx.checkCsrf(request);
    const admin = ctx.requireAdmin(request);
    const id = idParam(request);
    if (id === admin.id) throw forbidden('cannot_delete_self');
    if (ctx.admins.count() <= 1) throw forbidden('last_admin');
    const target = ctx.admins.byId(id);
    if (!target) throw badRequest('unknown_admin');
    ctx.admins.delete(id);
    ctx.audit.log(admin.username, 'admin.account_deleted', target.username, null, ctx.ip(request));
    return { ok: true };
  });
}
