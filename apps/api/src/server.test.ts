import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEmptySave } from '@lsg/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { totpCode } from './security/totp.ts';
import { buildServer, type Server } from './server.ts';
import type { OidcIdentity, OidcProvider } from './services/google-oidc.ts';

const ADMIN = { username: 'root', password: 'a-very-long-password-1' };
const CLIENT_ID = '1234567890-abcdefghijklmnop.apps.googleusercontent.com';
const CSRF = { 'x-lsg-request': '1' };

class FakeOidc implements OidcProvider {
  identity: OidcIdentity = {
    sub: 'google-sub-1',
    email: 'player@example.com',
    emailVerified: true,
    name: 'Player One',
    picture: null,
  };
  lastExchange: { codeVerifier: string; redirectUri: string } | null = null;

  async discovery() {
    return {
      issuer: 'https://accounts.google.com',
      authorizationEndpoint: 'https://accounts.example.test/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.example.test/token',
      jwksUri: 'https://www.example.test/certs',
    };
  }

  async exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }) {
    if (input.code !== 'good-code') throw new Error('invalid_grant');
    this.lastExchange = { codeVerifier: input.codeVerifier, redirectUri: input.redirectUri };
    return { idToken: 'id-token' };
  }

  async verifyIdToken(idToken: string, clientId: string): Promise<OidcIdentity> {
    if (idToken !== 'id-token' || clientId !== CLIENT_ID) throw new Error('bad token');
    return this.identity;
  }
}

let dataDir: string;
let server: Server;
let oidc: FakeOidc;

async function start(env: Record<string, string> = {}): Promise<void> {
  oidc = new FakeOidc();
  const config = loadConfig(
    { LSG_DATA_DIR: dataDir, LSG_ADMIN_USER: ADMIN.username, LSG_ADMIN_PASSWORD: ADMIN.password, ...env },
    { persistSecret: false },
  );
  server = await buildServer({ config, db: openDatabase(':memory:'), oidc });
}

function cookieValue(
  response: { cookies: { name: string; value: string }[] },
  name: string,
): string | undefined {
  return response.cookies.find((c) => c.name === name)?.value;
}

async function adminLogin(): Promise<string> {
  const response = await server.app.inject({
    method: 'POST',
    url: '/api/admin/login',
    headers: CSRF,
    payload: ADMIN,
  });
  expect(response.statusCode).toBe(200);
  const token = cookieValue(response, 'lsg_admin');
  if (!token) throw new Error('no admin cookie');
  return token;
}

async function configureGoogle(admin: string): Promise<void> {
  await server.app.inject({
    method: 'PUT',
    url: '/api/admin/settings/public-url',
    headers: CSRF,
    cookies: { lsg_admin: admin },
    payload: { publicUrl: 'https://lsg.example.com/some/path' },
  });
  const response = await server.app.inject({
    method: 'PUT',
    url: '/api/admin/settings/google',
    headers: CSRF,
    cookies: { lsg_admin: admin },
    payload: { clientId: CLIENT_ID, clientSecret: 'super-secret', enabled: true },
  });
  expect(response.statusCode).toBe(200);
}

async function playerLogin(): Promise<string> {
  const start = await server.app.inject({ method: 'GET', url: '/api/auth/google/start?returnTo=/play' });
  expect(start.statusCode).toBe(302);
  const location = new URL(String(start.headers.location));
  const state = location.searchParams.get('state') ?? '';
  const oauthCookie = cookieValue(start, 'lsg_oauth') ?? '';
  const callback = await server.app.inject({
    method: 'GET',
    url: `/api/auth/google/callback?code=good-code&state=${state}`,
    cookies: { lsg_oauth: oauthCookie },
  });
  expect(callback.statusCode).toBe(302);
  expect(callback.headers.location).toBe('/play#login=ok');
  const session = cookieValue(callback, 'lsg_session');
  if (!session) throw new Error('no session');
  return session;
}

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsg-api-'));
  await start();
});

