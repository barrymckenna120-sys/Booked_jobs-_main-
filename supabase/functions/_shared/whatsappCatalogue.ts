/**
 * CANONICAL WhatsApp message catalogue — single source of truth.
 *
 * Phase 2 of the WhatsApp audit (see docs/whatsapp/template-audit.md and
 * docs/whatsapp/phase2-migration-map.md).
 *
 * Rules for this module:
 *  - Zero imports. It is mirrored verbatim into the frontend
 *    (`src/lib/whatsappCatalogue.generated.ts`) by
 *    `scripts/generate-whatsapp-catalogue.mjs`, so it must stay dependency-free
 *    and runtime-agnostic (Deno + Vite).
 *  - Every `build()` is a PURE function. It performs no IO, reads no database,
 *    knows nothing about tenants and cannot switch tenant. Callers resolve
 *    tenant/job/customer data first — starting from a confirmed
 *    `organisation_id` — and pass the resolved values in.
 *  - The builders reproduce CURRENT PRODUCTION OUTPUT byte-for-byte, including
 *    punctuation, emoji, blank lines, optional lines and the known defects
 *    (literal "undefined", the "KN-" prefix, "Gas Safe" wording, the four money
 *    formatters). Those are recorded in `knownDefects` and are fixed as
 *    deliberate copy changes in Phase 3 / F1–F4 — never silently inside the
 *    refactor.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageCategory =
  | "Booking & scheduling"
  | "Reminders"
  | "Quotes"
  | "Payments"
  | "Invoices & receipts"
  | "Documents"
  | "Parts"
  | "Renewals"
  | "Retention"
  | "Inbound";

/** Everything ships as 360Messenger free text. There are no Meta templates. */
export type DeliveryChannel = "Free text (360Messenger)";

export type Audience = "customer" | "internal" | "platform";

export type TriggerKind = "user action" | "cron" | "webhook" | "inbound";

/** What happens when a required input is blank at runtime. */
export type MissingBehaviour = "skip" | "degrade";

export interface VariableDef {
  /** Name as used by `build()`. */
  name: string;
  /** Where the value comes from, verbatim enough to audit. */
  source: string;
  /** What the builder renders when the value is blank. */
  fallback?: string;
  /** True when the value originates in the request body (see audit D9). */
  callerSupplied?: boolean;
}

export interface ConfigDependency {
  /** Config field, in `table.column` / `tenant_integrations.<type>.<key>` form. */
  key: string;
  behaviour: MissingBehaviour;
  note?: string;
}

export type CatalogueVars = Record<string, unknown>;

