import { describe, it, expect } from "vitest";
import { buildPaymentWritePayload } from "@/lib/paymentWriteDiagnostics";

describe("buildPaymentWritePayload", () => {
  it("captures money fields, ledger summary and the error code", () => {
    const payload = buildPaymentWritePayload({
      surface: "useEngineerJobs",
      jobId: "job-1",
      before: { status: "In Progress", payment_status: "partial", revenue: 100, balance_due: 100 },
      patch: { payment_status: "paid", balance_due: 0 },
      ledgerRow: { amount: 100, payment_type: "balance", method: "card", source: "engineer_app" },
      outcome: "error",
      error: { code: "42501", message: "denied" },
    });

    expect(payload.surface).toBe("useEngineerJobs");
    expect(payload.jobId).toBe("job-1");
    expect(payload.outcome).toBe("error");
    expect(payload.before).toMatchObject({ payment_status: "partial", revenue: 100 });
    expect(payload.patch).toMatchObject({ payment_status: "paid", balance_due: 0 });
    expect(payload.ledger).toEqual({
      amount: 100,
      payment_type: "balance",
      method: "card",
      source: "engineer_app",
    });
    expect(payload.errorCode).toBe("42501");
    expect(payload.errorMessage).toBe("denied");
  });

  it("carries no customer or address fields", () => {
    const payload = buildPaymentWritePayload({
      surface: "TakePaymentModal",
      jobId: "job-2",
      before: { status: "Completed", customer_name: "Jane", address: "1 Main St" } as any,
      outcome: "success",
    });
    expect(JSON.stringify(payload)).not.toContain("Jane");
    expect(JSON.stringify(payload)).not.toContain("Main St");
    expect(payload.ledger).toBeNull();
  });
});
