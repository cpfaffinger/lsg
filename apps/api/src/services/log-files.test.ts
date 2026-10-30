import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DailyLogStream } from './log-files.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsg-logs-'));
  dirs.push(dir);
  return dir;
}

describe('DailyLogStream', () => {
  it('writes one file per day and removes files older than the retention', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'api-2026-01-01.log'), 'old\n');
    fs.writeFileSync(path.join(dir, 'api-2026-10-20.log'), 'recent\n');
    fs.writeFileSync(path.join(dir, 'other.txt'), 'keep\n');
    let now = new Date('2026-10-30T10:00:00Z');
    const stream = new DailyLogStream(dir, { keepDays: 30, now: () => now, echo: false });
    stream.write('first\n');
    now = new Date('2026-10-31T00:00:01Z');
    stream.write('second\n');
    await stream.close();

    expect(fs.readdirSync(dir).sort()).toEqual([
      'api-2026-10-20.log',
      'api-2026-10-30.log',
      'api-2026-10-31.log',
      'other.txt',
    ]);
    expect(fs.readFileSync(path.join(dir, 'api-2026-10-30.log'), 'utf8')).toBe('first\n');
    expect(fs.readFileSync(path.join(dir, 'api-2026-10-31.log'), 'utf8')).toBe('second\n');
  });
});
