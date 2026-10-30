import {
  MAX_SAVE_BYTES,
  sanitizeSave,
  type MeResponse,
  type PlayerProfile,
  type SaveConflictResponse,
  type SaveGetResponse,
  type SavePutResponse,
} from '@lsg/shared';
import type { FastifyInstance } from 'fastify';
import { OAUTH_COOKIE, USER_COOKIE, type AppContext } from '../context.ts';
import { badRequest } from '../http/errors.ts';
import { bodyOf, requiredInt } from '../http/validate.ts';
import type { UserRow } from '../repo/user-repo.ts';
import { beginGoogleFlow, googleSettings, safeReturnTo } from './google-state.ts';

function profile(user: UserRow): PlayerProfile {
  return {
    id: user.id,
    displayName: user.display_name,
    email: user.email,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at,
  };
}

function withHash(path: string, result: string): string {
  return `${path}#login=${result}`;
}

/** Player sign-in with Google, profile, data export/deletion and cloud saves. */
export function registerPlayerRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get(
    '/api/auth/google/start',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const returnTo = safeReturnTo((request.query as Record<string, unknown>).returnTo);
      const google = googleSettings(ctx);
      if (!google.active || ctx.settings.getBool('maintenance_mode')) {
        return reply.redirect(withHash(returnTo, 'unavailable'), 302);
      }
      return beginGoogleFlow(ctx, request, reply, 'login', returnTo);
    },
  );

  app.get(
    '/api/auth/google/callback',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const state = query.state ?? '';
      const row = ctx.db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state) as
        | {
            state: string;
            nonce: string;
            code_verifier: string;
            return_to: string;
            mode: string;
            created_at: string;
          }
        | undefined;
      if (row) ctx.db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
      reply.clearCookie(OAUTH_COOKIE, { path: '/api/auth' });
      const isTest = row?.mode === 'test';
      const fail = (reason: string) => {
        if (isTest) {
          ctx.settings.set(
            'google_last_test',
            JSON.stringify({ ok: false, at: new Date().toISOString(), email: null, error: reason }),
          );
          ctx.audit.log('admin', 'google.test_failed', null, { reason }, ctx.ip(request));
          return reply.redirect(`/admin/#/google?test=failed`, 302);
        }
        return reply.redirect(withHash(row ? safeReturnTo(row.return_to) : '/', reason), 302);
      };

      if (!row || request.cookies[OAUTH_COOKIE] !== state) return fail('invalid_state');
      if (Date.now() - Date.parse(row.created_at) > 15 * 60_000) return fail('expired');
      if (query.error) return fail(query.error === 'access_denied' ? 'cancelled' : 'provider_error');
      if (!query.code) return fail('missing_code');

      const clientId = ctx.settings.get('google_client_id');
      const clientSecret = ctx.settings.get('google_client_secret');
      if (!clientId || !clientSecret) return fail('not_configured');

      let identity;
      try {
        const tokens = await ctx.oidc.exchangeCode({
          clientId,
          clientSecret,
          code: query.code,
          codeVerifier: row.code_verifier,
          redirectUri: ctx.googleRedirectUri(request),
        });
        identity = await ctx.oidc.verifyIdToken(tokens.idToken, clientId, row.nonce);
      } catch (error) {
        request.log.warn({ err: error }, 'Google sign-in failed');
        return fail(isTest ? `token_error: ${String((error as Error).message).slice(0, 200)}` : 'error');
      }

      if (isTest) {
        ctx.settings.set(
          'google_last_test',
          JSON.stringify({ ok: true, at: new Date().toISOString(), email: identity.email, error: null }),
        );
        ctx.audit.log('admin', 'google.test_succeeded', identity.email, null, ctx.ip(request));
        return reply.redirect('/admin/#/google?test=ok', 302);
      }

      const user = ctx.users.upsertGoogleUser(identity.sub, identity.email, identity.name, identity.picture);
      if (user.banned) return reply.redirect(withHash(safeReturnTo(row.return_to), 'banned'), 302);
      const token = ctx.users.createSession(user.id, request.headers['user-agent'] ?? null, ctx.ip(request));
      reply.setCookie(USER_COOKIE, token, ctx.userCookieOptions(request));
      return reply.redirect(withHash(safeReturnTo(row.return_to), 'ok'), 302);
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    ctx.checkCsrf(request);
    const token = request.cookies[USER_COOKIE];
    if (token) ctx.users.deleteSession(token);
    reply.clearCookie(USER_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (request): Promise<MeResponse> => {
    const user = ctx.currentUser(request);
    return { user: user ? profile(user) : null };
  });

  app.get('/api/me/export', async (request, reply) => {
    const user = ctx.requireUser(request);
    const save = ctx.users.getSave(user.id);
    reply.header('content-disposition', 'attachment; filename="lsg-account-export.json"');
    return {
      exportedAt: new Date().toISOString(),
      account: { ...profile(user), googleSubject: user.google_sub, lastSeenAt: user.last_seen_at },
      save: save?.save ?? null,
      saveUpdatedAt: save?.updatedAt ?? null,
    };
  });

  app.delete('/api/me', async (request, reply) => {
    ctx.checkCsrf(request);
    const user = ctx.requireUser(request);
    ctx.users.delete(user.id);
    ctx.audit.log(`user:${user.id}`, 'user.self_deleted', String(user.id), null, ctx.ip(request));
    reply.clearCookie(USER_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/save', async (request): Promise<SaveGetResponse> => {
    const user = ctx.requireUser(request);
    const stored = ctx.users.getSave(user.id);
    return { save: stored?.save ?? null, serverRevision: stored?.serverRevision ?? 0 };
  });

  app.put(
    '/api/save',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply): Promise<SavePutResponse | SaveConflictResponse> => {
      ctx.checkCsrf(request);
      const user = ctx.requireUser(request);
      const body = bodyOf(request);
      const baseRevision = requiredInt(body, 'baseRevision', 0, Number.MAX_SAFE_INTEGER);
      if (JSON.stringify(body.save ?? null).length > MAX_SAVE_BYTES) throw badRequest('save_too_large');
      const save = sanitizeSave(body.save);
      const revision = ctx.users.putSave(user.id, save, baseRevision);
      if (revision === null) {
        const current = ctx.users.getSave(user.id);
        reply.status(409);
        return {
          error: { code: 'conflict', message: 'The server has a newer save' },
          save: current?.save ?? null,
          serverRevision: current?.serverRevision ?? 0,
        };
      }
      return { serverRevision: revision };
    },
  );
}
