/**
 * Invoice balance — the single calculation used by the invoice record, PDF,
 * WhatsApp message (create-job-invoice) and the office Invoice Preview.
 *
 * Pure: no Deno or browser APIs, so `src/` can import it too.
 *
 * Balance = invoice total − every payment actually received, never below 0.
 * Payments received = sum of the job_payments ledger (reversal rows subtract),
 * plus the job's deposit ONLY when the job marks it paid and the ledger holds
 * no deposit entry (older deposits were recorded before the ledger existed).
 */

export type LedgerPayment = {
  amount: number | string | null;
  payment_type?: string | null;
  reverses_payment_id?: string | null;
};

export type InvoiceJobPaymentState = {
  deposit_paid?: boolean | null;
  deposit_amount?: number | string | null;
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function paymentsReceived(job: InvoiceJobPaymentState, ledger: LedgerPayment[]): number {
  let total = 0;
  let ledgerHasDeposit = false;
  for (const p of ledger) {
    const amt = Math.abs(num(p.amount));
    if (p.reverses_payment_id) total -= amt;
    else {
      total += amt;
      if (p.payment_type === "deposit") ledgerHasDeposit = true;
    }
  }
  if (job.deposit_paid === true && !ledgerHasDeposit) total += num(job.deposit_amount);
  return round2(Math.max(total, 0));
}

export function invoiceBalanceDue(total: number, received: number): number {
  return round2(Math.max(num(total) - num(received), 0));
}

/** A job with no price and no linked quote must not be invoiced. */
export const MISSING_PRICE_ERROR = "Set a job price before invoicing";

export function hasInvoiceablePrice(revenue: unknown, hasQuote: boolean): boolean {
  if (hasQuote) return true;
  return revenue != null && revenue !== "" && num(revenue) > 0;
}
