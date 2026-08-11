import { describe, it, expect } from "vitest";
import {
  resolvePaymentSheetState,
  canCollectPayment,
  LABEL_JOB_TOTAL,
  LABEL_BALANCE_DUE,
  LABEL_COLLECT_DEPOSIT,
} from "./paymentSheetAmount";

describe("resolvePaymentSheetState", () => {
  it("Case C: Boiler Service, no deposit, revenue 120 -> full total pre-filled", () => {
    const s = resolvePaymentSheetState({
      revenue: 120,
      deposit_paid: null,
      deposit_required: null,
      balance_due: null,
      payment_status: "unpaid",
    });
    expect(s.case).toBe("C");
    expect(s.amount).toBe(120);
    expect(s.label).toBe(LABEL_JOB_TOTAL);
  });

  it("Case C: no revenue -> no amount, settings default still governs", () => {
    const s = resolvePaymentSheetState({ revenue: null, deposit_paid: null });
    expect(s.case).toBe("C");
    expect(s.amount).toBeUndefined();
    expect(s.label).toBe(LABEL_JOB_TOTAL);
  });

  it("Case C: deposit_amount set but deposit not paid and not required -> still full total", () => {
    const s = resolvePaymentSheetState({
      revenue: 480,
      deposit_amount: 200,
      deposit_paid: false,
      deposit_required: false,
    });
    expect(s.case).toBe("C");
    expect(s.amount).toBe(480);
  });

  it("Case D: deposit required, not yet paid -> collect the deposit only", () => {
    const s = resolvePaymentSheetState({
      revenue: 492,
      deposit_amount: 246,
      deposit_required: true,
      deposit_paid: false,
      balance_due: null,
      payment_status: "unpaid",
    });
    expect(s.case).toBe("D");
    expect(s.amount).toBe(246);
    expect(s.label).toBe(LABEL_COLLECT_DEPOSIT);
  });

  it("Case A: deposit paid, balance remains -> collect the balance", () => {
    const s = resolvePaymentSheetState({
      revenue: 492,
      deposit_amount: 246,
      deposit_paid: true,
      balance_due: 246,
      payment_status: "partial",
    });
    expect(s.case).toBe("A");
    expect(s.amount).toBe(246);
    expect(s.label).toBe(LABEL_BALANCE_DUE);
  });

  it("Case B: deposit paid and payment_status 'paid' -> fully paid", () => {
    const s = resolvePaymentSheetState({
      revenue: 492,
      deposit_amount: 246,
      deposit_paid: true,
      balance_due: 246, // stale positive balance must lose to payment_status
      payment_status: "paid",
    });
    expect(s.case).toBe("B");
    expect(s.amount).toBeUndefined();
    expect(s.label).toBeNull();
  });

  it("Case B: deposit paid with zero or null balance_due -> fully paid", () => {
    expect(resolvePaymentSheetState({ deposit_paid: true, balance_due: 0, payment_status: "partial" }).case).toBe("B");
    expect(resolvePaymentSheetState({ deposit_paid: true, balance_due: null, payment_status: "partial" }).case).toBe("B");
  });

  it("live shape KN-462/460/458/455/449: flat-rate fully paid -> Case B, not Case A", () => {
    const s = resolvePaymentSheetState({
      revenue: 120,
      deposit_amount: null,
      deposit_required: null,
      deposit_paid: true,
      balance_due: 0,
      payment_status: "paid",
    });
    expect(s.case).toBe("B");
    expect(s.amount).toBeUndefined();
  });

  it("live shape KN-465: partial deposit -> Case A at 246", () => {
    const s = resolvePaymentSheetState({
      revenue: 492,
      deposit_amount: 246,
      deposit_required: true,
      deposit_paid: true,
      balance_due: 246,
      payment_status: "partial",
    });
    expect(s.case).toBe("A");
    expect(s.amount).toBe(246);
    expect(s.label).toBe(LABEL_BALANCE_DUE);
  });
});

describe("TakePaymentModal gating (shared helper)", () => {
  const kn462 = {
    revenue: 120,
    deposit_amount: null,
    deposit_required: null,
    deposit_paid: true,
    balance_due: 0,
    payment_status: "paid",
  };

  it("does not offer to collect a further payment on the KN-462 shape", () => {
    expect(canCollectPayment(kn462)).toBe(false);
    expect(resolvePaymentSheetState(kn462).amount).toBeUndefined();
  });

  it("regression: still offers in-person deposit collection for a Case D job", () => {
    const caseD = {
      revenue: 492,
      deposit_amount: 246,
      deposit_required: true,
      deposit_paid: false,
      balance_due: null,
      payment_status: "unpaid",
    };
    expect(canCollectPayment(caseD)).toBe(true);
    const s = resolvePaymentSheetState(caseD);
    expect(s.case).toBe("D");
    expect(s.amount).toBe(246);
  });
});
