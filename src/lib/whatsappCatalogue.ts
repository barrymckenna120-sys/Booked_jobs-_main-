/**
 * Central catalogue of every outbound WhatsApp message type in the system.
 *
 * Source of truth for: the human name, purpose, trigger, sending Edge Function,
 * which tenant config fields the message depends on, the `message_log.message_type`
 * value it writes, and what happens when config is missing (skip vs degrade).
 *
 * The wording structure lives here as an abridged template. Tenant values are NOT
 * stored here — they are resolved live from `settings` + `tenant_integrations`
 * (see `resolveTenantConfig`), so this catalogue never goes stale on config edits.
 *
 * Read-only: nothing in this module writes to the database or sends a message.
 */

// ---------------------------------------------------------------------------
// Config keys
// ---------------------------------------------------------------------------

export type ConfigKeyId =
  | "message_footer"
  | "company_name"
  | "company_phone"
  | "google_review_url"
  | "renewal_form_url"
  | "new_booking_url"
  | "cert_prefix"
  | "whatsapp_api_key_secret"
  | "stripe_payment_link"
  | "sumup_merchant_code";

export interface ConfigKeyDef {
  id: ConfigKeyId;
  label: string;
  /** Where an admin edits it. */
  editedIn: string;
  /** Human description of the resolution chain used by the Edge Functions. */
  resolution: string;
}

export const CONFIG_KEYS: Record<ConfigKeyId, ConfigKeyDef> = {
  message_footer: {
    id: "message_footer",
    label: "Message footer",
    editedIn: "Settings → General",
    resolution: "settings.message_footer → settings.business_name → settings.company_name",
  },
  company_name: {
    id: "company_name",
    label: "Company name",
    editedIn: "Settings → General / Customer Integrations → Business Details",
    resolution: "settings.business_name → settings.company_name",
  },
  company_phone: {
    id: "company_phone",
    label: "Company phone",
    editedIn: "Settings → General / Customer Integrations → Business Details",
    resolution: "settings.business_phone → settings.company_phone",
  },
  google_review_url: {
    id: "google_review_url",
    label: "Google review URL",
    editedIn: "Settings → Integrations",
    resolution: "settings.google_review_url → tenant_integrations.settings.google_review_url",
  },
  renewal_form_url: {
    id: "renewal_form_url",
    label: "Rebooking form URL",
    editedIn: "Settings → Integrations",
    resolution: "tenant_integrations.tally.renewal_form_url",
  },
  new_booking_url: {
    id: "new_booking_url",
    label: "New booking form URL",
    editedIn: "Settings → Integrations",
    resolution: "tenant_integrations.tally.new_booking_url",
  },
  cert_prefix: {
    id: "cert_prefix",
    label: "Job / cert reference prefix",
    editedIn: "Settings → Quote & Invoice Defaults",
    resolution: "settings.cert_prefix (falls back to a generic 'Job XXXXXX' label)",
  },
  whatsapp_api_key_secret: {
    id: "whatsapp_api_key_secret",
    label: "360Messenger secret name",
    editedIn: "Customer Integrations → WhatsApp / 360Messenger",
    resolution: "tenant_integrations.360messenger.api_key_secret",
  },
  stripe_payment_link: {
    id: "stripe_payment_link",
    label: "Stripe payment link",
    editedIn: "Settings → Integrations",
    resolution: "tenant_integrations.stripe.payment_link → payment_link_url",
  },
  sumup_merchant_code: {
    id: "sumup_merchant_code",
    label: "SumUp merchant code",
    editedIn: "Customer Integrations → SumUp",
    resolution: "tenant_integrations.sumup.merchant_code (no shared fallback)",
  },
};

// ---------------------------------------------------------------------------
// Catalogue entries
// ---------------------------------------------------------------------------

/** What happens at runtime when a required config field is blank. */
export type MissingBehaviour = "skip" | "degrade";

export type TriggerKind = "user action" | "cron" | "webhook" | "inbound";

export interface RequiredField {
  key: ConfigKeyId;
  behaviour: MissingBehaviour;
}

