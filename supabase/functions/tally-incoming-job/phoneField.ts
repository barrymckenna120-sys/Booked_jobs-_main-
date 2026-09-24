/**
 * Tolerant lookup of the booking-intake phone field.
 *
 * The exact key `mobile_number` always wins (unchanged behaviour). If it is
 * absent, a small explicit alias list is tried — covering past form-label
 * edits such as the "Moblie No" misspelling. Every candidate must look like
 * a phone number, so an unrelated field can never be picked up by name alone.
 */

export const PHONE_FIELD_KEYS = [
  "mobile_number",
  "mobile_no",
  "moblie_no",
  "moblie_number",
  "mobile",
  "phone",
  "phone_number",
  "telephone",
  "contact_number",
] as const;

const PHONE_SHAPE = /^\+?[0-9]{7,15}$/;

export const looksLikePhoneValue = (value: string): boolean =>
  PHONE_SHAPE.test(value.replace(/[\s\-().]/g, ""));

/** Returns the trimmed phone value (max `maxLen`) or null. */
export function pickPhoneField(body: Record<string, unknown>, maxLen: number): string | null {
  for (const key of PHONE_FIELD_KEYS) {
    const raw = body[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim().substring(0, maxLen);
    if (value && looksLikePhoneValue(value)) return value;
  }
  // Preserve today's behaviour: a non-phone-looking `mobile_number` still
  // flows through to the existing "Invalid mobile number format" rejection.
  const exact = body.mobile_number;
  if (typeof exact === "string" && exact.trim()) return exact.trim().substring(0, maxLen);
  return null;
}