afterEach(async () => {
  await server.app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('public endpoints', () => {
  it('reports health and a disabled Google login by default', async () => {
    const health = await server.app.inject({ method: 'GET', url: '/api/healthz' });
    expect(health.json()).toMatchObject({ status: 'ok', database: { ok: true, schemaVersion: 2 } });
    const config = await server.app.inject({ method: 'GET', url: '/api/config' });
    expect(config.json()).toEqual({ googleLoginEnabled: false, maintenanceMode: false, announcement: null });
    const legal = await server.app.inject({ method: 'GET', url: '/api/legal' });
    expect(legal.json().privacy).toContain('Privacy policy');
  });
});

describe('admin authentication', () => {
  it('rejects wrong passwords and requests without the CSRF header', async () => {
    const wrong = await server.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: CSRF,
      payload: { username: ADMIN.username, password: 'nope-nope-nope' },
    });
    expect(wrong.statusCode).toBe(401);
    const noCsrf = await server.app.inject({ method: 'POST', url: '/api/admin/login', payload: ADMIN });
    expect(noCsrf.statusCode).toBe(403);
    const crossSite = await server.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: { ...CSRF, origin: 'https://evil.example' },
      payload: ADMIN,
    });
    expect(crossSite.statusCode).toBe(403);
  });

  it('forces a password change for generated first-run passwords', async () => {
    await server.app.close();
    await start({ LSG_ADMIN_PASSWORD: '' });
    const file = path.join(dataDir, 'initial-admin-password.txt');
    const password = /Password: (\S+)/.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? '';
    const login = await server.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: CSRF,
      payload: { username: ADMIN.username, password },
    });
    expect(login.json().mustChangePassword).toBe(true);
    const admin = cookieValue(login, 'lsg_admin') ?? '';
    const blocked = await server.app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      cookies: { lsg_admin: admin },
    });
    expect(blocked.json().error.code).toBe('password_change_required');
    const tooShort = await server.app.inject({
      method: 'POST',
      url: '/api/admin/password',
      headers: CSRF,
      cookies: { lsg_admin: admin },
      payload: { currentPassword: password, newPassword: 'short' },
    });
    expect(tooShort.statusCode).toBe(400);
    const changed = await server.app.inject({
      method: 'POST',
      url: '/api/admin/password',
      headers: CSRF,
      cookies: { lsg_admin: admin },
      payload: { currentPassword: password, newPassword: 'my-new-secure-password' },
    });
    expect(changed.statusCode).toBe(200);
    expect(fs.existsSync(file)).toBe(false);
    const overview = await server.app.inject({
      method: 'GET',
      url: '/api/admin/overview',
      cookies: { lsg_admin: admin },
    });
    expect(overview.statusCode).toBe(200);
  });

  it('supports TOTP as a second factor', async () => {
    const admin = await adminLogin();
    const setup = await server.app.inject({
      method: 'POST',
      url: '/api/admin/totp/setup',
      headers: CSRF,
      cookies: { lsg_admin: admin },
    });
    const { secret, otpauthUrl } = setup.json() as { secret: string; otpauthUrl: string };
    expect(otpauthUrl).toContain('otpauth://totp/');
    const enable = await server.app.inject({
      method: 'POST',
      url: '/api/admin/totp/enable',
      headers: CSRF,
      cookies: { lsg_admin: admin },
      payload: { code: totpCode(secret) },
    });
    expect(enable.statusCode).toBe(200);
    const withoutCode = await server.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: CSRF,
      payload: ADMIN,
    });
    expect(withoutCode.json().error.code).toBe('totp_required');
    const withCode = await server.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: CSRF,
      payload: { ...ADMIN, code: totpCode(secret) },
    });
    expect(withCode.statusCode).toBe(200);
  });
});

