import { resolvePaymentSheetState, type PaymentSheetJob } from "@/lib/paymentSheetAmount";

export type PaymentPresentation = {
  isFullyPaid: boolean;
  showDepositBreakdown: boolean;
  amountPaid: number;
};

/**
 * Presentation-only payment state. Historical deposit fields remain stored,
 * but must not make a settled job look like it was only part-paid.
 */
export function resolvePaymentPresentation(
  job: PaymentSheetJob | null | undefined,
): PaymentPresentation {
  const state = resolvePaymentSheetState(job);
  // An explicit settled status is authoritative even when legacy deposit fields
  // are incomplete or stale. The shared Case B also covers a paid deposit with
  // no remaining balance.
  const isFullyPaid = job?.payment_status === "paid" || state.case === "B";

  return {
    isFullyPaid,
    showDepositBreakdown: state.case === "A",
    amountPaid: isFullyPaid
      ? state.jobTotal > 0
        ? state.jobTotal
        : state.depositAmount
      : state.depositPaid
        ? state.depositAmount
        : 0,
  };
}