import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from './config.ts';
import type { Database } from './db/database.ts';
import { forbidden, unauthorized } from './http/errors.ts';
import { clientIp, normalizePublicUrl, requestOrigin } from './http/request-info.ts';
import { AdminRepo, ADMIN_SESSION_HOURS, type AdminRow } from './repo/admin-repo.ts';
import { AuditRepo } from './repo/audit-repo.ts';
import { SettingsRepo } from './repo/settings-repo.ts';
import { USER_SESSION_DAYS, UserRepo, type UserRow } from './repo/user-repo.ts';
import { deriveKeys, type Keys } from './security/crypto.ts';
import type { OidcProvider } from './services/google-oidc.ts';

export const USER_COOKIE = 'lsg_session';
export const ADMIN_COOKIE = 'lsg_admin';
export const OAUTH_COOKIE = 'lsg_oauth';
/** Custom header required on state-changing requests; cross-site forms cannot set it. */
export const CSRF_HEADER = 'x-lsg-request';

export interface PublicUrlInfo {
  url: string;
  source: 'settings' | 'environment' | 'request';
}

/** Shared services and helpers for all routes. */
export class AppContext {
  readonly config: AppConfig;
  readonly db: Database;
  readonly keys: Keys;
  readonly settings: SettingsRepo;
  readonly audit: AuditRepo;
  readonly admins: AdminRepo;
  readonly users: UserRepo;
  readonly oidc: OidcProvider;

  constructor(config: AppConfig, db: Database, oidc: OidcProvider) {
    this.config = config;
    this.db = db;
    this.keys = deriveKeys(config.secretKey);
    this.settings = new SettingsRepo(db, this.keys);
    this.audit = new AuditRepo(db);
    this.admins = new AdminRepo(db);
    this.users = new UserRepo(db);
    this.oidc = oidc;
  }

  ip(request: FastifyRequest): string {
    return clientIp(request, this.config.clientIpSource);
  }

  /** Public address of the game: admin setting, else environment, else the request's own origin. */
  publicUrl(request: FastifyRequest): PublicUrlInfo {
    const stored = normalizePublicUrl(this.settings.get('public_url') ?? '');
    if (stored) return { url: stored, source: 'settings' };
    const fromEnv = normalizePublicUrl(this.config.initialPublicUrl ?? '');
    if (fromEnv) return { url: fromEnv, source: 'environment' };
    return { url: requestOrigin(request), source: 'request' };
  }

  googleRedirectUri(request: FastifyRequest): string {
    return `${this.publicUrl(request).url}/api/auth/google/callback`;
  }

  /** Cookies are Secure whenever the public address uses HTTPS (TLS ends at the outer proxy). */
  secureCookies(request: FastifyRequest): boolean {
    return this.publicUrl(request).url.startsWith('https://');
  }

  userCookieOptions(request: FastifyRequest) {
    return {
      path: '/',
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.secureCookies(request),
      maxAge: USER_SESSION_DAYS * 86_400,
    };
  }

  adminCookieOptions(request: FastifyRequest) {
    return {
      path: '/api/admin',
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: this.secureCookies(request),
      maxAge: ADMIN_SESSION_HOURS * 3600,
    };
  }

  /**
   * Rejects cross-site state changes: requires the custom header and, when the browser sends
   * an Origin, that it matches the public URL or the request's own host.
   */
  checkCsrf(request: FastifyRequest): void {
    if (request.headers[CSRF_HEADER] !== '1') throw forbidden('csrf');
    const origin = request.headers.origin;
    if (!origin) return;
    const allowed = new Set([this.publicUrl(request).url, requestOrigin(request)]);
    const host = request.headers.host;
    if (host) {
      allowed.add(`http://${host}`);
      allowed.add(`https://${host}`);
    }
    if (!allowed.has(origin)) throw forbidden('csrf_origin');
  }

  currentUser(request: FastifyRequest): UserRow | null {
    const token = request.cookies[USER_COOKIE];
    return token ? (this.users.sessionUser(token) ?? null) : null;
  }

  requireUser(request: FastifyRequest): UserRow {
    const user = this.currentUser(request);
    if (!user) throw unauthorized();
    return user;
  }

  currentAdmin(request: FastifyRequest): AdminRow | null {
    const token = request.cookies[ADMIN_COOKIE];
    return token ? (this.admins.sessionAdmin(token) ?? null) : null;
  }

  /** Admin guard; accounts that must change their password may only do that. */
  requireAdmin(request: FastifyRequest, allowPasswordChange = false): AdminRow {
    const admin = this.currentAdmin(request);
    if (!admin) throw unauthorized('admin_unauthorized');
    if (admin.must_change_password && !allowPasswordChange) throw forbidden('password_change_required');
    return admin;
  }

  clearCookie(reply: FastifyReply, name: string, path: string): void {
    reply.clearCookie(name, { path });
  }
}
