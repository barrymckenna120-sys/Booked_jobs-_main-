import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractCheckoutId,
  handleSumUpWebhook,
  type SumUpCheckoutDiscovery,
  type SumUpCheckoutView,
  type SumUpWebhookJob,
} from "./sumupWebhook.ts";


const JOB_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "8c37827f-ce2c-4507-a821-a5e807d89856";
const CHECKOUT_ID = "33824b20-af8a-45d6-9e9f-a10cc40ee94c";

function job(overrides: Partial<SumUpWebhookJob> = {}): SumUpWebhookJob {
  return {
    id: JOB_ID,
    organisation_id: ORG_ID,
    customer_id: "cust-1",
    revenue: 2000,
    balance_due: 2000,
    deposit_paid: false,
    payment_status: "unpaid",
    paid_at: null,
    ...overrides,
  };
}

interface Harness {
  updates: Array<{ jobId: string; patch: Record<string, unknown> }>;
  activities: number;
  messages: number;
  notifications: Array<{ jobReference: string | null; amount: number; fullyPaid: boolean }>;
  fetches: number;
  discoveries: number;
  loadedById: string[];
  priorEventChecks: Array<{ serviceCallId: string; checkoutId: string }>;
  claims: number;
  failureAlerts: Array<{
    serviceCallId: string;
    jobReference: string | null;
    checkoutId: string;
    status: string;
    amount: number | null;
  }>;
  /** payment_failed timeline entries only; `activities` stays payment_received. */
  failureActivities: Array<{
    organisationId: string | null;
    customerId: string | null;
    serviceCallId: string;
    amount: number;
    fullyPaid: boolean;
    checkoutId?: string;
    status?: string;
  }>;
}

function run(opts: {
  jobRow?: SumUpWebhookJob | null;
  view?: SumUpCheckoutView;
  body?: string;
  presentedSecret?: string | null;
  expectedSecret?: string | null;
  updateOk?: boolean;
  /** Result of the checkout_reference discovery pass (Make-created checkouts). */
  discovery?: SumUpCheckoutDiscovery;
  /** Job returned by the id (checkout_reference) lookup. */
  jobById?: SumUpWebhookJob | null;
  /**
   * Layer 2 signal. undefined = dependency not supplied at all; boolean = the
   * lookup's answer; Error = a genuine query failure that must be thrown.
   */
  hasOtherClaimedEvent?: boolean | Error;
  /** Error = the failure alert itself throws; must never change the outcome. */
  failureAlert?: Error;
  /** Error = the failure timeline write throws; must never change the outcome. */
  activityLog?: Error;
}) {
  const h: Harness = {
    updates: [],
    activities: 0,
    messages: 0,
    notifications: [],
    fetches: 0,
    discoveries: 0,
    loadedById: [],
    priorEventChecks: [],
    claims: 0,
    failureAlerts: [],
    failureActivities: [],
  };

  const result = handleSumUpWebhook({
    expectedSecret: opts.expectedSecret === undefined ? "s3cret-token" : opts.expectedSecret,
    presentedSecret: opts.presentedSecret === undefined ? "s3cret-token" : opts.presentedSecret,
    body: opts.body ?? JSON.stringify({ id: CHECKOUT_ID, event_type: "CHECKOUT_STATUS_CHANGED" }),
    loadJobByCheckoutId: () => Promise.resolve(opts.jobRow === undefined ? job() : opts.jobRow),
    hasOtherClaimedEvent: opts.hasOtherClaimedEvent === undefined ? undefined : (e) => {
      h.priorEventChecks.push(e);
      if (opts.hasOtherClaimedEvent instanceof Error) return Promise.reject(opts.hasOtherClaimedEvent);
      return Promise.resolve(opts.hasOtherClaimedEvent === true);
    },
    loadJobById: (jobId) => {
      h.loadedById.push(jobId);
      return Promise.resolve(opts.jobById ?? null);
    },

    discoverCheckout: () => {
      h.discoveries++;
      return Promise.resolve(
        opts.discovery ?? { ok: true, reference: null, organisationId: null },
      );
    },
    fetchCheckout: () => {
      h.fetches++;
      return Promise.resolve(
        opts.view ?? {
          ok: true,
          status: "PAID",
          amount: 2000,
          checkoutReference: JOB_ID,
        },
      );
    },
    updateJob: (jobId, patch) => {
      h.updates.push({ jobId, patch });
      return Promise.resolve(opts.updateOk !== false);
    },
    logActivity: (e) => {
      if (e.eventType === "payment_failed") {
        h.failureActivities.push({
          organisationId: e.organisationId,
          customerId: e.customerId,
          serviceCallId: e.serviceCallId,
          amount: e.amount,
          fullyPaid: e.fullyPaid,
          checkoutId: e.checkoutId,
          status: e.status,
        });
        if (opts.activityLog) return Promise.reject(opts.activityLog);
        return Promise.resolve();
      }
      h.activities++;
      return Promise.resolve();
    },
    logMessage: () => {
      h.messages++;
      return Promise.resolve();
    },
    notifyOffice: (e) => {
      h.notifications.push({ jobReference: e.jobReference, amount: e.amount, fullyPaid: e.fullyPaid });
      return Promise.resolve();
    },
    claimEvent: () => {
      h.claims++;
      return Promise.resolve(true);
    },
    notifyPaymentFailed: (e) => {
      h.failureAlerts.push({
        serviceCallId: e.serviceCallId,
        jobReference: e.jobReference,
        checkoutId: e.checkoutId,
        status: e.status,
        amount: e.amount,
      });
      if (opts.failureAlert) return Promise.reject(opts.failureAlert);
      return Promise.resolve();
    },
    now: () => new Date("2026-08-10T09:00:00.000Z"),
  });
  return { h, result };
}


