/**
 * Diagnostics for payment / completion writes (BJ payment classification work).
 *
 * Detection and reporting only — this module never writes, recalculates or
 * corrects payment state. It exists because every failed completion write was
 * reported to the engineer as "No connection", which hid real database errors
 * and made a misclassified payment (e.g. a full payment recorded as a deposit)
 * impossible to trace after the fact.
 */
import { RequestTimeoutError } from "@/lib/queryDefaults";

export interface PaymentWriteLog {
  /** Which screen produced the write, e.g. "EngineerJobDetail". */
  surface: string;
  jobId: string;
  /** Fresh row read immediately before the write, when the caller has one. */
  before?: Record<string, unknown> | null;
  /** The exact patch sent to service_calls. */
  patch?: Record<string, unknown> | null;
  /** The ledger row that accompanies the write, if any. */
  ledgerRow?: Record<string, unknown> | null;
  outcome: "success" | "blocked" | "error";
  error?: unknown;
}

const money = (row: Record<string, unknown> | null | undefined) =>
  row
    ? {
        status: row.status,
        payment_status: row.payment_status,
        payment_method: row.payment_method,
        revenue: row.revenue,
        balance_due: row.balance_due,
        deposit_required: row.deposit_required,
        deposit_paid: row.deposit_paid,
        deposit_amount: row.deposit_amount,
        completed_at: row.completed_at,
      }
    : null;

/** Structured, greppable log of a payment-bearing write and its outcome. */
export const logPaymentWrite = (log: PaymentWriteLog): void => {
  const payload = {
    surface: log.surface,
    jobId: log.jobId,
    outcome: log.outcome,
    before: money(log.before),
    patch: money(log.patch),
    ledger: log.ledgerRow
      ? {
          amount: (log.ledgerRow as any).amount,
          payment_type: (log.ledgerRow as any).payment_type,
          method: (log.ledgerRow as any).method,
          source: (log.ledgerRow as any).source,
        }
      : null,
    errorCode: (log.error as any)?.code ?? null,
    errorMessage: (log.error as any)?.message ?? null,
  };
  if (log.outcome === "success") {
    console.log("[paymentWrite]", payload);
  } else {
    console.error("[paymentWrite]", payload);
  }
};

/**
 * True only when the failure is genuinely a connectivity/timeout problem, i.e.
 * when "saved and will retry" is an honest thing to tell the engineer.
 */
export const isTransientWriteError = (error: unknown): boolean => {
  if (error instanceof RequestTimeoutError) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = String((error as any)?.message ?? "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("load failed")
  );
};

/** Toast copy for a queued write failure — honest about what actually failed. */
export const writeFailureToastCopy = (
  error: unknown
): { title: string; description: string } => {
  if (isTransientWriteError(error)) {
    return {
      title: "No connection",
      description: "Update saved and will sync automatically when back online",
    };
  }
  const code = (error as any)?.code ? ` (${(error as any).code})` : "";
  const message = (error as any)?.message || "Unknown error";
  return {
    title: "Couldn't save this update",
    description: `${message}${code} — saved and will retry automatically.`,
  };
};
