import { UUID_PATTERN } from '@/lib/admin-applications';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid application data');
  return value as Record<string, unknown>;
}

export function relation(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row == null ? null : record(row);
}

export function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid application data');
  return value;
}

export function nullableText(value: unknown): string | null {
  return value == null ? null : text(value);
}

export function uuid(value: unknown): string {
  const result = text(value);
  if (!UUID_PATTERN.test(result)) throw new Error('Invalid application data');
  return result;
}

export function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid application data');
  return value;
}

export function rows(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid application data');
  return value;
}
