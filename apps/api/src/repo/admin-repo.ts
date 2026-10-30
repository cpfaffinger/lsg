import type { Database } from '../db/database.ts';
import { randomToken, sha256 } from '../security/crypto.ts';

export interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
  must_change_password: number;
  totp_secret_enc: string | null;
  totp_enabled: number;
  created_at: string;
  last_login_at: string | null;
}

export const ADMIN_SESSION_HOURS = 12;

export class AdminRepo {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM admins').get() as { n: number }).n;
  }

  byUsername(username: string): AdminRow | undefined {
    return this.db.prepare('SELECT * FROM admins WHERE username = ?').get(username) as AdminRow | undefined;
  }

  byId(id: number): AdminRow | undefined {
    return this.db.prepare('SELECT * FROM admins WHERE id = ?').get(id) as AdminRow | undefined;
  }

  list(): AdminRow[] {
    return this.db.prepare('SELECT * FROM admins ORDER BY id').all() as unknown as AdminRow[];
  }

  create(username: string, passwordHash: string, mustChange: boolean): number {
    const result = this.db
      .prepare('INSERT INTO admins (username, password_hash, must_change_password) VALUES (?, ?, ?)')
      .run(username, passwordHash, mustChange ? 1 : 0);
    return Number(result.lastInsertRowid);
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM admins WHERE id = ?').run(id);
  }

  setPassword(id: number, passwordHash: string): void {
    this.db
      .prepare('UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(passwordHash, id);
  }

  setTotp(id: number, secretEnc: string | null, enabled: boolean): void {
    this.db
      .prepare('UPDATE admins SET totp_secret_enc = ?, totp_enabled = ? WHERE id = ?')
      .run(secretEnc, enabled ? 1 : 0, id);
  }

  touchLogin(id: number): void {
    this.db
      .prepare(`UPDATE admins SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
      .run(id);
  }

  /** Creates a session and returns the raw token (only its hash is stored). */
  createSession(adminId: number, ip: string | null): string {
    const token = randomToken();
    const expires = new Date(Date.now() + ADMIN_SESSION_HOURS * 3600_000).toISOString();
    this.db
      .prepare('INSERT INTO admin_sessions (id, admin_id, expires_at, ip) VALUES (?, ?, ?, ?)')
      .run(sha256(token), adminId, expires, ip);
    return token;
  }

  sessionAdmin(token: string): AdminRow | undefined {
    return this.db
      .prepare(
        `SELECT a.* FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
         WHERE s.id = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .get(sha256(token)) as AdminRow | undefined;
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(sha256(token));
  }

  deleteSessionsFor(adminId: number, exceptToken?: string): void {
    if (exceptToken) {
      this.db
        .prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND id != ?')
        .run(adminId, sha256(exceptToken));
    } else {
      this.db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(adminId);
    }
  }

  pruneSessions(): void {
    this.db
      .prepare(`DELETE FROM admin_sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
      .run();
  }
}
