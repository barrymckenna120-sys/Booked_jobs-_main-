/**
 * Pure mapping from raw provider/transport errors to a short, human-readable
 * failure reason that is safe to show a non-technical office user.
 *
 * No Deno / npm imports so this can be unit-tested from the frontend runner.
 * The raw error is kept separately (attempts.provider_error) for support only —
 * never render it in the Office App.
 */

export type CommChannel = "whatsapp" | "email" | "sms";

export type CommType =
  | "quote"
  | "invoice"
  | "receipt"
  | "service_reminder"
  | "certificate"
  | "payment_link"
  | "booking_confirmation"
  | "other";

const CHANNEL_LABEL: Record<CommChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABEL[(channel as CommChannel)] ?? "Message";
}

/**
 * Collapse a provider error into one short sentence.
 * Order matters: the most specific, most actionable matches come first.
 */
export function humanFailureReason(
  rawError: string | null | undefined,
  channel: string,
): string {
  const raw = String(rawError ?? "").toLowerCase();
  const label = channelLabel(channel);

  if (!raw) return `${label} could not be delivered`;

  if (/no phone|missing phone|phone.*not set|empty recipient|no recipient|no email|missing email/.test(raw)) {
    return "No contact details on the customer record";
  }
  if (/not a valid|invalid number|invalid phone|invalid recipient|bad number|not in e164|malformed/.test(raw)) {
    return "The customer's number appears to be invalid";
  }
  if (/not on whatsapp|no whatsapp|not registered|not a whatsapp user/.test(raw)) {
    return "This number is not on WhatsApp";
  }
  if (/invalid email|mailbox|no such user|recipient rejected|bounce|undeliverable|suppress/.test(raw)) {
    return "The customer's email address was rejected";
  }
  if (/not configured|no api key|missing secret|credential|unauthor|forbidden|401|403/.test(raw)) {
    return `${label} sending is not set up correctly — contact support`;
  }
  if (/rate limit|too many requests|429|quota/.test(raw)) {
    return "Sending limit reached — try again shortly";
  }
  if (/timeout|timed out|network|econn|dns|fetch failed|socket/.test(raw)) {
    return "The messaging service could not be reached";
  }
  if (/opt(ed)?[ _-]?out|unsubscrib|stop/.test(raw)) {
    return "Customer has opted out of these messages";
  }
  if (/template|not approved|paused/.test(raw)) {
    return "The message template was rejected by the provider";
  }
  if (/5\d\d|server error|internal/.test(raw)) {
    return `The ${label} provider rejected the message`;
  }

  return `${label} could not be delivered`;
}

/** Short, human label for a delivery status shown in the Office App. */
export function deliveryStatusLabel(
  status: string | null | undefined,
  channel: string,
  commType?: string,
): string {
  const label = channelLabel(channel);
  switch (status) {
    case "sent":
      return `Sent by ${label}`;
    case "failed":
      return `Not delivered — ${label}`;
    case "opted_out":
      return commType === "service_reminder"
        ? "Reminder not sent – customer opted out"
        : "Not sent – customer opted out";
    case "pending":
      return "Sending…";
    default:
      return "";
  }
}

/** Whether a Resend action should be offered for this status. */
export function canResend(status: string | null | undefined): boolean {
  return status === "failed";
}
