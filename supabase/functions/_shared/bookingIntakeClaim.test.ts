import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  claimBookingIntake,
  recordFailedBookingIntake,
  releaseBookingIntakeClaim,
} from "./bookingIntakeClaim.ts";

// Minimal in-memory stand-in for the claim table with the (org, fingerprint) unique index.
function fakeDb() {
  const claims: { id: string; organisation_id: string; fingerprint: string; service_call_id: string | null; created_at: string }[] = [];
  const failed: Record<string, unknown>[] = [];
  let n = 0;
  const client = {
    claims,
    failed,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let op = "select";
      let payload: any = null;
      const q: any = {
        delete() { op = "delete"; return q; },
        insert(p: any) { op = "insert"; payload = p; return q; },
        update(p: any) { op = "update"; payload = p; return q; },
        select() { return q; },
        eq(k: string, v: unknown) { filters[k] = v; return q; },
        lt() { filters.__stale = true; return q; },
        single() { return q.run(); },
        maybeSingle() { return q.run(); },
        then(res: any, rej: any) { return q.run().then(res, rej); },
        async run() {
          if (table === "failed_booking_intakes") { failed.push(payload); return { error: null }; }
          const match = (c: any) => Object.entries(filters).every(([k, v]) => k === "__stale" ? false : c[k] === v);
          if (op === "insert") {
            if (claims.some((c) => c.organisation_id === payload.organisation_id && c.fingerprint === payload.fingerprint)) {
              return { data: null, error: { code: "23505" } };
            }
            const row = { id: `c${++n}`, service_call_id: null, created_at: new Date().toISOString(), ...payload };
            claims.push(row);
            return { data: { id: row.id }, error: null };
          }
          if (op === "delete") {
            for (let i = claims.length - 1; i >= 0; i--) if (match(claims[i])) claims.splice(i, 1);
            return { error: null };
          }
          if (op === "update") { claims.filter(match).forEach((c) => Object.assign(c, payload)); return { error: null }; }
          return { data: claims.find(match) ?? null, error: null };
        },
      };
      return q;
    },
  };
  return client;
}

const parts = { phone: "0871234567", jobType: "Boiler Service", address: "1 Test Rd", scheduledDate: "2026-10-01", timeBlock: "Morning" };

Deno.test("failed booking: released claim lets the retry claim again (no false success)", async () => {
  const db = fakeDb();
  const first = await claimBookingIntake(db, "org-a", parts);
  assertEquals(first.outcome, "claimed");
  // job creation failed -> release
  await releaseBookingIntakeClaim(db, (first as any).claimId);
  const retry = await claimBookingIntake(db, "org-a", parts);
  assertEquals(retry.outcome, "claimed");
});

Deno.test("claim without a job yet is pending, never a false duplicate", async () => {
  const db = fakeDb();
  await claimBookingIntake(db, "org-a", parts);
  const second = await claimBookingIntake(db, "org-a", parts);
  assertEquals(second.outcome, "pending");
});

Deno.test("claim with an attached job is a true duplicate carrying the job id", async () => {
  const db = fakeDb();
  await claimBookingIntake(db, "org-a", parts);
  db.claims[0].service_call_id = "job-1";
  const second = await claimBookingIntake(db, "org-a", parts);
  assertEquals(second.outcome, "duplicate");
  assertEquals((second as any).existingServiceCallId, "job-1");
});

Deno.test("claims are tenant-scoped", async () => {
  const db = fakeDb();
  await claimBookingIntake(db, "org-a", parts);
  const other = await claimBookingIntake(db, "org-b", parts);
  assertEquals(other.outcome, "claimed");
});

Deno.test("failed intake is recorded with its organisation; skipped without one", async () => {
  const db = fakeDb();
  await recordFailedBookingIntake(db, { organisationId: "org-a", submissionId: "s1", sourceFunction: "tally-incoming-job", errorMessage: "x", payload: { a: 1 } });
  await recordFailedBookingIntake(db, { organisationId: null, submissionId: "s2", sourceFunction: "tally-incoming-job", errorMessage: "x", payload: {} });
  assertEquals(db.failed.length, 1);
  assertEquals(db.failed[0].organisation_id, "org-a");
});
