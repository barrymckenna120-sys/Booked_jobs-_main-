/**
 * Extract the numeric portion from a job reference search input.
 * Strips spaces, dashes, and the "KN" prefix (case-insensitive).
 * Returns the numeric string or null if no digits found.
 *
 * Examples: "KN-123" → "123", "kn123" → "123", "123" → "123", "kn 45" → "45"
 */
export function extractRefDigits(input: string): string | null {
  const stripped = input.replace(/[\s-]/g, "").replace(/^kn/i, "");
  return /^\d+$/.test(stripped) && stripped.length > 0 ? stripped : null;
}

/**
 * Check if a job_reference (e.g. "KN-123") matches search digits.
 */
export function matchesJobRef(jobReference: string | null | undefined, searchDigits: string): boolean {
  if (!jobReference) return false;
  const refDigits = jobReference.replace(/[\s-]/g, "").replace(/^kn/i, "");
  return refDigits === searchDigits.replace(/^0+/, "") || refDigits === searchDigits.padStart(3, "0").replace(/^0+/, "") || jobReference.toLowerCase() === ("kn-" + searchDigits.padStart(3, "0")).toLowerCase();
}
