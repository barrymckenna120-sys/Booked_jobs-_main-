/**
 * Hard ceiling for the full-screen startup loader.
 *
 * Every startup stall that is not a bounded request — a lazy route chunk whose
 * fetch hangs on a dead cellular connection, for example — previously left
 * "Loading..." on screen forever with no error and no retry. The loader now
 * flips to a retry state once this ceiling passes.
 *
 * Deliberately above REQUEST_TIMEOUT_MS (15s) so a slow-but-working connection
 * finishing just inside its own timeout is never cut short.
 */
export const STARTUP_TIMEOUT_MS = 25_000;

/** True once the loader has been on screen long enough to be considered stuck. */
export function shouldShowStartupTimeout(
  elapsedMs: number,
  ceilingMs: number = STARTUP_TIMEOUT_MS
): boolean {
  return elapsedMs >= ceilingMs;
}
