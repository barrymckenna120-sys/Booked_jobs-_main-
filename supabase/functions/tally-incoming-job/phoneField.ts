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

import { parsePhoneNumberFromString } from "npm:libphonenumber-js@1.13.14/min";

const LEGACY_IRISH = /^(\+353|0)[0-9]{8,9}$/;

/**
 * Clean an intake number to E.164. Local-only numbers are assumed Irish,
 * matching today's behaviour; `00CC…` is treated as an international prefix.
 */
export function normaliseIntakePhone(raw: string): string {
  const s = raw.replace(/[\s\-().]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return "+" + s.slice(2);
  if (s.startsWith("353")) return "+" + s;
  return "+353" + s.replace(/^0/, "");
}

/**
 * True for a genuinely plausible number: a real country code and a correct
 * digit count for that country. Every Irish format accepted before stays accepted.
 */
export function isValidIntakePhone(raw: string): boolean {
  const cleaned = raw.replace(/[\s\-().]/g, "");
  if (LEGACY_IRISH.test(cleaned)) return true;
  if (!/^\+?[0-9]{6,17}$/.test(cleaned)) return false;
  const e164 = normaliseIntakePhone(cleaned);
  if (!/^\+[1-9][0-9]{6,14}$/.test(e164)) return false;
  const parsed = parsePhoneNumberFromString(e164);
  return Boolean(parsed && parsed.isPossible());
}
