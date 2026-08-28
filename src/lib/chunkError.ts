/**
 * Chunk-load failure detection + a single, session-wide reload budget.
 *
 * All routes are `lazy()`-loaded, so a tab left open across a deploy can fail
 * to fetch a hashed chunk that no longer exists. One reload fixes it. More than
 * one would be a loop, so the budget is shared between the React error boundary
 * and the global window handlers via sessionStorage.
 */

const RELOAD_FLAG = "bj_chunk_reload_attempted";

const CHUNK_ERROR_PATTERNS = [
  "chunkloaderror",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "unable to preload css",
  "failed to load module script",
];

/** True when the error looks like a stale/missing JS or CSS chunk. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  const name = typeof error === "object" && error !== null && "name" in error
    ? String((error as { name?: unknown }).name ?? "")
    : "";

  if (name.toLowerCase() === "chunkloaderror") return true;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";

  const haystack = message.toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => haystack.includes(pattern));
}

/** True when a chunk reload has already been spent this session. */
export function hasAttemptedChunkReload(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === "1";
  } catch {
    return false;
  }
}

/**
 * Consumes the one-per-session reload budget.
 * Returns true if this call may reload, false if the budget is already spent.
 */
export function consumeChunkReloadBudget(): boolean {
  if (hasAttemptedChunkReload()) return false;
  try {
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    // Private mode / storage disabled: without a durable flag a reload could
    // loop, so refuse rather than risk it.
    return false;
  }
  return true;
}

/**
 * If `error` is a chunk failure and the budget allows it, reload once.
 * Returns true when a reload was triggered (caller should render nothing new).
 */
export function maybeReloadForChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false;
  if (!consumeChunkReloadBudget()) return false;
  window.location.reload();
  return true;
}

/** Test-only helper. */
export function resetChunkReloadBudget(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* noop */
  }
}
