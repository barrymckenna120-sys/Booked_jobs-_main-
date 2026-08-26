import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deliverPaymentAlert,
  deliverPaymentFailedAlert,
  type PaymentCollectedEvent,
  type PaymentFailedEvent,
} from "./paymentAlertDelivery.ts";
import {
  handleSumUpWebhook,
  type SumUpCheckoutView,
  type SumUpWebhookJob,
} from "./sumupWebhook.ts";

const JOB_ID = "11111111-1111-1111-1111-111111111111";
const ORG_ID = "f1950683-e8b9-41cf-8972-2aa59516850d";
const CHECKOUT_ID = "c-99999999-9999-9999-9999-999999999999";

/* ------------------------------------------------------------------ *
 * Chainable fake client.
 *
 * Extends the hand-rolled pattern in auditLog.test.ts to cover the call
 * shapes this module actually uses:
 *   from("notifications").select().eq().eq().eq().limit()  -> dedupe read
 *   from("profiles").select().eq().eq()                    -> active staff
 *   from("customers").select().eq().maybeSingle()          -> customer name
 *   from("notifications").insert(rows)                     -> captured
 *
 * The builder is thenable so a chain that ends on .eq() (profiles) resolves
 * exactly like one that ends on .limit() (notifications).
 * ------------------------------------------------------------------ */
interface Seed {
  existingNotifications?: unknown[];
  dupError?: { message: string } | null;
  staff?: Array<{
    user_id: string;
    role: string;
    is_active: boolean;
    receives_ops_notifications?: boolean;
  }>;
  staffError?: { message: string } | null;
  customerName?: string | null;
  insertError?: { code?: string; message: string } | null;
}

interface FakeDb {
  // deno-lint-ignore no-explicit-any
  client: { from: (table: string) => any };
  inserts: Array<{ table: string; rows: Record<string, unknown>[] }>;
  /** Filters seen per table, so we can prove the dedupe key is the checkout. */
  filters: Array<{ table: string; column: string; value: unknown }>;
}

function makeDb(seed: Seed = {}): FakeDb {
  const inserts: FakeDb["inserts"] = [];
  const filters: FakeDb["filters"] = [];

  const resultFor = (table: string) => {
    if (table === "notifications") {
      return { data: seed.existingNotifications ?? [], error: seed.dupError ?? null };
    }
    if (table === "profiles") {
      return { data: seed.staff ?? [], error: seed.staffError ?? null };
    }
    if (table === "customers") {
      return {
        data: seed.customerName === undefined ? null : { name: seed.customerName },
        error: null,
      };
    }
    return { data: null, error: null };
  };

  const builder = (table: string) => {
    // deno-lint-ignore no-explicit-any
    const self: any = {
      select: () => self,
      eq: (column: string, value: unknown) => {
        filters.push({ table, column, value });
        return self;
      },
      limit: () => Promise.resolve(resultFor(table)),
      maybeSingle: () => Promise.resolve(resultFor(table)),
      // deno-lint-ignore no-explicit-any
      then: (onOk: any, onErr: any) => Promise.resolve(resultFor(table)).then(onOk, onErr),
      insert: (rows: Record<string, unknown>[]) => {
        inserts.push({ table, rows });
        return Promise.resolve({ error: seed.insertError ?? null });
      },
    };
    return self;
  };

  return { client: { from: (table: string) => builder(table) }, inserts, filters };
}

/** Captures console output so we can assert on the log lines. */
async function capturingLogs<T>(fn: () => Promise<T>): Promise<{ out: T; logs: string[] }> {
  const logs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => logs.push(a.map(String).join(" "));
  try {
    const out = await fn();
    return { out, logs };
  } finally {
    console.log = origLog;
    console.error = origErr;
  }
}

const collected = (over: Partial<PaymentCollectedEvent> = {}): PaymentCollectedEvent => ({
  organisationId: ORG_ID,
  serviceCallId: JOB_ID,
  customerId: "cust-1",
  jobReference: "DG-434",
  amount: 5,
  fullyPaid: false,
  outstanding: 15,
  checkoutId: CHECKOUT_ID,
  status: "PAID",
  ...over,
});