Deno.test("full payment marks the job paid, sets paid_at and zeroes the balance", async () => {
  const { h, result: p } = run({});
  const result = await p;
  assertEquals(result.outcome, "paid");
  assertEquals(result.status, 200);
  assertEquals(h.updates.length, 1);
  assertEquals(h.updates[0].patch.payment_status, "paid");
  assertEquals(h.updates[0].patch.paid_at, "2026-08-10T09:00:00.000Z");
  assertEquals(h.updates[0].patch.balance_due, 0);
  assertEquals(h.updates[0].patch.deposit_paid, true);
  assertEquals(h.activities, 1);
  assertEquals(h.messages, 1);
});

Deno.test("deposit payment sets partial + deposit_paid and stamps paid_at", async () => {
  const { h, result: p } = run({
    view: { ok: true, status: "PAID", amount: 1000, checkoutReference: JOB_ID },
  });
  const result = await p;
  assertEquals(result.outcome, "part_paid");
  assertEquals(h.updates[0].patch.payment_status, "partial");
  assertEquals(h.updates[0].patch.deposit_paid, true);
  assertEquals(h.updates[0].patch.balance_due, 1000);
  assertEquals(h.updates[0].patch.paid_at, "2026-08-10T09:00:00.000Z");
  assertEquals(h.activities, 1);
});

Deno.test("a part-paid job with paid_at already stamped can still be settled in full", async () => {
  const { h, result: p } = run({
    jobRow: job({
      payment_status: "partial",
      deposit_paid: true,
      balance_due: 1000,
      paid_at: "2026-08-09T10:00:00.000Z",
    }),
  });
  const result = await p;
  assertEquals(result.outcome, "paid");
  assertEquals(h.updates.length, 1);
  assertEquals(h.updates[0].patch.payment_status, "paid");
  assertEquals(h.updates[0].patch.paid_at, "2026-08-10T09:00:00.000Z");
  assertEquals(h.updates[0].patch.balance_due, 0);
  assertEquals(h.notifications.length, 1);
});

Deno.test("office is notified once per confirmed payment, with the job reference", async () => {
  const full = run({ jobRow: job({ job_reference: "KN-465" }) });
  await full.result;
  assertEquals(full.h.notifications, [{ jobReference: "KN-465", amount: 2000, fullyPaid: true }]);

  const deposit = run({
    jobRow: job({ job_reference: "KN-465" }),
    view: { ok: true, status: "PAID", amount: 1000, checkoutReference: JOB_ID },
  });
  await deposit.result;
  assertEquals(deposit.h.notifications, [{ jobReference: "KN-465", amount: 1000, fullyPaid: false }]);
});

Deno.test("no office notification on duplicate, unpaid or failed-update deliveries", async () => {
  const dup = run({ jobRow: job({ payment_status: "paid", deposit_paid: true }), hasOtherClaimedEvent: true });
  assertEquals((await dup.result).outcome, "duplicate");
  assertEquals(dup.h.notifications.length, 0);

  const unpaid = run({ view: { ok: true, status: "PENDING", amount: 2000, checkoutReference: JOB_ID } });
  assertEquals((await unpaid.result).outcome, "not_paid");
  assertEquals(unpaid.h.notifications.length, 0);

  const failed = run({ updateOk: false });
  assertEquals((await failed.result).outcome, "update_failed");
  assertEquals(failed.h.notifications.length, 0);
});

