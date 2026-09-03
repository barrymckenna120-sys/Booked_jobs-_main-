// Lookup failures must never masquerade as "no matching attempt" / "no row".
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DeliveryLookupError,
  isDeliveryLookupError,
  recordDelivered,
  recordProviderFailure,
} from "./deliveryStatus.ts";

type Row = Record<string, unknown> | null;

/** Minimal Supabase stub: one attempt lookup + swallowed updates/inserts. */
function client(lookup: { data: Row; error: { message: string } | null }) {
  const updates: string[] = [];
  const chain = (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => lookup,
      }),
    }),
    update: () => {
      updates.push(table);
      const self: any = {
        eq: () => self,
        then: (r: (v: unknown) => unknown) => r({ error: null }),
      };
      return self;
    },
    insert: async () => ({ error: null }),
  });
  return { from: (t: string) => chain(t), updates };
}

Deno.test("recordDelivered: genuine lookup error throws DeliveryLookupError", async () => {
  const c = client({ data: null, error: { message: "connection reset" } });
  const err = await assertRejects(() => recordDelivered(c as any, "msg-1", "delivered"));
  assertEquals(isDeliveryLookupError(err), true);
  assertEquals(err instanceof DeliveryLookupError, true);
  assertEquals(c.updates.length, 0);
});

Deno.test("recordProviderFailure: genuine lookup error throws DeliveryLookupError", async () => {
  const c = client({ data: null, error: { message: "permission denied" } });
  const err = await assertRejects(() => recordProviderFailure(c as any, "msg-1", "failed"));
  assertEquals(isDeliveryLookupError(err), true);
  assertEquals(c.updates.length, 0);
});

Deno.test("true absence still returns matched:false, no writes", async () => {
  const a = client({ data: null, error: null });
  assertEquals(await recordDelivered(a as any, "msg-x"), { matched: false, changed: false });
  assertEquals(a.updates.length, 0);

  const b = client({ data: null, error: null });
  assertEquals(await recordProviderFailure(b as any, "msg-x", "failed"), {
    matched: false,
    changed: false,
  });
  assertEquals(b.updates.length, 0);
});

Deno.test("repeat callbacks stay idempotent (changed:false, no writes)", async () => {
  const delivered = client({
    data: { id: "a1", delivery_id: "d1", organisation_id: "o1", delivered_at: "2026-09-01T00:00:00Z" },
    error: null,
  });
  assertEquals(await recordDelivered(delivered as any, "msg-1"), { matched: true, changed: false });
  assertEquals(delivered.updates.length, 0);

  const failedTwice = client({
    data: { id: "a1", delivery_id: "d1", organisation_id: "o1", outcome: "failed", delivered_at: null },
    error: null,
  });
  assertEquals(await recordProviderFailure(failedTwice as any, "msg-1", "failed"), {
    matched: true,
    changed: false,
  });
  assertEquals(failedTwice.updates.length, 0);

  // A provider failure never contradicts a confirmed delivery.
  const alreadyDelivered = client({
    data: {
      id: "a1",
      delivery_id: "d1",
      organisation_id: "o1",
      outcome: "accepted",
      delivered_at: "2026-09-01T00:00:00Z",
    },
    error: null,
  });
  assertEquals(await recordProviderFailure(alreadyDelivered as any, "msg-1", "failed"), {
    matched: true,
    changed: false,
  });
  assertEquals(alreadyDelivered.updates.length, 0);
});
