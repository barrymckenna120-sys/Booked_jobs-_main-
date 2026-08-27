// Shared GPRN (Gas Point Reference Number) format validation.
// Soft validation only — callers show a warning but never block submission.
export function isValidGprnFormat(value: string): boolean {
  return /^\d{7}$/.test(value.trim());
}

export const GPRN_WARNING_MESSAGE =
  "Doesn't look like a GPRN (usually 7 digits) — will still save";
