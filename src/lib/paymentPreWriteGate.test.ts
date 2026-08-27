import { describe, it, expect } from "vitest";
import {
  assertCollectable,
  gateJobPayment,
  isJobAlreadyPaidError,
  JobAlreadyPaidError,
} from "./paymentPreWriteGate";

const fakeClient = (row: any, error: any = null) => ({
  from: () => ({
    select: () => ({
      eq: () => ({ single: async () => ({ data: row, error }) }),
    }),
  }),
});

describe("paymentPreWriteGate", () => {
  it("blocks a fully paid job (Case B)", () => {
    const row = { revenue: 120, balance_due: 0, payment_status: "paid", deposit_required: true, deposit_paid: true, deposit_amount: 120 };
    expect(() => assertCollectable(row)).toThrow(JobAlreadyPaidError);
  });

  it("blocks a cash-settled job with no deposit (payment_status paid)", () => {
    expect(() => assertCollectable({ revenue: 100, balance_due: 0, payment_status: "paid" })).toThrow(JobAlreadyPaidError);
  });


  it("allows a job with an outstanding balance", () => {
    const row = { revenue: 120, balance_due: 60, payment_status: "partial", deposit_required: true, deposit_paid: true, deposit_amount: 60 };
    const { state } = assertCollectable(row);
    expect(state.case).not.toBe("B");
  });

  it("allows an unpriced job", () => {
    const { state } = assertCollectable({ revenue: 0, balance_due: 0, payment_status: null });
    expect(state.case).not.toBe("B");
  });

  it("allows a deposit-not-yet-paid job (Case D)", () => {
    const { state } = assertCollectable({
      revenue: 200, balance_due: 200, deposit_required: true, deposit_paid: false, deposit_amount: 50,
    });
    expect(state.case).toBe("D");
  });

  it("gateJobPayment re-reads and throws on a settled job", async () => {
    const client = fakeClient({ revenue: 100, balance_due: 0, payment_status: "paid" });
    await expect(gateJobPayment(client, "job-1")).rejects.toSatisfy(isJobAlreadyPaidError);
  });

  it("gateJobPayment returns the fresh row for a collectable job", async () => {
    const client = fakeClient({ organisation_id: "org-1", revenue: 100, balance_due: 100 });
    const { row } = await gateJobPayment(client, "job-1");
    expect(row.organisation_id).toBe("org-1");
    expect(row.balance_due).toBe(100);
  });

  it("surfaces a read error instead of silently allowing the write", async () => {
    const client = fakeClient(null, new Error("boom"));
    await expect(gateJobPayment(client, "job-1")).rejects.toThrow("boom");
  });

  it("throws when the job row is missing", async () => {
    const client = fakeClient(null);
    await expect(gateJobPayment(client, "job-1")).rejects.toThrow("Job not found");
  });
});
