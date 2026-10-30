import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Supported sources for the real client IP when running behind a proxy. */
export type ClientIpSource = 'cf-connecting-ip' | 'x-forwarded-for' | 'none';

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  databaseFile: string;
  logDir: string;
  backupDir: string;
  /** Optional initial public URL; the admin area setting takes precedence once stored. */
  initialPublicUrl: string | null;
  clientIpSource: ClientIpSource;
  /** 32-byte key (hex or base64) used to encrypt secrets such as the Google client secret at rest. */
  secretKey: string;
  initialAdminUser: string | null;
  initialAdminPassword: string | null;
  version: string;
  isProduction: boolean;
}

function readClientIpSource(value: string | undefined): ClientIpSource {
  const normalized = (value ?? 'cf-connecting-ip').trim().toLowerCase();
  if (normalized === 'cf-connecting-ip' || normalized === 'x-forwarded-for' || normalized === 'none') {
    return normalized;
  }
  throw new Error(`Invalid LSG_CLIENT_IP_HEADER "${value}". Use cf-connecting-ip, x-forwarded-for or none.`);
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Uses LSG_SECRET_KEY when provided; otherwise generates a random key once and stores it
 * in <data>/secret.key so it survives restarts and is included in data-folder backups.
 */
export function resolveSecretKey(envValue: string | undefined, dataDir: string, persist: boolean): string {
  const fromEnv = envValue?.trim() ?? '';
  if (fromEnv) {
    if (fromEnv.length < 32) throw new Error('LSG_SECRET_KEY must be at least 32 characters long.');
    return fromEnv;
  }
  if (!persist) return 'test-only-insecure-secret-key-000000000000';
  const file = path.join(dataDir, 'secret.key');
  try {
    const stored = fs.readFileSync(file, 'utf8').trim();
    if (stored.length >= 32) return stored;
  } catch {
    // Not created yet.
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, `${generated}\n`, { mode: 0o600 });
  console.info(`Generated a new secret key at ${file}. Keep it with your backups.`);
  return generated;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options = { persistSecret: true },
): AppConfig {
  // Default: <repo>/data, the same folder docker-compose.yml bind-mounts into the container.
  const dataDir = path.resolve(env.LSG_DATA_DIR ?? path.join(import.meta.dirname, '..', '..', '..', 'data'));
  const isProduction = env.NODE_ENV === 'production';
  const secretKey = resolveSecretKey(env.LSG_SECRET_KEY, dataDir, options.persistSecret);
  return {
    port: Number(env.LSG_API_PORT ?? 3000),
    host: env.LSG_API_HOST ?? '0.0.0.0',
    dataDir,
    databaseFile: path.join(dataDir, 'db', 'lsg.sqlite'),
    logDir: path.join(dataDir, 'logs'),
    backupDir: path.join(dataDir, 'backups'),
    initialPublicUrl: emptyToNull(env.LSG_PUBLIC_URL),
    clientIpSource: readClientIpSource(env.LSG_CLIENT_IP_HEADER),
    secretKey,
    initialAdminUser: emptyToNull(env.LSG_ADMIN_USER),
    initialAdminPassword: emptyToNull(env.LSG_ADMIN_PASSWORD),
    version: env.LSG_VERSION ?? packageVersion(),
    isProduction,
  };
}

/** Version from apps/api/package.json, so releases only bump the package files. */
function packageVersion(): string {
  try {
    const file = path.join(import.meta.dirname, '..', 'package.json');
    return (JSON.parse(fs.readFileSync(file, 'utf8')) as { version?: string }).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
