/**
 * Single source of truth for "what should we collect on this job right now?".
 *
 * Shared by the engineer completion PaymentSheet and the office TakePaymentModal
 * so both surfaces classify a job identically.
 *
 * Case D — deposit required but not yet paid  -> collect the deposit only
 * Case C — no deposit involved                -> collect the full job total (majority path)
 * Case B — nothing left owing                 -> collect nothing, block further payment
 * Case A — deposit paid, balance remains      -> collect the balance due
 */

export type PaymentCase = "A" | "B" | "C" | "D";

export interface PaymentSheetJob {
  revenue?: number | null;
  deposit_required?: boolean | null;
  deposit_amount?: number | null;
  deposit_paid?: boolean | null;
  balance_due?: number | null;
  payment_status?: string | null;
}

export interface PaymentSheetState {
  case: PaymentCase;
  /** Pre-fill amount. `undefined` means "no amount to pre-fill" (Case C fallback, or Case B). */
  amount?: number;
  /** Field label, or null for Case B where there is no amount field. */
  label: string | null;
  depositPaid: boolean;
  balanceDue: number;
  jobTotal: number;
  depositAmount: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const LABEL_JOB_TOTAL = "Job Total (€)";
export const LABEL_BALANCE_DUE = "Balance Due (€)";
export const LABEL_COLLECT_DEPOSIT = "Collect Deposit (€)";

export function resolvePaymentSheetState(job: PaymentSheetJob | null | undefined): PaymentSheetState {
  const j = job ?? {};
  const depositPaid = j.deposit_paid === true;
  const depositRequired = j.deposit_required === true;
  const jobTotal = num(j.revenue);
  const depositAmount = num(j.deposit_amount);
  const balanceDue = num(j.balance_due);

  const base = { depositPaid, balanceDue, jobTotal, depositAmount };

  // 1. Deposit demanded but nothing collected yet — take the deposit only.
  if (depositRequired && !depositPaid) {
    return { ...base, case: "D", amount: depositAmount > 0 ? depositAmount : undefined, label: LABEL_COLLECT_DEPOSIT };
  }

  // 2. No deposit collected and none demanded — the majority flat-rate path.
  //    `undefined` when revenue is unset so the existing settings-default lookup still governs.
  if (!depositPaid) {
    return { ...base, case: "C", amount: jobTotal > 0 ? jobTotal : undefined, label: LABEL_JOB_TOTAL };
  }

  // 3. Explicitly settled — wins over a stale positive balance_due.
  if (j.payment_status === "paid") {
    return { ...base, case: "B", amount: undefined, label: null };
  }

  // 4. Deposit collected, money still owing.
  if (balanceDue > 0) {
    return { ...base, case: "A", amount: balanceDue, label: LABEL_BALANCE_DUE };
  }

  // 5. Deposit collected, nothing left owing.
  return { ...base, case: "B", amount: undefined, label: null };
}

/** Convenience guard: can any further payment be collected on this job? */
export function canCollectPayment(job: PaymentSheetJob | null | undefined): boolean {
  return resolvePaymentSheetState(job).case !== "B";
}
