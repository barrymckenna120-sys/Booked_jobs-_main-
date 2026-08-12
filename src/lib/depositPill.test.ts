import { describe, expect, it } from "vitest";
import { resolveDepositPill } from "@/components/engineer/job-card/InfoPills";
import { resolvePaymentSheetState } from "./paymentSheetAmount";

// The pill is a presentation mapping over resolvePaymentSheetState — these tests
// assert the mapping stays aligned with the four cases the helper reports.
describe("resolveDepositPill", () => {
  it("Case D — deposit required, not paid → warning pill, no balance line", () => {
    const job = { deposit_required: true, deposit_paid: false, deposit_amount: 500, revenue: 2000, balance_due: 2000 };
    expect(resolvePaymentSheetState(job).case).toBe("D");
    expect(resolveDepositPill(job)).toEqual({
      pill: { tone: "warning", label: "Deposit €500.00 due" },
      balanceLine: null,
    });
  });

  it("Case A — deposit paid, balance remains → success pill + balance line", () => {
    const job = { deposit_required: true, deposit_paid: true, deposit_amount: 1230, revenue: 2460, balance_due: 1230, payment_status: "partial" };
    expect(resolvePaymentSheetState(job).case).toBe("A");
    expect(resolveDepositPill(job)).toEqual({
      pill: { tone: "success", label: "Deposit €1230.00 paid" },
      balanceLine: "Balance due €1230.00",
    });
  });

  it("Case B — nothing owing → no pill, no balance line", () => {
    const job = { deposit_paid: true, deposit_amount: 120, revenue: 120, balance_due: 0, payment_status: "paid" };
    expect(resolvePaymentSheetState(job).case).toBe("B");
    expect(resolveDepositPill(job)).toEqual({ pill: null, balanceLine: null });
  });

  it("Case C — no deposit involved → no pill, no balance line", () => {
    const job = { deposit_required: false, deposit_paid: false, deposit_amount: 0, revenue: 120 };
    expect(resolvePaymentSheetState(job).case).toBe("C");
    expect(resolveDepositPill(job)).toEqual({ pill: null, balanceLine: null });
    // The straight cash job that used to render a misleading "€0 Pending" pill.
    expect(resolveDepositPill(job).pill).toBeNull();
  });

  it("treats a missing job as Case C — nothing to show", () => {
    expect(resolveDepositPill(null)).toEqual({ pill: null, balanceLine: null });
    expect(resolveDepositPill(undefined)).toEqual({ pill: null, balanceLine: null });
  });
});
