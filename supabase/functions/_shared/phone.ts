/**
 * Shared phone helpers for Irish numbers.
 *
 * Three formats are in play across the system:
 *  - `customers.phone` is stored E.164 with a leading `+` (e.g. +353871234567)
 *  - 360Messenger requires digits WITHOUT the `+` (see `_shared/whatsapp.ts`)
 *  - inbound webhooks (Tally, Telnyx, Make) send anything: 0872…, 00353…,
 *    "+353 87 123 4567", with spaces/dashes/parens.
 *
 * `samePhone` is the ONLY safe way to decide that two numbers are the same
 * line. It compares full E.164 including the country code — see
 * `phoneMatchKey`. Do NOT compare numbers with `last9Digits`.
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
 * COARSE NARROWING HINT ONLY — never an equality test.
 *
 * Returns the last 9 significant digits. This deliberately IGNORES the country
 * code, so numbers from different countries collide: `+212656802656` and
 * `+353656802656` both yield "656802656". A real collision of exactly that
 * shape existed in production data, where it made an inbound WhatsApp CANCEL
 * from a Moroccan handset indistinguishable from an Irish customer.
 *
 * Use it only to cheaply narrow a DB candidate set, then confirm every
 * candidate with `samePhone`. Returns "" when there are fewer than 9 digits.
 */
export function last9Digits(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

/**
 * Canonical identity key for a phone number: full E.164 digits, country code
 * included. Returns "" when the input cannot be a phone number, so an
 * unmatchable value never accidentally matches another.
 *
 * A bare 9-digit local fragment with no prefix ("871234567") is assumed Irish
 * and resolved to "353871234567", matching how legacy rows were stored.
 */
export function phoneMatchKey(raw: unknown): string {
  let key: string;
  try {
    key = toE164Digits(raw);
  } catch {
    return "";
  }
  // Bare Irish local fragment (9 significant digits, no country code).
  if (key.length === 9) key = "353" + key;
  return key;
}

/**
 * True when two numbers refer to the same line, ignoring formatting but
 * REQUIRING the country code to agree.
 */
export function samePhone(a: unknown, b: unknown): boolean {
  const ka = phoneMatchKey(a);
  const kb = phoneMatchKey(b);
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
