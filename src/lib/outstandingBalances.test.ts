import { describe, expect, it } from "vitest";
import { amountPaidOnJob, isOutstandingBalanceJob, outstandingBalanceAmount } from "./outstandingBalances";

describe("isOutstandingBalanceJob", () => {
  it("includes a card deposit on a job that has never been invoiced", () => {
    expect(
      isOutstandingBalanceJob({
        status: "incoming",
        payment_status: "partial",
        payment_method: "card",
        invoiced_at: null,
        deposit_paid: true,
        balance_due: 246,
      }),
    ).toBe(true);
  });

  it("keeps including invoiced jobs and invoice-method jobs", () => {
    expect(
      isOutstandingBalanceJob({
        payment_status: "unpaid",
        payment_method: "card",
        invoiced_at: "2026-08-10T10:00:00Z",
        balance_due: 100,
      }),
    ).toBe(true);
    expect(
      isOutstandingBalanceJob({
        payment_status: "unpaid",
        payment_method: "invoice",
        invoiced_at: null,
        balance_due: 100,
      }),
    ).toBe(true);
  });

  it("excludes fully paid jobs", () => {
    expect(
      isOutstandingBalanceJob({
        payment_status: "paid",
        payment_method: "card",
        deposit_paid: true,
        invoiced_at: "2026-08-10T10:00:00Z",
        balance_due: 0,
      }),
    ).toBe(false);
  });

  it("excludes cancelled jobs and jobs with nothing outstanding", () => {
    expect(
      isOutstandingBalanceJob({
        status: "Cancelled",
        payment_status: "partial",
        deposit_paid: true,
        balance_due: 246,
      }),
    ).toBe(false);
    expect(
      isOutstandingBalanceJob({ payment_status: "partial", deposit_paid: true, balance_due: 0 }),
    ).toBe(false);
  });

  it("excludes an uninvoiced, unpaid card job with no payment taken and no deposit requested", () => {
    expect(
      isOutstandingBalanceJob({
        payment_status: "unpaid",
        payment_method: "card",
        invoiced_at: null,
        deposit_required: false,
        deposit_paid: false,
        balance_due: 400,
      }),
    ).toBe(false);
  });

  it("includes the KN-490 shape: deposit requested, unpaid, never invoiced", () => {
    expect(
      isOutstandingBalanceJob({
        status: "Booked",
        payment_status: "unpaid",
        payment_method: null,
        invoiced_at: null,
        deposit_required: true,
        deposit_paid: false,
        balance_due: 250,
      }),
    ).toBe(true);
  });

  it("excludes archived jobs even with a deposit outstanding", () => {
    expect(
      isOutstandingBalanceJob({
        status: "archived",
        payment_status: "unpaid",
        invoiced_at: null,
        deposit_required: true,
        deposit_paid: false,
        balance_due: 400,
      }),
    ).toBe(false);
  });


  // Engineer-facing list uses the same helper, so these shapes matter there too.
  describe("engineer-scoped shapes", () => {
    it("includes the KN-129 shape: real balance_due while deposit_paid is false, job invoiced", () => {
      expect(
        isOutstandingBalanceJob({
          status: "Completed",
          payment_status: "unpaid",
          payment_method: "card",
          invoiced_at: "2026-03-26T14:28:36Z",
          deposit_paid: false,
          balance_due: 1230,
        }),
      ).toBe(true);
    });

    it("excludes a zero balance even when the job is invoiced", () => {
      expect(
        isOutstandingBalanceJob({
          status: "Completed",
          payment_status: "unpaid",
          invoiced_at: "2026-03-26T14:28:36Z",
          deposit_paid: true,
          balance_due: 0,
        }),
      ).toBe(false);
    });

    it("excludes a cancelled job that still carries a balance", () => {
      expect(
        isOutstandingBalanceJob({
          status: "Cancelled",
          payment_status: "unpaid",
          invoiced_at: "2026-03-26T14:28:36Z",
          deposit_paid: true,
          balance_due: 1230,
        }),
      ).toBe(false);
    });
  });
});

