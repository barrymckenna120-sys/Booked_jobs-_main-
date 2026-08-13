/**
 * Normalises the outcome of a message-sending Edge Function call into a single
 * honest status. Used by the New Job wizard so the success screen never shows a
 * tick for a send that did not actually happen (BJ-0044b).
 *
 * Classification order matters: `skipped` is checked BEFORE treating a 200
 * response as a success, because these functions return HTTP 200 with
 * `success: true, sent: false, skipped: true` when they deliberately skip
 * (no phone, opted out, no integration). Checking `success === true` first
 * would reintroduce the exact false-tick bug this helper exists to prevent.
 */

export type SendStatus = "sent" | "skipped" | "failed";

export type SendResult = {
  status: SendStatus;
  reason?: string;
  message?: string;
};

const REASON_TEXT: Record<string, string> = {
  no_phone: "customer has no phone number",
  no_phone_number: "customer has no phone number",
  opted_out: "customer opted out of messages",
  customer_opted_out: "customer opted out of messages",
  no_integration: "WhatsApp is not connected for this business",
  no_api_key: "WhatsApp credentials are missing",
  customer_not_found: "customer record could not be read",
  no_deposit_amount: "no deposit amount on the job",
  checkout_already_pending: "a payment link is already pending",
  whatsapp_send_failed: "WhatsApp provider rejected the message",
};

export function describeReason(reason?: string | null, fallbackMessage?: string | null): string {
  if (reason && REASON_TEXT[reason]) return REASON_TEXT[reason];
  if (fallbackMessage && String(fallbackMessage).trim()) return String(fallbackMessage).trim();
  if (reason && String(reason).trim()) return String(reason).replace(/_/g, " ").trim();
  return "reason not reported";
}

/**
 * @param fnError error returned by supabase.functions.invoke (or a thrown one)
 * @param fnData  parsed JSON body returned by the function
 */
export function classifySendResult(fnError: unknown, fnData: unknown): SendResult {
  if (fnError) {
    const message = (fnError as { message?: string })?.message;
    return { status: "failed", reason: "invoke_error", message: describeReason(null, message) };
  }

  const data = (fnData ?? null) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") {
    return { status: "failed", reason: "no_response", message: "no response from the send function" };
  }

  // Explicit failure always wins.
  if (data.success === false) {
    const reason = (data.reason as string) ?? undefined;
    return { status: "failed", reason, message: describeReason(reason, data.error as string ?? data.message as string) };
  }

  // Skip checks BEFORE any success check — a 200 with success:true can still be a skip.
  const skippedFlag = data.skipped;
  if (skippedFlag === true || (typeof skippedFlag === "string" && skippedFlag.trim() !== "")) {
    const reason = typeof skippedFlag === "string" ? skippedFlag : (data.reason as string) ?? undefined;
    return { status: "skipped", reason, message: describeReason(reason, data.message as string) };
  }
  if (data.sent === false) {
    const reason = (data.reason as string) ?? undefined;
    return { status: "skipped", reason, message: describeReason(reason, data.message as string) };
  }

  if (data.success === true) return { status: "sent" };

  return { status: "failed", reason: "unknown_response", message: "unexpected response from the send function" };
}
