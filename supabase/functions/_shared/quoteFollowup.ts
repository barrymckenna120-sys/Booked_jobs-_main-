/**
 * Shared, pure logic for the automated quote follow-ups (day 3 and day 6).
 *
 * Business rule (single source of truth):
 *   send = !quoteRead && !quoteApproved && !followupAlreadySent
 *
 * "Read" is `quotes.viewed_at` (set by public.mark_quote_viewed when the
 * customer opens /quote/:token). "Approved" is `quotes.approved` /
 * `approved_at`, or a terminal status. Day 6 re-evaluates BOTH conditions —
 * having sent day 3 never implies day 6 may go out.
 *
 * Nothing here performs IO so the rules stay unit-testable.
 */

export type FollowupStage = 3 | 6;

export interface FollowupCustomer {
  name?: string | null;
  phone?: string | null;
  opted_out?: boolean | null;
}

export interface FollowupQuote {
  status?: string | null;
  approved?: boolean | null;
  approved_at?: string | null;
  viewed_at?: string | null;
  follow_up_day3_sent?: boolean | null;
  follow_up_day6_sent?: boolean | null;
  customers?: FollowupCustomer | null;
}

export type FollowupDecision =
  | { send: true; reason: "eligible" }
  | { send: false; reason: FollowupSkipReason };

export type FollowupSkipReason =
  | "no_customer"
  | "opted_out"
  | "no_phone"
  | "quote_read"
  | "quote_approved"
  | "status_not_open"
  | "already_sent"
  | "day3_not_sent";

/** Statuses that still represent an open, un-actioned, unread quote. */
const OPEN_STATUSES = new Set(["sent", "draft-sent"]);

/** Any of these means the customer already acted — never follow up. */
const ACTIONED_STATUSES = new Set([
  "accepted",
  "approved",
  "converted",
  "paid",
  "rejected",
  "declined",
  "expired",
  "cancelled",
  "canceled",
]);

export function decideFollowup(
  stage: FollowupStage,
  quote: FollowupQuote | null | undefined,
): FollowupDecision {
  if (!quote) return { send: false, reason: "no_customer" };

  const status = String(quote.status ?? "").trim().toLowerCase();

  if (quote.approved === true || quote.approved_at || ACTIONED_STATUSES.has(status)) {
    return { send: false, reason: "quote_approved" };
  }

  // Read the quote -> the customer has seen it. Chasing stops immediately.
  if (quote.viewed_at) return { send: false, reason: "quote_read" };

  // 'viewed' is a read state, so it is excluded by OPEN_STATUSES too — the
  // viewed_at check above is the primary gate, this is defence in depth.
  if (!OPEN_STATUSES.has(status)) return { send: false, reason: "status_not_open" };

  if (stage === 3 && quote.follow_up_day3_sent === true) {
    return { send: false, reason: "already_sent" };
  }
  if (stage === 6) {
    if (quote.follow_up_day6_sent === true) return { send: false, reason: "already_sent" };
    if (quote.follow_up_day3_sent !== true) return { send: false, reason: "day3_not_sent" };
  }

  const customer = quote.customers;
  if (!customer) return { send: false, reason: "no_customer" };
  if (customer.opted_out === true) return { send: false, reason: "opted_out" };
  if (!String(customer.phone ?? "").trim()) return { send: false, reason: "no_phone" };

  return { send: true, reason: "eligible" };
}

export interface FollowupTemplateData {
  customerName?: string | null;
  businessName?: string | null;
  businessPhone?: string | null;
  quoteNumber?: string | null;
  quoteUrl?: string | null;
}

export function firstNameOf(name?: string | null): string {
  const first = String(name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

/**
 * Renders the day-3 / day-6 follow-up copy. Every dynamic part degrades
 * gracefully rather than emitting "undefined", "null" or a blank URL:
 *   - no quote number  -> "the quote"
 *   - no quote link    -> link line omitted
 *   - no business phone-> "reply to this message" only
 *   - no business name -> "our team"
 */
export function renderFollowupMessage(
  stage: FollowupStage,
  data: FollowupTemplateData,
): string {
  const firstName = firstNameOf(data.customerName);
  const businessName = String(data.businessName ?? "").trim() || "our team";
  const phone = String(data.businessPhone ?? "").trim();
  const quoteNumber = String(data.quoteNumber ?? "").trim();
  const quoteRef = quoteNumber ? `quote ${quoteNumber}` : "the quote";
  const url = String(data.quoteUrl ?? "").trim();
  const linkLine = url ? `\n\nView your quote here: ${url}` : "";

  if (stage === 3) {
    return (
      `Hi ${firstName}, just checking you got ${quoteRef} we sent over. ` +
      `Happy to answer any questions or adjust anything if needed.` +
      linkLine +
      `\n\nThanks,\n${businessName}`
    );
  }

  const contactLine = phone
    ? `Reply to this message or call us on ${phone} if you have any questions.`
    : `Reply to this message if you have any questions.`;

  return (
    `Hi ${firstName}, we wanted to follow up on ${quoteRef} we sent over. ` +
    `We have some availability coming up if you'd like to go ahead. ` +
    `${contactLine}` +
    linkLine +
    `\n\nThanks,\n${businessName}`
  );
}
