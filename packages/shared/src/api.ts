import type { SaveData } from './save.ts';

/** Header every state-changing request must carry (CSRF protection). */
export const CSRF_HEADER_NAME = 'x-lsg-request';

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/** Response of GET /api/healthz. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  database: {
    ok: boolean;
    schemaVersion: number;
  };
}

/** Public, unauthenticated configuration the game client needs at startup. */
export interface PublicConfigResponse {
  googleLoginEnabled: boolean;
  maintenanceMode: boolean;
  announcement: string | null;
}

export interface LegalResponse {
  imprint: string;
  privacy: string;
}

export interface PlayerProfile {
  id: number;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export interface MeResponse {
  user: PlayerProfile | null;
}

export interface SaveGetResponse {
  save: SaveData | null;
  serverRevision: number;
}

export interface SavePutRequest {
  save: SaveData;
  /** Server revision the client's save is based on (0 if the server had none). */
  baseRevision: number;
}

export interface SavePutResponse {
  serverRevision: number;
}

/** 409 body: the client must merge with the server copy and retry. */
export interface SaveConflictResponse extends ApiErrorBody {
  save: SaveData | null;
  serverRevision: number;
}

// ------------------------------------------------------------------ admin

export interface AdminMe {
  id: number;
  username: string;
  totpEnabled: boolean;
  mustChangePassword: boolean;
}

export interface AdminLoginRequest {
  username: string;
  password: string;
  code?: string;
}

export interface PublicUrlState {
  /** Effective URL used for redirects and cookies. */
  url: string;
  source: 'settings' | 'environment' | 'request';
  /** Value stored in the admin settings, if any. */
  stored: string | null;
  /** Origin of the admin's current request, offered as a suggestion. */
  detected: string;
}

export interface GoogleTestResult {
  ok: boolean;
  at: string;
  email: string | null;
  error: string | null;
}

export interface GoogleSettingsState {
  enabled: boolean;
  clientId: string | null;
  hasSecret: boolean;
  lastTest: GoogleTestResult | null;
  /** True when enabled and fully configured, i.e. players see the sign-in button. */
  active: boolean;
}

export interface GoogleSetupGuide {
  publicUrl: string;
  publicUrlSource: PublicUrlState['source'];
  javascriptOrigin: string;
  redirectUri: string;
  authorizedDomain: string;
  homePageUrl: string;
  privacyPolicyUrl: string;
  scopes: string[];
  consoleUrls: { credentials: string; consentScreen: string; newProject: string };
  warnings: string[];
}

export interface GoogleCheck {
  id: string;
  ok: boolean;
  message: string;
}

export interface AdminSettingsResponse {
  publicUrl: PublicUrlState;
  google: GoogleSettingsState;
  game: { maintenanceMode: boolean; announcement: string | null };
  legal: { imprint: string | null; privacy: string | null; defaultImprint: string; defaultPrivacy: string };
}

export interface AdminOverview {
  version: string;
  nodeVersion: string;
  uptimeSeconds: number;
  schemaVersion: number;
  databaseBytes: number;
  users: {
    users: number;
    activeToday: number;
    activeWeek: number;
    newWeek: number;
    banned: number;
    sessions: number;
  };
  lastBackup: { name: string; createdAt: string; sizeBytes: number } | null;
  publicUrl: PublicUrlState;
  google: GoogleSettingsState;
  warnings: string[];
}

export interface AdminPlayer {
  id: number;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  banned: boolean;
  createdAt: string;
  lastSeenAt: string;
  progress: {
    levelsCompleted: number;
    stars: number;
    coins: number;
    endlessBest: number;
    runs: number;
  } | null;
}

export interface AdminPlayersResponse {
  players: AdminPlayer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminPlayerDetail extends AdminPlayer {
  save: SaveData | null;
  serverRevision: number;
  saveUpdatedAt: string | null;
}

export interface AdminStats {
  users: AdminOverview['users'];
  levelCompletions: Record<string, number>;
  totalKills: number;
  totalRuns: number;
  endlessBest: number;
}

export interface AdminAuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  target: string | null;
  details: unknown;
  ip: string | null;
}

export interface AdminAuditResponse {
  entries: AdminAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminBackup {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AdminAccount {
  id: number;
  username: string;
  totpEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}
