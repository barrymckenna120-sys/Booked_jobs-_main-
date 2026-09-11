import { describe, expect, it } from "vitest";
import { resolvePaymentPresentation } from "./paymentPresentation";

describe("resolvePaymentPresentation", () => {
  it("treats the reconciled DG-1019 shape as fully paid, not a deposit", () => {
    expect(resolvePaymentPresentation({
      revenue: 1537.5,
      deposit_required: true,
      deposit_paid: true,
      deposit_amount: 1537.5,
      balance_due: 0,
      payment_status: "paid",
    })).toEqual({
      isFullyPaid: true,
      showDepositBreakdown: false,
      amountPaid: 1537.5,
    });
  });

  it("keeps deposit wording available for a genuine part-paid job", () => {
    expect(resolvePaymentPresentation({
      revenue: 1000,
      deposit_required: true,
      deposit_paid: true,
      deposit_amount: 400,
      balance_due: 600,
      payment_status: "partial",
    })).toEqual({
      isFullyPaid: false,
      showDepositBreakdown: true,
      amountPaid: 400,
    });
  });

  it("does not show a paid deposit before any payment is collected", () => {
    expect(resolvePaymentPresentation({
      revenue: 1000,
      deposit_required: true,
      deposit_paid: false,
      deposit_amount: 400,
      balance_due: 1000,
      payment_status: "unpaid",
    })).toEqual({
      isFullyPaid: false,
      showDepositBreakdown: false,
      amountPaid: 0,
    });
  });
});