Deno.test("payment notification never crosses tenants — only the owning org's office/admins", async () => {
  // Confirmed live tenant ids.
  const KN_ORG = ORG_ID; // 8c37827f-ce2c-4507-a821-a5e807d89856
  const DUBLIN_ORG = "f1950683-e8b9-41cf-8972-2aa59516850d";
  const CAVAN_ORG = "62d6c1c3-99cc-47fa-80ce-ea0e36f0d52b";

  // Stands in for the edge function's recipient query: office/admin profiles
  // scoped to one organisation_id.
  const profiles = [
    { user_id: "kn-office", role: "office", organisation_id: KN_ORG },
    { user_id: "kn-admin", role: "admin", organisation_id: KN_ORG },
    { user_id: "dublin-office", role: "office", organisation_id: DUBLIN_ORG },
    { user_id: "dublin-admin", role: "admin", organisation_id: DUBLIN_ORG },
    { user_id: "cavan-office", role: "office", organisation_id: CAVAN_ORG },
    { user_id: "cavan-admin", role: "admin", organisation_id: CAVAN_ORG },
  ];
  const recipientsFor = (orgId: string) =>
    profiles.filter((p) => p.organisation_id === orgId).map((p) => p.user_id);

  const notifiedOrgs: string[] = [];
  // Every row that would actually be inserted into notifications.
  const rows: Array<{ recipient_user_id: string; organisation_id: string }> = [];

  const result = await handleSumUpWebhook({
    expectedSecret: "s3cret-token",
    presentedSecret: "s3cret-token",
    body: JSON.stringify({ id: CHECKOUT_ID }),
    loadJobByCheckoutId: () => Promise.resolve(job({ organisation_id: KN_ORG, job_reference: "KN-465" })),
    fetchCheckout: () =>
      Promise.resolve({ ok: true, status: "PAID", amount: 1000, checkoutReference: JOB_ID }),
    updateJob: () => Promise.resolve(true),
    notifyOffice: (e) => {
      notifiedOrgs.push(e.organisationId!);
      for (const userId of recipientsFor(e.organisationId!)) {
        rows.push({ recipient_user_id: userId, organisation_id: e.organisationId! });
      }
      return Promise.resolve();
    },
    now: () => new Date("2026-08-10T09:00:00.000Z"),
  });

  assertEquals(result.outcome, "part_paid");
  assertEquals(notifiedOrgs, [KN_ORG]);
  assertEquals(rows.map((r) => r.recipient_user_id), ["kn-office", "kn-admin"]);
  // Not inserted for, and therefore not visible to, any other tenant.
  assertEquals(rows.every((r) => r.organisation_id === KN_ORG), true);
  for (const outsider of ["dublin-office", "dublin-admin", "cavan-office", "cavan-admin"]) {
    assertEquals(rows.some((r) => r.recipient_user_id === outsider), false);
  }
  assertEquals(rows.filter((r) => r.organisation_id === DUBLIN_ORG).length, 0);
  assertEquals(rows.filter((r) => r.organisation_id === CAVAN_ORG).length, 0);
});

Deno.test("re-delivered callback is claimed once — no paid_at stamp, no notification the second time", async () => {
  const seen = new Set<string>();
  const call = (jobRow: SumUpWebhookJob) => {
    const updates: Array<Record<string, unknown>> = [];
    const notifications: string[] = [];
    const claims: string[] = [];
    return handleSumUpWebhook({
      expectedSecret: "s3cret-token",
      presentedSecret: "s3cret-token",
      body: JSON.stringify({ id: CHECKOUT_ID, event_type: "CHECKOUT_STATUS_CHANGED" }),
      loadJobByCheckoutId: () => Promise.resolve(jobRow),
      fetchCheckout: () =>
        Promise.resolve({ ok: true, status: "PAID", amount: 1000, checkoutReference: JOB_ID }),
      claimEvent: (e) => {
        claims.push(e.checkoutId);
        if (seen.has(e.checkoutId)) return Promise.resolve(false);
        seen.add(e.checkoutId);
        return Promise.resolve(true);
      },
      updateJob: (_id, patch) => {
        updates.push(patch);
        return Promise.resolve(true);
      },
      notifyOffice: () => {
        notifications.push("n");
        return Promise.resolve();
      },
      now: () => new Date("2026-08-10T09:00:00.000Z"),
    }).then((result) => ({ result, updates, notifications, claims }));
  };

  const first = await call(job());
  assertEquals(first.result.outcome, "part_paid");
  assertEquals(first.updates.length, 1);
  assertEquals(first.updates[0].paid_at, "2026-08-10T09:00:00.000Z");
  assertEquals(first.notifications.length, 1);

  // SumUp re-delivers the same checkout id. Job state deliberately left as-is,
  // so only the claim can stop it.
  const retry = await call(job());
  assertEquals(retry.result.outcome, "duplicate");
  assertEquals(retry.claims, [CHECKOUT_ID]);
  assertEquals(retry.updates.length, 0);
  assertEquals(retry.notifications.length, 0);
});

