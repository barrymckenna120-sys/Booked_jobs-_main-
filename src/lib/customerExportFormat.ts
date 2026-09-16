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

/** Yes / No / blank for nullable booleans. */
export const formatBooleanForExport = (raw: unknown): string =>
  raw === true ? "Yes" : raw === false ? "No" : "";

/** Numbers exported as plain text, blank when absent. */
export const formatNumberForExport = (raw: unknown): string =>
  raw === null || raw === undefined || raw === "" ? "" : String(raw);

const RENEWAL_STAGE_LABELS: Record<string, string> = {
  not_contacted: "Not Contacted",
  reminded: "Reminded",
  confirmed: "Confirmed",
  booked: "Booked In",
  paid: "Paid",
};

/** Renewal stage uses the same labels as the Customer Profile dropdown. */
export const formatRenewalStageForExport = (raw: unknown): string => {
  const v = cleanText(raw);
  if (!v) return "";
  return RENEWAL_STAGE_LABELS[v.toLowerCase()] || v;
};

/**
 * Warranty expiry mirrors the Customer Profile: installation date + warranty
 * years. The stored warranty_expiry_date column is used only as a fallback when
 * nothing can be derived, so the export can never contradict the profile.
 */
export const deriveWarrantyExpiry = (
  installationDate: unknown,
  warrantyYears: unknown,
  storedExpiry?: unknown,
): string => {
  const install = formatDateForExport(installationDate);
  const years = typeof warrantyYears === "number" ? warrantyYears : Number(warrantyYears);
  if (/^\d{4}-\d{2}-\d{2}$/.test(install) && Number.isFinite(years)) {
    const d = new Date(`${install}T12:00:00`);
    d.setFullYear(d.getFullYear() + years);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return formatDateForExport(storedExpiry);
};

/**
 * Warranty status uses the existing BookedJobs rule (Customer Profile and
 * Warranty Tracker): expired when the expiry has passed, "Expiring Soon" within
 * 90 days, otherwise "Under Warranty". Blank when no expiry can be established.
 */
export const deriveWarrantyStatus = (expiry: string, today = new Date()): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return "";
  const expiryDate = new Date(`${expiry}T12:00:00`);
  const now = new Date(today);
  now.setHours(0, 0, 0, 0);
  if (expiryDate < now) return "Expired";
  const days = (expiryDate.getTime() - now.getTime()) / 86_400_000;
  return days <= 90 ? "Expiring Soon" : "Under Warranty";
};

/** Column order of the customer export. Preview and Excel both use this. */
export const EXPORT_COLUMNS = [
  "Customer Name",
  "Mobile Number",
  "Landline",
  "Email",
  "Address",
  "Eircode",
  "Area Code",
  "GPRN",
  "Owner or Tenant",
  "Customer Type",
  "Opted Out of Reminders",
  "WhatsApp Reminders",
  "WhatsApp Opt-In",
  "Reminders Consent",
  "Boiler Brand",
  "Boiler Model",
  "Boiler Make / Model",
  "Boiler Location",
  "Boiler Type",
  "Installation Date",
  "Boiler Age",
  "Warranty Years",
  "Warranty Expiry Date",
  "Warranty Status",
  "Under Warranty",
  "Access Notes",
  "Last Service Date",
  "Last Service Engineer",
  "Engineer Notes",
  "Next Service Due",
  "Scheduled Service Date",
  "Last Reminder Sent",
  "Service Status",
  "Renewal Stage",
  "Assigned Engineer",
  "Customer Notes",
  "Source",
  "Job Tag",
  "Job Tag Date",
  "Customer Since",
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];
export type ExportRow = Record<ExportColumn, string>;

/** Columns that must be written as Excel text cells (identifiers). */
export const TEXT_EXPORT_COLUMNS: ExportColumn[] = [
  "Mobile Number",
  "Landline",
  "Eircode",
  "Area Code",
  "GPRN",
];

/**
 * The single canonical row builder. One customer = one row. No job, payment or
 * message-history lookups — every value comes from the customer record itself
 * or from the derived warranty helpers above.
 */
export const buildExportRows = (customers: any[]): ExportRow[] =>
  customers.map((c) => {
    const expiry = deriveWarrantyExpiry(
      c.boiler_installation_date,
      c.warranty_years,
      c.warranty_expiry_date,
    );
    return {
      "Customer Name": cleanText(c.name),
      "Mobile Number": formatPhoneForExport(c.phone),
      "Landline": formatPhoneForExport(c.landline_phone),
      "Email": cleanText(c.email),
      "Address": cleanText(c.address),
      "Eircode": formatEircodeForExport(c.eircode),
      "Area Code": formatAreaCodeForExport(c.area_code),
      "GPRN": formatIdentifierForExport(c.gprn),
      "Owner or Tenant": cleanText(c.owner_or_tenant),
      "Customer Type": cleanText(c.customer_type),
      "Opted Out of Reminders": formatBooleanForExport(c.opted_out),
      "WhatsApp Reminders": formatBooleanForExport(c.whatsapp_reminders_enabled),
      "WhatsApp Opt-In": formatBooleanForExport(c.whatsapp_opt_in),
      "Reminders Consent": formatBooleanForExport(c.reminders_consent),
      "Boiler Brand": cleanText(c.boiler_brand),
      "Boiler Model": cleanText(c.boiler_model),
      "Boiler Make / Model": formatBoilerMakeModel(c.boiler_make_model, c.boiler_brand, c.boiler_model),
      "Boiler Location": cleanText(c.boiler_location),
      "Boiler Type": cleanText(c.boiler_type),
      "Installation Date": formatDateForExport(c.boiler_installation_date),
      "Boiler Age": formatNumberForExport(c.boiler_age),
      "Warranty Years": formatNumberForExport(c.warranty_years),
      "Warranty Expiry Date": expiry,
      "Warranty Status": deriveWarrantyStatus(expiry),
      "Under Warranty": formatBooleanForExport(c.under_warranty),
      "Access Notes": cleanText(c.access_notes),
      "Last Service Date": formatDateForExport(c.last_service_date),
      "Last Service Engineer": cleanText(c.last_service_engineer),
      "Engineer Notes": cleanText(c.engineer_notes),
      "Next Service Due": formatDateForExport(c.next_service_due),
      "Scheduled Service Date": formatDateForExport(c.scheduled_service_date),
      "Last Reminder Sent": formatDateForExport(c.last_reminder_sent),
      "Service Status": formatServiceStatusForExport(c.service_status),
      "Renewal Stage": formatRenewalStageForExport(c.renewal_stage),
      "Assigned Engineer": cleanText(c.assigned_engineer),
      "Customer Notes": cleanText(c.notes),
      "Source": cleanText(c.source),
      "Job Tag": cleanText(c.job_tag),
      "Job Tag Date": formatDateForExport(c.job_tag_date),
      "Customer Since": formatDateForExport(c.customer_since),
    };
  });
