import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { addDays, dublinDate, inReminderWindow, installDateOf, isInstallJob } from "./installJob.ts";

Deno.test("isInstallJob by K&N job types", () => {
  for (const t of ["Boiler Replacement", "Installation", "Install"]) assertEquals(isInstallJob({ job_type: t }), true, t);
  for (const t of ["Boiler Service", "Boiler Repair", "Repair", "Emergency"]) assertEquals(isInstallJob({ job_type: t }), false, t);
});

Deno.test("isInstallJob via New Boiler Fitted tag", () => {
  assertEquals(isInstallJob({ job_type: "Boiler Service" }, ["new boiler FITTED"]), true);
  assertEquals(isInstallJob({ job_type: "Boiler Service" }, ["Under Warranty"]), false);
});

Deno.test("dublinDate uses Europe/Dublin, not UTC", () => {
  // 23:30 UTC on 28 Sep = 00:30 IST on 29 Sep
  assertEquals(dublinDate("2026-09-28T23:30:00Z"), "2026-09-29");
  // winter: 23:30 UTC = 23:30 GMT same day
  assertEquals(dublinDate("2026-12-01T23:30:00Z"), "2026-12-01");
});

Deno.test("installDateOf prefers completed_at, falls back to paid_at", () => {
  assertEquals(installDateOf({ completed_at: "2026-09-28T12:00:00Z", paid_at: "2026-09-30T12:00:00Z" }), "2026-09-28");
  assertEquals(installDateOf({ completed_at: null, paid_at: "2026-09-30T12:00:00Z" }), "2026-09-30");
  assertEquals(installDateOf({}), null);
});

Deno.test("inReminderWindow inclusive bounds", () => {
  const today = "2026-09-29";
  assertEquals(addDays(today, -14), "2026-09-15");
  assertEquals(inReminderWindow("2026-09-15", today, 14, 21), true);
  assertEquals(inReminderWindow("2026-09-08", today, 14, 21), true);
  assertEquals(inReminderWindow("2026-09-07", today, 14, 21), false);
  assertEquals(inReminderWindow("2026-09-16", today, 14, 21), false);
  assertEquals(inReminderWindow("2026-09-01", today, 28, 35), true);
  assertEquals(inReminderWindow(null, today, 28, 35), false);
});
