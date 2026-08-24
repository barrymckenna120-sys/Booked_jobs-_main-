// Pure decision layer for the engineer app's payment writes.
//
// `updateJob()` in useEngineerJobs is a hook body full of Supabase calls, toasts
// and navigation, so the branching that decides *what* a payment does lives here
// instead: given the patch the caller passed and the job as it stands PRE-WRITE,
// it returns the extra service_calls columns, the append-only ledger row, and
// whether a receipt should go out.
//
// No framework imports — only buildPaymentPatch and priorCollected.

import { buildPaymentPatch } from "@/lib/paymentUpdate";
import { priorCollected } from "@/lib/priorCollected";

/** Job states that mean the engineer is on the job — work is underway or done. */
const WORK_UNDERWAY = ["in progress", "completed", "on site", "en route"];

export type EngineerLedgerRow = {
  organisation_id: string | null;
  service_call_id: string;
  customer_id: string | null;
  amount: number;
  payment_type: "deposit" | "balance" | "full";
  method: string;
  source: "engineer_app";
  checkout_id: null;
  recorded_by: string | null;
  paid_at: string;
  metadata: Record<string, any>;
};

export type EngineerPaymentPlanInput = {
  /** The patch as passed to updateJob (only `status` is read here). */
  patch: Record<string, any>;
  paymentMethod?: string | null;
  confirmedRevenue?: number | null;
  /** The job row PRE-WRITE. */
  job: Record<string, any> | null | undefined;
  jobId: string;
  /** Shared timestamp for paid_at / completed_at / the ledger row. */
  paidAt: string;
  /** Cached profiles.id — never fetched at write time (offline safety). */
  recordedBy?: string | null;
  /** Entry point, recorded on the ledger row for traceability. */
  entry: "completion" | "standalone";
};

export type EngineerPaymentPlan = {
  /** Extra columns to merge into the service_calls patch. */
  dbPatchAdditions: Record<string, any>;
  /** Append-only job_payments row, or null when no money was collected. */
  ledgerRow: EngineerLedgerRow | null;
  /** Standalone path only: fire generate-receipt-pdf + send-whatsapp-receipt. */
  fireReceipt: boolean;
  /** Invoice branch asks the hook to run its completion gate. */
  forceCompleteInvoice: boolean;
};

export function buildEngineerPaymentPlan(input: EngineerPaymentPlanInput): EngineerPaymentPlan {
  const { patch, paymentMethod, confirmedRevenue, job, jobId, paidAt, recordedBy, entry } = input;

  const empty: EngineerPaymentPlan = {
    dbPatchAdditions: {},
    ledgerRow: null,
    fireReceipt: false,
    forceCompleteInvoice: false,
  };

  // Guard is on the PRESENCE of paymentMethod, never on "the patch has content":
  // onCompleteOnly and the empty-patch refresh call must fall through here.
  if (!paymentMethod) return empty;

  const jobRevenue = Number(job?.revenue || 0);
  // Cumulative — everything already collected on this job, not just a deposit.
  const collectedSoFar = priorCollected(job?.revenue, job?.balance_due);
  const amount =
    confirmedRevenue === undefined || confirmedRevenue === null ? undefined : Number(confirmedRevenue);

  if (paymentMethod === "invoice") {
    return {
      dbPatchAdditions: {
        payment_method: paymentMethod,
        ...buildPaymentPatch({
          type: "invoice",
          amount,
          fallbackRevenue: jobRevenue,
          revenue: jobRevenue,
          collectedToDate: collectedSoFar,
          revenueMode: "fill",
        }),
      },
      ledgerRow: null, // no money collected on an invoice
      fireReceipt: false,
      forceCompleteInvoice: true,
    };
  }

  const dbPatchAdditions: Record<string, any> = {
    payment_method: paymentMethod,
    paid_at: paidAt,
    ...buildPaymentPatch({
      type: "full",
      amount,
      revenue: jobRevenue,
      collectedToDate: collectedSoFar,
    }),
  };

  const settled = dbPatchAdditions.payment_status === "paid";
  const standalone = !patch.status;
  const priorStatus = String(job?.status || "").toLowerCase();
  const workUnderway = WORK_UNDERWAY.includes(priorStatus);

  // BJ-0061a, standalone variant: settle-and-complete, but never on a job where
  // work has not started. The Complete path passes status itself and is skipped.
  if (standalone && settled && workUnderway) {
    dbPatchAdditions.status = "Completed";
    dbPatchAdditions.completed_at = paidAt;
  }

  const paidAmount = Number.isFinite(amount as number) ? (amount as number) : 0;
  const payment_type: EngineerLedgerRow["payment_type"] =
    collectedSoFar > 0 ? "balance" : settled ? "full" : "deposit";

  return {
    dbPatchAdditions,
    ledgerRow: {
      organisation_id: job?.organisation_id ?? null,
      service_call_id: jobId,
      customer_id: job?.customer_id ?? null,
      amount: paidAmount,
      payment_type,
      method: paymentMethod,
      source: "engineer_app",
      checkout_id: null,
      recorded_by: recordedBy ?? null,
      paid_at: paidAt,
      metadata: { entry },
    },
    // A receipt goes out on full payment even when the job is not Completed yet.
    // The Complete path owns its own receipt send (useEngineerJobs 587-607).
    fireReceipt: standalone && settled,
    forceCompleteInvoice: false,
  };
}
