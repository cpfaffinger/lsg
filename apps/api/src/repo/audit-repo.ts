import type { Database } from '../db/database.ts';

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string | null;
  details: unknown;
  ip: string | null;
}

/** Append-only log of administrative and security-relevant actions. */
export class AuditRepo {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  log(
    actor: string,
    action: string,
    target: string | null = null,
    details: unknown = null,
    ip: string | null = null,
  ): void {
    this.db
      .prepare('INSERT INTO audit_log (actor, action, target, details, ip) VALUES (?, ?, ?, ?, ?)')
      .run(actor, action, target, details === null ? null : JSON.stringify(details), ip);
  }

  list(limit: number, offset: number): { entries: AuditEntry[]; total: number } {
    const rows = this.db
      .prepare(
        'SELECT id, at, actor, action, target, details, ip FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?',
      )
      .all(limit, offset) as unknown as (Omit<AuditEntry, 'details'> & { details: string | null })[];
    const total = (this.db.prepare('SELECT COUNT(*) AS n FROM audit_log').get() as { n: number }).n;
    return {
      total,
      entries: rows.map((row) => ({
        ...row,
        details: row.details ? (JSON.parse(row.details) as unknown) : null,
      })),
    };
  }

  /** Keeps the log bounded; old entries beyond the retention window are removed. */
  prune(keepDays: number): void {
    this.db
      .prepare(`DELETE FROM audit_log WHERE at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`)
      .run(`-${keepDays} days`);
  }
}
