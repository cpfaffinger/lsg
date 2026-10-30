import type { GoogleSettingsState, GoogleTestResult } from '@lsg/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { OAUTH_COOKIE, type AppContext } from '../context.ts';
import { badRequest } from '../http/errors.ts';
import { randomToken } from '../security/crypto.ts';
import { GOOGLE_SCOPES, pkceChallenge } from '../services/google-oidc.ts';

export function googleSettings(ctx: AppContext): GoogleSettingsState {
  const clientId = ctx.settings.get('google_client_id');
  const hasSecret = ctx.settings.get('google_client_secret') !== null;
  const enabled = ctx.settings.getBool('google_enabled');
  let lastTest: GoogleTestResult | null = null;
  const raw = ctx.settings.get('google_last_test');
  if (raw) {
    try {
      lastTest = JSON.parse(raw) as GoogleTestResult;
    } catch {
      lastTest = null;
    }
  }
  return { enabled, clientId, hasSecret, lastTest, active: enabled && !!clientId && hasSecret };
}

/** Only same-site relative paths are accepted as post-login destinations. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 200)
    return '/';
  return value.split('#')[0] ?? '/';
}

export type OauthMode = 'login' | 'test';

/** Starts the authorization code flow with PKCE, state and nonce, then redirects to Google. */
export async function beginGoogleFlow(
  ctx: AppContext,
  request: FastifyRequest,
  reply: FastifyReply,
  mode: OauthMode,
  returnTo: string,
): Promise<FastifyReply> {
  const clientId = ctx.settings.get('google_client_id');
  if (!clientId) throw badRequest('google_not_configured');
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  ctx.db
    .prepare(
      `DELETE FROM oauth_states WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes')`,
    )
    .run();
  ctx.db
    .prepare('INSERT INTO oauth_states (state, nonce, code_verifier, return_to, mode) VALUES (?, ?, ?, ?, ?)')
    .run(state, nonce, verifier, returnTo, mode);
  const discovery = await ctx.oidc.discovery();
  const url = new URL(discovery.authorizationEndpoint);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
  url.searchParams.set('redirect_uri', ctx.googleRedirectUri(request));
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', pkceChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'select_account');
  reply.setCookie(OAUTH_COOKIE, state, {
    path: '/api/auth',
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.secureCookies(request),
    maxAge: 600,
  });
  return reply.redirect(url.toString(), 302);
}