Deno.test("a different checkout id on the same job is still processed", async () => {
  const claimed: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const result = await handleSumUpWebhook({
    expectedSecret: "s3cret-token",
    presentedSecret: "s3cret-token",
    body: JSON.stringify({ id: "99999999-9999-9999-9999-999999999999" }),
    loadJobByCheckoutId: () => Promise.resolve(job({ payment_status: "partial", deposit_paid: true, balance_due: 1000 })),
    fetchCheckout: () => Promise.resolve({ ok: true, status: "PAID", amount: 2000, checkoutReference: JOB_ID }),
    claimEvent: (e) => {
      claimed.push(e.checkoutId);
      return Promise.resolve(true);
    },
    updateJob: (_id, patch) => {
      updates.push(patch);
      return Promise.resolve(true);
    },
    now: () => new Date("2026-08-10T09:00:00.000Z"),
  });
  assertEquals(result.outcome, "paid");
  assertEquals(claimed, ["99999999-9999-9999-9999-999999999999"]);
  assertEquals(updates.length, 1);
});



Deno.test("failed/expired checkout writes no payment state", async () => {
  for (const status of ["FAILED", "EXPIRED", "PENDING"]) {
    const { h, result: p } = run({
      view: { ok: true, status, amount: 2000, checkoutReference: JOB_ID },
    });
    const result = await p;
    assertEquals(result.outcome, "not_paid");
    assertEquals(result.status, 200);
    assertEquals(h.updates.length, 0);
    assertEquals(h.activities, 0);
  }
});

Deno.test("unknown checkout reference writes nothing and is reported, not silent", async () => {
  const { h, result: p } = run({ jobRow: null });
  const result = await p;
  assertEquals(result.outcome, "no_matching_reference");
  assertEquals(result.status, 200);
  assertEquals(h.updates.length, 0);
  assertEquals(h.fetches, 0);
});

Deno.test("a prior claimed event under a different checkout id is treated as duplicate", async () => {
  const { h, result: p } = run({
    jobRow: job({ payment_status: "paid", paid_at: "2026-08-10T08:00:00.000Z", deposit_paid: true }),
    hasOtherClaimedEvent: true,
  });
  const result = await p;
  assertEquals(result.outcome, "duplicate");
  assertEquals(h.priorEventChecks.length, 1);
  assertEquals(h.updates.length, 0);
  assertEquals(h.activities, 0);
  assertEquals(h.messages, 0);
});

Deno.test("duplicate deposit delivery does not double-log when a prior event exists", async () => {
  const { h, result: p } = run({
    jobRow: job({ payment_status: "partial", deposit_paid: true }),
    view: { ok: true, status: "PAID", amount: 1000, checkoutReference: JOB_ID },
    hasOtherClaimedEvent: true,
  });
  const result = await p;
  assertEquals(result.outcome, "duplicate");
  assertEquals(h.updates.length, 0);
  assertEquals(h.activities, 0);
});

// (a) The mis-stamp bug: deposit_paid was stamped by the New Job wizard with no
// payment behind it. With no claimed event on record the payment must process.
Deno.test("mis-stamped deposit_paid with no prior claimed event still processes the payment", async () => {
  const { h, result: p } = run({
    jobRow: job({ payment_status: "unpaid", deposit_paid: true, balance_due: 2000 }),
    view: { ok: true, status: "PAID", amount: 500, checkoutReference: JOB_ID },
    hasOtherClaimedEvent: false,
  });
  const result = await p;
  assertEquals(result.outcome, "part_paid");
  assertEquals(result.status, 200);
  assertEquals(h.updates.length, 1);
  assertEquals(h.updates[0].patch.payment_status, "partial");
  assertEquals(h.updates[0].patch.paid_at, "2026-08-10T09:00:00.000Z");
  assertEquals(h.updates[0].patch.balance_due, 1500);
  assertEquals(h.activities, 1);
  assertEquals(h.messages, 1);
});

// (c) Layer 1 still wins: the same checkout re-delivered never reaches layer 2.
Deno.test("same checkout re-delivered is stopped by claimEvent before the prior-event check", async () => {
  const checks: string[] = [];
  const updates: Array<Record<string, unknown>> = [];
  const result = await handleSumUpWebhook({
    expectedSecret: "s3cret-token",
    presentedSecret: "s3cret-token",
    body: JSON.stringify({ id: CHECKOUT_ID }),
    loadJobByCheckoutId: () => Promise.resolve(job()),
    fetchCheckout: () =>
      Promise.resolve({ ok: true, status: "PAID", amount: 2000, checkoutReference: JOB_ID }),
    claimEvent: () => Promise.resolve(false),
    hasOtherClaimedEvent: (e) => {
      checks.push(e.checkoutId);
      return Promise.resolve(false);
    },
    updateJob: (_id, patch) => {
      updates.push(patch);
      return Promise.resolve(true);
    },
    now: () => new Date("2026-08-10T09:00:00.000Z"),
  });
  assertEquals(result.outcome, "duplicate");
  assertEquals(checks, []);
  assertEquals(updates.length, 0);
});

