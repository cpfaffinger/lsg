import { sanitizeSave, type SaveData } from '@lsg/shared';
import type { Database } from '../db/database.ts';
import { randomToken, sha256 } from '../security/crypto.ts';

export interface UserRow {
  id: number;
  google_sub: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  banned: number;
  created_at: string;
  last_seen_at: string;
}

export const USER_SESSION_DAYS = 90;

export interface StoredSave {
  save: SaveData;
  serverRevision: number;
  updatedAt: string;
}

/** Player accounts, their sessions and their cloud saves. */
export class UserRepo {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  upsertGoogleUser(sub: string, email: string | null, name: string | null, avatar: string | null): UserRow {
    this.db
      .prepare(
        `INSERT INTO users (google_sub, email, display_name, avatar_url) VALUES (?, ?, ?, ?)
         ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email, display_name = excluded.display_name,
           avatar_url = excluded.avatar_url, last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(sub, email, name, avatar);
    return this.db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub) as unknown as UserRow;
  }

  byId(id: number): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  setBanned(id: number, banned: boolean): void {
    this.db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, id);
    if (banned) this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }

  search(query: string, limit: number, offset: number): { users: UserRow[]; total: number } {
    const like = `%${query.replace(/[%_]/g, (c) => `\\${c}`)}%`;
    const where = query
      ? `WHERE email LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' OR CAST(id AS TEXT) = ?`
      : '';
    const params = query ? [like, like, query] : [];
    const users = this.db
      .prepare(`SELECT * FROM users ${where} ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as unknown as UserRow[];
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM users ${where}`).get(...params) as { n: number }
    ).n;
    return { users, total };
  }

  createSession(userId: number, userAgent: string | null, ip: string | null): string {
    const token = randomToken();
    const expires = new Date(Date.now() + USER_SESSION_DAYS * 86_400_000).toISOString();
    this.db
      .prepare('INSERT INTO sessions (id, user_id, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)')
      .run(sha256(token), userId, expires, userAgent?.slice(0, 200) ?? null, ip);
    return token;
  }

  /** Resolves a session token and refreshes the user's last-seen timestamp (at most hourly). */
  sessionUser(token: string): UserRow | undefined {
    const id = sha256(token);
    const user = this.db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND u.banned = 0`,
      )
      .get(id) as UserRow | undefined;
    if (user) {
      this.db
        .prepare(
          `UPDATE users SET last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND last_seen_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`,
        )
        .run(user.id);
    }
    return user;
  }

  deleteSession(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
  }

  pruneSessions(): void {
    this.db.prepare(`DELETE FROM sessions WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).run();
  }

  getSave(userId: number): StoredSave | null {
    const row = this.db
      .prepare('SELECT data, server_revision, updated_at FROM saves WHERE user_id = ?')
      .get(userId) as { data: string; server_revision: number; updated_at: string } | undefined;
    if (!row) return null;
    return {
      save: sanitizeSave(JSON.parse(row.data)),
      serverRevision: row.server_revision,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Stores a save if the caller's base revision matches (optimistic locking).
   * Returns the new server revision, or null on conflict.
   */
  putSave(userId: number, save: SaveData, baseRevision: number): number | null {
    const current = this.db.prepare('SELECT server_revision FROM saves WHERE user_id = ?').get(userId) as
      { server_revision: number } | undefined;
    const currentRevision = current?.server_revision ?? 0;
    if (currentRevision !== baseRevision) return null;
    const next = currentRevision + 1;
    this.db
      .prepare(
        `INSERT INTO saves (user_id, data, server_revision, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, server_revision = excluded.server_revision,
           updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(save), next);
    return next;
  }

  stats(): {
    users: number;
    activeToday: number;
    activeWeek: number;
    newWeek: number;
    banned: number;
    sessions: number;
  } {
    const one = (sql: string) => (this.db.prepare(sql).get() as { n: number }).n;
    return {
      users: one('SELECT COUNT(*) AS n FROM users'),
      activeToday: one(
        `SELECT COUNT(*) AS n FROM users WHERE last_seen_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`,
      ),
      activeWeek: one(
        `SELECT COUNT(*) AS n FROM users WHERE last_seen_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')`,
      ),
      newWeek: one(
        `SELECT COUNT(*) AS n FROM users WHERE created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')`,
      ),
      banned: one('SELECT COUNT(*) AS n FROM users WHERE banned = 1'),
      sessions: one(
        `SELECT COUNT(*) AS n FROM sessions WHERE expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      ),
    };
  }

  /** Aggregated progress across all cloud saves (no per-player tracking). */
  progressStats(): {
    levelCompletions: Record<string, number>;
    totalKills: number;
    totalRuns: number;
    endlessBest: number;
  } {
    const rows = this.db.prepare('SELECT data FROM saves').all() as { data: string }[];
    const levelCompletions: Record<string, number> = {};
    let totalKills = 0;
    let totalRuns = 0;
    let endlessBest = 0;
    for (const row of rows) {
      const save = sanitizeSave(JSON.parse(row.data));
      for (const [level, record] of Object.entries(save.levels)) {
        if (record.completions > 0) levelCompletions[level] = (levelCompletions[level] ?? 0) + 1;
      }
      totalKills += save.stats.kills;
      totalRuns += save.stats.runs;
      endlessBest = Math.max(endlessBest, save.endlessBest);
    }
    return { levelCompletions, totalKills, totalRuns, endlessBest };
  }
}
