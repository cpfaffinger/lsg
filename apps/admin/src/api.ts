import { CSRF_HEADER_NAME, type ApiErrorBody } from '@lsg/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();

/** Called whenever the API answers 401, so the app can show the login screen. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { [CSRF_HEADER_NAME]: '1' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    if (
      response.status === 401 &&
      error?.code !== 'totp_required' &&
      error?.code !== 'invalid_credentials' &&
      error?.code !== 'invalid_totp'
    ) {
      for (const listener of unauthorizedListeners) listener();
    }
    throw new ApiError(
      response.status,
      error?.code ?? 'http_error',
      error?.message ?? `HTTP ${response.status}`,
    );
  }
  return data as T;
}

/** Human-readable messages for API error codes shown in the admin UI. */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong username or password.',
  invalid_totp: 'The authenticator code is not valid.',
  totp_required: 'Enter the code from your authenticator app.',
  rate_limited: 'Too many attempts. Please wait a minute.',
  password_too_short: 'The password must be at least 12 characters long.',
  password_unchanged: 'Choose a password different from the current one.',
  invalid_public_url: 'Enter a full address such as https://lsg.example.com.',
  invalid_client_id: 'This does not look like a Google OAuth client ID (…apps.googleusercontent.com).',
  google_incomplete: 'Client ID and client secret are required before sign-in can be enabled.',
  username_taken: 'This username already exists.',
  invalid_username: 'Use 3–64 letters, digits, dots, dashes or underscores.',
  cannot_delete_self: 'You cannot delete your own account.',
  last_admin: 'The last admin account cannot be deleted.',
  csrf: 'The request was blocked by the CSRF protection. Reload the page.',
  csrf_origin: 'The request came from an unexpected address. Check the public URL setting.',
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? error.message;
  return String(error);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString();
}

export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}
