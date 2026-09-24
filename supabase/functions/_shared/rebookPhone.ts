/**
 * Value for the rebooking form's `Mobile=` prefill. Always keeps the real
 * country code (E.164 with "+"). Local numbers (0 + 9 digits, or bare 9
 * digits) get the organisation's own country code; nothing else is rewritten.
 */
export function rebookMobileParam(storedPhone: string | null | undefined, orgCountryCode: string): string {
  const raw = String(storedPhone ?? "").trim();
  const cc = String(orgCountryCode ?? "").replace(/\D/g, "");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (raw.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (cc && digits.startsWith(cc) && digits.length === 9 + cc.length) {
    // already includes org country code
  } else if (cc && digits.startsWith("0") && digits.length === 10) {
    digits = cc + digits.slice(1);
  } else if (cc && digits.length === 9) {
    digits = cc + digits;
  }

  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : "";
}
