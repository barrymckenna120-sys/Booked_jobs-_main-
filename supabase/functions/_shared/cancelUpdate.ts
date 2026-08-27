/**
 * Patch applied to a job when a customer cancels by WhatsApp reply.
 *
 * Deliberate design decision (approved 2026-08-26): a customer can ALWAYS
 * cancel, even after replying CONFIRM — blocking it would also block genuine
 * late changes of plan. To protect against an accidental "cancel" text, every
 * WhatsApp cancellation raises an office follow-up so staff ring the customer
 * back and can rebook. A cancellation that reverses an earlier confirmation
 * also clears `confirmed`/`confirmed_at`, otherwise the job keeps rendering the
 * cyan "Confirmed" badge while showing status Cancelled.
 */

export const WHATSAPP_CANCEL_REASON = "Customer cancelled via WhatsApp";

export type CancelTargetJob = {
  id: string;
  confirmed?: boolean | null;
};

export type CancelUpdate = {
  status: "Cancelled";
  cancellation_reason: string;
  cancelled_at: string;
  confirmed: false;
  confirmed_at: null;
  follow_up_needed: true;
  follow_up_detail: string;
  follow_up_resolved: false;
};

/** True when this cancel reverses a confirmation the customer already sent. */
export function reversesConfirmation(job: CancelTargetJob): boolean {
  return job?.confirmed === true;
}

export function buildCancelUpdate(
  job: CancelTargetJob,
  customerName: string,
  now: Date = new Date(),
): CancelUpdate {
  const name = String(customerName || "").trim() || "Customer";
  const detail = reversesConfirmation(job)
    ? `${name} confirmed by WhatsApp and then replied CANCEL — call to check it wasn't sent by mistake, and rebook if needed.`
    : `${name} cancelled by WhatsApp reply — call to check it wasn't sent by mistake, and rebook if needed.`;

  return {
    status: "Cancelled",
    cancellation_reason: WHATSAPP_CANCEL_REASON,
    cancelled_at: now.toISOString(),
    confirmed: false,
    confirmed_at: null,
    follow_up_needed: true,
    follow_up_detail: detail,
    follow_up_resolved: false,
  };
}

/** Audit-trail detail line for the cancellation. */
export function cancelAuditDetail(job: CancelTargetJob): string {
  return reversesConfirmation(job)
    ? `Cancelled: ${WHATSAPP_CANCEL_REASON} (reversed an earlier WhatsApp confirmation)`
    : `Cancelled: ${WHATSAPP_CANCEL_REASON}`;
}
