/**
 * Money already collected on a job before the payment being recorded now.
 *
 * Same derivation the SumUp webhook uses: the job total minus what is still
 * outstanding. This replaces the old deposit_amount-only assumption, which
 * understated prior collections on jobs with two or more partial payments.
 *
 * Both inputs must be read PRE-WRITE (the values on the row before the current
 * payment is applied).
 *
 * Returns 0 when the job has no total yet (unpriced — buildPaymentPatch's
 * revenue fill handles that case) or when balance_due is unset. Negative
 * results from a stale balance_due are clamped to 0.
 */
export function priorCollected(
  revenue: number | null | undefined,
  balanceDue: number | null | undefined,
): number {
  const total = Number(revenue);
  if (!Number.isFinite(total) || total <= 0) return 0;

  if (balanceDue === null || balanceDue === undefined) return 0;
  const outstanding = Number(balanceDue);
  if (!Number.isFinite(outstanding)) return 0;

  return Math.max(0, Math.round((total - outstanding) * 100) / 100);
}
