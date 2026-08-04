import { describe, it, expect } from "vitest";
import {
  alreadyReminded,
  filterDueCustomers,
  CUSTOMER_REMINDER_COLUMN,
  JOB_REMINDER_COLUMN,
} from "./renewalDedup";

/**
 * Regression coverage for the renewal-reminder repeat-send bug.
 *
 * Before the fix, dedup only consulted the job-level flag
 * (`!latest || !latest.reminder_30day_sent`), so a customer with no
 * service_calls row was NEVER suppressed and got re-messaged daily.
 */
describe("renewal reminder dedup", () => {
  const noJobs = new Map();
  const noBookings = new Set<string>();

  it("REGRESSION: a job-less customer already reminded is suppressed", () => {
    const customer = { id: "c1", reminder_30_days_sent: true };
    expect(alreadyReminded(customer, undefined, "30day")).toBe(true);
    expect(filterDueCustomers([customer], noBookings, noJobs, "30day")).toEqual([]);
  });

  it("a job-less customer not yet reminded is still due", () => {
    const customer = { id: "c1", reminder_30_days_sent: false };
    expect(filterDueCustomers([customer], noBookings, noJobs, "30day")).toHaveLength(1);
  });

  it("treats missing/null customer flags as not sent", () => {
    expect(alreadyReminded({ id: "c1" }, undefined, "30day")).toBe(false);
    expect(alreadyReminded({ id: "c1", reminder_30_days_sent: null }, undefined, "14day")).toBe(false);
  });

  it("falls back to the legacy job-level flag for customers marked under the old scheme", () => {
    const customer = { id: "c1", reminder_30_days_sent: false };
    const jobs = new Map([["c1", { reminder_30day_sent: true }]]);
    expect(alreadyReminded(customer, jobs.get("c1"), "30day")).toBe(true);
    expect(filterDueCustomers([customer], noBookings, jobs, "30day")).toEqual([]);
  });

  it("keeps the 14-day and 30-day cadences independent", () => {
    const customer = { id: "c1", reminder_30_days_sent: true, reminder_14_days_sent: false };
    expect(alreadyReminded(customer, undefined, "30day")).toBe(true);
    expect(alreadyReminded(customer, undefined, "14day")).toBe(false);
  });

  it("excludes customers who already have an upcoming booked job", () => {
    const customer = { id: "c1", reminder_30_days_sent: false };
    expect(filterDueCustomers([customer], new Set(["c1"]), noJobs, "30day")).toEqual([]);
  });

  it("maps each cadence to the right columns", () => {
    expect(CUSTOMER_REMINDER_COLUMN["30day"]).toBe("reminder_30_days_sent");
    expect(CUSTOMER_REMINDER_COLUMN["14day"]).toBe("reminder_14_days_sent");
    expect(CUSTOMER_REMINDER_COLUMN["7day"]).toBe("reminder_7_days_sent");
    // 2-day is an appointment reminder — job-level only
    expect(CUSTOMER_REMINDER_COLUMN["2day"]).toBeNull();
    expect(JOB_REMINDER_COLUMN["2day"]).toBe("reminder_2day_sent");
    expect(JOB_REMINDER_COLUMN["7day"]).toBeNull();
  });
});
