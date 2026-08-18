import { describe, it, expect } from "vitest";
import { buildPaymentPatch } from "@/lib/paymentUpdate";

describe("buildPaymentPatch — booking_setup (NewJobPanel parity)", () => {
  it("non-deposit job keeps null balance/deposit, not 0", () => {
    expect(buildPaymentPatch({ type: "booking_setup", depositMode: "none", amount: 246 })).toEqual({
      revenue: 246,
      deposit_paid: false,
      deposit_required: false,
      deposit_amount: null,
      balance_due: null,
    });
  });

  it("deposit-required job carries deposit amount and balance", () => {
    expect(
      buildPaymentPatch({
        type: "booking_setup",
        depositMode: "deposit",
        amount: 800,
        depositAmount: 100,
        balanceDue: 700,
      }),
    ).toEqual({
      revenue: 800,
      deposit_paid: false,
      deposit_required: true,
      deposit_amount: 100,
      balance_due: 700,
    });
  });

  it("paid-upfront job marks deposit_paid and leaves balance null", () => {
    expect(buildPaymentPatch({ type: "booking_setup", depositMode: "paid", amount: 120 })).toEqual({
      revenue: 120,
      deposit_paid: true,
      deposit_required: false,
      deposit_amount: null,
      balance_due: null,
    });
  });

  it("missing amount stays null revenue", () => {
    expect(buildPaymentPatch({ type: "booking_setup" }).revenue).toBeNull();
  });
});

describe("buildPaymentPatch — invoice (TakePaymentModal + completion parity)", () => {
  it("writes unpaid with revenue = balance = amount", () => {
    expect(buildPaymentPatch({ type: "invoice", amount: 369 })).toEqual({
      payment_status: "unpaid",
      balance_due: 369,
      revenue: 369,
    });
  });

  it("falls back to existing job revenue when confirmedRevenue is undefined", () => {
    expect(buildPaymentPatch({ type: "invoice", amount: undefined, fallbackRevenue: 184.5 })).toEqual({
      payment_status: "unpaid",
      balance_due: 184.5,
    });
  });

  it("no confirmed amount and no job revenue yields 0 balance", () => {
    expect(buildPaymentPatch({ type: "invoice" }).balance_due).toBe(0);
  });
});

describe("buildPaymentPatch — deposit / part payment", () => {
  it("on-site card deposit: partial, deposit_paid, revenue set, balance untouched", () => {
    expect(buildPaymentPatch({ type: "deposit", amount: 100 })).toEqual({
      payment_status: "partial",
      deposit_paid: true,
      revenue: 100,
    });
  });

  it("webhook deposit with a known total derives the balance", () => {
    expect(
      buildPaymentPatch({ type: "deposit", amount: 400, revenue: 1000, revenueMode: "fill" }),
    ).toEqual({
      payment_status: "partial",
      deposit_paid: true,
      balance_due: 600,
    });
  });

  it("webhook deposit with no job total backfills revenue and keeps existing balance", () => {
    expect(
      buildPaymentPatch({
        type: "deposit",
        amount: 250,
        revenue: 0,
        currentBalanceDue: 500,
        revenueMode: "fill",
      }),
    ).toEqual({
      payment_status: "partial",
      deposit_paid: true,
      revenue: 250,
      balance_due: 500,
    });
  });

  it("never returns a negative balance", () => {
    expect(
      buildPaymentPatch({ type: "deposit", amount: 900, revenue: 500, revenueMode: "fill" }).balance_due,
    ).toBe(0);
  });
});

describe("buildPaymentPatch — balance / full settle", () => {
  it("balance settle zeroes balance_due (hadDeposit true)", () => {
    expect(buildPaymentPatch({ type: "balance", amount: 369 })).toEqual({
      payment_status: "paid",
      balance_due: 0,
      revenue: 369,
    });
  });

  it("full settle with no prior deposit also zeroes balance_due (fixed disagreement)", () => {
    expect(buildPaymentPatch({ type: "full", amount: 120 })).toEqual({
      payment_status: "paid",
      balance_due: 0,
      revenue: 120,
    });
  });

  it("completion with undefined confirmedRevenue leaves revenue alone", () => {
    expect(buildPaymentPatch({ type: "full" })).toEqual({
      payment_status: "paid",
      balance_due: 0,
    });
  });

  it("webhook full payment marks deposit_paid and only fills a missing total", () => {
    expect(
      buildPaymentPatch({
        type: "full",
        amount: 246,
        revenue: 246,
        revenueMode: "fill",
        markDepositPaid: true,
      }),
    ).toEqual({
      payment_status: "paid",
      balance_due: 0,
      deposit_paid: true,
    });

    expect(
      buildPaymentPatch({
        type: "full",
        amount: 246,
        revenue: 0,
        revenueMode: "fill",
        markDepositPaid: true,
      }),
    ).toEqual({
      payment_status: "paid",
      balance_due: 0,
      deposit_paid: true,
      revenue: 246,
    });
  });
});

describe("buildPaymentPatch — increment (ExtraWorkSheet parity)", () => {
  it("adds the subtotal to both revenue and balance, rounded to 2dp", () => {
    expect(
      buildPaymentPatch({ type: "increment", amount: 45.555, revenue: 120.1, currentBalanceDue: 100.2 }),
    ).toEqual({ revenue: 165.66, balance_due: 145.76 });
  });

  it("treats null revenue/balance as 0", () => {
    expect(
      buildPaymentPatch({ type: "increment", amount: 80, revenue: null, currentBalanceDue: null }),
    ).toEqual({ revenue: 80, balance_due: 80 });
  });
});
