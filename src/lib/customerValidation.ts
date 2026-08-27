/** Shared validation helpers for customer forms */

export type CustomerFieldErrors = Record<string, string>;

const PHONE_RE = /^(\+?353|0)\d{7,10}$/;
const EIRCODE_RE = /^[A-Z]\d[\dW][A-Z0-9]{4}$/i;
const AREA_CODE_RE = /^(0\d{1,2}|D\d{1,2}W?|[A-Z][A-Za-z\s]{1,29})$/i;

/** Irish mobile prefixes (national form, without the leading 0). */
const MOBILE_PREFIXES = ["83", "84", "85", "86", "87", "89"];

/** Reduce any accepted Irish input to its 9-digit national form (e.g. "871234567"). */
const toNationalDigits = (raw: string): string => {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("353")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
};

/** Primary mobile-number field: required, must be an Irish MOBILE (08x), not a landline. */
export const validatePhone = (raw: string): string | null => {
  const stripped = raw.replace(/\s+/g, "");
  if (!stripped) return "This field is required";
  if (!PHONE_RE.test(stripped)) return "Enter a valid Irish mobile number (e.g. 083 123 4567)";
  const national = toNationalDigits(stripped);
  if (national.length !== 9 || !MOBILE_PREFIXES.some((p) => national.startsWith(p))) {
    return "Must be a mobile number (083/085/086/087/089) — use the Landline field for landlines";
  }
  return null;
};

/** Legacy shape-only check: Irish number of plausible length, mobile or landline.
 *  Used for pre-existing records whose phone the user hasn't edited. */
export const validatePhoneLegacyShape = (raw: string): string | null => {
  const stripped = raw.replace(/\s+/g, "");
  if (!stripped) return "This field is required";
  if (!PHONE_RE.test(stripped)) return "Enter a valid Irish phone number";
  return null;
};

/** Optional landline field: sanity only — 7–15 digits when present. Never used for sends. */
export const validateLandline = (raw: string): string | null => {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 7 || digits.length > 15) return "Enter a valid phone number";
  return null;
};

/**
 * COARSE NARROWING HINT ONLY — never an equality test.
 *
 * Returns the last 9 significant digits, deliberately ignoring the country
 * code, so numbers from different countries collide ("+212656802656" and
 * "+353656802656" both → "656802656"). Use it to narrow a candidate set, then
 * confirm with `samePhone`.
 *
 * Deliberate frontend twin of `last9Digits` in
 * `supabase/functions/_shared/phone.ts` — Edge Function modules cannot be
 * imported into the Vite bundle. Keep the two in sync; both are unit-tested.
 */
export const last9Digits = (raw: string | null | undefined): string => {
  if (!raw || typeof raw !== "string") return "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
};

/**
 * Canonical identity key: full E.164 digits, country code included. Returns ""
 * when unusable. A bare 9-digit local fragment is assumed Irish.
 *
 * Frontend twin of `phoneMatchKey` in `supabase/functions/_shared/phone.ts`.
 */
export const phoneMatchKey = (raw: string | null | undefined): string => {
  const s = String(raw ?? "").trim();
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";

  let candidate: string;
  if (s.startsWith("+")) candidate = digits;
  else if (digits.startsWith("00")) candidate = digits.slice(2);
  else if (digits.startsWith("0")) candidate = "353" + digits.slice(1);
  else candidate = digits;

  if (!/^[1-9]\d{7,14}$/.test(candidate)) return "";
  // Bare Irish local fragment (9 significant digits, no country code).
  if (candidate.length === 9) candidate = "353" + candidate;
  return candidate;
};

/**
 * True when two numbers refer to the same line, ignoring formatting but
 * REQUIRING the country code to agree.
 *
 * Frontend twin of `samePhone` in `supabase/functions/_shared/phone.ts`.
 */
export const samePhone = (
  a: string | null | undefined,
  b: string | null | undefined,
): boolean => {
  const ka = phoneMatchKey(a);
  const kb = phoneMatchKey(b);
  return ka !== "" && ka === kb;
};





export const validateEircode = (raw: string): string | null => {
  const stripped = raw.replace(/\s+/g, "");
  if (!stripped) return "This field is required";
  if (!EIRCODE_RE.test(stripped)) return "Enter a valid Eircode (e.g. D01 X2Y3)";
  return null;
};

export const validateAreaCode = (raw: string): string | null => {
  const stripped = raw.trim();
  if (!stripped) return null; // optional field
  if (!AREA_CODE_RE.test(stripped)) return "Enter a valid area code (e.g. 01, 021, D7, D15)";
  return null;
};

export const validateRequired = (val: string): string | null => {
  if (!val.trim()) return "This field is required";
  return null;
};

/** Format eircode to uppercase with space (e.g. "d01x2y3" → "D01 X2Y3") */
export const formatEircode = (raw: string): string => {
  const stripped = raw.replace(/\s+/g, "").toUpperCase();
  if (stripped.length === 7) return stripped.slice(0, 3) + " " + stripped.slice(3);
  return stripped;
};

/** Convert an Irish mobile number to +353 international format.
 *  Strips spaces, removes leading +353/353/0, then prepends +353.
 *  e.g. "087 123 4567" → "+3531234567" … wait, "0871234567" → "+353871234567" */
export const formatPhoneInternational = (raw: string): string => {
  let stripped = raw.replace(/\s+/g, "");
  // Remove leading + if present
  if (stripped.startsWith("+")) stripped = stripped.slice(1);
  // Remove leading 353 country code
  if (stripped.startsWith("353")) stripped = stripped.slice(3);
  // Remove leading 0
  if (stripped.startsWith("0")) stripped = stripped.slice(1);
  return `+353${stripped}`;
};

/** Normalise area code: "Dublin 15" → "D15", "Dublin 6W" → "D6W", trim & uppercase */
export const normalizeAreaCode = (raw: string): string => {
  let val = raw.trim();
  val = val.replace(/^dublin\s+/i, "D");
  return val.toUpperCase();
};

export const RED_BORDER = "ring-2 ring-[#EF4444] border-[#EF4444]";
