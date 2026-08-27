/**
 * Deposit calculation helpers for the New Job wizard (Step 4).
 *
 * `deposit_percentage` lives on the tenant's organisation-scoped settings row.
 * When it is null/undefined/invalid we fall back to 50%.
 */

export const DEFAULT_DEPOSIT_PERCENTAGE = 50;

/** Resolve a usable deposit percentage, falling back to 50 when unset. */
export const resolveDepositPercentage = (pct: number | null | undefined): number => {
  if (pct === null || pct === undefined) return DEFAULT_DEPOSIT_PERCENTAGE;
  const n = Number(pct);
  if (!Number.isFinite(n)) return DEFAULT_DEPOSIT_PERCENTAGE;
  return n;
};

/**
 * Cent-safe deposit amount: round((total * pct / 100) * 100) / 100.
 * Returns 0 for non-positive/invalid totals.
 */
export const calcDepositAmount = (total: number, pct: number | null | undefined): number => {
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const percentage = resolveDepositPercentage(pct);
  return Math.round(((amount * percentage) / 100) * 100) / 100;
};