export interface CatalogueEntry {
  /** Stable catalogue key. Never renamed — logs and the Admin UI key off it. */
  key: string;
  name: string;
  /** One-line description shown in the Admin panel. */
  purpose: string;
  category: MessageCategory;
  audience: Audience;
  trigger: TriggerKind;
  channel: DeliveryChannel;
  /** Edge Function directories that send this message. */
  functions: string[];
  /** `message_log.message_type` value(s) written. Empty = nothing logged. */
  messageTypes: string[];
  /** True when the message_type is chosen at runtime. */
  dynamicMessageType?: boolean;
  variables: VariableDef[];
  config: ConfigDependency[];
  /** Explicit skip / degrade behaviour, in plain words. */
  skipRules: string[];
  /** Baseline defects deliberately preserved until a Phase 3 copy change. */
  knownDefects: string[];
  /**
   * Pure body builder, or null when the body is not authored in this repo
   * (Make.com scenarios, JSON feeds, orchestrators, inbound customer text).
   */
  build: ((v: CatalogueVars) => string) | null;
  /** Why `build` is null. */
  bodyOwner?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Formatting helpers — deliberately four money formatters (audit D5)
// ---------------------------------------------------------------------------

const s = (v: unknown): string => (v == null ? "" : String(v));
/** Interpolation that matches template-literal behaviour, defects included. */
const raw = (v: unknown): string => `${v as string}`;
const num = (v: unknown): number => Number(v ?? 0);
const firstName = (v: unknown): string => String(v ?? "").split(" ")[0];

/** F-A: `€` + toFixed(2). Used by most payment/quote paths. */
export const fmtPlainEuro = (v: unknown): string => `€${num(v).toFixed(2)}`;
/** F-B: comma-grouped. `create-job-invoice` only. */
export const fmtGroupedEuro = (v: unknown): string => {
  const parts = Math.abs(num(v)).toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `\u20AC${intPart}.${parts[1]}`;
};
/** F-C: rounded then fixed. `_shared/depositConfirmationMessage.ts`. */
export const fmtRoundedEuro = (v: unknown): string =>
  `€${(Math.round(num(v) * 100) / 100).toFixed(2)}`;
/** F-D: nullable receipt amount. `_shared/receiptAmount.ts`. */
export const fmtReceiptAmount = (v: unknown, fallback = "€0.00"): string =>
  v === null || v === undefined ? fallback : `€${num(v).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

const FREE_TEXT: DeliveryChannel = "Free text (360Messenger)";

export const WHATSAPP_CATALOGUE: CatalogueEntry[] = [
  // === Booking & scheduling ================================================
  {
    key: "booking_confirmation",
    name: "Booking confirmation",
    purpose: "Confirms a newly booked appointment to the customer.",
    category: "Booking & scheduling",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-booking-confirmation"],
    messageTypes: ["booking_confirmation"],
    variables: [
      { name: "firstName", source: "customers.name, first token", fallback: "(blank)" },
      { name: "companyName", source: "settings.business_name", fallback: '"us"' },
      { name: "formattedDate", source: "service_calls.scheduled_date", fallback: '"TBC"' },
      { name: "timeSlot", source: "service_calls.time_slot", fallback: '"TBC"' },
      { name: "engineerName", source: "engineers.name", fallback: '"TBC"' },
      { name: "messageFooter", source: "settings.message_footer", fallback: "line omitted" },
    ],
    config: [
      { key: "settings.business_name", behaviour: "degrade", note: 'renders "us"' },
      { key: "settings.message_footer", behaviour: "degrade", note: "footer line omitted" },
    ],
    skipRules: [
      "Opt-out handled by _shared/bookingConfirmationSkip (logs status:'skipped').",
      "requireResourceOrgAccess on the service_call.",
    ],
    knownDefects: [
      'Second hardcoded name fallback "us" (orgBranding uses "our team") — F4.',
      "Reads settings.business_* while send-schedule-confirmation reads company_* — D10 / F4.",
    ],
    build: (v) =>
      `Hi ${raw(v.firstName)}, your booking with ${s(v.companyName) || "us"} is confirmed.\n\n` +
      `📅 Date: ${raw(v.formattedDate)}\n` +
      `⏰ Time: ${raw(v.timeSlot)}\n` +
      `👷 Engineer: ${raw(v.engineerName)}\n\n` +
      `If you need to make any changes please reply to this message.` +
      (v.messageFooter ? `\n\n${raw(v.messageFooter)}` : ""),
  },
  {
    key: "schedule_confirmation",
    name: "Schedule confirmation",
    purpose: "Confirms the scheduled visit window once a job is placed on the calendar.",
    category: "Booking & scheduling",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-schedule-confirmation"],
    messageTypes: ["schedule_confirmation"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      { name: "companyName", source: "settings.company_name", fallback: "phrase omitted" },
      { name: "companyPhone", source: "settings.company_phone", fallback: "omitted from signoff" },
      { name: "scheduledDate", source: "service_calls.scheduled_date" },
      { name: "timeSlot", source: "service_calls.time_slot" },
      { name: "engineerName", source: "engineers.name" },
    ],
    config: [
      { key: "settings.company_name", behaviour: "degrade" },
      { key: "settings.company_phone", behaviour: "degrade" },
    ],
    skipRules: ["Logged through the log-message function rather than a direct insert."],
    knownDefects: [
      "Reads settings.company_* where the near-identical booking confirmation reads business_* — D10 / F4.",
      "Near-duplicate of booking_confirmation — D11.",
    ],
    build: (v) => {
      const companyName = s(v.companyName);
      const companyPhone = s(v.companyPhone);
      const confirmedWith = companyName ? ` with ${companyName}` : "";
      const signoff = [companyName, companyPhone].filter(Boolean).join(" ☎ ");
      return (
        `Hi ${raw(v.firstName)}, your booking${confirmedWith} is confirmed.\n\n` +
        `📅 Date: ${raw(v.scheduledDate)}\n` +
        `⏰ Time: ${raw(v.timeSlot)}\n` +
        `👷 Engineer: ${raw(v.engineerName)}\n\n` +
        `If you need to make any changes please reply to this message.${signoff ? `\n\n${signoff}` : ""}`
      );
    },
  },
  {
    key: "reschedule_notification",
    name: "Reschedule notification",
    purpose: "Tells the customer their appointment has moved to a new date or time.",
    category: "Booking & scheduling",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-reschedule-notification"],
    messageTypes: ["reschedule_notification"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      { name: "newDate", source: "service_calls.scheduled_date" },
      { name: "timeSlot", source: "service_calls.time_slot" },
      { name: "messageFooter", source: "settings.message_footer" },
    ],
    config: [
      {
        key: "settings.message_footer",
        behaviour: "skip",
        note: "blank skips with message_footer_not_configured",
      },
    ],
    skipRules: [
      "Hard skip when settings.message_footer is blank.",
      "requireResourceOrgAccess + requireCustomerMessagingConsent.",
    ],
    knownDefects: [],
    build: (v) =>
      `Hi ${raw(v.firstName)}, your appointment has been rescheduled to ${raw(v.newDate)} at ${raw(v.timeSlot)}. Apologies for any inconvenience — ${raw(v.messageFooter)}`,
  },
  {
    key: "cancellation",
    name: "Cancellation notice",
    purpose: "Notifies the customer that their appointment was cancelled.",
    category: "Booking & scheduling",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-cancellation-notice"],
    messageTypes: ["cancellation"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      { name: "brandingName", source: "orgBranding.org_name (legacy shim)" },
      { name: "brandingPhone", source: "orgBranding.org_phone", fallback: "rebook line omitted" },
      { name: "brandingFooter", source: "orgBranding.footer", fallback: "falls back to name" },
      {
        name: "cancellationReason",
        source: "service_calls.cancellation_reason",
        fallback: '"No reason provided"',
      },
    ],
    config: [{ key: "settings.business_name", behaviour: "degrade" }],
    skipRules: ["Ad-hoc inline opt-out check rather than the shared consent gate."],
    knownDefects: [
      "Overlaps cancel_job_notify — two functions, two literals, same customer event (D11).",
      'Legacy "our team" default can reach the customer — F4.',
    ],
    build: (v) => {
      const rebookLine = v.brandingPhone
        ? `To rebook please call us on ${raw(v.brandingPhone)}.\n\n`
        : "";
      return `Hi ${raw(v.firstName)}, your booking with ${raw(v.brandingName)} has been cancelled.\n\nReason: ${raw(v.cancellationReason)}\n\n${rebookLine}${s(v.brandingFooter) || raw(v.brandingName)}`;
    },
  },
  {
    key: "cancel_job_notify",
    name: "Cancellation (customer + internal)",
    purpose: "Cancellation fan-out: customer notice plus internal alert.",
    category: "Booking & scheduling",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["cancel-job-notify"],
    messageTypes: ["cancel_job_notify"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      { name: "brandingName", source: "orgBranding.org_name (legacy shim)" },
      { name: "brandingPhone", source: "orgBranding.org_phone", fallback: "rebook line omitted" },
      { name: "cancellation_reason", source: "request body", callerSupplied: true },
    ],
    config: [{ key: "settings.business_name", behaviour: "degrade" }],
    skipRules: [
      "Org from get_my_org_id() and the job org must match — fail closed.",
      "requireCustomerMessagingConsent.",
    ],
    knownDefects: ["Overlaps `cancellation` (D11)."],
    build: (v) => {
      const rebookLine = v.brandingPhone
        ? ` To rebook please call us on ${raw(v.brandingPhone)}.`
        : "";
      return `Hi ${raw(v.firstName)}, your booking with ${raw(v.brandingName)} has been cancelled. Reason: ${raw(v.cancellation_reason)}.${rebookLine}`;
    },
  },

  // === Reminders ===========================================================
  {
    key: "appointment_reminder",
    name: "Upcoming appointment reminder",
    purpose: "Day-before reminder for tomorrow's jobs.",
    category: "Reminders",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["send-upcoming-reminders"],
    messageTypes: ["appointment_reminder"],
    variables: [
      { name: "messageFooter", source: "settings.message_footer (used twice)" },
      { name: "firstName", source: "customers.name, first token" },
      { name: "jobType", source: "service_calls.job_type" },
      { name: "targetStr", source: "service_calls.scheduled_date (formatted)" },
      { name: "timeSlot", source: "service_calls.time_slot" },
      {
        name: "engineerName",
        source: "service_calls.assigned_engineer",
        fallback: '"our engineer"',
      },
    ],
    config: [
      { key: "settings.message_footer", behaviour: "skip", note: "blank skips the whole org" },
    ],
    skipRules: [
      "Blank footer skips the entire organisation.",
      "Auth scope enforced by _shared/sweepScope (P1 fix): only service-role / cron may sweep all orgs.",
    ],
    knownDefects: ["Footer appears twice — as a header line and as the sign-off."],
    build: (v) =>
      `Appointment Reminder 📅\n${raw(v.messageFooter)}\n\nHi ${raw(v.firstName)}, just a reminder that your ${raw(v.jobType)} is booked for ${raw(v.targetStr)} between ${raw(v.timeSlot)}.\n\nYour engineer ${raw(v.engineerName)} will be with you on the day. If you need to reschedule, please give us a call.\n\nThanks,\n${raw(v.messageFooter)}`,
  },
  {
    key: "job_reminder_2day",
    name: "2-day job reminder",
    purpose: "Reminder sent two days before the appointment.",
    category: "Reminders",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["job-reminder-2day"],
    messageTypes: ["job_reminder_2day"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      {
        name: "companyName",
        source: "tenant_integrations.360messenger.config.company_name",
        fallback: 'NONE — renders literal "undefined"',
      },
      {
        name: "companyPhone",
        source: "tenant_integrations.360messenger.config.company_phone",
        fallback: 'NONE — renders literal "undefined"',
      },
      { name: "formattedDate", source: "service_calls.scheduled_date" },
      { name: "formattedTime", source: "service_calls.time_slot" },
      { name: "engineerName", source: "engineers.name", fallback: "line omitted" },
    ],
    config: [
      {
        key: "tenant_integrations.360messenger.company_name",
        behaviour: "degrade",
        note: 'DEFECT: degrades to the literal "undefined"',
      },
      { key: "tenant_integrations.360messenger.company_phone", behaviour: "degrade" },
    ],
    skipRules: ["requireMachineCaller; org taken per-row from service_calls.organisation_id."],
    knownDefects: [
      'F1 — a missing company_name/company_phone interpolates the literal string "undefined" into the customer message (D12).',
      "Reads branding from tenant_integrations rather than settings — D1 / F4.",
    ],
    build: (v) => {
      const engineerLine = v.engineerName ? `\nYour engineer will be ${raw(v.engineerName)}.\n` : "";
      return `Hi ${raw(v.firstName)},\n\nThis is a reminder from ${raw(v.companyName)} that your appointment is confirmed for ${raw(v.formattedDate)} at ${raw(v.formattedTime)}.\n${engineerLine}\nPlease reply CONFIRM to confirm your appointment or CANCEL to cancel. Alternatively call us on ${raw(v.companyPhone)}.\n\n${raw(v.companyName)} ☎ ${raw(v.companyPhone)}`;
    },
  },

  // === Quotes ==============================================================
  {
    key: "quote_sent",
    name: "Quote sent",
    purpose: "Sends the customer their quote link.",
    category: "Quotes",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-quote-whatsapp"],
    messageTypes: ["quote"],
    variables: [
      { name: "firstName", source: "consent.name || customer_name, first token", fallback: '"there"' },
      { name: "job_description", source: "request body / quotes.job_description", callerSupplied: true },
      { name: "refNumber", source: "quotes.quote_number || Q-<id[0:4]>" },
      { name: "quote_amount", source: "quotes.total_amount" },
      { name: "deposit", source: "quotes.deposit_amount", fallback: "line omitted when 0" },
      { name: "acceptUrl", source: "tenant public domain + quotes.access_token", fallback: "line omitted" },
      { name: "quotePdfUrl", source: "signed quote PDF URL", fallback: "line omitted" },
      { name: "messageFooter", source: "settings.message_footer" },
      { name: "business_phone", source: "REQUEST BODY (not the org record)", callerSupplied: true },
    ],
    config: [{ key: "settings.message_footer", behaviour: "skip", note: "blank aborts the send" }],
    skipRules: [
      "Blank message_footer aborts.",
      "Org from quotes.organisation_id; hard block when missing; requireResourceOrgAccess IDOR guard.",
    ],
    knownDefects: [
      "D6/D9 — the trailing 📞 line is caller-supplied, not resolved from the org.",
    ],
    build: (v) => {
      const deposit = num(v.deposit);
      let message =
        `Hi ${raw(v.firstName)},\n\nHere is your quote for ${raw(v.job_description)}.\n\nQuote No: ${raw(v.refNumber)}\n\nTotal: €${num(v.quote_amount).toFixed(2)}`;
      if (deposit > 0) message += `\n\nDeposit to secure booking: €${deposit.toFixed(2)}`;
      message += `\n\nTo accept this quote, reply:\nYES ${raw(v.refNumber)}`;
      if (v.acceptUrl) message += `\n\nView and approve here:\n${raw(v.acceptUrl)}`;
      if (v.quotePdfUrl) message += `\n\n📄 View your full quote PDF:\n${raw(v.quotePdfUrl)}`;
      message += `\n\n${raw(v.messageFooter)}`;
      if (v.business_phone) message += `\n📞 ${raw(v.business_phone)}`;
      return message;
    },
  },
  {
    key: "quote_followup_day3",
    name: "Quote follow-up (day 3)",
    purpose: "Chases an unanswered quote after 3 days.",
    category: "Quotes",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["quote-followup-day3"],
    messageTypes: ["quote_followup_day3"],
    variables: [
      { name: "customerName", source: "customers.name" },
      { name: "quoteNumber", source: "quotes.quote_number", fallback: '"the quote"' },
      { name: "quoteUrl", source: "tenant public quote URL", fallback: "line omitted" },
      { name: "businessName", source: "orgBranding.org_name", fallback: '"our team"' },
    ],
    config: [{ key: "settings.business_name", behaviour: "degrade" }],
    skipRules: ["decideFollowup handles opt-out and stage eligibility."],
    knownDefects: ['Legacy "our team" default — F4.'],
    build: (v) => buildQuoteFollowup(3, v),
  },
  {
    key: "quote_followup_day6",
    name: "Quote follow-up (day 6)",
    purpose: "Final chase on an unanswered quote.",
    category: "Quotes",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["quote-followup-day6"],
    messageTypes: ["quote_followup_day6"],
    variables: [
      { name: "customerName", source: "customers.name" },
      { name: "quoteNumber", source: "quotes.quote_number", fallback: '"the quote"' },
      { name: "quoteUrl", source: "tenant public quote URL", fallback: "line omitted" },
      { name: "businessName", source: "orgBranding.org_name", fallback: '"our team"' },
      { name: "businessPhone", source: "orgBranding.org_phone", fallback: "shorter contact line" },
    ],
    config: [
      { key: "settings.business_name", behaviour: "degrade" },
      { key: "settings.business_phone", behaviour: "degrade" },
    ],
    skipRules: ["decideFollowup handles opt-out and stage eligibility."],
    knownDefects: ['Legacy "our team" default — F4.'],
    build: (v) => buildQuoteFollowup(6, v),
  },
  {
    key: "quote_accepted_alert",
    name: "Quote accepted alert (internal)",
    purpose: "Alerts the office that a customer accepted a quote.",
    category: "Quotes",
    audience: "internal",
    trigger: "webhook",
    channel: FREE_TEXT,
    functions: ["quote-accepted-alert"],
    messageTypes: ["quote"],
    variables: [
      { name: "customerName", source: "quotes.customers.name", fallback: '"Customer"' },
      { name: "quoteRef", source: "quotes.quote_number || Q-<id[0:4]>" },
      { name: "totalAmount", source: "quotes.total_amount, toFixed(2)" },
      { name: "depositAmount", source: "quotes.deposit || deposit_amount, toFixed(2)" },
      { name: "messageFooter", source: "settings.message_footer", fallback: "line omitted" },
    ],
    config: [{ key: "settings.message_footer", behaviour: "degrade" }],
    skipRules: [
      "Recipient is the office number, so no customer opt-out applies.",
      "Silently returns sent:false when the org cannot be derived.",
    ],
    knownDefects: [
      "D2 — recipient/footer looked up by settings.user_id instead of organisation_id.",
      "D7 — byte-identical body also exists inline in accept-quote.",
    ],
    build: (v) =>
      `✅ Quote Accepted\n\nCustomer: ${raw(v.customerName)}\nQuote: ${raw(v.quoteRef)}\nTotal: €${raw(v.totalAmount)}\nDeposit: €${raw(v.depositAmount)}\n\nJob has been created — open BookedJobs to schedule.${v.messageFooter ? `\n\n${raw(v.messageFooter)}` : ""}`,
  },
  {
    key: "accept_quote_customer",
    name: "Quote acceptance office alert (accept-quote)",
    purpose: "Office alert raised by accept-quote when a quote is accepted; the customer half of that flow is the deposit link.",
    category: "Quotes",
    audience: "internal",
    trigger: "webhook",
    channel: FREE_TEXT,
    functions: ["accept-quote"],
    messageTypes: [],
    variables: [
      { name: "customerName", source: "quotes.customers.name", fallback: '"Customer"' },
      { name: "quoteRef", source: "quotes.quote_number || Q-<id[0:4]>" },
      { name: "totalAmount", source: "quotes.total_amount, toFixed(2)" },
      { name: "depositAmount", source: "quotes.deposit || deposit_amount, toFixed(2)" },
    ],
    config: [{ key: "settings.whatsapp_number", behaviour: "skip" }],
    skipRules: [
      "Skipped silently when the office number or org is absent.",
      "Only failures are written to message_log (logWhatsAppFailure); success is never logged.",
    ],
    knownDefects: [
      "D2 — settings looked up by user_id.",
      "D7 — duplicate of quote_accepted_alert; the customer-facing half of accept-quote is the deposit link (see deposit_link).",
    ],
    build: (v) =>
      `✅ Quote Accepted\n\nCustomer: ${raw(v.customerName)}\nQuote: ${raw(v.quoteRef)}\nTotal: €${raw(v.totalAmount)}\nDeposit: €${raw(v.depositAmount)}\n\nJob has been created — open BookedJobs to schedule.`,
  },

  // === Payments ============================================================
  {
    key: "deposit_link",
    name: "Deposit payment link",
    purpose: "Sends a SumUp deposit checkout link for a booked job.",
    category: "Payments",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-deposit-link", "accept-quote", "_shared/depositLink.ts"],
    messageTypes: ["payment_link"],
    variables: [
      { name: "customerName", source: "caller arg || customers.name", fallback: '"Customer"' },
      {
        name: "companyName",
        source: "tenant_integrations.360messenger.config.company_name",
        fallback: "NONE — send is skipped",
      },
      {
        name: "companyPhone",
        source: "tenant_integrations.360messenger.config.company_phone",
        fallback: "NONE — send is skipped",
      },
      { name: "depositAmount", source: "quotes.deposit_amount (50% deposit)" },
      { name: "paymentLink", source: "SumUp checkout URL via createSumUpDepositCheckout" },
    ],
    config: [
      { key: "tenant_integrations.360messenger.company_name", behaviour: "skip" },
      { key: "tenant_integrations.360messenger.company_phone", behaviour: "skip" },
      { key: "tenant_integrations.sumup.*", behaviour: "skip" },
    ],
    skipRules: [
      "Blank company name/phone writes a status:'failed' message_log row and skips.",
      "organisation_id is always caller-supplied; this module never resolves it.",
    ],
    knownDefects: [
      "D1 — branding read from tenant_integrations while the rest of the app uses settings (root cause of the deposit phone bug).",
    ],
    build: (v) =>
      `Hi ${raw(v.customerName)},\n\nThank you for approving your quote with ${raw(v.companyName)}.\n\nTo confirm your booking and secure the parts for your job, a 50% deposit of €${num(v.depositAmount).toFixed(2)} is required.\n\nPay securely here: ${raw(v.paymentLink)}\n\nIf you have any questions please reply to this message.\n\n${raw(v.companyName)} ☎ ${raw(v.companyPhone)}`,
  },
  {
    key: "deposit_reminder",
    name: "Deposit reminder",
    purpose: "Chases an unpaid deposit before the visit.",
    category: "Payments",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["send-deposit-reminder"],
    messageTypes: ["deposit_reminder"],
    variables: [
      { name: "customerName", source: "customers.name", fallback: 'NONE — renders "undefined"' },
      {
        name: "companyName",
        source: "tenant_integrations.360messenger.config.company_name",
        fallback: "NONE — skipped",
      },
      {
        name: "companyPhone",
        source: "tenant_integrations.360messenger.config.company_phone",
        fallback: "NONE — skipped",
      },
      { name: "paymentLink", source: "service_calls.payment_link (raw column)" },
    ],
    config: [
      { key: "tenant_integrations.360messenger.company_name", behaviour: "skip" },
      { key: "tenant_integrations.360messenger.company_phone", behaviour: "skip" },
    ],
    skipRules: [
      "requireMachineCaller; jobs without organisation_id are skipped.",
      "Opt-out filtered in-query and re-checked before send.",
    ],
    knownDefects: [
      'D12 — a null customers.name renders the literal "undefined".',
      "D1 — branding from tenant_integrations rather than settings.",
      "Historic: the payload field name was `phone_number` (fixed 31/08/26 via _shared/whatsappPayload.ts).",
    ],
    build: (v) =>
      `Hi ${raw(v.customerName)}, this is a reminder that your deposit payment is still outstanding for your booking with ${raw(v.companyName)}.\n\nPlease pay securely here: ${raw(v.paymentLink)}\n\nIf you have any questions please reply to this message.\n\n${raw(v.companyName)} ☎ ${raw(v.companyPhone)}`,
  },
  {
    key: "payment_link",
    name: "Payment link",
    purpose: "Sends a payment link for the balance on a job.",
    category: "Payments",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-payment-link"],
    messageTypes: ["payment_link"],
    variables: [
      { name: "customerName", source: "customers.name" },
      { name: "jobType", source: "service_calls.job_type", fallback: '"your job"' },
      { name: "jobTotal", source: "service_calls.revenue" },
      { name: "depositAmount", source: "deposit_required ? deposit_amount : 0" },
      { name: "balanceDue", source: "balance_due || (total - deposit) || total" },
      { name: "invoiceNumber", source: "service_calls.invoice_number", fallback: '"N/A"' },
      { name: "invoicePdfUrl", source: "REQUEST BODY", callerSupplied: true, fallback: "line omitted" },
      { name: "paymentLink", source: "resolved payment link" },
      { name: "footer", source: "settings.message_footer || business_name", fallback: "line omitted" },
    ],
    config: [{ key: "settings.message_footer", behaviour: "degrade" }],
    skipRules: ["Org via get_my_org_id() RPC + job match, else 404."],
    knownDefects: [
      "D7 — same content as invoice_created but with double newlines and a different money formatter.",
      "D9 — invoice_pdf_url is caller-supplied and interpolated unvalidated.",
    ],
    build: (v) => {
      let message = `Hi ${raw(v.customerName)}, please find your invoice attached for ${s(v.jobType) || "your job"}.\n\nTotal: €${num(v.jobTotal).toFixed(2)}\n\nDeposit paid: €${num(v.depositAmount).toFixed(2)}\n\nBalance due: €${num(v.balanceDue).toFixed(2)}\n\nInvoice ref: ${s(v.invoiceNumber) || "N/A"}\n\nPayment due within 14 days.`;
      if (v.invoicePdfUrl) message += `\n\n📄 View invoice:\n${raw(v.invoicePdfUrl)}`;
      message += `\n\n💳 Pay now:\n${raw(v.paymentLink)}`;
      if (v.footer) message += `\n\nThank you, ${raw(v.footer)}`;
      return message;
    },
  },
  {
    key: "extra_work_payment",
    name: "Extra work payment link",
    purpose: "Payment link for additional work agreed on site.",
    category: "Payments",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-extrawork-payment-link"],
    messageTypes: ["extra_work_payment"],
    variables: [
      { name: "customerName", source: "customers.name" },
      { name: "companyName", source: "settings.business_name", fallback: "NONE — blocks send" },
      { name: "companyPhone", source: "settings.business_phone", fallback: "NONE — blocks send" },
      { name: "itemsSummary", source: "REQUEST BODY line_items", callerSupplied: true },
      { name: "amount", source: "REQUEST BODY total_amount", callerSupplied: true },
      { name: "paymentLink", source: "service_calls.payment_link" },
    ],
    config: [
      { key: "settings.business_name", behaviour: "skip" },
      { key: "settings.business_phone", behaviour: "skip" },
    ],
    skipRules: [
      "requireResourceOrgAccess on quotes plus explicit org equality checks on the job and customer.",
    ],
    knownDefects: [
      "D9 — line items and total are caller-supplied and not re-derived server-side.",
      "Uses settings.business_* while the sibling ☎ messages use tenant_integrations — F4.",
    ],
    build: (v) =>
      `Hi ${raw(v.customerName)},\n\nYour engineer has identified some additional work required during your service today with ${raw(v.companyName)}.\n\nAdditional work:\n${raw(v.itemsSummary)}\nAmount due: €${num(v.amount).toFixed(2)}\n\nTo approve and pay securely tap here:\n${raw(v.paymentLink)}\n\nIf you have any questions please call us on ${raw(v.companyPhone)}.\n\n${raw(v.companyName)} ☎ ${raw(v.companyPhone)}`,
  },
  {
    key: "payment_received",
    name: "Payment received",
    purpose: "Thanks the customer once a payment lands.",
    category: "Payments",
    audience: "customer",
    trigger: "webhook",
    channel: FREE_TEXT,
    functions: ["send-payment-received"],
    messageTypes: ["payment_received"],
    variables: [
      { name: "customerName", source: "customers.name" },
      { name: "jobRef", source: 'service_calls.job_reference || "KN-" + id (DEFECT)' },
      { name: "invoiceNumber", source: "latest invoices.invoice_number", fallback: '"—"' },
      { name: "jobType", source: "service_calls.job_type", fallback: '"—"' },
      { name: "scheduledDate", source: "service_calls.scheduled_date" },
      { name: "amountPaid", source: "resolveReceiptAmount(body, job_payments, revenue)" },
      { name: "receiptUrl", source: "organisations.public_domain + access_token", fallback: "line omitted" },
      {
        name: "companyName",
        source: "tenant_integrations.360messenger.config.company_name",
        fallback: "NONE — skipped",
      },
    ],
    config: [{ key: "tenant_integrations.360messenger.company_name", behaviour: "skip" }],
    skipRules: ["requireResourceOrgAccess on service_calls."],
    knownDefects: [
      'F2 — hardcoded "KN-" job-reference prefix leaks K&N branding into other tenants.',
      'D8 — writes message_log.status "success"/"fail" instead of "sent"/"failed".',
      "Inline Irish phone normalisation instead of shared normalisePhone.",
    ],
    build: (v) =>
      `Hi ${raw(v.customerName)}, thanks for your payment. Here is your receipt:\n\n` +
      `Job Ref: ${raw(v.jobRef)}\n` +
      `Receipt: ${raw(v.invoiceNumber)}\n` +
      `Service: ${s(v.jobType) || "—"}\n` +
      `Date: ${raw(v.scheduledDate)}\n` +
      `Amount Paid: ${raw(v.amountPaid)}\n\n` +
      (v.receiptUrl ? `View your receipt here: ${raw(v.receiptUrl)}\n\n` : "") +
      `Thanks,\n` +
      s(v.companyName),
  },
  {
    key: "sumup_payment_confirmed",
    name: "SumUp part-payment confirmation",
    purpose: "Confirmation triggered by the SumUp webhook on a successful part payment.",
    category: "Payments",
    audience: "customer",
    trigger: "webhook",
    channel: FREE_TEXT,
    functions: ["sumup-payment-webhook", "_shared/depositConfirmationMessage.ts"],
    messageTypes: ["part_payment_received"],
    variables: [
      { name: "customerName", source: "customers.name", fallback: '"there"' },
      { name: "jobReference", source: "service_calls.job_reference", fallback: "line omitted" },
      { name: "amountPaid", source: "SumUp checkout amount" },
      { name: "balanceRemaining", source: "service_calls.balance_due after the payment" },
      { name: "receiptUrl", source: "tenant receipt URL", fallback: "line omitted" },
      { name: "footer", source: "orgBranding.footer || org_name", fallback: "sign-off omitted" },
    ],
    config: [{ key: "settings.message_footer", behaviour: "degrade" }],
    skipRules: [
      "Only sent for a genuine part payment (money moved, job not fully paid, balance > 0).",
      "Org resolved in _shared/sumupWebhook and cross-checked against the job; guarded when absent.",
    ],
    knownDefects: ["D5 — a fourth money formatter (round-then-fix)."],
    build: (v) => {
      const name = String(v.customerName ?? "").trim() || "there";
      const business = String(v.businessName ?? "").trim();
      const lines: string[] = [
        `Hi ${name}, thanks for your payment.`,
        "",
        `Amount paid: ${fmtRoundedEuro(v.amountPaid)} (Card)`,
        `Balance remaining: ${fmtRoundedEuro(v.balanceRemaining)}`,
      ];
      if (v.jobReference) lines.splice(2, 0, `Job Ref: ${raw(v.jobReference)}`, "");
      lines.push(
        "",
        "This is a part payment, so your job is not fully paid yet — the balance above is still due. Your full receipt follows once the job is settled in full.",
      );
      const receiptUrl = String(v.receiptUrl ?? "").trim();
      if (receiptUrl) lines.push("", `Payment record: ${receiptUrl}`);
      const footer = (String(v.footer ?? "").trim() || business).trim();
      if (footer) lines.push("", "Thanks,", footer);
      return lines.join("\n");
    },
  },

  // === Invoices & receipts =================================================
  {
    key: "invoice_sent",
    name: "Invoice sent",
    purpose: "Sends the customer their invoice link.",
    category: "Invoices & receipts",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-invoice-whatsapp"],
    messageTypes: ["invoice_sent"],
    variables: [
      { name: "customerName", source: "customers.name" },
      { name: "businessName", source: "settings.business_name", fallback: "NONE — blocks send" },
      { name: "businessPhone", source: "settings.business_phone", fallback: "line omitted" },
      { name: "jobRef", source: "service_calls.job_reference || <cert_prefix>-<id>" },
      { name: "invoiceNumber", source: "service_calls.invoice_number", fallback: '"—"' },
      { name: "invoiceDate", source: "service_calls.invoiced_at as dd/mm/yyyy", fallback: '"—"' },
      { name: "balanceDue", source: "€ + service_calls.balance_due.toFixed(2)" },
      { name: "paymentLink", source: "tenant_integrations.stripe.config.payment_link" },
    ],
    config: [
      { key: "settings.business_name", behaviour: "skip" },
      { key: "settings.cert_prefix", behaviour: "degrade" },
      { key: "tenant_integrations.stripe.payment_link", behaviour: "skip" },
    ],
    skipRules: ["Blank business name or payment link blocks the send."],
    knownDefects: ["Inline customer.opted_out check rather than the shared consent gate (D4)."],
    build: (v) =>
      `Hi ${raw(v.customerName)}, please find your invoice from ${raw(v.businessName)}.\n\n` +
      `Job Ref: ${raw(v.jobRef)}\n` +
      `Invoice #: ${raw(v.invoiceNumber)}\n` +
      `Invoice Date: ${raw(v.invoiceDate)}\n` +
      `Balance Due: ${raw(v.balanceDue)}\n\n` +
      `Pay securely here: ${raw(v.paymentLink)}\n\n` +
      `If you have any questions please reply to this message.\n\n` +
      `${raw(v.businessName)}${v.businessPhone ? `\n☎️ ${raw(v.businessPhone)}` : ""}`,
  },
  {
    key: "invoice_created",
    name: "Invoice created notification",
    purpose: "Notification issued when an invoice is generated for a job.",
    category: "Invoices & receipts",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["create-job-invoice"],
    messageTypes: ["invoice"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      { name: "jobType", source: "service_calls.job_type", fallback: '"your job"' },
      { name: "total", source: "quotes.total_amount || service_calls.revenue" },
      { name: "depositPaid", source: "quotes.deposit || service_calls.deposit_amount" },
      { name: "balance", source: "total - depositPaid" },
      { name: "invNum", source: "invoices.invoice_number || INV-<id[0:8]>" },
      { name: "invoiceUrl", source: "organisations.public_domain + invoices.access_token", fallback: "line omitted" },
      { name: "messageFooter", source: "settings.message_footer || business_name", fallback: "line omitted" },
    ],
    config: [{ key: "settings.message_footer", behaviour: "degrade" }],
    skipRules: ["requireCustomerMessagingConsent gates only the outbound message; the invoice is still created."],
    knownDefects: [
      "D5 — the only user of the comma-grouped money formatter.",
      "D7 — duplicates payment_link's content with different whitespace.",
      "Hand-builds the public URL instead of using getTenantPublicUrl.",
    ],
    build: (v) =>
      `Hi ${raw(v.firstName)}, please find your invoice attached for ${s(v.jobType) || "your job"}.\n\nTotal: ${fmtGroupedEuro(v.total)}\nDeposit paid: ${fmtGroupedEuro(v.depositPaid)}\nBalance due: ${fmtGroupedEuro(v.balance)}\n\nInvoice ref: ${raw(v.invNum)}\nPayment due within 14 days.${v.invoiceUrl ? `\n\n📄 View invoice:\n${raw(v.invoiceUrl)}` : ""}${v.messageFooter ? `\n\nThank you, ${raw(v.messageFooter)}` : ""}`,
  },
  {
    key: "outstanding_invoice",
    name: "Outstanding invoice reminder",
    purpose: "Chases unpaid invoices on a schedule.",
    category: "Invoices & receipts",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["send-outstanding-invoice-reminders"],
    messageTypes: ["outstanding_invoice"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      { name: "businessName", source: "settings.business_name", fallback: "NONE — aborts batch" },
      { name: "businessPhone", source: "settings.business_phone", fallback: "NONE — aborts batch" },
      { name: "balance", source: "service_calls.balance_due.toFixed(2)" },
      { name: "invoiceDate", source: "invoiced_at || completed_at as dd/mm/yyyy" },
      { name: "stripeLink", source: "tenant_integrations.stripe.payment_link || 360messenger.stripe_payment_link" },
    ],
    config: [
      { key: "settings.business_name", behaviour: "skip" },
      { key: "settings.business_phone", behaviour: "skip" },
      { key: "tenant_integrations.stripe.payment_link", behaviour: "skip" },
    ],
    skipRules: [
      "requireBoundOrg plus a per-job assertSameOrganisation.",
      "Claims invoice_reminder_count before sending and rolls back on failure.",
    ],
    knownDefects: [],
    build: (v) =>
      `Hi ${raw(v.firstName)}, this is a friendly reminder from ${raw(v.businessName)} that you have an outstanding balance of €${raw(v.balance)} for work completed on ${raw(v.invoiceDate)}.\n\n` +
      `Pay securely here: ${raw(v.stripeLink)}\n\n` +
      `If you have already made payment please ignore this message. Any questions reply to this message.\n\n` +
      `${raw(v.businessName)} ☎️ ${raw(v.businessPhone)}`,
  },
  {
    key: "outstanding_reminder_trigger",
    name: "Outstanding reminder (manual run)",
    purpose: "Office-triggered run of the outstanding invoice chase.",
    category: "Invoices & receipts",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["trigger-outstanding-reminder"],
    messageTypes: [],
    variables: [
      { name: "customer_name", source: "customers.name (posted to Make)" },
      { name: "customer_phone", source: "customers.phone (posted to Make)" },
      { name: "company_name", source: "tenant_integrations.make.config.company_name" },
      { name: "company_phone", source: "tenant_integrations.make.config.company_phone" },
    ],
    config: [
      { key: "tenant_integrations.make.company_name", behaviour: "skip" },
      { key: "tenant_integrations.make.company_phone", behaviour: "skip" },
    ],
    skipRules: ["Posts to a Make.com webhook; the wording lives in the Make scenario."],
    knownDefects: [
      "D6 — no org guard, no opt-out check, and a global webhook-secret fallback.",
    ],
    build: null,
    bodyOwner: "Make.com scenario (no in-repo body)",
  },
  {
    key: "receipt",
    name: "Receipt",
    purpose: "Sends the service receipt after payment.",
    category: "Invoices & receipts",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-whatsapp-receipt"],
    messageTypes: ["receipt"],
    variables: [
      { name: "customerName", source: "customers.name" },
      { name: "jobRef", source: "job_reference || <cert_prefix>-<shortId> || Job <shortId>" },
      { name: "receiptNum", source: "service_calls.receipt_number", fallback: "line omitted" },
      { name: "jobType", source: "service_calls.job_type", fallback: '"Boiler Service"' },
      { name: "date", source: "completed_at, en-IE long date" },
      { name: "amount", source: "formatReceiptAmount(resolveReceiptAmount(...))" },
      { name: "paymentMethod", source: 'payment_method mapped to "Card"/"Invoice"/"Cash"' },
      { name: "receiptUrl", source: "tenant receipt URL", fallback: "line omitted" },
      { name: "footer", source: "settings.message_footer || business_name" },
    ],
    config: [
      { key: "settings.message_footer", behaviour: "degrade" },
      { key: "settings.cert_prefix", behaviour: "degrade" },
    ],
    skipRules: ["requireCustomerMessagingConsent. Send failures log and return 200 success:false."],
    knownDefects: ["Opt-out gap noted for sibling send functions does not apply here."],
    build: (v) =>
      `Hi ${raw(v.customerName)}, thanks for your payment. Here's your receipt:\n\nJob Ref: ${raw(v.jobRef)}${v.receiptNum ? `\nReceipt: ${raw(v.receiptNum)}` : ""}\nService: ${s(v.jobType) || "Boiler Service"}\nDate: ${raw(v.date)}\nAmount Paid: ${raw(v.amount)} (${raw(v.paymentMethod)})${v.receiptUrl ? `\n\n📄 View your receipt here: ${raw(v.receiptUrl)}` : ""}\n\nThanks,\n${raw(v.footer)}`,
  },

  // === Documents ===========================================================
  {
    key: "certificate",
    name: "Certificate",
    purpose: "Sends a gas or service certificate link to the customer.",
    category: "Documents",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-certificate-whatsapp"],
    messageTypes: ["certificate"],
    variables: [
      { name: "customerName", source: "customers.name, first token" },
      { name: "certTypeLabel", source: "certificates.notes.cert_type || cert_number prefix" },
      { name: "certificateNumber", source: "certificates.cert_number" },
      { name: "certificateUrl", source: "tenant certificate URL (1-hour signed)" },
      { name: "messageFooter", source: "settings.message_footer", fallback: "NONE — blocks send" },
    ],
    config: [
      { key: "settings.message_footer", behaviour: "skip" },
      {
        key: "settings.template_certificate",
        behaviour: "degrade",
        note: "operator override replaces the whole body",
      },
    ],
    skipRules: ["Blank footer skips and logs. requireCustomerMessagingConsent."],
    knownDefects: [
      "String-replaces certificate-type phrases inside operator-authored templates (D6).",
    ],
    build: (v) =>
      `Hi ${raw(v.customerName)}, please find your ${raw(v.certTypeLabel)} ${raw(v.certificateNumber)}.\n\nThis certificate confirms all work has been completed in accordance with Irish gas safety standards.\n\nPlease keep this for your records.\n\nThank you for choosing us. 🔧\n\n📄 View Certificate:\n${raw(v.certificateUrl)}\n\n${raw(v.messageFooter)}`,
    notes:
      "Default template only. settings.template_certificate replaces the body before the footer is appended; the {{customer_name}}, {{certificate_number}}, {{certificate_type}} and {{certificate_url}} tokens are substituted either way.",
  },
  {
    key: "hazard_notification",
    name: "Hazard notification",
    purpose: "Sends an At Risk / Immediately Dangerous notice to the customer.",
    category: "Documents",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-hazard-whatsapp"],
    messageTypes: ["hazard_notification"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      { name: "engineerName", source: "engineers.name", fallback: '"your engineer"' },
      { name: "hazardUrl", source: "tenant hazard document URL", fallback: "line omitted" },
      { name: "messageFooter", source: "settings.message_footer" },
    ],
    config: [{ key: "settings.message_footer", behaviour: "skip" }],
    skipRules: [
      "Org from service_calls.organisation_id via hazard.job_id; hard block when missing.",
      "requireCustomerMessagingConsent.",
    ],
    knownDefects: ["Hazard PDFs are stored in the `certificates` bucket (D6)."],
    build: (v) =>
      `Hi ${raw(v.firstName)}, please find attached your Gas Installation Notification of Hazard/Non-Conformance from ${raw(v.engineerName)}.${v.hazardUrl ? `\n\n📄 View Document:\n${raw(v.hazardUrl)}` : ""}\n\n${raw(v.messageFooter)}`,
  },

  // === Parts ===============================================================
  {
    key: "part_arrived",
    name: "Part arrived",
    purpose: "Tells the customer their ordered part is in and the visit can be booked.",
    category: "Parts",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-part-arrived"],
    messageTypes: ["part_arrived"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      { name: "follow_up_detail", source: "request body", callerSupplied: true, fallback: '"Follow-up repair"' },
      { name: "customMessage", source: "REQUEST BODY — replaces the whole body", callerSupplied: true },
      {
        name: "messageFooter",
        source: "settings.message_footer || business_name || company_name",
        fallback: "line omitted (degrades, logs)",
      },
    ],
    config: [{ key: "settings.message_footer", behaviour: "degrade" }],
    skipRules: ["Degrades rather than blocking when branding is absent; logs the degradation."],
    knownDefects: ["D9 — customMessage overrides the entire body with unvalidated caller text."],
    build: (v) => {
      const baseMessage = v.customMessage
        ? raw(v.customMessage)
        : `Hi ${raw(v.firstName)}, great news! The part we ordered for your boiler has arrived. 🔧\n\nWe'd like to arrange a time to come back and complete the work.\n\nDetails: ${s(v.follow_up_detail) || "Follow-up repair"}\n\nPlease reply to this message or call us to book a time that suits you.`;
      return v.messageFooter ? `${baseMessage}\n\n${raw(v.messageFooter)}` : baseMessage;
    },
  },

  // === Renewals ============================================================
  {
    key: "renewal_reminder",
    name: "Service renewal reminder",
    purpose: "Prompts the customer to rebook their annual service.",
    category: "Renewals",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-renewal-reminder"],
    messageTypes: ["renewal_reminder"],
    variables: [
      { name: "first_name", source: "REQUEST BODY", callerSupplied: true },
      { name: "renewal_date", source: "REQUEST BODY", callerSupplied: true },
      { name: "companyName", source: "settings.company_name" },
      { name: "companyPhone", source: "settings.company_phone" },
      { name: "renewalFormUrl", source: "tenant_integrations.tally.renewal_form_url", fallback: "shorter book line" },
      { name: "cleanPhone", source: "customers.phone (DB only), normalised" },
    ],
    config: [
      { key: "settings.company_name", behaviour: "skip" },
      { key: "tenant_integrations.tally.renewal_form_url", behaviour: "degrade" },
    ],
    skipRules: [
      "requireResourceOrgAccess on customers; cross-sibling-phone dedup via isDuplicateRenewalSend (20h).",
      "No Tally URL is a hard skip of the booking link only — never a fallback to another tenant's URL.",
    ],
    knownDefects: [
      "Reads settings.company_* while other paths read business_* — D10 / F4.",
      "D11/D14 — near-duplicate of area_bulk_renewal under a different message_type, so dedup does not span them.",
    ],
    build: (v) => {
      const bookLine = v.renewalFormUrl
        ? `Book online: ${raw(v.renewalFormUrl)}?customer_phone=${encodeURIComponent(s(v.cleanPhone))}\n\nOr reply here or call us on ${raw(v.companyPhone)}.`
        : `Reply here to book your service or call us on ${raw(v.companyPhone)}.`;
      return `Hi ${raw(v.first_name)},\n\nThis is ${raw(v.companyName)}. Your annual boiler service is due on ${raw(v.renewal_date)}.\n\nIf your boiler is under manufacturer warranty, maintaining a yearly service is a condition of keeping that warranty valid.\n\n${bookLine}\n\nReply STOP to unsubscribe.\n${raw(v.companyName)}`;
    },
  },
  {
    key: "area_bulk_renewal",
    name: "Area bulk outreach",
    purpose: "Bulk renewal outreach to customers in a chosen area code.",
    category: "Renewals",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-area-bulk-whatsapp"],
    messageTypes: ["renewal"],
    variables: [
      { name: "firstName", source: "customers.name, first token" },
      { name: "companyName", source: "tenant_integrations.360messenger.config.company_name (trimmed)" },
      { name: "companyPhone", source: "tenant_integrations.360messenger.config.company_phone (trimmed)" },
      { name: "dueDate", source: "customers.next_service_due", fallback: '"soon"' },
    ],
    config: [
      { key: "tenant_integrations.360messenger.company_name", behaviour: "skip" },
      { key: "tenant_integrations.360messenger.company_phone", behaviour: "skip" },
    ],
    skipRules: [
      "requireCallerOrg restricted to office/admin/owner/manager, plus a per-recipient org equality check.",
    ],
    knownDefects: [
      'D11 — one word ("is generally a condition") differs from renewal_reminder.',
      "D1 — branding from tenant_integrations.",
    ],
    build: (v) =>
      `Hi ${raw(v.firstName)},\n\nThis is ${raw(v.companyName)}. Your annual boiler service is due on ${raw(v.dueDate)}.\n\nIf your boiler is under manufacturer warranty, maintaining a yearly service is generally a condition of keeping that warranty valid.\n\nReply here to book your service or call us on ${raw(v.companyPhone)}.\n\nReply STOP to unsubscribe.\n${raw(v.companyName)}`,
  },
  {
    key: "warranty_day14",
    name: "Warranty outreach (day 14)",
    purpose: "Warranty outreach 14 days after an install, inviting the customer to book the annual service.",
    category: "Renewals",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-warranty-whatsapp"],
    messageTypes: ["warranty_day14"],
    variables: [
      { name: "first_name", source: "REQUEST BODY", callerSupplied: true },
      { name: "boiler_brand", source: "REQUEST BODY", callerSupplied: true },
      { name: "boiler_model", source: "REQUEST BODY", callerSupplied: true },
      { name: "install_date_formatted", source: "REQUEST BODY", callerSupplied: true },
      { name: "brandingName", source: "orgBranding.org_name (rejects the 'our team' default)" },
      { name: "brandingPhone", source: "orgBranding.org_phone", fallback: "call line omitted" },
      { name: "footerLine", source: "orgBranding.footer || org_name" },
      { name: "tallyUrl", source: "tenant_integrations.tally.renewal_form_url" },
    ],
    config: [
      { key: "tenant_integrations.tally.renewal_form_url", behaviour: "skip" },
      { key: "settings.business_name", behaviour: "skip" },
    ],
    skipRules: [
      "No Tally URL is a HARD SKIP — there is no K&N fallback anywhere in this path.",
      'Branding is hard-required and the "our team" default is rejected outright.',
    ],
    knownDefects: [
      'F3 — "registered Gas Safe engineer" is the UK scheme; Irish tenants should read RGI.',
    ],
    build: (v) => {
      const phoneLine = v.brandingPhone ? `\n\nOr call us on 📞 ${raw(v.brandingPhone)}` : "";
      return (
        `Hi ${raw(v.first_name)}, this is ${raw(v.brandingName)}.\n\n` +
        `We are getting in touch to let you know your ${raw(v.boiler_brand)} ${raw(v.boiler_model)} boiler, installed on ${raw(v.install_date_formatted)}, is currently covered under the manufacturer's warranty.\n\n` +
        `⚠️ Important: To keep your warranty valid, your boiler must be serviced by a registered Gas Safe engineer every year.\n\n` +
        `Book your annual service here:\n👉 ${raw(v.tallyUrl)}` +
        `${phoneLine}\n\n` +
        `${raw(v.footerLine)}`
      );
    },
  },
  {
    key: "warranty_day28",
    name: "Warranty outreach (day 28)",
    purpose: "Second-stage warranty follow-up 28 days after an install.",
    category: "Renewals",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["send-warranty-whatsapp"],
    messageTypes: ["warranty_day28"],
    variables: [
      { name: "first_name", source: "REQUEST BODY", callerSupplied: true },
      { name: "boiler_brand", source: "REQUEST BODY", callerSupplied: true },
      { name: "boiler_model", source: "REQUEST BODY", callerSupplied: true },
      { name: "brandingName", source: "orgBranding.org_name" },
      { name: "brandingPhone", source: "orgBranding.org_phone", fallback: "call line omitted" },
      { name: "footerLine", source: "orgBranding.footer || org_name" },
      { name: "tallyUrl", source: "tenant_integrations.tally.renewal_form_url" },
    ],
    config: [
      { key: "tenant_integrations.tally.renewal_form_url", behaviour: "skip" },
      { key: "settings.business_name", behaviour: "skip" },
    ],
    skipRules: ["Same hard-skip rules as warranty_day14."],
    knownDefects: [],
    build: (v) => {
      const phoneLine = v.brandingPhone ? `\n\nOr call us on 📞 ${raw(v.brandingPhone)}` : "";
      return (
        `Hi ${raw(v.first_name)}, this is ${raw(v.brandingName)}.\n\n` +
        `We messaged you two weeks ago about your new ${raw(v.boiler_brand)} ${raw(v.boiler_model)} boiler warranty. We just wanted to follow up — booking your annual service is the best way to keep your warranty valid and your boiler running safely.\n\n` +
        `Book here:\n👉 ${raw(v.tallyUrl)}` +
        `${phoneLine}\n\n` +
        `${raw(v.footerLine)}`
      );
    },
  },
  {
    key: "warranty_auto",
    name: "Warranty auto-send orchestrator",
    purpose: "Automated two-stage warranty follow-up after an install.",
    category: "Renewals",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["warranty-auto-send"],
    messageTypes: ["warranty_day14", "warranty_day28"],
    dynamicMessageType: true,
    variables: [],
    config: [{ key: "tenant_integrations.tally.renewal_form_url", behaviour: "skip" }],
    skipRules: [
      "requireMachineCaller; iterates non-archived orgs and invokes send-warranty-whatsapp per eligible customer.",
      "Reads its Supabase URL from the function environment, not the current_setting() pattern.",
    ],
    knownDefects: [],
    build: null,
    bodyOwner: "warranty_day14 / warranty_day28 (this function only orchestrates)",
  },
  {
    key: "renewal_reminder_30",
    name: "Renewal reminder feed (30 days)",
    purpose: "Automated reminder 30 days before the service due date.",
    category: "Renewals",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["renewal-reminder-30"],
    messageTypes: [],
    variables: [],
    config: [{ key: "tenant_integrations.tally.renewal_form_url", behaviour: "skip" }],
    skipRules: ["requireBoundOrg; opted_out filtered in-query; hard 400 when the Tally URL is absent."],
    knownDefects: [],
    build: null,
    bodyOwner: "Make.com scenario (this function returns a JSON feed only)",
  },
  {
    key: "renewal_reminder_14",
    name: "Renewal reminder feed (14 days)",
    purpose: "Automated reminder 14 days before the service due date.",
    category: "Renewals",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["renewal-reminder-14"],
    messageTypes: [],
    variables: [],
    config: [{ key: "tenant_integrations.tally.renewal_form_url", behaviour: "skip" }],
    skipRules: ["requireBoundOrg; opted_out filtered in-query; hard 400 when the Tally URL is absent."],
    knownDefects: [],
    build: null,
    bodyOwner: "Make.com scenario (this function returns a JSON feed only)",
  },
  {
    key: "renewal_reminder_7",
    name: "Renewal reminder feed (7 days)",
    purpose: "Automated reminder 7 days before the service due date.",
    category: "Renewals",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["renewal-reminder-7"],
    messageTypes: [],
    variables: [],
    config: [],
    skipRules: ["requireBoundOrg; opted_out filtered in-query; returns a bare customer list."],
    knownDefects: [],
    build: null,
    bodyOwner: "Make.com scenario (this function returns a JSON feed only)",
  },

  // === Retention ===========================================================
  {
    key: "review_request",
    name: "Review request feed",
    purpose: "Asks the customer for a Google review after a completed job.",
    category: "Retention",
    audience: "customer",
    trigger: "cron",
    channel: FREE_TEXT,
    functions: ["review-request"],
    messageTypes: [],
    variables: [],
    config: [{ key: "settings.google_review_url", behaviour: "skip" }],
    skipRules: [
      "requireBoundOrg; jobs completed >2h ago with review_sent = false; per-org review URL, skip+log when absent.",
    ],
    knownDefects: [],
    build: null,
    bodyOwner: "Make.com scenario (this function returns a JSON feed only)",
  },
  {
    key: "review_request_trigger",
    name: "Review request (manual run)",
    purpose: "Office-triggered review request for a specific job.",
    category: "Retention",
    audience: "customer",
    trigger: "user action",
    channel: FREE_TEXT,
    functions: ["trigger-review-request"],
    messageTypes: [],
    variables: [],
    config: [{ key: "settings.google_review_url", behaviour: "skip" }],
    skipRules: [
      "requireResourceOrgAccess on the service_call plus a cross-tenant customer check (P1 fix).",
    ],
    knownDefects: [
      'Logs customer_activity.event_type = "whatsapp_sent" although it never calls 360Messenger.',
    ],
    build: null,
    bodyOwner: "Make.com scenario (no in-repo body)",
  },

  // === Inbound =============================================================
  {
    key: "missed_call_followup",
    name: "Missed call follow-up",
    purpose: "Auto-replies to a missed call with a booking link.",
    category: "Inbound",
    audience: "customer",
    trigger: "webhook",
    channel: FREE_TEXT,
    functions: ["missed-call-lookup"],
    messageTypes: ["missed_call_followup"],
    variables: [],
    config: [],
    skipRules: [
      "Shared-secret authorised; organisation_id comes from the body, so a trusted caller can name any org.",
    ],
    knownDefects: ["Trusted caller can name any organisation_id."],
    build: null,
    bodyOwner: "Make.com scenario (this function only looks up and logs)",
  },
  {
    key: "opt_out",
    name: "Opt-out confirmation (logged)",
    purpose: "Confirms a STOP request and flags the customer as opted out.",
    category: "Inbound",
    audience: "customer",
    trigger: "inbound",
    channel: FREE_TEXT,
    functions: ["handle-whatsapp-opt-out"],
    messageTypes: ["opt_out"],
    variables: [],
    config: [],
    skipRules: [
      "resolveMachineOrganisation fails closed and refuses to guess the tenant.",
      "Writes the fixed audit line 'Customer replied STOP — opted out of WhatsApp messages'; the customer reply itself is sent by whatsapp-inbound.",
    ],
    knownDefects: [],
    build: null,
    bodyOwner: "whatsapp-inbound reply_opt_out (this function only records the opt-out)",
  },
  {
    key: "inbound_reply",
    name: "Inbound auto-replies",
    purpose: "Automatic replies to inbound customer messages (STOP, CONFIRM, CANCEL and unmatched replies).",
    category: "Inbound",
    audience: "customer",
    trigger: "inbound",
    channel: FREE_TEXT,
    functions: ["whatsapp-inbound"],
    messageTypes: ["inbound", "reply_opt_out", "reply_unmatched", "reply_ambiguous", "reply_confirm", "reply_cancel"],
    dynamicMessageType: true,
    variables: [
      { name: "replyKind", source: "inbound intent: opt_out | unmatched | ambiguous | confirm | cancel" },
      { name: "brandingName", source: "orgBranding.org_name (legacy shim)" },
      { name: "brandingPhone", source: "orgBranding.org_phone", fallback: "call phrase shortened" },
      { name: "brandingFooter", source: "orgBranding.footer", fallback: "falls back to name" },
      { name: "jobOwnerName", source: "customers.name on the matched job" },
    ],
    config: [{ key: "settings.message_footer", behaviour: "degrade" }],
    skipRules: [
      "Org derived from the customer rows matching the inbound phone, never from a caller.",
      "CONFIRM/CANCEL require a single unambiguous org or are dropped as cross_org_ambiguous.",
      "Gated by WHATSAPP_INBOUND_SECRET (fail-closed when unset) or a machine caller.",
    ],
    knownDefects: [
      "STOP applies opted_out to every customer row sharing that phone, across orgs (deliberate, documented).",
    ],
    build: (v) => {
      const brandSignoff = s(v.brandingFooter) || raw(v.brandingName);
      const callUs = v.brandingPhone ? ` on ${raw(v.brandingPhone)}` : "";
      switch (s(v.replyKind)) {
        case "opt_out":
          return `Got it — we've removed you from our reminder list. No further messages will be sent. ${brandSignoff}.`;
        case "unmatched":
          return `Thanks — we couldn't match that to an upcoming appointment. Please call us${callUs} and we'll help.`;
        case "ambiguous":
          return `Thanks — you have more than one upcoming appointment with us, so we don't want to change the wrong one. Please call us${callUs} and we'll sort it straight away.`;
        case "confirm":
          return `Thanks ${raw(v.jobOwnerName)}, your appointment is confirmed. See you then! ${brandSignoff}`;
        case "cancel":
          return `Thanks ${raw(v.jobOwnerName)}, your appointment has been cancelled. To rebook please call us${callUs}. ${brandSignoff}`;
        default:
          return "";
      }
    },
    notes:
      "The `inbound` message_type stores the customer's own words and has no builder; the five reply kinds above are the outbound halves.",
  },
];

