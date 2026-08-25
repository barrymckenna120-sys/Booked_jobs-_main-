import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCustomerAuditRow, CUSTOMER_ACTOR_ID, logCustomerAudit } from "./auditLog.ts";

Deno.test("buildCustomerAuditRow fills every NOT NULL column", () => {
  const row = buildCustomerAuditRow({
    action_type: "job_cancelled",
    entity_id: "job-1",
    detail: "Cancelled by customer via WhatsApp reply",
    organisation_id: "org-1",
    customer_name: "Jane Doe",
    metadata: { intent: "cancel" },
  });

  assertEquals(row.user_id, CUSTOMER_ACTOR_ID);
  assertEquals(row.user_name, "Jane Doe");
  assertEquals(row.user_role, "customer");
  assertEquals(row.entity_type, "service_call");
  assertEquals(row.entity_id, "job-1");
  assertEquals(row.organisation_id, "org-1");
  assertEquals(row.metadata, { intent: "cancel", source: "whatsapp_inbound" });
});

Deno.test("buildCustomerAuditRow falls back when name missing", () => {
  const row = buildCustomerAuditRow({
    action_type: "job_confirmed",
    entity_id: "job-2",
    detail: "Confirmed",
    organisation_id: "org-1",
    customer_name: "   ",
  });
  assertEquals(row.user_name, "Customer");
  assertEquals(row.metadata, { source: "whatsapp_inbound" });
});

Deno.test("logCustomerAudit inserts once with the built row", async () => {
  const inserts: unknown[] = [];
  const supabase = {
    from: (table: string) => ({
      insert: (row: unknown) => {
        assertEquals(table, "audit_log");
        inserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  };

  await logCustomerAudit(supabase, {
    action_type: "job_cancelled",
    entity_id: "job-1",
    detail: "d",
    organisation_id: "org-1",
  });
  assertEquals(inserts.length, 1);
});

Deno.test("logCustomerAudit skips without job or org, and swallows errors", async () => {
  let calls = 0;
  const supabase = {
    from: () => ({
      insert: () => {
        calls++;
        throw new Error("boom");
      },
    }),
  };

  await logCustomerAudit(supabase, {
    action_type: "job_cancelled",
    entity_id: "",
    detail: "d",
    organisation_id: "org-1",
  });
  await logCustomerAudit(supabase, {
    action_type: "job_cancelled",
    entity_id: "job-1",
    detail: "d",
    organisation_id: "",
  });
  assertEquals(calls, 0);

  // Throwing client must not propagate.
  await logCustomerAudit(supabase, {
    action_type: "job_cancelled",
    entity_id: "job-1",
    detail: "d",
    organisation_id: "org-1",
  });
  assertEquals(calls, 1);
});
