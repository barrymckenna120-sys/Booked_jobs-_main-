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
  fetches: number;
  discoveries: number;
  loadedById: string[];
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
}) {
  const h: Harness = {
    updates: [],
    activities: 0,
    messages: 0,
    fetches: 0,
    discoveries: 0,
    loadedById: [],
  };
  const result = handleSumUpWebhook({
    expectedSecret: opts.expectedSecret === undefined ? "s3cret-token" : opts.expectedSecret,
    presentedSecret: opts.presentedSecret === undefined ? "s3cret-token" : opts.presentedSecret,
    body: opts.body ?? JSON.stringify({ id: CHECKOUT_ID, event_type: "CHECKOUT_STATUS_CHANGED" }),
    loadJobByCheckoutId: () => Promise.resolve(opts.jobRow === undefined ? job() : opts.jobRow),
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
    logActivity: () => {
      h.activities++;
      return Promise.resolve();
    },
    logMessage: () => {
      h.messages++;
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

Deno.test("deposit payment sets partial + deposit_paid and leaves paid_at unset", async () => {
  const { h, result: p } = run({
    view: { ok: true, status: "PAID", amount: 1000, checkoutReference: JOB_ID },
  });
  const result = await p;
  assertEquals(result.outcome, "part_paid");
  assertEquals(h.updates[0].patch.payment_status, "partial");
  assertEquals(h.updates[0].patch.deposit_paid, true);
  assertEquals(h.updates[0].patch.balance_due, 1000);
  assertEquals("paid_at" in h.updates[0].patch, false);
  assertEquals(h.activities, 1);
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

Deno.test("duplicate delivery of the same paid event is a no-op", async () => {
  const { h, result: p } = run({
    jobRow: job({ payment_status: "paid", paid_at: "2026-08-10T08:00:00.000Z", deposit_paid: true }),
  });
  const result = await p;
  assertEquals(result.outcome, "duplicate");
  assertEquals(h.updates.length, 0);
  assertEquals(h.activities, 0);
  assertEquals(h.messages, 0);
});

Deno.test("duplicate deposit delivery does not double-log", async () => {
  const { h, result: p } = run({
    jobRow: job({ payment_status: "partial", deposit_paid: true }),
    view: { ok: true, status: "PAID", amount: 1000, checkoutReference: JOB_ID },
  });
  const result = await p;
  assertEquals(result.outcome, "duplicate");
  assertEquals(h.updates.length, 0);
  assertEquals(h.activities, 0);
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
  // Second delivery: the id lookup now hits, and the job is already paid.
  const { h, result: p } = run({
    jobRow: job({ payment_status: "paid", paid_at: "2026-08-10T09:00:00.000Z", deposit_paid: true }),
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