// (d) A genuine query failure must be retried, never treated as "no prior event".
Deno.test("prior-event lookup failure returns 500 and writes nothing", async () => {
  const { h, result: p } = run({
    hasOtherClaimedEvent: new Error("prior_event_lookup_failed: 42501 permission denied"),
  });
  const result = await p;
  assertEquals(result.outcome, "duplicate_check_failed");
  assertEquals(result.status, 500);
  assertEquals(h.updates.length, 0);
  assertEquals(h.activities, 0);
  assertEquals(h.messages, 0);
  assertEquals(h.notifications.length, 0);
});


Deno.test("a deposit-paid job can still be settled in full later", async () => {
  const { h, result: p } = run({
    jobRow: job({ payment_status: "partial", deposit_paid: true, balance_due: 1000 }),
  });
  const result = await p;
  assertEquals(result.outcome, "paid");
  assertEquals(h.updates[0].patch.balance_due, 0);
});

Deno.test("missing or wrong secret is rejected before any lookup or SumUp call", async () => {
  for (const presented of [null, "", "wrong-token", "s3cret-toke"]) {
    const { h, result: p } = run({ presentedSecret: presented });
    const result = await p;
    assertEquals(result.outcome, "unauthorized");
    assertEquals(result.status, 401);
    assertEquals(h.fetches, 0);
    assertEquals(h.updates.length, 0);
  }
});

Deno.test("unconfigured server secret fails closed", async () => {
  const { result: p } = run({ expectedSecret: "" });
  const result = await p;
  assertEquals(result.outcome, "not_configured");
  assertEquals(result.status, 500);
});

Deno.test("forged body claiming payment is rejected by the SumUp re-fetch", async () => {
  const { h, result: p } = run({
    body: JSON.stringify({ id: CHECKOUT_ID, status: "PAID", amount: 999999 }),
    view: { ok: true, status: "PENDING", amount: 0, checkoutReference: JOB_ID },
  });
  const result = await p;
  assertEquals(result.outcome, "not_paid");
  assertEquals(h.updates.length, 0);
});

Deno.test("reference belonging to another job is refused", async () => {
  const { h, result: p } = run({
    view: { ok: true, status: "PAID", amount: 2000, checkoutReference: "some-other-job" },
  });
  const result = await p;
  assertEquals(result.outcome, "reference_mismatch");
  assertEquals(h.updates.length, 0);
});

Deno.test("SumUp verification failure is retryable and writes nothing", async () => {
  const { h, result: p } = run({ view: { ok: false, error: "sumup_http_503" } });
  const result = await p;
  assertEquals(result.outcome, "verification_failed");
  assertEquals(result.status, 502);
  assertEquals(h.updates.length, 0);
});

Deno.test("unparseable body is acknowledged with 200, not retried", async () => {
  const { result: p } = run({ body: "{not json" });
  const badRequest = await p;
  assertEquals(badRequest.outcome, "bad_request");
  assertEquals(badRequest.status, 200);
});

Deno.test("missing checkout id is acknowledged with 200, not retried", async () => {
  const { result: p } = run({ body: JSON.stringify({ event_type: "X" }) });
  const missing = await p;
  assertEquals(missing.outcome, "missing_checkout_id");
  assertEquals(missing.status, 200);
});

Deno.test("extractCheckoutId handles SumUp's body shapes", () => {
  assertEquals(extractCheckoutId({ id: "a" }), "a");
  assertEquals(extractCheckoutId({ checkout_id: "b" }), "b");
  assertEquals(extractCheckoutId({ payload: { id: "c" } }), "c");
  assertEquals(extractCheckoutId({ resource_id: "d" }), "d");
  assertEquals(extractCheckoutId({}), null);
  assertEquals(extractCheckoutId(null), null);
});

