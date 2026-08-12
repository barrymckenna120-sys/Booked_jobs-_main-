import { describe, expect, it } from "vitest";
import { isOutstandingBalanceJob } from "./outstandingBalances";

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

  it("excludes an uninvoiced, unpaid card job with no payment taken", () => {
    expect(
      isOutstandingBalanceJob({
        payment_status: "unpaid",
        payment_method: "card",
        invoiced_at: null,
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
