/**
 * Step 4 — Calm the Network.
 *
 * Centralised React Query behaviour so screens stop hammering the network on
 * weak 4G/5G. Kept in its own module so the retry rules are unit-testable and
 * shared rather than re-implemented per query.
 */

/** Requests hung on a dead socket resolve into an error instead of spinning. */
export const REQUEST_TIMEOUT_MS = 15_000;

export class RequestTimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

/**
 * Pull an HTTP-ish status code out of whatever the failure was. Supabase
 * PostgREST errors carry a numeric `code` string, edge-function errors carry
 * `status`, and fetch failures carry neither.
 */
export function extractStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as Record<string, unknown>;
  for (const key of ["status", "statusCode", "httpStatus"]) {
    const value = candidate[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
  }
  return null;
}

/** Postgres/PostgREST codes that will never succeed on a retry. */
const NON_RETRYABLE_PG_CODES = new Set([
  "42501", // insufficient_privilege (RLS denial)
  "PGRST301", // JWT expired / not authorised
  "PGRST116", // no rows for single()
  "23505", // unique violation
]);

/**
 * Retry once for transient/network/5xx failures only. A 4xx — including an RLS
 * denial — is a decision, not a blip: retrying it just burns radio time.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof RequestTimeoutError) return false;

  const pgCode = (error as { code?: unknown } | null)?.code;
  if (typeof pgCode === "string" && NON_RETRYABLE_PG_CODES.has(pgCode)) return false;

  const status = extractStatus(error);
  if (status !== null && status >= 400 && status < 500) return false;

  return true;
}

/** Short capped backoff — a field engineer should never wait 30s for attempt 2. */
export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 5000);
}

/**
 * Rejects with RequestTimeoutError if the underlying promise never settles, so
 * a hung request always reaches a terminal state.
 */
export function withRequestTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RequestTimeoutError()), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
