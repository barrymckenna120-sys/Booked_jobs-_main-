import { describe, it, expect } from "vitest";
import { buildPaymentPatch } from "@/lib/paymentUpdate";

describe("buildPaymentPatch — booking_setup (NewJobPanel parity)", () => {
  it("non-deposit priced job leaves the full total outstanding", () => {
    expect(buildPaymentPatch({ type: "booking_setup", depositMode: "none", amount: 246 })).toEqual({
      revenue: 246,
      deposit_paid: false,
      deposit_required: false,
      deposit_amount: null,
      balance_due: 246,
    });
  });

  it("ignores a caller-supplied balance that discounts an unpaid deposit (KN-490 regression)", () => {
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
      balance_due: 800,
    });
  });

  it("trusts a caller balance that does not discount the total", () => {
    expect(
      buildPaymentPatch({
        type: "booking_setup",
        depositMode: "deposit",
        amount: 800,
        depositAmount: 100,
        balanceDue: 800,
      }).balance_due,
    ).toBe(800);
  });

  it("deposit requested but nothing collected yet: full total outstanding, deposit ignored", () => {
    expect(
      buildPaymentPatch({
        type: "booking_setup",
        depositMode: "deposit",
        amount: 800,
        depositAmount: 100,
        collectedToDate: 0,
      }).balance_due,
    ).toBe(800);
  });

  it("edit-shaped call subtracts money collected to date, never deposit_amount", () => {
    expect(
      buildPaymentPatch({ type: "booking_setup", amount: 1000, collectedToDate: 400 }).balance_due,
    ).toBe(600);

    expect(
      buildPaymentPatch({
        type: "booking_setup",
        depositMode: "deposit",
        amount: 1000,
        depositAmount: 100,
        balanceDue: 900,
        collectedToDate: 400,
      }).balance_due,
    ).toBe(600);
  });

  it("never returns a negative balance on an over-collected job", () => {
    expect(
      buildPaymentPatch({ type: "booking_setup", amount: 100, collectedToDate: 250 }).balance_due,
    ).toBe(0);
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

  it("unpriced job stays null revenue and null balance", () => {
    const patch = buildPaymentPatch({ type: "booking_setup" });
    expect(patch.revenue).toBeNull();
    expect(patch.balance_due).toBeNull();
  });
});


describe("buildPaymentPatch — invoice (TakePaymentModal + completion parity)", () => {
  it("writes unpaid with the full amount outstanding and never rewrites revenue", () => {
    const patch = buildPaymentPatch({ type: "invoice", amount: 369 });
    expect(patch).toEqual({
      payment_status: "unpaid",
      balance_due: 369,
    });
    expect("revenue" in patch).toBe(false);
  });

  it("keeps a priced job's revenue untouched even with revenueMode fill", () => {
    const patch = buildPaymentPatch({
      type: "invoice",
      amount: 369,
      revenue: 500,
      revenueMode: "fill",
    });
    expect("revenue" in patch).toBe(false);
  });

  it("revenueMode fill backfills an unpriced job", () => {
    expect(
      buildPaymentPatch({ type: "invoice", amount: 369, revenue: 0, revenueMode: "fill" }),
    ).toEqual({
      payment_status: "unpaid",
      balance_due: 369,
      revenue: 369,
    });
  });

  it("subtracts money already collected from the outstanding balance", () => {
    expect(
      buildPaymentPatch({ type: "invoice", amount: 500, revenue: 500, collectedToDate: 250 }),
    ).toEqual({
      payment_status: "unpaid",
      balance_due: 250,
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
  it("balance settle on a €500 job with a €250 paid deposit settles without touching revenue", () => {
    const patch = buildPaymentPatch({
      type: "balance",
      amount: 250,
      revenue: 500,
      collectedToDate: 250,
    });
    expect(patch).toEqual({
      payment_status: "paid",
      balance_due: 0,
      deposit_paid: true,
    });
    expect("revenue" in patch).toBe(false);
  });

  it("full settle on the same shape behaves identically", () => {
    const patch = buildPaymentPatch({
      type: "full",
      amount: 250,
      revenue: 500,
      collectedToDate: 250,
    });
    expect(patch).toEqual({
      payment_status: "paid",
      balance_due: 0,
      deposit_paid: true,
    });
    expect("revenue" in patch).toBe(false);
  });

  it("short collection stays partial with the true remaining balance", () => {
    const patch = buildPaymentPatch({
      type: "full",
      amount: 100,
      revenue: 500,
      collectedToDate: 250,
    });
    expect(patch).toEqual({
      payment_status: "partial",
      balance_due: 150,
    });
    expect("revenue" in patch).toBe(false);
  });

  it("does not set deposit_paid while money is still outstanding", () => {
    expect(
      buildPaymentPatch({ type: "balance", amount: 50, revenue: 500, collectedToDate: 0 }).deposit_paid,
    ).toBeUndefined();
  });

  it("never writes revenue on balance/full without revenueMode", () => {
    expect("revenue" in buildPaymentPatch({ type: "balance", amount: 369 })).toBe(false);
    expect("revenue" in buildPaymentPatch({ type: "full", amount: 120 })).toBe(false);
  });

  it("full settle with no known total settles from the collected amount alone", () => {
    expect(buildPaymentPatch({ type: "full", amount: 120 })).toEqual({
      payment_status: "paid",
      balance_due: 0,
      deposit_paid: true,
    });
  });

  it("completion with undefined confirmedRevenue leaves revenue alone", () => {
    const patch = buildPaymentPatch({ type: "full" });
    expect(patch).toEqual({
      payment_status: "paid",
      balance_due: 0,
      deposit_paid: true,
    });
    expect("revenue" in patch).toBe(false);
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
