export interface Migration {
  version: number;
  name: string;
  sql: string;
}

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
];
