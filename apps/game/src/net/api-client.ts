import { CSRF_HEADER_NAME } from '@lsg/shared';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

/**
 * Small fetch wrapper for the game. Network failures resolve with status 0 instead of
 * throwing, because the game must keep working as a pure guest/offline app.
 */
export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 6000,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { [CSRF_HEADER_NAME]: '1' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  try {
    const response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let data: T | null = null;
    try {
      data = text ? (JSON.parse(text) as T) : null;
    } catch {
      // Not JSON (e.g. static hosting without the API returns index.html).
      return { ok: false, status: 0, data: null };
    }
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
