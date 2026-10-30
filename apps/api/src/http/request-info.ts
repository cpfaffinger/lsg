import type { FastifyRequest } from 'fastify';
import type { ClientIpSource } from '../config.ts';

function firstHeader(request: FastifyRequest, name: string): string | null {
  const value = request.headers[name];
  const text = Array.isArray(value) ? value[0] : value;
  return text?.trim() ? text.trim() : null;
}

/**
 * Real client IP. Behind Cloudflare the visitor address arrives in CF-Connecting-IP.
 * Only used for rate limiting and audit logs, never for authorization.
 */
export function clientIp(request: FastifyRequest, source: ClientIpSource): string {
  if (source === 'cf-connecting-ip') {
    const ip = firstHeader(request, 'cf-connecting-ip');
    if (ip) return ip.slice(0, 64);
  }
  if (source === 'x-forwarded-for' || source === 'cf-connecting-ip') {
    const forwarded = firstHeader(request, 'x-forwarded-for');
    const first = forwarded?.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return request.ip;
}

/**
 * Origin the browser used for this request, reconstructed from proxy headers.
 * Only a suggestion for the admin ("use this address"); the stored public URL is authoritative.
 */
export function requestOrigin(request: FastifyRequest): string {
  const host = firstHeader(request, 'x-forwarded-host') ?? firstHeader(request, 'host') ?? 'localhost';
  let proto = firstHeader(request, 'x-forwarded-proto')?.split(',')[0]?.trim() ?? null;
  const cfVisitor = firstHeader(request, 'cf-visitor');
  if (!proto && cfVisitor?.includes('"https"')) proto = 'https';
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
}

/** Accepts only http(s) URLs and reduces them to the origin (no path, query or trailing slash). */
export function normalizePublicUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}
