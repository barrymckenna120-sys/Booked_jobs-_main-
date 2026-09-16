// Export-only formatting helpers for the customer Excel export.
// These never write to the database — they normalise values as they are
// written into the spreadsheet.

/** Collapse whitespace, trim. Leaves punctuation and capitalisation alone. */
export const cleanText = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
};

/**
 * Phone numbers are exported as text in international form where we can be
 * confident of the transformation. Anything unusual is passed through cleaned
 * but otherwise untouched.
 */
export const formatPhoneForExport = (raw: unknown): string => {
  const v = cleanText(raw).replace(/[\s()\-.]/g, "");
  if (!v) return "";
  if (v.startsWith("+")) return v;
  if (v.startsWith("00")) return `+${v.slice(2)}`;
  if (/^353\d{6,}$/.test(v)) return `+${v}`;
  if (/^0\d{7,}$/.test(v)) return `+353${v.slice(1)}`;
  return v;
};

const EIRCODE_RE = /^([A-Z]\d{2}|D6W)\s*([A-Z0-9]{4})$/;

/** D24W289 -> "D24 W289". Non-Eircode-looking values are only cleaned. */
export const formatEircodeForExport = (raw: unknown): string => {
  const v = cleanText(raw).toUpperCase();
  if (!v) return "";
  const m = v.replace(/\s+/g, "").match(EIRCODE_RE);
  return m ? `${m[1]} ${m[2]}` : v;
};

/**
 * Area Code is a stored customer field — we export what is stored.
 * The only correction applied is a Dublin postal district that has picked up
 * the fourth Eircode character (D24W289 -> stored "D24W" -> exported "D24").
 * "D6W" is a genuine Dublin district and is preserved.
 * Non-Dublin values (county names, other routing keys) are passed through
 * cleaned only.
 */
export const formatAreaCodeForExport = (raw: unknown): string => {
  const v = cleanText(raw);
  if (!v) return "";
  const upper = v.toUpperCase();
  const m = upper.match(/^D(\d{1,2})W$/);
  if (m && m[1] !== "6") return `D${m[1]}`;
  return /^D\d{1,2}W?$/.test(upper) ? upper : v;
};

/** Date-only values exported as YYYY-MM-DD, with no timezone conversion. */
export const formatDateForExport = (raw: unknown): string => {
  const v = cleanText(raw);
  if (!v) return "";
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return v;
};

/**
 * Service status is written by several code paths using two vocabularies:
 * the UI set ("Up to Date" / "Due Soon" / "Overdue" / "Serviced") and a legacy
 * placeholder "active" used when a customer is first created. They describe the
 * same concept, so the export uses the UI vocabulary throughout.
 */
export const formatServiceStatusForExport = (raw: unknown): string => {
  const v = cleanText(raw);
  if (!v) return "";
  return v.toLowerCase() === "active" ? "Up to Date" : v;
};

/** GPRN is an identifier: exported exactly as stored, as text. */
export const formatIdentifierForExport = (raw: unknown): string => cleanText(raw);

/** Boiler details live on boiler_make_model, or on boiler_brand/boiler_model. */
export const formatBoilerMakeModel = (
  makeModel: unknown,
  brand: unknown,
  model: unknown,
): string => {
  const combined = cleanText(makeModel);
  if (combined) return combined;
  return [cleanText(brand), cleanText(model)].filter(Boolean).join(" ");
};
