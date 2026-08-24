import { describe, it, expect } from "vitest";
import { buildEngineerPaymentPlan } from "./engineerPaymentPlan";

const PAID_AT = "2026-08-24T16:00:00.000Z";

const job = (over: Record<string, any> = {}) => ({
  id: "job-1",
  organisation_id: "org-1",
  customer_id: "cust-1",
  status: "In Progress",
  revenue: 400,
  balance_due: 400,
  ...over,
});

const plan = (over: Record<string, any> = {}) =>
  buildEngineerPaymentPlan({
    patch: {},
    job: job(),
    jobId: "job-1",
    paidAt: PAID_AT,
    recordedBy: "profile-1",
    entry: "standalone",
    ...over,
  } as any);

describe("engineerPaymentPlan — regression safeguards", () => {
  // Test 1
  it("onCompleteOnly (status only, no paymentMethod) produces no payment output", () => {
    const result = plan({
      patch: { status: "Completed", workDone: "Serviced boiler", selectedTags: ["Under Warranty"] },
      entry: "completion",
      job: job({ payment_status: "paid", balance_due: 0 }),
    });
    expect(result.dbPatchAdditions).toEqual({});
    expect(result.ledgerRow).toBeNull();
    expect(result.fireReceipt).toBe(false);
    expect(result.forceCompleteInvoice).toBe(false);
    for (const key of ["payment_status", "balance_due", "paid_at", "status", "completed_at"]) {
      expect(result.dbPatchAdditions).not.toHaveProperty(key);
    }
  });

  // Test 2
  it("empty-patch refresh call stays a no-op", () => {
    const result = plan({ patch: {} });
    expect(result.dbPatchAdditions).toEqual({});
    expect(result.ledgerRow).toBeNull();
    expect(result.fireReceipt).toBe(false);
  });

  // Test 3
  it("Complete-button path is unaffected: no status/completed_at, no receipt, ledger row written", () => {
    const result = plan({
      patch: { status: "Completed" },
      paymentMethod: "card",
      confirmedRevenue: 400,
      entry: "completion",
    });
    expect(result.dbPatchAdditions).not.toHaveProperty("status");
    expect(result.dbPatchAdditions).not.toHaveProperty("completed_at");
    expect(result.dbPatchAdditions.payment_status).toBe("paid");
    expect(result.fireReceipt).toBe(false);
    expect(result.ledgerRow?.payment_type).toBe("full");
    expect(result.ledgerRow?.metadata).toEqual({ entry: "completion" });
  });
});

describe("engineerPaymentPlan — standalone completion gating", () => {
  // Test 4
  it("completes on In Progress when the payment settles the job", () => {
    const result = plan({ paymentMethod: "cash", confirmedRevenue: 400 });
    expect(result.dbPatchAdditions.payment_status).toBe("paid");
    expect(result.dbPatchAdditions.status).toBe("Completed");
    expect(result.dbPatchAdditions.completed_at).toBe(PAID_AT);
    expect(result.dbPatchAdditions.paid_at).toBe(PAID_AT);
  });

  it("does NOT complete a Booked job, but still records the payment", () => {
    const result = plan({
      paymentMethod: "cash",
      confirmedRevenue: 400,
      job: job({ status: "Booked" }),
    });
    expect(result.dbPatchAdditions.payment_status).toBe("paid");
    expect(result.dbPatchAdditions).not.toHaveProperty("status");
    expect(result.dbPatchAdditions).not.toHaveProperty("completed_at");
  });

  it.each(["En Route", "On Site", "Completed"])("completes from %s", (status) => {
    const result = plan({ paymentMethod: "card", confirmedRevenue: 400, job: job({ status }) });
    expect(result.dbPatchAdditions.status).toBe("Completed");
  });

  it("a partial payment on In Progress stays partial and does not complete", () => {
    const result = plan({ paymentMethod: "cash", confirmedRevenue: 100 });
    expect(result.dbPatchAdditions.payment_status).toBe("partial");
    expect(result.dbPatchAdditions.balance_due).toBe(300);
    expect(result.dbPatchAdditions).not.toHaveProperty("status");
  });
});

