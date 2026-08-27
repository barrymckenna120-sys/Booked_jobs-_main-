// Authoritative pre-write balance gate for engineer-app payments (BJ-next-D).
//
// Every payment-entry surface used to decide "is this job already fully paid?"
// from a client-held copy of the job. Two surfaces used in one session — before
// a realtime refresh landed — could therefore both accept a payment. This module
// is the single place that re-reads the job from `service_calls` immediately
// before the write and classifies it with the SAME shared classifier
// (`resolvePaymentSheetState`) the UI uses.
//
// Framework-free: takes the Supabase client as an argument so it is unit
// testable with a fake.

import { resolvePaymentSheetState, type PaymentSheetState } from "@/lib/paymentSheetAmount";

/** Thrown when the freshly-read job is Case B — nothing left to collect. */
export class JobAlreadyPaidError extends Error {
  readonly state: PaymentSheetState;
  constructor(state: PaymentSheetState) {
    super("This job is fully paid — no further payment can be collected.");
    this.name = "JobAlreadyPaidError";
    this.state = state;
  }
}

export const isJobAlreadyPaidError = (e: unknown): e is JobAlreadyPaidError =>
  !!e && (e as any).name === "JobAlreadyPaidError";

/** Same shape TakePaymentModal already read, extended to what the classifier needs. */
export const PAYMENT_STATE_COLUMNS =
  "organisation_id, customer_id, status, revenue, balance_due, payment_status, deposit_paid, deposit_required, deposit_amount, receipt_number";


export type FreshJobPaymentRow = {
  organisation_id?: string | null;
  customer_id?: string | null;
  status?: string | null;
  revenue?: number | null;
  balance_due?: number | null;
  payment_status?: string | null;
  deposit_paid?: boolean | null;
  deposit_required?: boolean | null;
  deposit_amount?: number | null;
};

export type PaymentGateResult = {
  /** The job as it stands in the database PRE-WRITE — authoritative. */
  row: FreshJobPaymentRow;
  state: PaymentSheetState;
};

/** One query, no decisions. */
export async function fetchJobPaymentState(
  client: any,
  jobId: string
): Promise<FreshJobPaymentRow> {
  const { data, error } = await client
    .from("service_calls")
    .select(PAYMENT_STATE_COLUMNS)
    .eq("id", jobId)
    .single();
  if (error) throw error;
  if (!data) throw new Error("Job not found — payment not recorded.");
  return data as FreshJobPaymentRow;
}

/**
 * Pure: a settled job is a hard stop; every other case passes through.
 *
 * Two ways a job is settled:
 *  - the shared classifier says Case B (deposit collected, nothing owing), or
 *  - `payment_status = 'paid'`, which is authoritative on its own. The classifier
 *    only reaches Case B when a deposit was paid, so a straight cash/card
 *    settlement (no deposit) lands in Case C and must be caught here.
 */
export function assertCollectable(row: FreshJobPaymentRow): PaymentGateResult {
  const state = resolvePaymentSheetState(row);
  if (state.case === "B" || row.payment_status === "paid") throw new JobAlreadyPaidError(state);
  return { row, state };
}


/**
 * Re-read + gate. Call immediately before any job_payments insert triggered
 * from the engineer app. Throws JobAlreadyPaidError on a settled job.
 */
export async function gateJobPayment(client: any, jobId: string): Promise<PaymentGateResult> {
  return assertCollectable(await fetchJobPaymentState(client, jobId));
}
