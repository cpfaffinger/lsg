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
