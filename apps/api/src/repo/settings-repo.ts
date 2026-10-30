import type { Database } from '../db/database.ts';
import { decrypt, encrypt, type Keys } from '../security/crypto.ts';

/** Known setting keys. Secret values are stored encrypted. */
export type SettingKey =
  | 'public_url'
  | 'google_enabled'
  | 'google_client_id'
  | 'google_client_secret'
  | 'google_last_test'
  | 'maintenance_mode'
  | 'announcement'
  | 'legal_imprint'
  | 'legal_privacy'
  | 'last_backup_at';

const SECRET_KEYS: ReadonlySet<SettingKey> = new Set(['google_client_secret']);

/** Typed access to the key/value settings table. */
export class SettingsRepo {
  private readonly db: Database;
  private readonly keys: Keys;
  private readonly cache = new Map<SettingKey, string | null>();

  constructor(db: Database, keys: Keys) {
    this.db = db;
    this.keys = keys;
  }

  get(key: SettingKey): string | null {
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined;
    let value: string | null = row?.value ?? null;
    if (value !== null && SECRET_KEYS.has(key)) {
      try {
        value = decrypt(this.keys, value);
      } catch {
        // Wrong LSG_SECRET_KEY or corrupted value: treat as unset so the admin can re-enter it.
        value = null;
      }
    }
    this.cache.set(key, value);
    return value;
  }

  getBool(key: SettingKey): boolean {
    return this.get(key) === 'true';
  }

  set(key: SettingKey, value: string | null): void {
    this.cache.delete(key);
    if (value === null) {
      this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
      return;
    }
    const stored = SECRET_KEYS.has(key) ? encrypt(this.keys, value) : value;
    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, stored);
  }

  setBool(key: SettingKey, value: boolean): void {
    this.set(key, value ? 'true' : 'false');
  }
}