Deno.test("every decided path answers 200 so SumUp does not retry (1m/5m/20m/2h)", async () => {
  const cases = [
    await run({ jobRow: null }).result,
    await run({ view: { ok: true, status: "PAID", amount: 2000, checkoutReference: "other" } }).result,
    await run({ view: { ok: true, status: "FAILED", amount: 0, checkoutReference: JOB_ID } }).result,
    await run({ jobRow: job({ payment_status: "paid", paid_at: "2026-08-10T08:00:00.000Z" }) }).result,
    await run({ body: "{not json" }).result,
    await run({ body: JSON.stringify({ event_type: "X" }) }).result,
    await run({ jobRow: job({ organisation_id: null }) }).result,
    await run({}).result,
    await run({ view: { ok: true, status: "PAID", amount: 1000, checkoutReference: JOB_ID } }).result,
  ];
  for (const c of cases) {
    assertEquals(c.status, 200, `expected 200 for outcome ${c.outcome}`);
  }
});

// ---------------------------------------------------------------------------
// checkout_reference fallback — checkouts created outside this system (Make's
// Scenario 5 calls SumUp directly, so sumup_checkout_id is never written back).
// ---------------------------------------------------------------------------

Deno.test("fallback: unknown checkout id is matched by checkout_reference and backfilled", async () => {
  const { h, result: p } = run({
    jobRow: null,
    discovery: { ok: true, reference: JOB_ID, organisationId: ORG_ID },
    jobById: job(),
  });
  const result = await p;
  assertEquals(result.outcome, "paid");
  assertEquals(result.jobId, JOB_ID);
  assertEquals(h.discoveries, 1);
  assertEquals(h.loadedById, [JOB_ID]);
  assertEquals(h.updates.length, 1);
  assertEquals(h.updates[0].patch.payment_status, "paid");
  // The id is written back so a re-delivery matches directly and is a no-op.
  assertEquals(h.updates[0].patch.sumup_checkout_id, CHECKOUT_ID);
  assertEquals(h.activities, 1);
  assertEquals(h.messages, 1);
});

Deno.test("fallback: a deposit-only Make checkout still records as partial", async () => {
  const { h, result: p } = run({
    jobRow: null,
    discovery: { ok: true, reference: JOB_ID, organisationId: ORG_ID },
    jobById: job(),
    view: { ok: true, status: "PAID", amount: 1000, checkoutReference: JOB_ID },
  });
  const result = await p;
  assertEquals(result.outcome, "part_paid");
  assertEquals(h.updates[0].patch.payment_status, "partial");
  assertEquals(h.updates[0].patch.sumup_checkout_id, CHECKOUT_ID);
});

Deno.test("fallback: still verified against the owning org before any write", async () => {
  const { h, result: p } = run({
    jobRow: null,
    discovery: { ok: true, reference: JOB_ID, organisationId: ORG_ID },
    jobById: job(),
    view: { ok: true, status: "FAILED", amount: 0, checkoutReference: JOB_ID },
  });
  const result = await p;
  assertEquals(result.outcome, "not_paid");
  assertEquals(h.fetches, 1);
  assertEquals(h.updates.length, 0);
});

Deno.test("fallback: reference that matches no job writes nothing (200, logged)", async () => {
  const { h, result: p } = run({
    jobRow: null,
    discovery: { ok: true, reference: "22222222-2222-2222-2222-222222222222", organisationId: ORG_ID },
    jobById: null,
  });
  const result = await p;
  assertEquals(result.outcome, "no_matching_reference");
  assertEquals(result.status, 200);
  assertEquals(h.updates.length, 0);
  assertEquals(h.fetches, 0);
});

Deno.test("fallback: non-uuid / junk reference is refused before touching the database", async () => {
  for (const reference of ["", "   ", "not-a-uuid", "ORDER-123", "'; drop table service_calls; --"]) {
    const { h, result: p } = run({
      jobRow: null,
      discovery: { ok: true, reference, organisationId: ORG_ID },
      jobById: job(),
    });
    const result = await p;
    assertEquals(result.outcome, "no_matching_reference", `reference: ${reference}`);
    assertEquals(result.status, 200);
    assertEquals(h.loadedById.length, 0);
    assertEquals(h.updates.length, 0);
  }
});

Deno.test("fallback: cross-tenant reference is refused, never written", async () => {
  const { h, result: p } = run({
    jobRow: null,
    discovery: { ok: true, reference: JOB_ID, organisationId: "99999999-9999-9999-9999-999999999999" },
    jobById: job(),
  });
  const result = await p;
  assertEquals(result.outcome, "reference_mismatch");
  assertEquals(result.status, 200);
  assertEquals(h.updates.length, 0);
  assertEquals(h.fetches, 0);
});

Deno.test("fallback: transient discovery failure is retryable and writes nothing", async () => {
  const { h, result: p } = run({
    jobRow: null,
    discovery: { ok: false, error: "sumup_http_503" },
    jobById: job(),
  });
  const result = await p;
  assertEquals(result.outcome, "verification_failed");
  assertEquals(result.status, 502);
  assertEquals(h.updates.length, 0);
});

