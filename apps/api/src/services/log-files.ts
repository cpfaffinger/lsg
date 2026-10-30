import fs from 'node:fs';
import path from 'node:path';

const FILE_PATTERN = /^api-(\d{4}-\d{2}-\d{2})\.log$/;

/**
 * Log destination for the API: every line goes to stdout (container log) and to one file per
 * day in the log folder (`data/logs/api-YYYY-MM-DD.log`). Files older than `keepDays` are removed.
 */
export class DailyLogStream {
  private readonly dir: string;
  private readonly keepDays: number;
  private readonly now: () => Date;
  private readonly echo: boolean;
  private day = '';
  private file: fs.WriteStream | null = null;

  constructor(dir: string, options: { keepDays?: number; now?: () => Date; echo?: boolean } = {}) {
    this.dir = dir;
    this.keepDays = options.keepDays ?? 30;
    this.now = options.now ?? (() => new Date());
    this.echo = options.echo ?? true;
  }

  write(line: string): void {
    if (this.echo) process.stdout.write(line);
    try {
      this.current().write(line);
    } catch {
      // A full or read-only disk must never break request handling; stdout still has the line.
    }
  }

  close(): Promise<void> {
    const file = this.file;
    this.file = null;
    return new Promise((resolve) => (file ? file.end(resolve) : resolve()));
  }

  private current(): fs.WriteStream {
    const day = this.now().toISOString().slice(0, 10);
    if (day !== this.day || !this.file) {
      this.file?.end();
      fs.mkdirSync(this.dir, { recursive: true });
      this.file = fs.createWriteStream(path.join(this.dir, `api-${day}.log`), { flags: 'a' });
      this.file.on('error', () => undefined);
      this.day = day;
      this.prune();
    }
    return this.file;
  }

  private prune(): void {
    const cutoff = new Date(this.now().getTime() - this.keepDays * 86_400_000).toISOString().slice(0, 10);
    for (const name of fs.readdirSync(this.dir)) {
      const match = FILE_PATTERN.exec(name);
      if (match?.[1] && match[1] < cutoff) fs.rmSync(path.join(this.dir, name), { force: true });
    }
  }
}
