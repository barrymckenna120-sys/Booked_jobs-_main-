/**
 * Presentation rules for customer-communication delivery status.
 *
 * The Office App never shows raw provider errors — only the stored
 * `failure_reason_public` written by the backend. Pure functions so the copy and
 * the resend rules are unit-tested.
 */

export type DeliveryStatus = "pending" | "sent" | "failed" | "opted_out";

export type CommunicationDelivery = {
  id: string;
  comm_type: string;
  channel: string;
  delivery_status: DeliveryStatus | string;
  failure_reason_public: string | null;
  attempt_count: number;
  last_attempt_at: string | null;
  recipient: string | null;
  related_reference: string | null;
};

export const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
};

export function channelLabel(channel: string | null | undefined): string {
  return CHANNEL_LABEL[String(channel ?? "")] ?? "Message";
}

/** Short badge text, identical wording across every tenant and every screen. */
export function deliveryBadgeLabel(
  status: string | null | undefined,
  channel: string | null | undefined,
): string {
  switch (status) {
    case "sent":
      return `Sent · ${channelLabel(channel)}`;
    case "failed":
      return "Not delivered";
    case "opted_out":
      return "Opted out";
    case "pending":
      return "Sending…";
    default:
      return "Not sent";
  }
}

/** Tailwind classes using the existing status palette (no hardcoded hex). */
export function deliveryBadgeClasses(status: string | null | undefined): string {
  switch (status) {
    case "sent":
      return "bg-emerald-100 text-emerald-700";
    case "failed":
      return "bg-rose-100 text-rose-700";
    case "opted_out":
      return "bg-slate-200 text-slate-600";
    case "pending":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-slate-200 text-slate-500";
  }
}

/** One-line explanation shown under the badge. */
export function deliveryDetailLine(
  delivery: Pick<
    CommunicationDelivery,
    "delivery_status" | "channel" | "failure_reason_public" | "attempt_count"
  >,
): string {
  if (delivery.delivery_status === "failed") {
    const reason =
      delivery.failure_reason_public?.trim() ||
      `${channelLabel(delivery.channel)} could not be delivered`;
    return delivery.attempt_count > 1
      ? `${reason} · ${delivery.attempt_count} attempts`
      : reason;
  }
  if (delivery.delivery_status === "opted_out") {
    return (
      delivery.failure_reason_public?.trim() ||
      "Not sent – customer opted out of messages"
    );
  }
  return "";
}

/** Resend is only ever offered for a real failure. */
export function canResendDelivery(status: string | null | undefined): boolean {
  return status === "failed";
}

/** DD/MM/YY HH:mm in Europe/Dublin — the project-wide date format. */
export function formatAttemptTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IE", {
    timeZone: "Europe/Dublin",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