Deno.test("fallback: re-delivery after backfill matches directly and is a no-op", async () => {
  // Second delivery: the id lookup now hits, and an earlier claimed event exists
  // for this job under the first checkout id.
  const { h, result: p } = run({
    jobRow: job({ payment_status: "paid", paid_at: "2026-08-10T09:00:00.000Z", deposit_paid: true }),
    hasOtherClaimedEvent: true,
  });

  const result = await p;
  assertEquals(result.outcome, "duplicate");
  assertEquals(h.discoveries, 0);
  assertEquals(h.updates.length, 0);
  assertEquals(h.activities, 0);
});

Deno.test("fallback is optional — without the deps, behaviour is unchanged", async () => {
  const result = await handleSumUpWebhook({
    expectedSecret: "s3cret-token",
    presentedSecret: "s3cret-token",
    body: JSON.stringify({ id: CHECKOUT_ID }),
    loadJobByCheckoutId: () => Promise.resolve(null),
    fetchCheckout: () => Promise.resolve({ ok: true, status: "PAID", amount: 1 }),
    updateJob: () => Promise.resolve(true),
  });
  assertEquals(result.outcome, "no_matching_reference");
  assertEquals(result.status, 200);
});

Deno.test("writes revenue when the job has no total (Make-created checkout)", async () => {
  const { h, result: p } = run({
    jobRow: job({ revenue: null, balance_due: null }),
    view: { ok: true, status: "PAID", amount: 120 },
  });
  const result = await p;
  assertEquals(result.outcome, "paid");
  assertEquals(h.updates[0].patch.revenue, 120);
  assertEquals(h.updates[0].patch.payment_status, "paid");
});

Deno.test("never overwrites a known job total", async () => {
  const { h, result: p } = run({
    jobRow: job({ revenue: 400, balance_due: 400 }),
    view: { ok: true, status: "PAID", amount: 120 },
  });
  const result = await p;
  assertEquals(result.outcome, "part_paid");
  assertEquals("revenue" in h.updates[0].patch, false);
  assertEquals(h.updates[0].patch.payment_status, "partial");
});

// ---------------------------------------------------------------------------
// BJ-0044 — declined checkouts used to be completely silent: no event row, no
// job write, no alert. The office now gets told, and nothing else changes.
// ---------------------------------------------------------------------------

Deno.test("a FAILED checkout alerts the office and writes nothing else", async () => {
  const { h, result: p } = run({
    jobRow: job({ job_reference: "KN-480", revenue: 22, balance_due: 11 }),
    view: { ok: true, status: "FAILED", amount: 11, checkoutReference: JOB_ID },
  });
  const result = await p;

  assertEquals(result.outcome, "not_paid");
  assertEquals(result.status, 200);
  assertEquals(h.failureAlerts, [{
    serviceCallId: JOB_ID,
    jobReference: "KN-480",
    checkoutId: CHECKOUT_ID,
    status: "FAILED",
    amount: 11,
  }]);
  // The money path must stay untouched, and the checkout id must stay claimable.
  assertEquals(h.updates.length, 0);
  assertEquals(h.claims, 0);
  assertEquals(h.activities, 0);
  assertEquals(h.messages, 0);
  assertEquals(h.notifications.length, 0);
});

Deno.test("EXPIRED and CANCELLED also alert; PENDING and unknown statuses stay silent", async () => {
  for (const status of ["EXPIRED", "CANCELLED", "CANCELED"]) {
    const { h, result: p } = run({
      view: { ok: true, status, amount: 11, checkoutReference: JOB_ID },
    });
    assertEquals((await p).outcome, "not_paid");
    assertEquals(h.failureAlerts.length, 1);
    assertEquals(h.failureAlerts[0].status, status);
  }

  for (const status of ["PENDING", "", "SOMETHING_NEW"]) {
    const { h, result: p } = run({
      view: { ok: true, status, amount: 11, checkoutReference: JOB_ID },
    });
    assertEquals((await p).outcome, "not_paid");
    assertEquals(h.failureAlerts.length, 0);
    assertEquals(h.updates.length, 0);
  }
});

Deno.test("a throwing failure alert never changes the outcome and never writes", async () => {
  const { h, result: p } = run({
    view: { ok: true, status: "FAILED", amount: 11, checkoutReference: JOB_ID },
    failureAlert: new Error("notifications insert exploded"),
  });
  const result = await p;
  assertEquals(result.outcome, "not_paid");
  assertEquals(result.status, 200);
  assertEquals(h.updates.length, 0);
  assertEquals(h.claims, 0);
});

