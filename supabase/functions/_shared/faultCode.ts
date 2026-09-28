/**
 * Single source of truth for fault-code normalisation and matching, shared by
 * the engineer app (via src/lib/faultCode.ts re-export) and public-fault-lookup.
 *
 * - Case-insensitive; ignores spaces, dots and dashes ("e 133" = "E-133" = "E133").
 * - "/" separates alternatives: "F4 / L4" matches "F4", "L4" and "F4/L4".
 * - An empty normalised search (e.g. "", "-", "--", spaces) never matches.
 * - An exact match always beats a partial (prefix) suggestion.
 */

export const normCode = (c: string): string =>
  (c ?? "").trim().toUpperCase().replace(/[\s.-]/g, "");

/** Normalised keys a stored code answers to: the whole code plus each "/" alternative. */
export const codeKeys = (stored: string): string[] => {
  const whole = normCode(stored);
  const parts = (stored ?? "").split("/").map(normCode);
  return [...new Set([whole, ...parts])].filter((k) => k.length > 0);
};

/** Exact match of a search against one stored code. Empty searches never match. */
export const codeMatches = (stored: string, search: string): boolean => {
  const q = normCode(search);
  return q.length > 0 && codeKeys(stored).includes(q);
};

/** First row whose code exactly matches the search, or null. */
export const findExactCode = <T extends { code: string }>(rows: T[], search: string): T | null =>
  rows.find((r) => codeMatches(r.code, search)) ?? null;

/** True when some code (or alternative) still starts with what was typed. Empty never counts. */
export const anyCodeStartsWith = (rows: { code: string }[], search: string): boolean => {
  const q = normCode(search);
  return q.length > 0 && rows.some((r) => codeKeys(r.code).some((k) => k.startsWith(q)));
};
