/** Shared validation helpers for customer forms */

export type CustomerFieldErrors = Record<string, string>;

const PHONE_RE = /^(\+?353|0)\d{7,10}$/;
const EIRCODE_RE = /^[A-Z]\d[\dW][A-Z0-9]{4}$/i;
const AREA_CODE_RE = /^(0\d{1,2}|D\d{1,2}W?|[A-Z][A-Za-z\s]{1,29})$/i;

export const validatePhone = (raw: string): string | null => {
  const stripped = raw.replace(/\s+/g, "");
  if (!stripped) return "This field is required";
  if (!PHONE_RE.test(stripped)) return "Enter a valid Irish mobile number (e.g. 083 123 4567)";
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

export const RED_BORDER = "ring-2 ring-[#EF4444] border-[#EF4444]";