export interface MessageTypeDef {
  id: string;
  name: string;
  purpose: string;
  category: string;
  trigger: TriggerKind;
  /** Directory name under supabase/functions/. */
  fn: string;
  /** Literal `message_log.message_type` value written by the function. */
  messageType?: string;
  /** True when the message_type is built at runtime (e.g. day-suffixed). */
  dynamicMessageType?: boolean;
  requires: RequiredField[];
  /** Abridged wording structure. {{config}} and {{data}} tokens. */
  template: string;
}

export const WHATSAPP_CATALOGUE: MessageTypeDef[] = [
  // --- Booking & scheduling -------------------------------------------------
  {
    id: "booking_confirmation",
    name: "Booking confirmation",
    purpose: "Confirms a newly booked appointment to the customer.",
    category: "Booking & scheduling",
    trigger: "user action",
    fn: "send-booking-confirmation",
    messageType: "booking_confirmation",
    requires: [{ key: "message_footer", behaviour: "skip" }],
    template:
      "Hi {{customer_name}}, your appointment is confirmed for {{date}} at {{time}}.\n\n{{message_footer}}",
  },
  {
    id: "schedule_confirmation",
    name: "Schedule confirmation",
    purpose: "Confirms the scheduled visit window once a job is placed on the calendar.",
    category: "Booking & scheduling",
    trigger: "user action",
    fn: "send-schedule-confirmation",
    messageType: "schedule_confirmation",
    requires: [
      { key: "company_name", behaviour: "degrade" },
      { key: "company_phone", behaviour: "degrade" },
      { key: "message_footer", behaviour: "skip" },
    ],
    template:
      "Hi {{customer_name}}, {{company_name}} has you booked in for {{date}} at {{time}}. Questions? Call {{company_phone}}.\n\n{{message_footer}}",
  },
  {
    id: "reschedule_notification",
    name: "Reschedule notification",
    purpose: "Tells the customer their appointment has moved to a new date or time.",
    category: "Booking & scheduling",
    trigger: "user action",
    fn: "send-reschedule-notification",
    messageType: "reschedule_notification",
    requires: [{ key: "message_footer", behaviour: "skip" }],
    template:
      "Hi {{customer_name}}, your appointment has been moved to {{date}} at {{time}}.\n\n{{message_footer}}",
  },
  {
    id: "cancellation",
    name: "Cancellation notice",
    purpose: "Notifies the customer that their appointment was cancelled.",
    category: "Booking & scheduling",
    trigger: "user action",
    fn: "send-cancellation-notice",
    messageType: "cancellation",
    requires: [{ key: "message_footer", behaviour: "degrade" }],
    template:
      "Hi {{customer_name}}, your appointment on {{date}} has been cancelled.\n\n{{message_footer}}",
  },
  {
    id: "cancel_job_notify",
    name: "Cancellation (customer + internal)",
    purpose: "Cancellation fan-out: customer notice plus internal alert.",
    category: "Booking & scheduling",
    trigger: "user action",
    fn: "cancel-job-notify",
    messageType: "cancel_job_notify",
    requires: [{ key: "message_footer", behaviour: "degrade" }],
    template: "Job {{job_reference}} on {{date}} cancelled — {{reason}}.\n\n{{message_footer}}",
  },

  // --- Reminders ------------------------------------------------------------
  {
    id: "appointment_reminder",
    name: "Upcoming appointment reminder",
    purpose: "Day-before reminder for tomorrow's jobs.",
    category: "Reminders",
    trigger: "cron",
    fn: "send-upcoming-reminders",
    messageType: "appointment_reminder",
    requires: [
      { key: "message_footer", behaviour: "skip" },
      { key: "company_name", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, reminder from {{company_name}}: we're calling to you {{date}} at {{time}}.\n\n{{message_footer}}",
  },
  {
    id: "job_reminder_2day",
    name: "2-day job reminder",
    purpose: "Reminder sent two days before the appointment.",
    category: "Reminders",
    trigger: "cron",
    fn: "job-reminder-2day",
    messageType: "job_reminder_2day",
    requires: [
      { key: "company_name", behaviour: "degrade" },
      { key: "company_phone", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, {{company_name}} here — you're booked in for {{date}}. Call {{company_phone}} to change.",
  },

  // --- Quotes ---------------------------------------------------------------
  {
    id: "quote_sent",
    name: "Quote sent",
    purpose: "Sends the customer their quote link.",
    category: "Quotes",
    trigger: "user action",
    fn: "send-quote-whatsapp",
    messageType: "quote",
    requires: [{ key: "message_footer", behaviour: "skip" }],
    template:
      "Hi {{customer_name}}, here's your quote {{quote_number}}: {{quote_url}}\n\n{{message_footer}}",
  },
  {
    id: "quote_followup_day3",
    name: "Quote follow-up (day 3)",
    purpose: "Chases an unanswered quote after 3 days.",
    category: "Quotes",
    trigger: "cron",
    fn: "quote-followup-day3",
    messageType: "quote_followup_day3",
    requires: [{ key: "message_footer", behaviour: "degrade" }],
    template:
      "Hi {{customer_name}}, just checking in on quote {{quote_number}}: {{quote_url}}\n\n{{message_footer}}",
  },
  {
    id: "quote_followup_day6",
    name: "Quote follow-up (day 6)",
    purpose: "Final chase on an unanswered quote.",
    category: "Quotes",
    trigger: "cron",
    fn: "quote-followup-day6",
    messageType: "quote_followup_day6",
    requires: [{ key: "message_footer", behaviour: "degrade" }],
    template:
      "Hi {{customer_name}}, last nudge on quote {{quote_number}}: {{quote_url}}\n\n{{message_footer}}",
  },
  {
    id: "quote_accepted_alert",
    name: "Quote accepted alert (internal)",
    purpose: "Alerts the office that a customer accepted a quote.",
    category: "Quotes",
    trigger: "webhook",
    fn: "quote-accepted-alert",
    messageType: "quote",
    requires: [{ key: "message_footer", behaviour: "degrade" }],
    template:
      "Quote {{quote_number}} accepted by {{customer_name}} — {{amount}}.\n\n{{message_footer}}",
  },
  {
    id: "accept_quote_customer",
    name: "Quote acceptance confirmation",
    purpose: "Confirms acceptance to the customer, including the deposit link when one is required.",
    category: "Quotes",
    trigger: "webhook",
    fn: "accept-quote",
    messageType: "quote",
    requires: [
      { key: "message_footer", behaviour: "skip" },
      { key: "sumup_merchant_code", behaviour: "degrade" },
    ],
    template:
      "Thanks {{customer_name}} — quote {{quote_number}} accepted. Deposit: {{deposit_link}}\n\n{{message_footer}}",
  },

  // --- Payments -------------------------------------------------------------
  {
    id: "deposit_link",
    name: "Deposit payment link",
    purpose: "Sends a SumUp deposit checkout link for a booked job.",
    category: "Payments",
    trigger: "user action",
    fn: "send-deposit-link",
    requires: [
      { key: "message_footer", behaviour: "skip" },
      { key: "sumup_merchant_code", behaviour: "skip" },
    ],
    template:
      "Hi {{customer_name}}, here's your deposit link for {{job_reference}}: {{checkout_url}}\n\n{{message_footer}}",
  },
  {
    id: "deposit_reminder",
    name: "Deposit reminder",
    purpose: "Chases an unpaid deposit before the visit.",
    category: "Payments",
    trigger: "cron",
    fn: "send-deposit-reminder",
    messageType: "deposit_reminder",
    requires: [
      { key: "sumup_merchant_code", behaviour: "skip" },
      { key: "company_name", behaviour: "degrade" },
      { key: "company_phone", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, {{company_name}} — your deposit for {{date}} is still outstanding: {{checkout_url}}. Call {{company_phone}} with any questions.",
  },
  {
    id: "payment_link",
    name: "Payment link",
    purpose: "Sends a payment link for the balance on a job.",
    category: "Payments",
    trigger: "user action",
    fn: "send-payment-link",
    messageType: "payment_link",
    requires: [
      { key: "message_footer", behaviour: "skip" },
      { key: "sumup_merchant_code", behaviour: "skip" },
    ],
    template:
      "Hi {{customer_name}}, you can pay {{amount}} for {{job_reference}} here: {{checkout_url}}\n\n{{message_footer}}",
  },
  {
    id: "extra_work_payment",
    name: "Extra work payment link",
    purpose: "Payment link for additional work agreed on site.",
    category: "Payments",
    trigger: "user action",
    fn: "send-extrawork-payment-link",
    messageType: "extra_work_payment",
    requires: [
      { key: "sumup_merchant_code", behaviour: "skip" },
      { key: "message_footer", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, payment link for the extra work ({{amount}}): {{checkout_url}}\n\n{{message_footer}}",
  },
  {
    id: "payment_received",
    name: "Payment received",
    purpose: "Thanks the customer once a payment lands.",
    category: "Payments",
    trigger: "webhook",
    fn: "send-payment-received",
    messageType: "payment_received",
    requires: [{ key: "company_name", behaviour: "skip" }],
    template:
      "Hi {{customer_name}}, {{company_name}} has received your payment of {{amount}}. Thank you!",
  },
  {
    id: "sumup_payment_confirmed",
    name: "SumUp payment confirmation",
    purpose: "Confirmation triggered by the SumUp webhook on a successful checkout.",
    category: "Payments",
    trigger: "webhook",
    fn: "sumup-payment-webhook",
    messageType: "sumup_payment_confirmed",
    requires: [{ key: "sumup_merchant_code", behaviour: "skip" }],
    template: "Payment of {{amount}} received for {{job_reference}}. Thank you!",
  },

  // --- Invoices & receipts --------------------------------------------------
  {
    id: "invoice_sent",
    name: "Invoice sent",
    purpose: "Sends the customer their invoice link.",
    category: "Invoices & receipts",
    trigger: "user action",
    fn: "send-invoice-whatsapp",
    messageType: "invoice_sent",
    requires: [
      { key: "cert_prefix", behaviour: "degrade" },
      { key: "message_footer", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, invoice for {{cert_prefix}}-{{job_number}}: {{invoice_url}}\n\n{{message_footer}}",
  },
  {
    id: "invoice_created",
    name: "Invoice created notification",
    purpose: "Notification issued when an invoice is generated for a job.",
    category: "Invoices & receipts",
    trigger: "user action",
    fn: "create-job-invoice",
    messageType: "invoice",
    requires: [{ key: "message_footer", behaviour: "degrade" }],
    template: "Invoice {{invoice_number}} for {{amount}}: {{invoice_url}}\n\n{{message_footer}}",
  },
  {
    id: "outstanding_invoice",
    name: "Outstanding invoice reminder",
    purpose: "Chases unpaid invoices on a schedule.",
    category: "Invoices & receipts",
    trigger: "cron",
    fn: "send-outstanding-invoice-reminders",
    messageType: "outstanding_invoice",
    requires: [
      { key: "company_name", behaviour: "degrade" },
      { key: "message_footer", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, invoice {{invoice_number}} for {{amount}} is still outstanding: {{invoice_url}}\n\n{{message_footer}}",
  },
  {
    id: "outstanding_reminder_trigger",
    name: "Outstanding reminder (manual run)",
    purpose: "Office-triggered run of the outstanding invoice chase.",
    category: "Invoices & receipts",
    trigger: "user action",
    fn: "trigger-outstanding-reminder",
    requires: [
      { key: "company_name", behaviour: "degrade" },
      { key: "company_phone", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, {{company_name}} — invoice {{invoice_number}} is outstanding. Call {{company_phone}}.",
  },
  {
    id: "receipt",
    name: "Receipt",
    purpose: "Sends the service receipt after payment.",
    category: "Invoices & receipts",
    trigger: "user action",
    fn: "send-whatsapp-receipt",
    messageType: "receipt",
    requires: [
      { key: "message_footer", behaviour: "skip" },
      { key: "cert_prefix", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, receipt for {{cert_prefix}}-{{job_number}}: {{receipt_url}}\n\n{{message_footer}}",
  },

  // --- Documents ------------------------------------------------------------
  {
    id: "certificate",
    name: "Certificate",
    purpose: "Sends a gas or service certificate link to the customer.",
    category: "Documents",
    trigger: "user action",
    fn: "send-certificate-whatsapp",
    messageType: "certificate",
    requires: [{ key: "message_footer", behaviour: "skip" }],
    template:
      "Hi {{customer_name}}, your certificate is ready: {{certificate_url}}\n\n{{message_footer}}",
  },
  {
    id: "hazard_notification",
    name: "Hazard notification",
    purpose: "Sends an At Risk / Immediately Dangerous notice to the customer.",
    category: "Documents",
    trigger: "user action",
    fn: "send-hazard-whatsapp",
    messageType: "hazard_notification",
    requires: [{ key: "message_footer", behaviour: "skip" }],
    template:
      "Hi {{customer_name}}, safety notice for {{address}}: {{hazard_url}}\n\n{{message_footer}}",
  },

  // --- Parts ----------------------------------------------------------------
  {
    id: "part_arrived",
    name: "Part arrived",
    purpose: "Tells the customer their ordered part is in and the visit can be booked.",
    category: "Parts",
    trigger: "user action",
    fn: "send-part-arrived",
    messageType: "part_arrived",
    requires: [
      { key: "message_footer", behaviour: "degrade" },
      { key: "company_name", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, good news — the part for {{job_reference}} has arrived. We'll be in touch to book you in.\n\n{{message_footer}}",
  },

  // --- Renewals -------------------------------------------------------------
  {
    id: "renewal_reminder",
    name: "Service renewal reminder",
    purpose: "Prompts the customer to rebook their annual service.",
    category: "Renewals",
    trigger: "user action",
    fn: "send-renewal-reminder",
    messageType: "renewal_reminder",
    requires: [
      { key: "renewal_form_url", behaviour: "skip" },
      { key: "company_name", behaviour: "degrade" },
      { key: "company_phone", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, {{company_name}} — your service is due. Rebook here: {{renewal_form_url}} or call {{company_phone}}.",
  },
  {
    id: "renewal_reminder_30",
    name: "Renewal reminder (30 days)",
    purpose: "Automated reminder 30 days before the service due date.",
    category: "Renewals",
    trigger: "cron",
    fn: "renewal-reminder-30",
    requires: [{ key: "renewal_form_url", behaviour: "skip" }],
    template: "Hi {{customer_name}}, your service is due in 30 days. Rebook: {{renewal_form_url}}",
  },
  {
    id: "renewal_reminder_14",
    name: "Renewal reminder (14 days)",
    purpose: "Automated reminder 14 days before the service due date.",
    category: "Renewals",
    trigger: "cron",
    fn: "renewal-reminder-14",
    requires: [{ key: "renewal_form_url", behaviour: "skip" }],
    template: "Hi {{customer_name}}, your service is due in 14 days. Rebook: {{renewal_form_url}}",
  },
  {
    id: "renewal_reminder_7",
    name: "Renewal reminder (7 days)",
    purpose: "Automated reminder 7 days before the service due date.",
    category: "Renewals",
    trigger: "cron",
    fn: "renewal-reminder-7",
    requires: [{ key: "renewal_form_url", behaviour: "skip" }],
    template: "Hi {{customer_name}}, your service is due next week. Rebook: {{renewal_form_url}}",
  },
  {
    id: "area_bulk_renewal",
    name: "Area bulk outreach",
    purpose: "Bulk renewal outreach to customers in a chosen area code.",
    category: "Renewals",
    trigger: "user action",
    fn: "send-area-bulk-whatsapp",
    messageType: "renewal",
    requires: [
      { key: "company_name", behaviour: "degrade" },
      { key: "company_phone", behaviour: "degrade" },
      { key: "renewal_form_url", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, {{company_name}} are in {{area}} next week. Rebook: {{renewal_form_url}} or call {{company_phone}}.",
  },
  {
    id: "warranty_whatsapp",
    name: "Warranty outreach",
    purpose: "Warranty-expiry outreach inviting the customer to rebook.",
    category: "Renewals",
    trigger: "user action",
    fn: "send-warranty-whatsapp",
    requires: [
      { key: "renewal_form_url", behaviour: "skip" },
      { key: "company_name", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, {{company_name}} — your boiler warranty is coming up for renewal. Book here: {{renewal_form_url}}",
  },
  {
    id: "warranty_auto",
    name: "Warranty auto-send (day 14 / 28)",
    purpose: "Automated two-stage warranty follow-up after an install.",
    category: "Renewals",
    trigger: "cron",
    fn: "warranty-auto-send",
    messageType: "warranty_day14",
    dynamicMessageType: true,
    requires: [
      { key: "renewal_form_url", behaviour: "skip" },
      { key: "company_name", behaviour: "degrade" },
    ],
    template:
      "Hi {{customer_name}}, {{company_name}} — checking in on your new boiler. Anything to book? {{renewal_form_url}}",
  },

  // --- Retention ------------------------------------------------------------
  {
    id: "review_request",
    name: "Review request",
    purpose: "Asks the customer for a Google review after a completed job.",
    category: "Retention",
    trigger: "cron",
    fn: "review-request",
    requires: [{ key: "google_review_url", behaviour: "skip" }],
    template:
      "Hi {{customer_name}}, thanks for having us out. Would you leave us a review? {{google_review_url}}",
  },
  {
    id: "review_request_trigger",
    name: "Review request (manual run)",
    purpose: "Office-triggered review request for a specific job.",
    category: "Retention",
    trigger: "user action",
    fn: "trigger-review-request",
    requires: [{ key: "google_review_url", behaviour: "skip" }],
    template: "Hi {{customer_name}}, would you leave us a review? {{google_review_url}}",
  },

  // --- Inbound --------------------------------------------------------------
  {
    id: "missed_call_followup",
    name: "Missed call follow-up",
    purpose: "Auto-replies to a missed call with a booking link.",
    category: "Inbound",
    trigger: "webhook",
    fn: "missed-call-lookup",
    messageType: "missed_call_followup",
    requires: [
      { key: "renewal_form_url", behaviour: "skip" },
      { key: "company_name", behaviour: "degrade" },
    ],
    template:
      "Sorry we missed your call — {{company_name}}. You can book online here: {{renewal_form_url}}",
  },
  {
    id: "opt_out",
    name: "Opt-out confirmation",
    purpose: "Confirms a STOP request and flags the customer as opted out.",
    category: "Inbound",
    trigger: "inbound",
    fn: "handle-whatsapp-opt-out",
    messageType: "opt_out",
    requires: [],
    template: "You've been unsubscribed and won't receive further messages.",
  },
  {
    id: "inbound",
    name: "Inbound message (logged)",
    purpose: "Logs customer replies against the conversation — no outbound send.",
    category: "Inbound",
    trigger: "inbound",
    fn: "whatsapp-inbound",
    messageType: "inbound",
    requires: [],
    template: "(inbound only — the customer's own words are stored)",
  },
];

// ---------------------------------------------------------------------------
// Live tenant config resolution
// ---------------------------------------------------------------------------

export interface SettingsRow {
  business_name?: string | null;
  company_name?: string | null;
  business_phone?: string | null;
  company_phone?: string | null;
  message_footer?: string | null;
  google_review_url?: string | null;
  cert_prefix?: string | null;
}

export interface IntegrationRow {
  integration_type: string;
  config: Record<string, unknown> | null;
}

export interface ResolvedValue {
  key: ConfigKeyId;
  value: string;
  /** Which field actually supplied the value; empty when unresolved. */
  source: string;
  configured: boolean;
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/** Pick the first non-blank candidate, returning both value and its source label. */
function firstOf(candidates: Array<[string, unknown]>): { value: string; source: string } {
  for (const [source, raw] of candidates) {
    const v = str(raw);
    if (v) return { value: v, source };
  }
  return { value: "", source: "" };
}

export function resolveTenantConfig(
  settings: SettingsRow | null,
  integrations: IntegrationRow[],
): Record<ConfigKeyId, ResolvedValue> {
  const s = settings || {};
  const rows = integrations || [];
  const cfg = (type: string): Record<string, unknown> => {
    const row = rows.find((r) => r.integration_type === type);
    return (row?.config as Record<string, unknown>) || {};
  };
  const tally = cfg("tally");
  const stripe = cfg("stripe");
  const sumup = cfg("sumup");
  const messenger = cfg("360messenger");
  const settingsIntegration = cfg("settings");

  const picks: Record<ConfigKeyId, { value: string; source: string }> = {
    company_name: firstOf([
      ["settings.business_name", s.business_name],
      ["settings.company_name", s.company_name],
      ["tenant_integrations.360messenger.company_name", messenger.company_name],
    ]),
    company_phone: firstOf([
      ["settings.business_phone", s.business_phone],
      ["settings.company_phone", s.company_phone],
      ["tenant_integrations.360messenger.company_phone", messenger.company_phone],
    ]),
    message_footer: firstOf([
      ["settings.message_footer", s.message_footer],
      ["settings.business_name", s.business_name],
      ["settings.company_name", s.company_name],
    ]),
    google_review_url: firstOf([
      ["settings.google_review_url", s.google_review_url],
      ["tenant_integrations.settings.google_review_url", settingsIntegration.google_review_url],
    ]),
    renewal_form_url: firstOf([
      ["tenant_integrations.tally.renewal_form_url", tally.renewal_form_url],
    ]),
    new_booking_url: firstOf([
      ["tenant_integrations.tally.new_booking_url", tally.new_booking_url],
    ]),
    cert_prefix: firstOf([["settings.cert_prefix", s.cert_prefix]]),
    whatsapp_api_key_secret: firstOf([
      ["tenant_integrations.360messenger.api_key_secret", messenger.api_key_secret],
    ]),
    stripe_payment_link: firstOf([
      ["tenant_integrations.stripe.payment_link", stripe.payment_link],
      ["tenant_integrations.stripe.payment_link_url", stripe.payment_link_url],
    ]),
    sumup_merchant_code: firstOf([
      ["tenant_integrations.sumup.merchant_code", sumup.merchant_code],
    ]),
  };

  const out = {} as Record<ConfigKeyId, ResolvedValue>;
  for (const key of Object.keys(picks) as ConfigKeyId[]) {
    const p = picks[key];
    out[key] = { key, value: p.value, source: p.source, configured: p.value.length > 0 };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Status derivation + preview
// ---------------------------------------------------------------------------

export type MessageStatus = "ready" | "degrade" | "skip";

export interface MessageStatusResult {
  status: MessageStatus;
  missingSkip: ConfigKeyId[];
  missingDegrade: ConfigKeyId[];
}

export function deriveMessageStatus(
  def: MessageTypeDef,
  resolved: Record<ConfigKeyId, ResolvedValue>,
): MessageStatusResult {
  const missingSkip: ConfigKeyId[] = [];
  const missingDegrade: ConfigKeyId[] = [];
  for (const req of def.requires) {
    if (resolved[req.key]?.configured) continue;
    if (req.behaviour === "skip") missingSkip.push(req.key);
    else missingDegrade.push(req.key);
  }
  const status: MessageStatus =
    missingSkip.length > 0 ? "skip" : missingDegrade.length > 0 ? "degrade" : "ready";
  return { status, missingSkip, missingDegrade };
}

export const STATUS_LABEL: Record<MessageStatus, string> = {
  ready: "Ready",
  degrade: "Will degrade",
  skip: "Will skip",
};

/**
 * Display-only preview. Substitutes resolved config tokens into the abridged
 * template. Never sends anything.
 */
export function renderPreview(
  def: MessageTypeDef,
  resolved: Record<ConfigKeyId, ResolvedValue>,
): string {
  const status = deriveMessageStatus(def, resolved);
  let body = def.template;
  for (const key of Object.keys(CONFIG_KEYS) as ConfigKeyId[]) {
    const token = `{{${key}}}`;
    if (!body.includes(token)) continue;
    const r = resolved[key];
    if (r?.configured) {
      body = body.split(token).join(r.value);
    } else if (status.missingDegrade.includes(key)) {
      // Degrade path: at runtime the line carrying the token is omitted.
      body = body
        .split("\n")
        .filter((line) => !line.includes(token))
        .join("\n");
    } else {
      body = body.split(token).join(`[${CONFIG_KEYS[key].label} not configured]`);
    }
  }
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

export const CATALOGUE_CATEGORIES = Array.from(
  new Set(WHATSAPP_CATALOGUE.map((m) => m.category)),
);
