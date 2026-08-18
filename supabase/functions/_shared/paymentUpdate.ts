// Single source of truth for payment field writes on public.service_calls.
//
// PURE MODULE — no imports, no Deno/Vite specifics. It builds a patch; the caller
// applies it with its own client and keeps its own side effects (receipt numbers,
// paid_at, invoice numbers, activity logs, notifications, retry queue).
//
// Only these columns are owned here:
//   payment_status, balance_due, deposit_paid, revenue,
//   deposit_required + deposit_amount (booking setup only)
//
// Consumed by the app via src/lib/paymentUpdate.ts.

export type PaymentWriteType =
  | "booking_setup"
  | "deposit"
  | "balance"
  | "full"
  | "invoice"
  | "increment";

export type DepositMode = "none" | "deposit" | "paid";

export type PaymentPatchInput = {
  type: PaymentWriteType;

  /** Amount being recorded now (payment taken, invoice total, extra-work subtotal). */
  amount?: number | null;

  /** Existing job total, when the caller knows it. */
  revenue?: number | null;

  /** Used by completion paths when the confirmed amount is undefined. */
  fallbackRevenue?: number | null;

  /** Existing balance_due — fallback on partial payments, base for increments. */
  currentBalanceDue?: number | null;

  /**
   * "set"  — always write revenue from `amount` (engineer/office payment sheets).
   * "fill" — only write revenue when the job has no total yet (SumUp webhook).
   */
  revenueMode?: "set" | "fill";

  /** booking_setup only. */
  depositMode?: DepositMode;
  depositAmount?: number | null;
  balanceDue?: number | null;

  /**
   * booking_setup only — money ACTUALLY collected on this job so far. 0 (or
   * omitted) for a brand-new booking.
   *
   * This is the only permitted subtrahend when deriving balance_due: a
   * requested-but-unpaid deposit never reduces the balance ("Deposit Taken"
   * only requests a SumUp link; deposit_paid is flipped by the webhook or a
   * recorded payment). Any future edit path MUST pass collectedToDate — when
   * supplied it takes precedence over `balanceDue`, so an edit to an active job
   * can never re-derive the balance from deposit_amount and wipe out real
   * payment history.
   */
  collectedToDate?: number | null;


  /** Mark deposit_paid on a settle (SumUp full payment). */
  markDepositPaid?: boolean;
};

export type PaymentPatch = {
  payment_status?: string;
  balance_due?: number | null;
  deposit_paid?: boolean;
  deposit_required?: boolean;
  deposit_amount?: number | null;
  revenue?: number | null;
};

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

const isSet = (v: unknown): boolean => v !== undefined && v !== null;

export function buildPaymentPatch(input: PaymentPatchInput): PaymentPatch {
  const patch: PaymentPatch = {};
  const amount = num(input.amount);

  switch (input.type) {
    // ── Job creation (New Job wizard). Preserves null, not 0, when unpriced.
    // balance_due = revenue − money actually collected to date.
    case "booking_setup": {
      const mode: DepositMode = input.depositMode ?? "none";
      const total = isSet(input.amount) && amount !== 0 ? amount : null;
      const dep = mode === "deposit" ? (input.depositAmount || null) : null;
      const collected = num(input.collectedToDate);
      patch.revenue = total;
      patch.deposit_paid = mode === "paid";
      patch.deposit_required = mode === "deposit";
      patch.deposit_amount = dep;
      // A caller-supplied balanceDue is only trusted when it does NOT discount
      // the total, or when real money is evidenced (collectedToDate). A
      // requested-but-unpaid deposit must never reduce the balance.
      const trustedCallerBalance =
        isSet(input.balanceDue) && !isSet(input.collectedToDate) && num(input.balanceDue) >= total!
          ? num(input.balanceDue)
          : null;
      patch.balance_due =
        mode === "paid"
          ? null // settled upfront, nothing outstanding
          : total == null
            ? null // unpriced job
            : trustedCallerBalance != null
              ? round2(trustedCallerBalance)
              : round2(Math.max(0, total - collected));
      return patch;
    }


    // ── Invoice: nothing collected, full total outstanding.
    case "invoice": {
      const resolved = isSet(input.amount) ? amount : num(input.fallbackRevenue);
      patch.payment_status = "unpaid";
      patch.balance_due = resolved;
      if (isSet(input.amount)) patch.revenue = amount;
      return patch;
    }

    // ── Part payment (card deposit on site, SumUp deposit webhook).
    case "deposit": {
      patch.payment_status = "partial";
      patch.deposit_paid = true;
      if (input.revenueMode === "fill") {
        const known = num(input.revenue);
        if (known <= 0 && amount > 0) patch.revenue = amount;
      } else if (isSet(input.amount)) {
        patch.revenue = amount;
      }
      // Only touch balance_due when the caller knows the job total.
      if (isSet(input.revenue)) {
        const known = num(input.revenue);
        patch.balance_due = known > 0
          ? Math.max(0, round2(known - amount))
          : (isSet(input.currentBalanceDue) ? num(input.currentBalanceDue) : null);
      }
      return patch;
    }

    // ── Settle: balance collected, or paid in full in one go. Always zeroes balance.
    case "balance":
    case "full": {
      patch.payment_status = "paid";
      patch.balance_due = 0;
      if (input.markDepositPaid) patch.deposit_paid = true;
      if (input.revenueMode === "fill") {
        const known = num(input.revenue);
        if (known <= 0 && amount > 0) patch.revenue = amount;
      } else if (isSet(input.amount)) {
        patch.revenue = amount;
      }
      return patch;
    }

    // ── Extra work added mid-job: additive, never absolute.
    case "increment": {
      patch.revenue = round2(num(input.revenue) + amount);
      patch.balance_due = round2(num(input.currentBalanceDue) + amount);
      return patch;
    }
  }

  return patch;
}