const failed = (over: Partial<PaymentFailedEvent> = {}): PaymentFailedEvent => ({
  organisationId: ORG_ID,
  serviceCallId: JOB_ID,
  customerId: "cust-1",
  jobReference: "DG-434",
  checkoutId: CHECKOUT_ID,
  status: "FAILED",
  amount: 5,
  ...over,
});

const NO_OFFICE_STAFF = [
  { user_id: "sa-1", role: "superadmin", is_active: true, receives_ops_notifications: true },
  { user_id: "eng-1", role: "engineer", is_active: true, receives_ops_notifications: false },
];

const OFFICE_STAFF = [
  { user_id: "off-1", role: "office", is_active: true, receives_ops_notifications: false },
  { user_id: "adm-1", role: "admin", is_active: true, receives_ops_notifications: false },
  { user_id: "sa-1", role: "superadmin", is_active: true, receives_ops_notifications: true },
];

/* ================= 1. No office/admin -> ops tier ================= */

Deno.test("collected: org with no office/admin alerts the ops-flagged user only", async () => {
  const db = makeDb({ staff: NO_OFFICE_STAFF, customerName: "Paula White" });
  const stamped: Array<[string, string]> = [];

  const { logs } = await capturingLogs(() =>
    deliverPaymentAlert({
      supabase: db.client,
      event: collected(),
      recordAttemptStatus: (c, s) => {
        stamped.push([c, s]);
        return Promise.resolve();
      },
    })
  );

  assertEquals(db.inserts.length, 1);
  assertEquals(db.inserts[0].table, "notifications");
  assertEquals(db.inserts[0].rows.length, 1);
  const row = db.inserts[0].rows[0];
  assertEquals(row.recipient_user_id, "sa-1");
  assertEquals(row.notification_type, "payment_collected");
  assertEquals(row.role, "office");
  assertEquals(row.job_id, JOB_ID);
  assertEquals((row.metadata as Record<string, unknown>).checkout_id, CHECKOUT_ID);
  assertEquals((row.metadata as Record<string, unknown>).outstanding, 15);
  assertEquals(stamped, [[CHECKOUT_ID, "PAID"]]);
  assertEquals(
    logs.some((l) => l.includes("routed to ops_flag")),
    true,
  );
  assertEquals(logs.some((l) => l.includes("PAYMENT_ALERT_NO_RECIPIENTS")), false);
  // The dedupe read must key on the checkout, not just the job.
  assertEquals(
    db.filters.some((f) => f.column === "metadata->>checkout_id" && f.value === CHECKOUT_ID),
    true,
  );
});

Deno.test("failed: org with no office/admin alerts the ops-flagged user only", async () => {
  const db = makeDb({ staff: NO_OFFICE_STAFF, customerName: "Paula White" });

  const { logs } = await capturingLogs(() =>
    deliverPaymentFailedAlert({
      supabase: db.client,
      event: failed(),
      recordAttemptStatus: () => Promise.resolve(),
    })
  );

  assertEquals(db.inserts.length, 1);
  assertEquals(db.inserts[0].rows.length, 1);
  const row = db.inserts[0].rows[0];
  assertEquals(row.recipient_user_id, "sa-1");
  assertEquals(row.notification_type, "payment_failed");
  assertEquals(row.title, "Payment failed — DG-434");
  assertEquals(
    row.body,
    "€5.00 card payment on DG-434 for Paula White did not go through — the card payment was declined. That payment link no longer works; send a new one.",
  );
  assertEquals(logs.some((l) => l.includes("routed to ops_flag")), true);
});

/* ============ 2. Every tier empty -> loud, no insert ============ */

Deno.test("collected: no recipients in any tier logs PAYMENT_ALERT_NO_RECIPIENTS and inserts nothing", async () => {
  const db = makeDb({
    staff: [{ user_id: "eng-1", role: "engineer", is_active: true, receives_ops_notifications: false }],
  });

  const { logs } = await capturingLogs(() =>
    deliverPaymentAlert({
      supabase: db.client,
      event: collected(),
      recordAttemptStatus: () => Promise.resolve(),
    })
  );

  assertEquals(db.inserts.length, 0);
  const line = logs.find((l) => l.includes("PAYMENT_ALERT_NO_RECIPIENTS"));
  assertEquals(typeof line, "string");
  assertEquals(line!.includes("kind=payment_collected"), true);
  assertEquals(line!.includes(`job_id=${JOB_ID}`), true);
  assertEquals(line!.includes(`checkout_id=${CHECKOUT_ID}`), true);
  assertEquals(line!.includes(`org=${ORG_ID}`), true);
});

