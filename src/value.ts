/** Narrow values entering from YAML, JSON, and persisted plugin settings. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}
export function stringList(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/[,\s]+/);
  return Array.isArray(value) ? value.filter((entry: unknown): entry is string => typeof entry === 'string') : [];
}
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  return JSON.stringify(value) ?? '';
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : valueText(error);
}
export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(character => character.charCodeAt(0) < 32);
}