Deno.test("a paid checkout is unaffected by the failure path", async () => {
  const { h, result: p } = run({ jobRow: job({ job_reference: "KN-465" }) });
  const result = await p;
  assertEquals(result.outcome, "paid");
  assertEquals(h.failureAlerts.length, 0);
  assertEquals(h.updates.length, 1);
  assertEquals(h.claims, 1);
  assertEquals(h.notifications.length, 1);
});

// ---------------------------------------------------------------------------
// BJ-0044 (timeline) — the same terminal failures also write ONE
// customer_activity entry, so the decline is visible on the customer profile.
// ---------------------------------------------------------------------------

Deno.test("a FAILED checkout writes one payment_failed timeline entry", async () => {
  const { h, result: p } = run({
    jobRow: job({ job_reference: "KN-480", revenue: 22, balance_due: 11 }),
    view: { ok: true, status: "FAILED", amount: 11, checkoutReference: JOB_ID },
  });
  assertEquals((await p).outcome, "not_paid");

  assertEquals(h.failureActivities, [{
    organisationId: ORG_ID,
    customerId: "cust-1",
    serviceCallId: JOB_ID,
    amount: 11,
    fullyPaid: false,
    checkoutId: CHECKOUT_ID,
    status: "FAILED",
  }]);
  // Still nothing on the money path.
  assertEquals(h.updates.length, 0);
  assertEquals(h.claims, 0);
  assertEquals(h.activities, 0);
  assertEquals(h.messages, 0);
});

Deno.test("a failed full-amount attempt is not labelled a deposit", async () => {
  const { h, result: p } = run({
    jobRow: job({ revenue: 11, balance_due: 11 }),
    view: { ok: true, status: "FAILED", amount: 11, checkoutReference: JOB_ID },
  });
  assertEquals((await p).outcome, "not_paid");
  assertEquals(h.failureActivities.length, 1);
  assertEquals(h.failureActivities[0].fullyPaid, true);
});

Deno.test("EXPIRED and CANCELLED log once each; non-terminal statuses log nothing", async () => {
  for (const status of ["FAILED", "EXPIRED", "CANCELLED", "CANCELED"]) {
    const { h, result: p } = run({
      view: { ok: true, status, amount: 11, checkoutReference: JOB_ID },
    });
    assertEquals((await p).outcome, "not_paid");
    assertEquals(h.failureActivities.length, 1);
    assertEquals(h.failureActivities[0].status, status);
  }

  for (const status of ["PENDING", "", "SOMETHING_NEW"]) {
    const { h, result: p } = run({
      view: { ok: true, status, amount: 11, checkoutReference: JOB_ID },
    });
    assertEquals((await p).outcome, "not_paid");
    assertEquals(h.failureActivities.length, 0);
  }
});

Deno.test("a failed checkout on a job with no customer writes no timeline entry", async () => {
  const { h, result: p } = run({
    jobRow: job({ customer_id: null }),
    view: { ok: true, status: "FAILED", amount: 11, checkoutReference: JOB_ID },
  });
  assertEquals((await p).outcome, "not_paid");
  assertEquals(h.failureActivities.length, 0);
  // The office alert still fires — it does not need a customer row.
  assertEquals(h.failureAlerts.length, 1);
});

Deno.test("a throwing failure timeline write never changes the outcome", async () => {
  const { h, result: p } = run({
    view: { ok: true, status: "FAILED", amount: 11, checkoutReference: JOB_ID },
    activityLog: new Error("customer_activity insert exploded"),
  });
  const result = await p;
  assertEquals(result.outcome, "not_paid");
  assertEquals(result.status, 200);
  assertEquals(h.updates.length, 0);
  assertEquals(h.claims, 0);
});

Deno.test("a paid checkout logs payment_received only, never payment_failed", async () => {
  const { h, result: p } = run({ jobRow: job({ job_reference: "KN-465" }) });
  assertEquals((await p).outcome, "paid");
  assertEquals(h.activities, 1);
  assertEquals(h.failureActivities.length, 0);
});

// --- BJ-0050a: both reference shapes are permanently supported ---

Deno.test("jobIdFromCheckoutReference: attempt-numbered reference yields the job id", () => {
  assertEquals(
    jobIdFromCheckoutReference("11111111-1111-1111-1111-111111111111::3"),
    "11111111-1111-1111-1111-111111111111",
  );
});

Deno.test("jobIdFromCheckoutReference: legacy raw uuid passes through unchanged", () => {
  assertEquals(
    jobIdFromCheckoutReference("11111111-1111-1111-1111-111111111111"),
    "11111111-1111-1111-1111-111111111111",
  );
});

Deno.test("jobIdFromCheckoutReference: trims and tolerates junk", () => {
  assertEquals(jobIdFromCheckoutReference("  abc::1  "), "abc");
  assertEquals(jobIdFromCheckoutReference(""), "");
});
