/**
 * BJ-0063 — customer confirmation WhatsApp for a PART payment (deposit).
 *
 * The full receipt stays reserved for final settlement (see sendReceipt in
 * _shared/sumupWebhook.ts). This message only confirms what was paid now and
 * what is still outstanding, so a customer never mistakes a deposit for a
 * settled job.
 *
 * Pure module — no IO, so both the decision and the wording are unit tested.
 */

export interface DepositConfirmationInput {
  customerName?: string | null;
  jobReference?: string | null;
  amountPaid: number;
  /** Outstanding balance AFTER this payment. */
  balanceRemaining: number;
  businessName?: string | null;
  footer?: string | null;
}

export const formatEuro = (value: number): string =>
  `€${(Math.round(Number(value) * 100) / 100).toFixed(2)}`;

/**
 * Only send for a genuine part payment: money actually moved, the job is not
 * fully settled, and there is a balance left to state. Opt-out / missing phone
 * are the caller's concern.
 */
export function shouldSendDepositConfirmation(args: {
  amountPaid: number;
  balanceRemaining: number;
  fullyPaid: boolean;
}): boolean {
  const amount = Number(args.amountPaid);
  const balance = Number(args.balanceRemaining);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (args.fullyPaid) return false;
  if (!Number.isFinite(balance) || balance <= 0) return false;
  return true;
}

export function buildDepositConfirmationMessage(input: DepositConfirmationInput): string {
  const name = (input.customerName || "").trim() || "there";
  const business = (input.businessName || "").trim();
  const lines: string[] = [
    `Hi ${name}, thanks for your payment.`,
    "",
    `Amount paid: ${formatEuro(input.amountPaid)} (Card)`,
    `Balance remaining: ${formatEuro(input.balanceRemaining)}`,
  ];

  if (input.jobReference) {
    lines.splice(2, 0, `Job Ref: ${input.jobReference}`, "");
  }

  lines.push(
    "",
    "This is a part payment, so your job is not fully paid yet — the balance above is still due. Your full receipt follows once the job is settled in full.",
  );

  const footer = (input.footer || business || "").trim();
  if (footer) {
    lines.push("", "Thanks,", footer);
  }

  return lines.join("\n");
}
