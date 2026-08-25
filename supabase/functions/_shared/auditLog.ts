/**
 * Audit trail for actions initiated by a CUSTOMER rather than a staff member
 * (currently WhatsApp CONFIRM / CANCEL replies).
 *
 * Office- and engineer-initiated cancellations already write to `audit_log`
 * from the app via `src/lib/auditLog.ts`. Customer-initiated ones happen inside
 * an edge function where there is no signed-in user, so `user_id` is stamped
 * with a fixed sentinel UUID and `user_role` is "customer". The Audit Log UI
 * falls back gracefully for unknown roles.
 *
 * Writes are best-effort: audit logging must never break the reply flow.
 */

/** Sentinel `user_id` for actions taken by a customer, not a logged-in user. */
export const CUSTOMER_ACTOR_ID = "00000000-0000-0000-0000-000000000000";

export type CustomerAuditInput = {
  action_type: string;
  entity_id: string;
  detail: string;
  organisation_id: string;
  customer_name?: string | null;
  metadata?: Record<string, unknown>;
};

export type AuditRow = {
  user_id: string;
  user_name: string;
  user_role: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  detail: string;
  metadata: Record<string, unknown>;
  organisation_id: string;
};

/** Pure builder — every NOT NULL column is always populated. */
export function buildCustomerAuditRow(input: CustomerAuditInput): AuditRow {
  const name = String(input.customer_name ?? "").trim();
  return {
    user_id: CUSTOMER_ACTOR_ID,
    user_name: name || "Customer",
    user_role: "customer",
    action_type: input.action_type,
    entity_type: "service_call",
    entity_id: input.entity_id,
    detail: input.detail,
    metadata: { ...(input.metadata ?? {}), source: "whatsapp_inbound" },
    organisation_id: input.organisation_id,
  };
}

/** Insert a customer-initiated audit entry. Never throws. */
export async function logCustomerAudit(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  input: CustomerAuditInput,
): Promise<void> {
  try {
    if (!input.entity_id || !input.organisation_id) return;
    await supabase.from("audit_log").insert(buildCustomerAuditRow(input));
  } catch (_e) {
    console.error("audit_log insert failed:", _e);
  }
}
