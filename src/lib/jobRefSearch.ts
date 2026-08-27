/**
 * Extract the numeric portion from a job reference search input.
 * Strips non-digit characters so tenant-specific prefixes (KN, DG, etc.) all work.
 * Returns the numeric string or null if no digits found.
 *
 * Examples: "KN-123" → "123", "DG-9001" → "9001", "123" → "123", "kn 45" → "45"
 */
export function extractRefDigits(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

const normalizeDigits = (value: string): string | null => {
  const digits = extractRefDigits(value);
  if (!digits) return null;
  const normalized = digits.replace(/^0+/, "");
  return normalized || "0";
};

/**
 * Check if a job_reference (e.g. "KN-123") matches search digits.
 */
export function matchesJobRef(jobReference: string | null | undefined, searchDigits: string): boolean {
  if (!jobReference) return false;
  const refDigits = extractRefDigits(jobReference);
  const queryDigits = normalizeDigits(searchDigits);
  if (!refDigits || !queryDigits) return false;
  return normalizeDigits(refDigits) === queryDigits;
}
