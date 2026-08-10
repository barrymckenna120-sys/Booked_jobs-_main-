import { describe, it, expect } from "vitest";
import {
  collectedAmount,
  completedJobsInPeriod,
  isRevenueRecognised,
  outstandingTotal,
  paidJobsInPeriod,
  periodRevenue,
  revenueDate,
} from "./financeMetrics";

const start = new Date("2026-08-01T00:00:00");
const end = new Date("2026-08-31T23:59:59");

// Real rows from the K&N sandbox tests
const KN449 = { status: "Completed", payment_status: "paid", revenue: 25, balance_due: 0, paid_at: "2026-08-10T09:49:09.899+00:00", completed_at: "2026-08-10T10:11:13.306+00:00", scheduled_date: "2026-08-10" };
const KN453 = { status: "Pending", payment_status: "paid", revenue: 120, balance_due: 0, deposit_amount: 120, paid_at: "2026-08-10T11:24:18.947+00:00", scheduled_date: "2026-08-19" };
const KN455 = { status: "Pending", payment_status: "paid", revenue: 120, balance_due: 0, paid_at: "2026-08-10T11:48:11+00:00", scheduled_date: "2026-08-13" };
const KN458 = { status: "Pending", payment_status: "paid", revenue: null, balance_due: 0, deposit_amount: 120, paid_at: "2026-08-10T12:16:18.703+00:00", scheduled_date: "2026-09-02" };
const KN451 = { status: "Pending", payment_status: "unpaid", revenue: 400, balance_due: 400, deposit_amount: 120, scheduled_date: null };

describe("revenue recognition", () => {
  it("counts paid and part_paid jobs regardless of job status", () => {
    expect(isRevenueRecognised(KN453)).toBe(true);
    expect(isRevenueRecognised({ payment_status: "part_paid", status: "Pending" })).toBe(true);
  });

  it("ignores unpaid and cancelled jobs", () => {
    expect(isRevenueRecognised(KN451)).toBe(false);
    expect(isRevenueRecognised({ payment_status: "paid", status: "Cancelled" })).toBe(false);
  });

  it("includes the previously-missing pending-but-paid jobs in period revenue", () => {
    const jobs = [KN449, KN453, KN455, KN458, KN451];
    expect(periodRevenue(jobs, start, end)).toBe(385); // 25 + 120 + 120 + 120
    expect(paidJobsInPeriod(jobs, start, end)).toHaveLength(4);
  });

  it("attributes revenue to paid_at, not scheduled_date", () => {
    // KN-458 is scheduled in September but was paid in August
    expect(revenueDate(KN458)!.getMonth()).toBe(7);
    expect(periodRevenue([KN458], start, end)).toBe(120);
  });
});

describe("collectedAmount", () => {
  it("uses the job total when paid", () => {
    expect(collectedAmount(KN455)).toBe(120);
  });

  it("falls back to the deposit figure when no job total was written", () => {
    expect(collectedAmount(KN458)).toBe(120);
  });

  it("returns total minus balance for part payments", () => {
    expect(collectedAmount({ payment_status: "part_paid", revenue: 400, balance_due: 280 })).toBe(120);
  });

  it("never returns a negative amount", () => {
    expect(collectedAmount({ payment_status: "part_paid", revenue: 100, balance_due: 400 })).toBe(0);
  });

  it("returns 0 for unpaid jobs", () => {
    expect(collectedAmount(KN451)).toBe(0);
  });

  it("handles numeric strings from the database", () => {
    expect(collectedAmount({ payment_status: "paid", revenue: "25.00" })).toBe(25);
  });
});

describe("jobs completed stays job-status based", () => {
  it("only counts jobs marked Completed", () => {
    const jobs = [KN449, KN453, KN455, KN458, KN451];
    const completed = completedJobsInPeriod(jobs, start, end);
    expect(completed).toHaveLength(1);
    expect(completed[0]).toBe(KN449);
  });

  it("counts a completed job even when it was never paid", () => {
    const job = { status: "Completed", payment_status: "unpaid", completed_at: "2026-08-05T09:00:00+00:00" };
    expect(completedJobsInPeriod([job], start, end)).toHaveLength(1);
    expect(periodRevenue([job], start, end)).toBe(0);
  });
});

describe("outstandingTotal", () => {
  it("counts balances on completed or part-paid work only", () => {
    const jobs = [
      KN451, // pending, never completed, no payment → not chased here
      { status: "Completed", payment_status: "unpaid", balance_due: 200, completed_at: "2026-08-02T09:00:00+00:00" },
      { status: "Pending", payment_status: "part_paid", balance_due: 280, paid_at: "2026-08-09T09:00:00+00:00" },
      { status: "Cancelled", payment_status: "unpaid", balance_due: 500, completed_at: "2026-08-03T09:00:00+00:00" },
      KN455,
    ];
    expect(outstandingTotal(jobs)).toBe(480);
  });
});
