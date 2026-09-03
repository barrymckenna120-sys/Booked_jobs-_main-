/**
 * Decides whether a cancelled job should trigger a customer-facing
 * cancellation WhatsApp.
 *
 * A "Duplicate Booking" cancellation is an internal tidy-up: the customer
 * still has their real booking, so telling them a booking was cancelled is
 * wrong and alarming. The job is still cancelled and drops off the schedule —
 * only the customer message is suppressed.
 */
export const NO_CUSTOMER_NOTICE_REASONS = ["duplicate booking"];

export function shouldSendCancellationNotice(reason: string | null | undefined): boolean {
  const normalised = String(reason ?? "").trim().toLowerCase();
  if (!normalised) return true;
  return !NO_CUSTOMER_NOTICE_REASONS.includes(normalised);
}