describe("outstandingBalanceAmount", () => {
  it("prefers stored balance_due when present", () => {
    expect(outstandingBalanceAmount({ balance_due: 300, revenue: 500, deposit_amount: 100 })).toBe(300);
  });

  it("falls back to revenue - deposit for legacy rows with no balance_due", () => {
    expect(outstandingBalanceAmount({ balance_due: null, revenue: 500, deposit_amount: 100 })).toBe(400);
  });

  it("treats zero balance_due as legacy and derives instead", () => {
    expect(outstandingBalanceAmount({ balance_due: 0, revenue: 250, deposit_amount: 0 })).toBe(250);
  });

  it("never returns a negative amount", () => {
    expect(outstandingBalanceAmount({ balance_due: null, revenue: 100, deposit_amount: 250 })).toBe(0);
  });

  it("parses string numerics from postgres numeric columns", () => {
    expect(outstandingBalanceAmount({ balance_due: "861.50" })).toBe(861.5);
  });
});

describe("amountPaidOnJob", () => {
  it("returns 0 when nothing has been paid (full amount stays outstanding)", () => {
    const job = { revenue: 307.5, balance_due: 307.5, deposit_required: true, deposit_paid: false, deposit_amount: 153.75, payment_status: "unpaid" };
    expect(amountPaidOnJob(job)).toBe(0);
    expect(outstandingBalanceAmount(job)).toBe(307.5);
    expect(isOutstandingBalanceJob(job)).toBe(true);
  });

  it("DG-444: 50% deposit paid leaves the other 50% outstanding", () => {
    const job = { revenue: 307.5, balance_due: 153.75, deposit_required: true, deposit_paid: true, deposit_amount: 153.75, payment_status: "partial", status: "incoming" };
    expect(amountPaidOnJob(job)).toBe(153.75);
    expect(outstandingBalanceAmount(job)).toBe(153.75);
    expect(isOutstandingBalanceJob(job)).toBe(true);
  });

  it("reduces the outstanding amount after each further part payment", () => {
    // second €100 taken on the DG-444 shape: balance falls, paid rises
    const job = { revenue: 307.5, balance_due: 53.75, deposit_paid: true, deposit_amount: 153.75, payment_status: "partial" };
    expect(amountPaidOnJob(job)).toBe(253.75);
    expect(outstandingBalanceAmount(job)).toBe(53.75);
    expect(isOutstandingBalanceJob(job)).toBe(true);
  });

  it("settles to zero outstanding and drops off the report when paid in full", () => {
    const job = { revenue: 307.5, balance_due: 0, deposit_paid: true, deposit_amount: 153.75, payment_status: "paid" };
    expect(amountPaidOnJob(job)).toBe(307.5);
    expect(isOutstandingBalanceJob(job)).toBe(false);
  });

  it("recalculates after a refund/adjustment that reopens a balance", () => {
    const job = { revenue: 307.5, balance_due: 307.5, deposit_paid: true, deposit_amount: 153.75, payment_status: "unpaid", invoiced_at: "2026-08-26T10:00:00Z" };
    expect(amountPaidOnJob(job)).toBe(0);
    expect(outstandingBalanceAmount(job)).toBe(307.5);
    expect(isOutstandingBalanceJob(job)).toBe(true);
  });

  it("is payment-method agnostic", () => {
    for (const method of ["card", "cash", "bank_transfer", "invoice"]) {
      const job = { revenue: 200, balance_due: 50, deposit_paid: true, deposit_amount: 150, payment_status: "partial", payment_method: method };
      expect(amountPaidOnJob(job)).toBe(150);
      expect(outstandingBalanceAmount(job)).toBe(50);
      expect(isOutstandingBalanceJob(job)).toBe(true);
    }
  });

  it("never exceeds the job total and falls back to the deposit for legacy rows", () => {
    expect(amountPaidOnJob({ revenue: 100, balance_due: -50, deposit_paid: true, deposit_amount: 40 })).toBe(40);
    expect(amountPaidOnJob({ revenue: null, balance_due: null, deposit_paid: true, deposit_amount: 75 })).toBe(75);
  });
});
