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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(env.LSG_DATA_DIR ?? './data');
  const isProduction = env.NODE_ENV === 'production';
  const secretKey = env.LSG_SECRET_KEY?.trim() ?? '';
  if (isProduction && secretKey.length < 32) {
    throw new Error('LSG_SECRET_KEY must be set to at least 32 characters in production.');
  }
  return {
    port: Number(env.LSG_API_PORT ?? 3000),
    host: env.LSG_API_HOST ?? '0.0.0.0',
    dataDir,
    databaseFile: path.join(dataDir, 'db', 'lsg.sqlite'),
    logDir: path.join(dataDir, 'logs'),
    backupDir: path.join(dataDir, 'backups'),
    initialPublicUrl: emptyToNull(env.LSG_PUBLIC_URL),
    clientIpSource: readClientIpSource(env.LSG_CLIENT_IP_HEADER),
    secretKey: secretKey || 'dev-only-insecure-secret-key-change-me!!',
    initialAdminUser: emptyToNull(env.LSG_ADMIN_USER),
    initialAdminPassword: emptyToNull(env.LSG_ADMIN_PASSWORD),
    version: env.LSG_VERSION ?? '0.1.0',
    isProduction,
  };
}