describe("engineerPaymentPlan — cumulative collectedToDate", () => {
  // Test 5
  it("a €250 balance on a €500 job with a €250 deposit already taken settles it", () => {
    const result = plan({
      paymentMethod: "card",
      confirmedRevenue: 250,
      job: job({ revenue: 500, balance_due: 250 }),
    });
    expect(result.dbPatchAdditions.payment_status).toBe("paid");
    expect(result.dbPatchAdditions.balance_due).toBe(0);
    expect(result.ledgerRow?.payment_type).toBe("balance");
  });

  it("handles two prior partial payments (revenue 600 / balance_due 100)", () => {
    const result = plan({
      paymentMethod: "cash",
      confirmedRevenue: 100,
      job: job({ revenue: 600, balance_due: 100 }),
    });
    // Cumulative: 500 already collected + 100 now = settled.
    expect(result.dbPatchAdditions.payment_status).toBe("paid");
    expect(result.dbPatchAdditions.balance_due).toBe(0);
    // The old deposit_amount-only assumption would have seen 0 collected and
    // mis-resolved this to partial with 500 outstanding.
    expect(result.dbPatchAdditions.balance_due).not.toBe(500);
  });

  it("does not overstate collections on an unpriced job", () => {
    const result = plan({
      paymentMethod: "cash",
      confirmedRevenue: 150,
      job: job({ revenue: null, balance_due: null }),
    });
    expect(result.dbPatchAdditions.payment_status).toBe("paid");
    expect(result.ledgerRow?.payment_type).toBe("full");
  });
});

describe("engineerPaymentPlan — ledger row", () => {
  // Test 6
  it("is self-contained and correctly shaped", () => {
    const result = plan({ paymentMethod: "card", confirmedRevenue: 400 });
    expect(result.ledgerRow).toEqual({
      organisation_id: "org-1",
      service_call_id: "job-1",
      customer_id: "cust-1",
      amount: 400,
      payment_type: "full",
      method: "card",
      source: "engineer_app",
      checkout_id: null,
      recorded_by: "profile-1",
      paid_at: PAID_AT,
      metadata: { entry: "standalone" },
    });
  });

  it("classifies a partial first payment as a deposit", () => {
    const result = plan({ paymentMethod: "cash", confirmedRevenue: 100 });
    expect(result.ledgerRow?.payment_type).toBe("deposit");
  });

  it("writes no ledger row for an invoice", () => {
    const result = plan({ paymentMethod: "invoice", confirmedRevenue: 400 });
    expect(result.ledgerRow).toBeNull();
    expect(result.forceCompleteInvoice).toBe(true);
    expect(result.dbPatchAdditions.payment_status).toBe("unpaid");
    expect(result.dbPatchAdditions).not.toHaveProperty("paid_at");
  });

  it("tolerates a missing cached profile id", () => {
    const result = plan({ paymentMethod: "cash", confirmedRevenue: 400, recordedBy: null });
    expect(result.ledgerRow?.recorded_by).toBeNull();
  });
});

describe("engineerPaymentPlan — receipt firing", () => {
  // Test 7
  it("fires on full payment even when the job is not completed (Booked)", () => {
    const result = plan({
      paymentMethod: "cash",
      confirmedRevenue: 400,
      job: job({ status: "Booked" }),
    });
    expect(result.fireReceipt).toBe(true);
    expect(result.dbPatchAdditions).not.toHaveProperty("status");
  });

  it("does not fire for an invoice", () => {
    expect(plan({ paymentMethod: "invoice", confirmedRevenue: 400 }).fireReceipt).toBe(false);
  });

  it("does not fire for a partial payment", () => {
    expect(plan({ paymentMethod: "cash", confirmedRevenue: 100 }).fireReceipt).toBe(false);
  });
});