describe('admin settings and Google setup guide', () => {
  it('derives exact Google console values from the public URL', async () => {
    const admin = await adminLogin();
    const invalid = await server.app.inject({
      method: 'PUT',
      url: '/api/admin/settings/public-url',
      headers: CSRF,
      cookies: { lsg_admin: admin },
      payload: { publicUrl: 'ftp://nope' },
    });
    expect(invalid.statusCode).toBe(400);
    await configureGoogle(admin);
    const guide = await server.app.inject({
      method: 'GET',
      url: '/api/admin/google/setup',
      cookies: { lsg_admin: admin },
    });
    expect(guide.json()).toMatchObject({
      publicUrl: 'https://lsg.example.com',
      javascriptOrigin: 'https://lsg.example.com',
      redirectUri: 'https://lsg.example.com/api/auth/google/callback',
      authorizedDomain: 'example.com',
      scopes: ['openid', 'email', 'profile'],
      warnings: [],
    });
    const raw = server.ctx.db
      .prepare(`SELECT value FROM settings WHERE key = 'google_client_secret'`)
      .get() as { value: string };
    expect(raw.value).not.toContain('super-secret');
    const config = await server.app.inject({ method: 'GET', url: '/api/config' });
    expect(config.json().googleLoginEnabled).toBe(true);
  });

  it('validates the client id and refuses to enable an incomplete setup', async () => {
    const admin = await adminLogin();
    const bad = await server.app.inject({
      method: 'PUT',
      url: '/api/admin/settings/google',
      headers: CSRF,
      cookies: { lsg_admin: admin },
      payload: { clientId: 'not-a-client-id', enabled: false },
    });
    expect(bad.json().error.code).toBe('invalid_client_id');
    const incomplete = await server.app.inject({
      method: 'PUT',
      url: '/api/admin/settings/google',
      headers: CSRF,
      cookies: { lsg_admin: admin },
      payload: { clientId: CLIENT_ID, enabled: true },
    });
    expect(incomplete.json().error.code).toBe('google_incomplete');
  });

  it('runs a test sign-in without creating a player', async () => {
    const admin = await adminLogin();
    await configureGoogle(admin);
    const start = await server.app.inject({
      method: 'GET',
      url: '/api/admin/google/test-login',
      cookies: { lsg_admin: admin },
    });
    const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
    const callback = await server.app.inject({
      method: 'GET',
      url: `/api/auth/google/callback?code=good-code&state=${state}`,
      cookies: { lsg_oauth: cookieValue(start, 'lsg_oauth') ?? '' },
    });
    expect(callback.headers.location).toBe('/admin/#/google?test=ok');
    const settings = await server.app.inject({
      method: 'GET',
      url: '/api/admin/settings',
      cookies: { lsg_admin: admin },
    });
    expect(settings.json().google.lastTest).toMatchObject({ ok: true, email: 'player@example.com' });
    expect(server.ctx.users.stats().users).toBe(0);
  });

  it('logs the Cloudflare client IP in the audit log', async () => {
    await server.app.inject({
      method: 'POST',
      url: '/api/admin/login',
      headers: { ...CSRF, 'cf-connecting-ip': '203.0.113.7' },
      payload: ADMIN,
    });
    const entry = server.ctx.audit.list(1, 0).entries[0];
    expect(entry).toMatchObject({ action: 'admin.login', ip: '203.0.113.7' });
  });
});

