import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  action_type: string;
  entity_type: string;
  entity_id: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

/**
 * Insert a row into the audit_log table.
 * Silently fails — audit logging should never block the main action.
 */
export const logAudit = async (entry: AuditEntry) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Resolve role + name from engineers table (or fallback to admin)
    const { data: eng } = await supabase
      .from("engineers")
      .select("name, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const userName = eng?.name || user.email || "Unknown";
    const userRole = eng?.role || "admin";

    await supabase.from("audit_log" as any).insert({
      user_id: user.id,
      user_name: userName,
      user_role: userRole,
      action_type: entry.action_type,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      detail: entry.detail,
      metadata: entry.metadata || {},
    });
  } catch {
    // Audit logging should never throw
  }
};
