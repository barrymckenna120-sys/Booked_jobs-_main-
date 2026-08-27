import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  alreadyReminded,
  filterDueCustomers,
  CUSTOMER_REMINDER_COLUMN,
  JOB_REMINDER_COLUMN,
} from "./renewalDedup.ts";

/**
 * Regression coverage for the renewal-reminder repeat-send bug.
 *
 * Before the fix, dedup only consulted the job-level flag
 * (`!latest || !latest.reminder_30day_sent`), so a customer with no
 * service_calls row was NEVER suppressed and got re-messaged daily.
 *
 * NOTE: this file previously used vitest globals and imported "./renewalDedup"
 * without the .ts extension. It lived under supabase/functions, which vitest
 * does not scan, so it never ran there — and the extensionless import made
 * `deno test` fail type-checking for the WHOLE _shared directory, silently
 * disabling the cancelIntent and sumupWebhook suites. Keep it Deno-native.
 */

const noJobs = new Map<string, { reminder_30day_sent?: boolean | null }>();
const noBookings = new Set<string>();

Deno.test("REGRESSION: a job-less customer already reminded is suppressed", () => {
  const customer = { id: "c1", reminder_30_days_sent: true };
  assertEquals(alreadyReminded(customer, undefined, "30day"), true);
  assertEquals(filterDueCustomers([customer], noBookings, noJobs, "30day"), []);
});

Deno.test("a job-less customer not yet reminded is still due", () => {
  const customer = { id: "c1", reminder_30_days_sent: false };
  assertEquals(filterDueCustomers([customer], noBookings, noJobs, "30day").length, 1);
});

Deno.test("treats missing/null customer flags as not sent", () => {
  assertEquals(alreadyReminded({ id: "c1" }, undefined, "30day"), false);
  assertEquals(alreadyReminded({ id: "c1", reminder_30_days_sent: null }, undefined, "14day"), false);
});

Deno.test("falls back to the legacy job-level flag for customers marked under the old scheme", () => {
  const customer = { id: "c1", reminder_30_days_sent: false };
  const jobs = new Map([["c1", { reminder_30day_sent: true }]]);
  assertEquals(alreadyReminded(customer, jobs.get("c1"), "30day"), true);
  assertEquals(filterDueCustomers([customer], noBookings, jobs, "30day"), []);
});

Deno.test("keeps the 14-day and 30-day cadences independent", () => {
  const customer = { id: "c1", reminder_30_days_sent: true, reminder_14_days_sent: false };
  assertEquals(alreadyReminded(customer, undefined, "30day"), true);
  assertEquals(alreadyReminded(customer, undefined, "14day"), false);
});

Deno.test("excludes customers who already have an upcoming booked job", () => {
  const customer = { id: "c1", reminder_30_days_sent: false };
  assertEquals(filterDueCustomers([customer], new Set(["c1"]), noJobs, "30day"), []);
});

Deno.test("maps each cadence to the right columns", () => {
  assertEquals(CUSTOMER_REMINDER_COLUMN["30day"], "reminder_30_days_sent");
  assertEquals(CUSTOMER_REMINDER_COLUMN["14day"], "reminder_14_days_sent");
  assertEquals(CUSTOMER_REMINDER_COLUMN["7day"], "reminder_7_days_sent");
  // 2-day is an appointment reminder — job-level only
  assertEquals(CUSTOMER_REMINDER_COLUMN["2day"], null);
  assertEquals(JOB_REMINDER_COLUMN["2day"], "reminder_2day_sent");
  assertEquals(JOB_REMINDER_COLUMN["7day"], null);
});
