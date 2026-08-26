import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveAlertRecipients } from "./alertRecipients.ts";

Deno.test("office/admin present → only those, tier office", () => {
  const r = resolveAlertRecipients([
    { user_id: "a", role: "office", is_active: true },
    { user_id: "b", role: "admin", is_active: true },
    { user_id: "c", role: "superadmin", is_active: true, receives_ops_notifications: true },
    { user_id: "d", role: "engineer", is_active: true },
  ]);
  assertEquals(r.tier, "office");
  assertEquals(r.recipients.sort(), ["a", "b"]);
});

Deno.test("no office/admin → ops-flagged profiles", () => {
  const r = resolveAlertRecipients([
    { user_id: "e", role: "engineer", is_active: true, receives_ops_notifications: true },
    { user_id: "s", role: "superadmin", is_active: true },
  ]);
  assertEquals(r.tier, "ops_flag");
  assertEquals(r.recipients, ["e"]);
});

Deno.test("no office/admin and no ops flag → superadmin", () => {
  const r = resolveAlertRecipients([
    { user_id: "s", role: "superadmin", is_active: true },
    { user_id: "e", role: "engineer", is_active: true },
  ]);
  assertEquals(r.tier, "superadmin");
  assertEquals(r.recipients, ["s"]);
});

Deno.test("nobody eligible → empty, tier none", () => {
  const r = resolveAlertRecipients([{ user_id: "e", role: "engineer", is_active: true }]);
  assertEquals(r.tier, "none");
  assertEquals(r.recipients, []);
});

Deno.test("inactive rows never receive alerts", () => {
  const r = resolveAlertRecipients([
    { user_id: "a", role: "office", is_active: false },
    { user_id: "s", role: "superadmin", is_active: true },
  ]);
  assertEquals(r.tier, "superadmin");
  assertEquals(r.recipients, ["s"]);
});

Deno.test("empty / null input is safe", () => {
  assertEquals(resolveAlertRecipients([]), { recipients: [], tier: "none" });
  assertEquals(resolveAlertRecipients(null), { recipients: [], tier: "none" });
  assertEquals(resolveAlertRecipients(undefined), { recipients: [], tier: "none" });
});

Deno.test("null user_id rows and duplicates are dropped", () => {
  const r = resolveAlertRecipients([
    { user_id: null, role: "office", is_active: true },
    { user_id: "a", role: "office", is_active: true },
    { user_id: "a", role: "admin", is_active: true },
  ]);
  assertEquals(r.recipients, ["a"]);
});
