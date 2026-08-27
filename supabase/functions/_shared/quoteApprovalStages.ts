/**
 * Pure stage decisions for the quote-approval workflow.
 *
 * The approval pipeline runs strictly in order and each stage is named so a
 * failure is attributable without reading logs:
 *
 *   quote_approval -> office_notification -> deposit_link -> whatsapp_send
 *
 * Nothing here performs IO — it only decides what a stage result means, so the
 * rules stay unit-testable.
 */

export type ApprovalStage =
  | "quote_approval"
  | "office_notification"
  | "deposit_link"
  | "whatsapp_send";

export interface DepositStageResult {
  ok: boolean;
  skipped?: string | null;
  sent?: boolean | null;
  reused?: boolean | null;
  paymentLink?: string | null;
  error?: string | null;
}

export interface DepositStageOutcome {
  /** true when the whole workflow may be reported as successful. */
  success: boolean;
  /** Machine-readable outcome for the UI. */
  status: string;
  /** Only set when success is false. */
  stage?: ApprovalStage;
  error?: string;
}

/**
 * Skip reasons that are legitimate business outcomes rather than failures:
 * there is simply no deposit to collect, or no way to reach the customer that
 * the office already knows about.
 */
const BENIGN_SKIPS = new Set([
  "no_deposit_amount",
  "no_service_call",
  "opted_out",
]);

export function classifyDepositStage(
  result: DepositStageResult | null | undefined,
): DepositStageOutcome {
  if (!result) {
    return {
      success: false,
      status: "deposit_link_failed",
      stage: "deposit_link",
      error: "deposit_link_failed",
    };
  }

  const skipped = result.skipped ?? null;

  // A still-valid pending checkout: the customer already holds a good link.
  if (skipped === "checkout_already_pending") {
    return { success: true, status: "deposit_link_already_pending" };
  }

  if (skipped && BENIGN_SKIPS.has(skipped) && result.ok) {
    return { success: true, status: skipped };
  }

  // Anything else that stopped us short of a send is a real, reportable
  // failure — the customer must never be told a link went out when it didn't.
  if (!result.ok || skipped) {
    // A link exists but the message did not go out -> the send stage failed.
    const stage: ApprovalStage = result.paymentLink ? "whatsapp_send" : "deposit_link";
    return {
      success: false,
      status: skipped || "deposit_link_failed",
      stage,
      error: result.error || skipped || "deposit_link_failed",
    };
  }

  if (!result.sent) {
    return {
      success: false,
      status: "whatsapp_not_sent",
      stage: "whatsapp_send",
      error: result.error || "whatsapp_not_sent",
    };
  }

  if (!result.paymentLink) {
    return {
      success: false,
      status: "payment_link_missing",
      stage: "deposit_link",
      error: "payment_link_missing",
    };
  }

  return { success: true, status: "deposit_link_sent" };
}
