/**
 * Office bell alert wording for a SumUp-confirmed payment.
 *
 * Kept pure (no IO) so the copy is unit tested: the notifyOffice implementation
 * in sumup-payment-webhook only does the DB read/insert around it.
 *
 * The outstanding figure comes from the SAME patch the job write applied
 * (patch.balance_due), never from a recalculation here — the alert must never be
 * able to disagree with the job or the ledger.
 */

import { formatEuro } from "./depositConfirmationMessage.ts";

export interface PaymentAlertInput {
  amount: number;
  fullyPaid: boolean;
  jobReference?: string | null;
  /** Fallback shown when the job has no reference (first 8 of the job id). */
  fallbackReference?: string | null;
  customerName?: string | null;
  /** Outstanding balance AFTER this payment. Omitted/0 adds no clause. */
  outstanding?: number | null;
}

export interface PaymentAlert {
  title: string;
  body: string;
}

export function buildPaymentAlert(input: PaymentAlertInput): PaymentAlert {
  const ref = (input.jobReference || "").trim() || (input.fallbackReference || "").trim() || "job";
  const kind = input.fullyPaid ? "Payment received" : "Deposit received";

  let body = `${formatEuro(input.amount)} paid by card (SumUp)${
    input.fullyPaid ? " — full payment" : " — deposit"
  } on ${ref}`;

  const name = (input.customerName || "").trim();
  if (name) body += ` for ${name}`;

  // Only a part payment can leave a balance worth stating. A fully paid job is
  // settled by definition, so no outstanding clause is ever appended to it.
  const outstanding = Number(input.outstanding ?? 0);
  if (!input.fullyPaid && Number.isFinite(outstanding) && outstanding > 0) {
    body += ` · ${formatEuro(outstanding)} still outstanding`;
  }

  return { title: `${kind} — ${ref}`, body };
}