describe('player login and cloud saves', () => {
  it('signs in with Google using PKCE and the configured redirect URI', async () => {
    const admin = await adminLogin();
    await configureGoogle(admin);
    const session = await playerLogin();
    expect(oidc.lastExchange?.redirectUri).toBe('https://lsg.example.com/api/auth/google/callback');
    const me = await server.app.inject({ method: 'GET', url: '/api/me', cookies: { lsg_session: session } });
    expect(me.json().user).toMatchObject({ email: 'player@example.com', displayName: 'Player One' });
  });

  it('rejects callbacks with a forged state', async () => {
    const admin = await adminLogin();
    await configureGoogle(admin);
    const callback = await server.app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=good-code&state=forged',
    });
    expect(callback.headers.location).toBe('/#login=invalid_state');
  });

  it('syncs saves with optimistic locking', async () => {
    const admin = await adminLogin();
    await configureGoogle(admin);
    const session = await playerLogin();
    const cookies = { lsg_session: session };
    const empty = await server.app.inject({ method: 'GET', url: '/api/save', cookies });
    expect(empty.json()).toEqual({ save: null, serverRevision: 0 });
    const save = createEmptySave();
    save.coins = 500;
    save.levels['1'] = { stars: 3, bestUnits: 40, completions: 1 };
    const first = await server.app.inject({
      method: 'PUT',
      url: '/api/save',
      headers: CSRF,
      cookies,
      payload: { save, baseRevision: 0 },
    });
    expect(first.json()).toEqual({ serverRevision: 1 });
    const stale = await server.app.inject({
      method: 'PUT',
      url: '/api/save',
      headers: CSRF,
      cookies,
      payload: { save, baseRevision: 0 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ serverRevision: 1, save: { coins: 500 } });
    const second = await server.app.inject({
      method: 'PUT',
      url: '/api/save',
      headers: CSRF,
      cookies,
      payload: { save: { ...save, coins: 'hacked', upgrades: { squad: 999 } }, baseRevision: 1 },
    });
    expect(second.json()).toEqual({ serverRevision: 2 });
    const stored = await server.app.inject({ method: 'GET', url: '/api/save', cookies });
    expect(stored.json().save.coins).toBe(0);
    expect(stored.json().save.upgrades.squad).toBe(12);

    const players = await server.app.inject({
      method: 'GET',
      url: '/api/admin/players?query=player',
      cookies: { lsg_admin: admin },
    });
    expect(players.json()).toMatchObject({
      total: 1,
      players: [{ email: 'player@example.com', progress: { levelsCompleted: 1 } }],
    });
  });

  it('lets admins ban players and players delete themselves', async () => {
    const admin = await adminLogin();
    await configureGoogle(admin);
    const session = await playerLogin();
    const userId = (
      await server.app.inject({ method: 'GET', url: '/api/me', cookies: { lsg_session: session } })
    ).json().user.id;
    await server.app.inject({
      method: 'POST',
      url: `/api/admin/players/${userId}/ban`,
      headers: CSRF,
      cookies: { lsg_admin: admin },
      payload: { banned: true },
    });
    const bannedMe = await server.app.inject({
      method: 'GET',
      url: '/api/me',
      cookies: { lsg_session: session },
    });
    expect(bannedMe.json().user).toBeNull();
    await server.app.inject({
      method: 'POST',
      url: `/api/admin/players/${userId}/ban`,
      headers: CSRF,
      cookies: { lsg_admin: admin },
      payload: { banned: false },
    });
    const again = await playerLogin();
    const exported = await server.app.inject({
      method: 'GET',
      url: '/api/me/export',
      cookies: { lsg_session: again },
    });
    expect(exported.json().account.email).toBe('player@example.com');
    const deleted = await server.app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: CSRF,
      cookies: { lsg_session: again },
    });
    expect(deleted.statusCode).toBe(200);
    expect(server.ctx.users.stats().users).toBe(0);
  });
});

describe('backups', () => {
  it('creates and lists consistent snapshots', async () => {
    const admin = await adminLogin();
    const created = await server.app.inject({
      method: 'POST',
      url: '/api/admin/backups',
      headers: CSRF,
      cookies: { lsg_admin: admin },
    });
    expect(created.json().name).toMatch(/^lsg-\d{8}-\d{6}\.sqlite$/);
    const list = await server.app.inject({
      method: 'GET',
      url: '/api/admin/backups',
      cookies: { lsg_admin: admin },
    });
    expect(list.json()).toHaveLength(1);
    const traversal = await server.app.inject({
      method: 'GET',
      url: '/api/admin/backups/..%2Fsecret.key',
      cookies: { lsg_admin: admin },
    });
    expect(traversal.statusCode).toBe(404);
  });
});
