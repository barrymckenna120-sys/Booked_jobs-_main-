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

// ---------------------------------------------------------------- sender

import { pickActingOrg, resolveInboundSender, type InboundCustomer } from "./cancelIntent.ts";
import { samePhone } from "./phone.ts";

const cust = (over: Partial<InboundCustomer> = {}): InboundCustomer => ({
  id: over.id ?? "c1",
  organisation_id: "org-1",
  name: "Test",
  phone: "+353892109224",
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

Deno.test("resolveInboundSender drops when nothing matches", () => {
  const d = resolveInboundSender("353871111111", [cust()], samePhone);
  assertEquals(d.action === "drop" && d.reason, "no_match");
});

Deno.test("resolveInboundSender drops on an empty candidate list", () => {
  assertEquals(resolveInboundSender("353892109224", [], samePhone).action, "drop");
});

Deno.test("resolveInboundSender returns EVERY record sharing the number, newest first", () => {
  const d = resolveInboundSender(
    "353892109224",
    [
      cust({ id: "philip", name: "Philip Ward", created_at: "2026-08-05T00:00:00Z" }),
      cust({ id: "aisling", name: "Aisling Power", created_at: "2026-07-01T00:00:00Z" }),
    ],
    samePhone,
  );
  assertEquals(d.action, "resolved");
  if (d.action !== "resolved") return;
  // Regression: previously only `philip` (newest) was considered, so a reminded
  // job owned by `aisling` was invisible and CANCEL silently matched nothing.
  assertEquals(d.customers.map((c) => c.id), ["philip", "aisling"]);
  assertEquals(d.primary.id, "philip");
  assertEquals(d.logging_organisation_id, "org-1");
  assertEquals(d.orgs.length, 1);
});

Deno.test("resolveInboundSender matches regardless of formatting, but NOT across country codes", () => {
  const d = resolveInboundSender(
    "00353892109224",
    [
      cust({ id: "a", phone: "089 210 9224" }),
      cust({ id: "b", phone: null, landline_phone: "+353892109224" }),
      cust({ id: "z", phone: "+353871234567" }),
      // Same last 9 digits, different country — must NOT be pulled in.
      cust({ id: "morocco", phone: "+212892109224" }),
    ],
    samePhone,
  );
  assertEquals(d.action === "resolved" && d.customers.map((c) => c.id).sort(), ["a", "b"]);
});


Deno.test("resolveInboundSender groups multi-tenant matches, logging to the newest org", () => {
  const d = resolveInboundSender(
    "353892109224",
    [
      cust({ id: "kn", organisation_id: "org-1", created_at: "2026-08-05T00:00:00Z" }),
      cust({ id: "dg", organisation_id: "org-2", created_at: "2026-05-20T00:00:00Z" }),
    ],
    samePhone,
  );
  assertEquals(d.action, "resolved");
  if (d.action !== "resolved") return;
  assertEquals(d.logging_organisation_id, "org-1");
  assertEquals(d.orgs.map((g) => g.organisation_id), ["org-1", "org-2"]);
  assertEquals(d.customers.length, 2);
});

Deno.test("resolveInboundSender ignores rows with no organisation", () => {
  const d = resolveInboundSender("353892109224", [cust({ organisation_id: null })], samePhone);
  assertEquals(d.action === "drop" && d.reason, "no_match");
});

// ------------------------------------------------------------- acting org

Deno.test("pickActingOrg acts in the org owning the only eligible job, not the newest org", () => {
  const d = pickActingOrg(
    [
      job({ id: "old", organisation_id: "org-1", scheduled_date: "2026-07-01" }), // stale
      job({ id: "kn-484", organisation_id: "org-2" }),
    ],
    TODAY,
  );
  assertEquals(d.action, "act");
  assertEquals(d.action === "act" && d.organisation_id, "org-2");
  assertEquals(d.action === "act" && d.jobs.map((j) => j.id), ["kn-484"]);
});

Deno.test("pickActingOrg refuses to guess when eligible jobs span organisations", () => {
  const d = pickActingOrg(
    [job({ id: "a", organisation_id: "org-1" }), job({ id: "b", organisation_id: "org-2" })],
    TODAY,
  );
  assertEquals(d.action === "drop" && d.reason, "cross_org_ambiguous");
});

Deno.test("pickActingOrg drops when no job is eligible", () => {
  assertEquals(pickActingOrg([job({ scheduled_date: "2026-01-01" })], TODAY).action, "drop");
  assertEquals(pickActingOrg([], TODAY).action, "drop");
});

Deno.test("two shared-number records with upcoming jobs escalate rather than act", () => {
  const chosen = pickActingOrg(
    [
      job({ id: "kn-477", organisation_id: "org-1", scheduled_date: "2026-08-07" }),
      job({ id: "kn-484", organisation_id: "org-1", scheduled_date: "2026-08-09" }),
    ],
    TODAY,
  );
  assertEquals(chosen.action, "act");
  if (chosen.action !== "act") return;
  assertEquals(resolveReplyTarget(chosen.jobs, TODAY).action, "escalate");
});

// ------------------------------------------------- cross-country collision
//
// End-to-end version of the production hazard: a Moroccan test handset and an
// Irish customer shared their last 9 digits. Before the fix, a CANCEL from the
// Moroccan number resolved to the Irish record and — because that record held
// the only eligible job — `pickActingOrg` returned "act", cancelling a real
// customer's booking and WhatsApping them the cancellation.

Deno.test("REGRESSION: a +212 sender never reaches the same-last-9 +353 customer", () => {
  const d = resolveInboundSender(
    "212656802656",
    [cust({ id: "sean", phone: "+353656802656" })],
    samePhone,
  );
  assertEquals(d.action, "drop");
  assertEquals(d.action === "drop" && d.reason, "no_match");
});

Deno.test("REGRESSION: a +212 CANCEL cannot cancel the Irish customer's only eligible job", () => {
  const today = "2026-08-25";
  const irishCustomer = cust({ id: "sean", organisation_id: "org-kn", phone: "+353656802656" });
  const moroccanTester = cust({ id: "tester", organisation_id: "org-kn", phone: "+212656802656" });

  // Only the Irish customer has an upcoming reminded job.
  const irishJob = {
    id: "job-real",
    status: "Booked",
    scheduled_date: "2026-08-27",
    organisation_id: "org-kn",
    reminder_2day_sent: true,
  };

  // The sender resolves to the tester alone — the Irish record is not a match,
  // so its job is never fed into the acting decision.
  const sender = resolveInboundSender("212656802656", [irishCustomer, moroccanTester], samePhone);
  assertEquals(sender.action, "resolved");
  assertEquals(sender.action === "resolved" && sender.customers.map((c) => c.id), ["tester"]);

  // The tester has no jobs, so nothing is acted on.
  assertEquals(pickActingOrg([], today).action, "drop");

  // Sanity check the guard is not vacuous: the Irish customer's own reply DOES act.
  const ownReply = resolveInboundSender("+353656802656", [irishCustomer, moroccanTester], samePhone);
  assertEquals(ownReply.action === "resolved" && ownReply.customers.map((c) => c.id), ["sean"]);
  const acting = pickActingOrg([irishJob], today);
  assertEquals(acting.action, "act");
  assertEquals(acting.action === "act" && acting.jobs[0].id, "job-real");
});
