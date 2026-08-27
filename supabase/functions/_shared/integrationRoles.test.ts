import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canManageTenantIntegration } from "./integrationRoles.ts";

Deno.test("canManageTenantIntegration allows office/admin profile roles even when RPC role falls back to engineer", () => {
  assertEquals(canManageTenantIntegration("engineer", "admin"), true);
  assertEquals(canManageTenantIntegration("engineer", "office"), true);
  assertEquals(canManageTenantIntegration("engineer", "superadmin"), true);
});

Deno.test("canManageTenantIntegration blocks engineer-only users", () => {
  assertEquals(canManageTenantIntegration("engineer", "engineer"), false);
  assertEquals(canManageTenantIntegration("", null), false);
});
