import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.ts';

export type Database = DatabaseSync;

/**
 * Opens (and creates if needed) the SQLite database and applies pending migrations.
 * SQLite is used instead of PostgreSQL because the data directory is a bind mount
 * that may live on a Windows drive under WSL, where PostgreSQL cannot set the
 * file permissions it requires. A single file also makes backups trivial.
 */
export function openDatabase(file: string): Database {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');
  migrate(db);
  return db;
}

export function getSchemaVersion(db: Database): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  return row?.user_version ?? 0;
}

export function migrate(db: Database): void {
  const current = getSchemaVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${migration.version} (${migration.name}) failed: ${String(error)}`, {
        cause: error,
      });
    }
  }
}

/** Creates a consistent snapshot of the live database, safe while the server is running. */
export function backupDatabase(db: Database, targetFile: string): void {
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  const escaped = targetFile.replaceAll("'", "''");
  db.exec(`VACUUM INTO '${escaped}'`);
}
