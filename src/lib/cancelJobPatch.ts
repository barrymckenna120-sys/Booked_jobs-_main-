/**
 * Single builder for every MANUAL (office/engineer) job cancellation patch.
 *
 * Mirrors the WhatsApp path (`supabase/functions/_shared/cancelUpdate.ts`):
 * a cancellation must also clear `confirmed`/`confirmed_at`, otherwise a job
 * that was confirmed and then cancelled keeps a stale confirmation flag in the
 * database. Unlike the WhatsApp path, a manual cancellation is already a
 * deliberate office action, so it does NOT raise a follow-up.
 */
export type ManualCancelPatch = {
  status: "Cancelled";
  cancellation_reason: string;
  cancellation_note: string | null;
  cancelled_at: string;
  cancelled_by: string | null;
  confirmed: false;
  confirmed_at: null;
};

export function buildManualCancelPatch(
  reason: string,
  note: string | null | undefined,
  cancelledBy: string | null | undefined,
  now: Date = new Date(),
): ManualCancelPatch {
  return {
    status: "Cancelled",
    cancellation_reason: reason,
    cancellation_note: note || null,
    cancelled_at: now.toISOString(),
    cancelled_by: cancelledBy || null,
    confirmed: false,
    confirmed_at: null,
  };
}
