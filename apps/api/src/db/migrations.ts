export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

/** Ordered list of schema migrations. Never edit an applied migration; append a new one. */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'settings',
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `,
  },
  {
    version: 2,
    name: 'accounts-admin-audit',
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_sub TEXT NOT NULL UNIQUE,
        email TEXT,
        display_name TEXT,
        avatar_url TEXT,
        banned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        last_seen_at TEXT NOT NULL DEFAULT ${NOW}
      );
      CREATE INDEX users_email ON users (email);
      CREATE INDEX users_last_seen ON users (last_seen_at);

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL DEFAULT ${NOW},
        user_agent TEXT,
        ip TEXT
      );
      CREATE INDEX sessions_user ON sessions (user_id);
      CREATE INDEX sessions_expires ON sessions (expires_at);

      CREATE TABLE saves (
        user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        server_revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT ${NOW}
      );

      CREATE TABLE admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        totp_secret_enc TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        last_login_at TEXT
      );

      CREATE TABLE admin_sessions (
        id TEXT PRIMARY KEY,
        admin_id INTEGER NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        expires_at TEXT NOT NULL,
        ip TEXT
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL DEFAULT ${NOW},
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        details TEXT,
        ip TEXT
      );
      CREATE INDEX audit_at ON audit_log (at);

      CREATE TABLE oauth_states (
        state TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        return_to TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'login',
        created_at TEXT NOT NULL DEFAULT ${NOW}
      );
    `,
  },
];
