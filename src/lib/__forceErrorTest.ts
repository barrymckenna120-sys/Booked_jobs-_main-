/**
 * TEMPORARY verification helper — remove after the Step 3 browser test run.
 * Throws during render when `?forceError=1` is present, so route-level error
 * boundaries can be exercised from a real browser session.
 */
export const maybeForceError = (tag: string) => {
  if (typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).get("forceError") === "1") {
    throw new Error(`Forced verification error: ${tag}`);
  }
};