Deno.test("failed: no recipients in any tier logs PAYMENT_ALERT_NO_RECIPIENTS and inserts nothing", async () => {
  const db = makeDb({ staff: [] });

  const { logs } = await capturingLogs(() =>
    deliverPaymentFailedAlert({
      supabase: db.client,
      event: failed(),
      recordAttemptStatus: () => Promise.resolve(),
    })
  );

  assertEquals(db.inserts.length, 0);
  const line = logs.find((l) => l.includes("PAYMENT_ALERT_NO_RECIPIENTS"));
  assertEquals(typeof line, "string");
  assertEquals(line!.includes("kind=payment_failed"), true);
});

/* ====== 3. Office/admin present -> unchanged (regression guard) ====== */

Deno.test("collected: office/admin present gets both, no ops/superadmin leakage", async () => {
  const db = makeDb({ staff: OFFICE_STAFF, customerName: "Paula White" });

  const { logs } = await capturingLogs(() =>
    deliverPaymentAlert({
      supabase: db.client,
      event: collected(),
      recordAttemptStatus: () => Promise.resolve(),
    })
  );

  assertEquals(db.inserts.length, 1);
  assertEquals(
    db.inserts[0].rows.map((r) => r.recipient_user_id),
    ["off-1", "adm-1"],
  );
  // No tier-routing log at all on the healthy path.
  assertEquals(logs.some((l) => l.includes("routed to")), false);
  assertEquals(logs.some((l) => l.includes("PAYMENT_ALERT_NO_RECIPIENTS")), false);
});

Deno.test("failed: office/admin present gets both, no ops/superadmin leakage", async () => {
  const db = makeDb({ staff: OFFICE_STAFF, customerName: "Paula White" });

  await capturingLogs(() =>
    deliverPaymentFailedAlert({
      supabase: db.client,
      event: failed(),
      recordAttemptStatus: () => Promise.resolve(),
    })
  );

  assertEquals(db.inserts.length, 1);
  assertEquals(
    db.inserts[0].rows.map((r) => r.recipient_user_id),
    ["off-1", "adm-1"],
  );
});

/* ===================== dedupe + failure modes ===================== */

Deno.test("collected: existing alert for the same checkout inserts nothing but still stamps the attempt", async () => {
  const db = makeDb({ existingNotifications: [{ id: "n-1" }], staff: OFFICE_STAFF });
  const stamped: Array<[string, string]> = [];

  await capturingLogs(() =>
    deliverPaymentAlert({
      supabase: db.client,
      event: collected(),
      recordAttemptStatus: (c, s) => {
        stamped.push([c, s]);
        return Promise.resolve();
      },
    })
  );

  assertEquals(db.inserts.length, 0);
  assertEquals(stamped, [[CHECKOUT_ID, "PAID"]]);
});

Deno.test("failed: existing alert for the same checkout inserts nothing, attempt already stamped", async () => {
  const db = makeDb({ existingNotifications: [{ id: "n-1" }], staff: OFFICE_STAFF });
  const stamped: Array<[string, string]> = [];

  await capturingLogs(() =>
    deliverPaymentFailedAlert({
      supabase: db.client,
      event: failed(),
      recordAttemptStatus: (c, s) => {
        stamped.push([c, s]);
        return Promise.resolve();
      },
    })
  );

  assertEquals(db.inserts.length, 0);
  assertEquals(stamped, [[CHECKOUT_ID, "FAILED"]]);
});

Deno.test("failed: a raced unique-violation insert is treated as already-alerted, not an error", async () => {
  const db = makeDb({
    staff: OFFICE_STAFF,
    insertError: { code: "23505", message: "duplicate key" },
  });

  const { logs } = await capturingLogs(() =>
    deliverPaymentFailedAlert({
      supabase: db.client,
      event: failed(),
      recordAttemptStatus: () => Promise.resolve(),
    })
  );

  assertEquals(logs.some((l) => l.includes("(raced)")), true);
  assertEquals(logs.some((l) => l.includes("insert failed")), false);
});

