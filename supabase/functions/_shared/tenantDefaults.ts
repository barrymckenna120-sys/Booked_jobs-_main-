/**
 * PRODUCT-OWNED BookedJobs tenant defaults — the single source of truth for
 * what every new tenant receives at provisioning time.
 *
 * Rules for this module:
 *  - Zero imports, pure data + pure functions. No IO, no database, no Deno APIs.
 *  - Contains NO tenant-specific values: no company names, addresses, phone
 *    numbers, domains, UUIDs, credentials or secret values. Anything specific to
 *    one company is supplied by the caller (the provisioning form) or left blank
 *    for the company to enter.
 *  - No runtime read of any existing tenant. K&N Gas Services is not a template.
 *
 * Deliberately NOT included (classified during the provisioning audit as either
 * tenant-specific, customer data, credentials, or already-correct-when-absent):
 *  - product/price catalogue rows, service areas, review URL, logo
 *  - WhatsApp template table rows (live messages are built in
 *    `_shared/whatsappCatalogue.ts`; those rows only feed an admin view)
 *  - `settings.template_*` fields (no send path reads them)
 *  - engineer working-day rows (a missing row already means "working")
 *  - boiler brands (the catalogue is read unfiltered and is already shared)
 *  - any credential or API key
 */

/** Bump when the mandatory default set changes. Existing tenants stay at 0. */
export const TENANT_CONFIG_VERSION = 1;

export interface OpeningHoursDay {
  day: string;
  start: string;
  end: string;
  enabled: boolean;
}

export interface JobTimeBlock {
  label: string;
  start: string;
  end: string;
  max_jobs: number;
}

export const DEFAULT_OPENING_HOURS: OpeningHoursDay[] = [
  { day: "Mon", start: "08:00", end: "17:00", enabled: true },
  { day: "Tue", start: "08:00", end: "17:00", enabled: true },
  { day: "Wed", start: "08:00", end: "17:00", enabled: true },
  { day: "Thu", start: "08:00", end: "17:00", enabled: true },
  { day: "Fri", start: "08:00", end: "17:00", enabled: true },
  { day: "Sat", start: "09:00", end: "13:00", enabled: true },
  { day: "Sun", start: "09:00", end: "13:00", enabled: false },
];

export const DEFAULT_JOB_TIME_BLOCKS: JobTimeBlock[] = [
  { label: "Morning", start: "08:00", end: "11:00", max_jobs: 10 },
  { label: "Midday", start: "11:00", end: "14:00", max_jobs: 10 },
  { label: "Afternoon", start: "14:00", end: "17:00", max_jobs: 10 },
];

/** Generic product wording — no company name, no warranty promise specific to one firm. */
export const DEFAULT_TERMS =
  "Payment due within 14 days of invoice. All prices include parts and labour unless stated otherwise. " +
  "Quotes are valid for 30 days from the date of issue.";

export const DEFAULT_CATEGORIES: string[] = [
  "Boilers",
  "Parts",
  "Labour",
  "Materials",
  "Heat Controls",
  "Pipework",
];

/** Document/PDF branding defaults — identical to the app's own fallback palette. */
export const DEFAULT_BRAND_SETTINGS = {
  primary_color: "#1E3A5F",
  secondary_color: "#2C4F7C",
  accent_color: "#4A86E8",
  background_color: "#FFFFFF",
  header_text_color: "#FFFFFF",
  body_text_color: "#1F2937",
  section_label_color: "#1E3A5F",
  border_color: "#E2E8F0",
  table_header_color: "#EBF2FF",
  table_row_color: "#FFFFFF",
  table_alt_color: "#F8FAFF",
  font_family: "Poppins",
} as const;

/**
 * Settings values that are product behaviour rather than company identity.
 * Company identity (names, phone, address, RGI, prefixes) is passed separately
 * by the provisioning function.
 */
export const DEFAULT_SETTINGS = {
  // Pricing defaults
  default_callout_charge: 85,
  default_service_price: 130,
  default_repair_price: 0,
  default_emergency_price: 160,
  // Quote defaults
  default_expiry_days: 30,
  default_vat_enabled: true,
  default_deposit: 100,
  deposit_percentage: 50,
  default_terms: DEFAULT_TERMS,
  // Invoicing
  payment_terms: "30_days",
  next_invoice_number: 1,
  // Reminder schedules
  renewal_reminder_days_1: 30,
  renewal_reminder_days_2: 7,
  renewal_reminders_enabled: true,
  review_request_hours: 2,
  review_requests_enabled: true,
  payment_reminder_days_1: 7,
  payment_reminder_days_2: 14,
  payment_reminders_enabled: true,
  // Delivery-failure alerting
  delivery_failure_alerts_enabled: true,
  delivery_failure_alert_mode: "immediate",
  delivery_alerts_quotes: true,
  delivery_alerts_invoices: true,
  delivery_alerts_receipts: false,
  delivery_alerts_service_reminders: false,
  // Receipts
  receipt_show_boiler_details: true,
  // Scheduling
  opening_hours: DEFAULT_OPENING_HOURS,
  job_time_blocks: DEFAULT_JOB_TIME_BLOCKS,
  // Coverage: a new tenant starts with NO service areas. The settings table has
  // a column default carrying K&N's own routing keys, so this must be written
  // explicitly to stop a new tenant inheriting them.
  service_areas: [] as string[],

} as const;

/** Uppercase alphanumeric prefix derived from a slug, e.g. "acme-gas" -> "AC". */
export function derivePrefix(slug: string, length: number): string {
  const cleaned = String(slug ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned.slice(0, Math.max(1, length)) || "BJ";
}

/**
 * NOTE: no public-domain derivation lives here any more. BookedJobs has no
 * wildcard DNS for <slug>.bookedjobs.ie, so a derived address produced dead
 * customer links. New tenants get a blank organisations.public_domain and rely
 * on the platform host fallback until a real domain is connected.
 */


/**
 * Payment integration placeholder. Explicitly sandbox so a half-configured
 * tenant can never create a live charge: `resolveSumUpCredentials` hard-fails on
 * an incomplete sandbox entry and never falls back to a live pair.
 */
export function defaultPaymentPlaceholder() {
  return {
    environment: "sandbox",
    merchant_code: "",
    api_key_secret: "",
    environments: { sandbox: { merchant_code: "", api_key_secret: "" } },
  };
}

/** Fresh, tenant-unique webhook secret. Never copied from another tenant. */
export function generateWebhookSecret(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return `whsec_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}
