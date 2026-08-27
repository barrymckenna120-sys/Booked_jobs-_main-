export type AlreadyActionedJobState = {
  convertedJobId: string | null | undefined;
  depositAmount: number;
  job?: {
    deposit_paid?: boolean | null;
    payment_status?: string | null;
  } | null;
};

export type AlreadyActionedRecoveryDecision =
  | { action: "resend_deposit_link"; status: "deposit_link_needed" }
  | { action: "accept_without_resend"; status: "already_paid" | "no_deposit_due" }
  | { action: "reject"; status: "already_actioned" };

export function decideAlreadyActionedRecovery(
  state: AlreadyActionedJobState,
): AlreadyActionedRecoveryDecision {
  if (!state.convertedJobId || !state.job) {
    return { action: "reject", status: "already_actioned" };
  }

  if (!(state.depositAmount > 0)) {
    return { action: "accept_without_resend", status: "no_deposit_due" };
  }

  const paymentStatus = String(state.job.payment_status ?? "").toLowerCase();
  const depositAlreadyPaid = state.job.deposit_paid === true || paymentStatus === "paid" || paymentStatus === "partial";

  if (depositAlreadyPaid) {
    return { action: "accept_without_resend", status: "already_paid" };
  }

  return { action: "resend_deposit_link", status: "deposit_link_needed" };
}