Deno.test("collected: a dedupe read failure skips the alert rather than double-sending", async () => {
  const db = makeDb({ dupError: { message: "boom" }, staff: OFFICE_STAFF });

  await capturingLogs(() =>
    deliverPaymentAlert({
      supabase: db.client,
      event: collected(),
      recordAttemptStatus: () => Promise.resolve(),
    })
  );

  assertEquals(db.inserts.length, 0);
});

Deno.test("collected: a staff lookup failure skips the alert without throwing", async () => {
  const db = makeDb({ staffError: { message: "nope" } });

  await capturingLogs(() =>
    deliverPaymentAlert({
      supabase: db.client,
      event: collected(),
      recordAttemptStatus: () => Promise.resolve(),
    })
  );

  assertEquals(db.inserts.length, 0);
});

/* ============ handler wiring: outcome is unaffected ============ */

function jobRow(): SumUpWebhookJob {
  return {
    id: JOB_ID,
    organisation_id: ORG_ID,
    customer_id: "cust-1",
    revenue: 20,
    balance_due: 20,
    deposit_paid: false,
    payment_status: "unpaid",
    paid_at: null,
  };
}

/** Runs the real handler with the real deliverer wired to a fake client. */
function runHandler(view: SumUpCheckoutView, db: FakeDb) {
  return handleSumUpWebhook({
    expectedSecret: "s3cret-token",
    presentedSecret: "s3cret-token",
    body: JSON.stringify({ id: CHECKOUT_ID, event_type: "CHECKOUT_STATUS_CHANGED" }),
    loadJobByCheckoutId: () => Promise.resolve(jobRow()),
    loadJobById: () => Promise.resolve(null),
    discoverCheckout: () =>
      Promise.resolve({ ok: true, reference: null, organisationId: null }),
    fetchCheckout: () => Promise.resolve(view),
    updateJob: () => Promise.resolve(true),
    logActivity: () => Promise.resolve(),
    logMessage: () => Promise.resolve(),
    claimEvent: () => Promise.resolve(true),
    notifyOffice: (e) =>
      deliverPaymentAlert({
        supabase: db.client,
        event: e as PaymentCollectedEvent,
        recordAttemptStatus: () => Promise.resolve(),
      }),
    notifyPaymentFailed: (e) =>
      deliverPaymentFailedAlert({
        supabase: db.client,
        event: e as PaymentFailedEvent,
        recordAttemptStatus: () => Promise.resolve(),
      }),
  });
}

Deno.test("handler still returns outcome 'paid' when the alert routes to the ops tier", async () => {
  const db = makeDb({ staff: NO_OFFICE_STAFF, customerName: "Paula White" });
  const { out } = await capturingLogs(() =>
    runHandler({ ok: true, status: "PAID", amount: 500, checkoutReference: JOB_ID }, db)
  );

  assertEquals(out.outcome, "paid");
  assertEquals(db.inserts.length, 1);
  assertEquals(db.inserts[0].rows[0].recipient_user_id, "sa-1");
});

Deno.test("handler outcome is unchanged when no tier has recipients", async () => {
  const db = makeDb({ staff: [] });
  const { out, logs } = await capturingLogs(() =>
    runHandler({ ok: true, status: "PAID", amount: 500, checkoutReference: JOB_ID }, db)
  );

  assertEquals(out.outcome, "paid");
  assertEquals(db.inserts.length, 0);
  assertEquals(logs.some((l) => l.includes("PAYMENT_ALERT_NO_RECIPIENTS")), true);
});

Deno.test("handler failure path still delivers the failed alert via the ops tier", async () => {
  const db = makeDb({ staff: NO_OFFICE_STAFF, customerName: "Paula White" });
  const { out } = await capturingLogs(() =>
    runHandler({ ok: true, status: "FAILED", amount: 500, checkoutReference: JOB_ID }, db)
  );

  assertEquals(db.inserts.length, 1);
  assertEquals(db.inserts[0].rows[0].notification_type, "payment_failed");
  assertEquals(out.outcome, "failed");
});
