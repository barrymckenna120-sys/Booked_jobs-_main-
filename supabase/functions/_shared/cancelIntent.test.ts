import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  businessToday,
  isEligibleJob,
  parseInboundIntent,
  resolveReplyTarget,
  type CandidateJob,
} from "./cancelIntent.ts";

const TODAY = "2026-08-05";

const job = (over: Partial<CandidateJob> = {}): CandidateJob => ({
  id: over.id ?? "job-1",
  status: "Scheduled",
  scheduled_date: "2026-08-07",
  reminder_2day_sent: true,
  ...over,
});

// ---------------------------------------------------------------- intent

Deno.test("parseInboundIntent recognises STOP in any case / with punctuation", () => {
  assertEquals(parseInboundIntent("STOP"), "stop");
  assertEquals(parseInboundIntent(" stop "), "stop");
  assertEquals(parseInboundIntent("*STOP*"), "stop");
});

Deno.test("parseInboundIntent recognises CANCEL and CONFIRM", () => {
  assertEquals(parseInboundIntent("CANCEL"), "cancel");
  assertEquals(parseInboundIntent("cancel."), "cancel");
  assertEquals(parseInboundIntent("CONFIRM"), "confirm");
  assertEquals(parseInboundIntent("yes"), "confirm");
});

Deno.test("parseInboundIntent does not fire on sentences containing the word", () => {
  // Must be an exact keyword reply — "can I cancel?" is a human question.
  assertEquals(parseInboundIntent("can I cancel?"), "unknown");
  assertEquals(parseInboundIntent("please cancel my job"), "unknown");
  assertEquals(parseInboundIntent(""), "unknown");
  assertEquals(parseInboundIntent(null), "unknown");
});

// ------------------------------------------------------------- eligibility

Deno.test("isEligibleJob accepts a future reminded job", () => {
  assertEquals(isEligibleJob(job(), TODAY), true);
});

Deno.test("isEligibleJob accepts a job scheduled today", () => {
  assertEquals(isEligibleJob(job({ scheduled_date: TODAY }), TODAY), true);
});

Deno.test("isEligibleJob rejects stale past jobs (the reliability fix)", () => {
  assertEquals(isEligibleJob(job({ scheduled_date: "2026-07-01" }), TODAY), false);
  assertEquals(isEligibleJob(job({ scheduled_date: "2026-08-04" }), TODAY), false);
});

Deno.test("isEligibleJob rejects completed / cancelled jobs regardless of case", () => {
  assertEquals(isEligibleJob(job({ status: "Completed" }), TODAY), false);
  assertEquals(isEligibleJob(job({ status: "cancelled" }), TODAY), false);
});

Deno.test("isEligibleJob rejects jobs that never got a 2-day reminder", () => {
  assertEquals(isEligibleJob(job({ reminder_2day_sent: false }), TODAY), false);
  assertEquals(isEligibleJob(job({ reminder_2day_sent: null }), TODAY), false);
});

Deno.test("isEligibleJob rejects jobs with no scheduled date", () => {
  assertEquals(isEligibleJob(job({ scheduled_date: null }), TODAY), false);
});

// ---------------------------------------------------------------- matching

Deno.test("resolveReplyTarget acts when exactly one job matches", () => {
  const d = resolveReplyTarget([job({ id: "only" })], TODAY);
  assertEquals(d.action, "act");
  if (d.action === "act") assertEquals(d.job.id, "only");
});

Deno.test("resolveReplyTarget returns none when there are zero matches", () => {
  const d = resolveReplyTarget([], TODAY);
  assertEquals(d, { action: "none", reason: "no_eligible_job" });
});

Deno.test("resolveReplyTarget returns none when the only job is stale", () => {
  const d = resolveReplyTarget([job({ scheduled_date: "2026-01-01" })], TODAY);
  assertEquals(d.action, "none");
});

Deno.test("resolveReplyTarget NEVER guesses with two upcoming jobs", () => {
  const d = resolveReplyTarget(
    [job({ id: "later", scheduled_date: "2026-08-20" }), job({ id: "sooner", scheduled_date: "2026-08-07" })],
    TODAY,
  );
  assertEquals(d.action, "escalate");
  if (d.action === "escalate") {
    assertEquals(d.jobs.length, 2);
    // soonest first, so staff follow-up lands on the most imminent booking
    assertEquals(d.jobs[0].id, "sooner");
  }
});

Deno.test("resolveReplyTarget is unambiguous when the second job is stale or closed", () => {
  const d = resolveReplyTarget(
    [
      job({ id: "live", scheduled_date: "2026-08-07" }),
      job({ id: "old", scheduled_date: "2026-06-01" }),
      job({ id: "done", status: "Completed" }),
    ],
    TODAY,
  );
  assertEquals(d.action, "act");
  if (d.action === "act") assertEquals(d.job.id, "live");
});

Deno.test("resolveReplyTarget handles null input", () => {
  assertEquals(resolveReplyTarget(null, TODAY).action, "none");
});

// ---------------------------------------------------------------- timezone

Deno.test("businessToday formats YYYY-MM-DD in Europe/Dublin", () => {
  // 00:30 UTC in August is 01:30 Dublin — same calendar day.
  assertEquals(businessToday(new Date("2026-08-05T00:30:00Z")), "2026-08-05");
  // 23:30 UTC is 00:30 Dublin the NEXT day during IST.
  assertEquals(businessToday(new Date("2026-08-05T23:30:00Z")), "2026-08-06");
});
