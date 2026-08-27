import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cooldownWindowStart,
  isDuplicateRenewalSend,
  RENEWAL_REMINDER_COOLDOWN_MS,
} from "./renewalSendGuard.ts";

const NOW = new Date("2026-08-25T15:49:14.708Z");
const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

Deno.test("REGRESSION: a second send 600ms after the first is suppressed", () => {
  // Exactly the Dublin Gas duplicate: two renewal_reminder rows, same second.
  const rows = [{ sent_at: iso(639), status: "sent" }];
  const d = isDuplicateRenewalSend(rows, NOW);
  assertEquals(d.duplicate, true);
  assertEquals(d.reason, "duplicate_recent_reminder");
});

Deno.test("REGRESSION: an in-flight 'pending' row blocks a concurrent send", () => {
  const d = isDuplicateRenewalSend([{ sent_at: iso(50), status: "pending" }], NOW);
  assertEquals(d.duplicate, true);
});

Deno.test("no prior reminders means send", () => {
  assertEquals(isDuplicateRenewalSend([], NOW).duplicate, false);
  assertEquals(isDuplicateRenewalSend(null, NOW).duplicate, false);
  assertEquals(isDuplicateRenewalSend(undefined, NOW).duplicate, false);
});

Deno.test("a failed send does not block a retry — the customer got nothing", () => {
  assertEquals(
    isDuplicateRenewalSend([{ sent_at: iso(1000), status: "failed" }], NOW).duplicate,
    false,
  );
});

Deno.test("delivered/read rows block just like sent", () => {
  for (const status of ["delivered", "read", "SENT"]) {
    assertEquals(
      isDuplicateRenewalSend([{ sent_at: iso(1000), status }], NOW).duplicate,
      true,
      status,
    );
  }
});

Deno.test("a reminder older than the cooldown allows a deliberate re-send", () => {
  const old = iso(RENEWAL_REMINDER_COOLDOWN_MS + 60_000);
  assertEquals(isDuplicateRenewalSend([{ sent_at: old, status: "sent" }], NOW).duplicate, false);
});

Deno.test("boundary: exactly at the cooldown edge still counts as duplicate", () => {
  const edge = iso(RENEWAL_REMINDER_COOLDOWN_MS);
  assertEquals(isDuplicateRenewalSend([{ sent_at: edge, status: "sent" }], NOW).duplicate, true);
});

Deno.test("force bypasses the guard for an explicit operator re-send", () => {
  const rows = [{ sent_at: iso(500), status: "sent" }];
  assertEquals(isDuplicateRenewalSend(rows, NOW, { force: true }).duplicate, false);
});

Deno.test("a blocking row with no timestamp is treated as in-flight", () => {
  assertEquals(isDuplicateRenewalSend([{ status: "pending" }], NOW).duplicate, true);
});

Deno.test("unparseable timestamps are ignored, not treated as blocking", () => {
  assertEquals(isDuplicateRenewalSend([{ sent_at: "not-a-date", status: "sent" }], NOW).duplicate, false);
});

Deno.test("a mix of failed then sent still blocks on the sent row", () => {
  const rows = [
    { sent_at: iso(200), status: "failed" },
    { sent_at: iso(800), status: "sent" },
  ];
  assertEquals(isDuplicateRenewalSend(rows, NOW).duplicate, true);
});

Deno.test("cooldownWindowStart returns the window lower bound", () => {
  assertEquals(cooldownWindowStart(NOW), iso(RENEWAL_REMINDER_COOLDOWN_MS));
});
