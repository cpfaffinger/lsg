import type { FastifyRequest } from 'fastify';
import { badRequest } from './errors.ts';

/** Minimal body validation helpers: every route checks exactly the fields it uses. */

export function bodyOf(request: FastifyRequest): Record<string, unknown> {
  const body = request.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw badRequest('invalid_body');
  return body as Record<string, unknown>;
}

export function requiredString(body: Record<string, unknown>, key: string, max = 500): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '' || value.length > max)
    throw badRequest(`invalid_${key}`);
  return value.trim();
}

export function optionalString(body: Record<string, unknown>, key: string, max = 10_000): string | null {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > max) throw badRequest(`invalid_${key}`);
  return value;
}

export function requiredBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (typeof value !== 'boolean') throw badRequest(`invalid_${key}`);
  return value;
}

export function requiredInt(body: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw badRequest(`invalid_${key}`);
  return value;
}

export function pageParams(
  request: FastifyRequest,
  pageSize = 25,
): { page: number; limit: number; offset: number } {
  const query = request.query as Record<string, string | undefined>;
  const page = Math.max(1, Math.min(10_000, Number.parseInt(query.page ?? '1', 10) || 1));
  return { page, limit: pageSize, offset: (page - 1) * pageSize };
}

export function idParam(request: FastifyRequest): number {
  const id = Number((request.params as { id?: string }).id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('invalid_id');
  return id;
}
