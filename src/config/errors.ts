/** Error thrown for an invalid Sanmaime configuration or a failure to load it. */
export class SanmaimeConfigError extends Error {
  override name = 'SanmaimeConfigError';
}

/** Short, human-readable description of an arbitrary value for error messages. */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `${truncate(safeJson(value))} (array)`;
  if (typeof value === 'function') return 'a function';
  if (typeof value === 'object') return `${truncate(safeJson(value))} (object)`;
  if (typeof value === 'string') return `${truncate(JSON.stringify(value))} (string)`;
  if (typeof value === 'symbol') return `${value.toString()} (symbol)`;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return `${String(value)} (${typeof value})`;
  }
  return typeof value;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return Array.isArray(value) ? '[...]' : '{...}';
  }
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
