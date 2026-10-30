import fs from 'node:fs';
import path from 'node:path';
import { backupDatabase, type Database } from '../db/database.ts';

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

const NAME_PATTERN = /^lsg-\d{8}-\d{6}\.sqlite$/;

/** Consistent SQLite snapshots in <data>/backups, created on demand and once per day. */
export class BackupService {
  private readonly db: Database;
  private readonly dir: string;
  private readonly keep: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(db: Database, dir: string, keep = 14) {
    this.db = db;
    this.dir = dir;
    this.keep = keep;
  }

  create(now = new Date()): BackupInfo {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `lsg-${stamp}.sqlite`;
    const file = path.join(this.dir, name);
    if (fs.existsSync(file)) fs.rmSync(file);
    backupDatabase(this.db, file);
    this.prune();
    return this.info(name);
  }

  list(): BackupInfo[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((name) => NAME_PATTERN.test(name))
      .sort()
      .reverse()
      .map((name) => this.info(name));
  }

  /** Absolute path of a backup, or null for unknown / unsafe names. */
  resolve(name: string): string | null {
    if (!NAME_PATTERN.test(name)) return null;
    const file = path.join(this.dir, name);
    return fs.existsSync(file) ? file : null;
  }

  private info(name: string): BackupInfo {
    const stat = fs.statSync(path.join(this.dir, name));
    return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
  }

  private prune(): void {
    for (const old of this.list().slice(this.keep)) fs.rmSync(path.join(this.dir, old.name), { force: true });
  }

  /** Creates a backup if the newest one is older than a day; checks hourly. */
  startSchedule(
    onBackup: (info: BackupInfo) => void,
    onError: (error: unknown) => void = (error) => console.error('Scheduled backup failed', error),
  ): void {
    const check = () => {
      const newest = this.list()[0];
      if (!newest || Date.now() - Date.parse(newest.createdAt) > 24 * 3600_000) {
        try {
          onBackup(this.create());
        } catch (error) {
          onError(error);
        }
      }
    };
    check();
    this.timer = setInterval(check, 3600_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
