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