// ---------------------------------------------------------------------------
// Shared body helpers
// ---------------------------------------------------------------------------

/** Quote follow-up stages 3 and 6 share one builder (mirrors _shared/quoteFollowup.ts). */
function buildQuoteFollowup(stage: 3 | 6, v: CatalogueVars): string {
  const first = firstName(v.customerName);
  const businessName = String(v.businessName ?? "").trim() || "our team";
  const phone = String(v.businessPhone ?? "").trim();
  const quoteNumber = String(v.quoteNumber ?? "").trim();
  const quoteRef = quoteNumber ? `quote ${quoteNumber}` : "the quote";
  const url = String(v.quoteUrl ?? "").trim();
  const linkLine = url ? `\n\nView your quote here: ${url}` : "";

  if (stage === 3) {
    return (
      `Hi ${first}, just checking you got ${quoteRef} we sent over. ` +
      `Happy to answer any questions or adjust anything if needed.` +
      linkLine +
      `\n\nThanks,\n${businessName}`
    );
  }

  const contactLine = phone
    ? `Reply to this message or call us on ${phone} if you have any questions.`
    : `Reply to this message if you have any questions.`;

  return (
    `Hi ${first}, we wanted to follow up on ${quoteRef} we sent over. ` +
    `We have some availability coming up if you'd like to go ahead. ` +
    `${contactLine}` +
    linkLine +
    `\n\nThanks,\n${businessName}`
  );
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export const CATALOGUE_KEYS: string[] = WHATSAPP_CATALOGUE.map((e) => e.key);

export function getCatalogueEntry(key: string): CatalogueEntry | undefined {
  return WHATSAPP_CATALOGUE.find((e) => e.key === key);
}

/**
 * Build a message body from the catalogue. Throws for unknown keys and for
 * entries whose body is not authored in this repo, so a caller can never
 * silently send an empty string.
 */
export function buildCatalogueMessage(key: string, vars: CatalogueVars): string {
  const entry = getCatalogueEntry(key);
  if (!entry) throw new Error(`Unknown WhatsApp catalogue key: ${key}`);
  if (!entry.build) {
    throw new Error(
      `Catalogue entry "${key}" has no in-repo body (owner: ${entry.bodyOwner ?? "external"})`,
    );
  }
  return entry.build(vars);
}

/** Every `message_log.message_type` the catalogue accounts for. */
export const CATALOGUE_MESSAGE_TYPES: string[] = Array.from(
  new Set(WHATSAPP_CATALOGUE.flatMap((e) => e.messageTypes)),
).sort();

/** Every Edge Function directory the catalogue accounts for. */
export const CATALOGUE_FUNCTIONS: string[] = Array.from(
  new Set(WHATSAPP_CATALOGUE.flatMap((e) => e.functions).filter((f) => !f.startsWith("_shared/"))),
).sort();

/**
 * Send paths that are deliberately NOT tenant catalogue entries.
 * `_shared/notifyAdmin.ts` messages the platform admin using global secrets:
 * no organisation_id, no opt-out, no message_log row. It must never be
 * migrated into the tenant catalogue.
 */
export const EXCLUDED_SEND_PATHS: string[] = ["_shared/notifyAdmin.ts"];
