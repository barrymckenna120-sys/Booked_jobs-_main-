/**
 * Shared phone helpers for Irish numbers.
 *
 * Three formats are in play across the system:
 *  - `customers.phone` is stored E.164 with a leading `+` (e.g. +353871234567)
 *  - 360Messenger requires digits WITHOUT the `+` (see `_shared/whatsapp.ts`)
 *  - inbound webhooks (Tally, Telnyx, Make) send anything: 0872…, 00353…,
 *    "+353 87 123 4567", with spaces/dashes/parens.
 *
 * `last9Digits` is the format-agnostic matching key: compare the last 9
 * significant digits within a single organisation. Prefer it over string
 * equality for ANY inbound-number → customer lookup.
 */

/** Normalise an Irish number to E.164 with a leading `+`. Returns "" if unusable. */
export function normalisePhoneE164(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.replace(/[\s\-()]/g, "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("353")) return "+" + trimmed;
  return "+353" + trimmed.replace(/^0/, "");
}

/**
 * Last-9-digit matching key, tolerant of legacy/formatted inputs.
 * Returns "" when there are fewer than 9 digits, so callers can treat an
 * empty key as "not matchable" rather than accidentally matching each other.
 */
export function last9Digits(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

/** True when two numbers refer to the same line, ignoring formatting. */
export function samePhone(a: unknown, b: unknown): boolean {
  const ka = last9Digits(a);
  const kb = last9Digits(b);
  return ka !== "" && ka === kb;
}

/**
 * Digits-only E.164 for outbound messaging APIs (360Messenger wants NO `+`).
 *
 * Accepts anything sensible and is explicitly NOT Irish-only — an inbound
 * international number (e.g. a Moroccan +212…) must still be replyable:
 *  - "+212656802656" / "212656802656" / "00212656802656" -> "212656802656"
 *  - Irish local forms ("0871234567") get the 353 country code added.
 * Throws only when the input cannot be a valid E.164 number (8-15 digits,
 * leading digit 1-9).
 */
export function toE164Digits(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const digits = s.replace(/\D/g, "");
  if (!digits) throw new Error(`Unrecognised phone format: "${raw}"`);

  let candidate: string;
  if (s.startsWith("+")) candidate = digits;
  else if (digits.startsWith("00")) candidate = digits.slice(2);
  else if (digits.startsWith("0")) candidate = "353" + digits.slice(1);
  else candidate = digits;

  if (!/^[1-9]\d{7,14}$/.test(candidate)) {
    throw new Error(`Unrecognised phone format: "${raw}"`);
  }
  return candidate;
}
