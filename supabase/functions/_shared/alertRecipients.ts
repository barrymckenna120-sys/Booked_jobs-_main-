/**
 * Tiered recipient resolution for org-level payment alerts.
 *
 * Payment alerts used to go to office/admin only. An org with no active
 * office/admin profile silently produced zero notifications (BJ — Dublin Gas:
 * superadmin + engineer only), so the alert looked lost even though the money
 * path succeeded.
 *
 * Tiers are tried in order and the FIRST non-empty tier wins — never a union,
 * so a correctly configured org's recipients are unchanged.
 */

export interface AlertProfileRow {
  user_id: string | null;
  role?: string | null;
  is_active?: boolean | null;
  receives_ops_notifications?: boolean | null;
}

export type RecipientTier = "office" | "ops_flag" | "superadmin" | "none";

export interface ResolvedRecipients {
  recipients: string[];
  tier: RecipientTier;
}

const PRIMARY_ROLES = ["office", "admin"];

function ids(rows: AlertProfileRow[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.user_id) seen.add(r.user_id);
  }
  return [...seen];
}

/**
 * @param rows Active-or-not profile rows for ONE organisation. Inactive rows are
 *             filtered here too, so a caller that forgets the DB filter is safe.
 */
export function resolveAlertRecipients(rows: AlertProfileRow[] | null | undefined): ResolvedRecipients {
  const active = (rows ?? []).filter((r) => r.is_active !== false);

  const office = ids(active.filter((r) => PRIMARY_ROLES.includes((r.role ?? "").toLowerCase())));
  if (office.length > 0) return { recipients: office, tier: "office" };

  const opsFlagged = ids(active.filter((r) => r.receives_ops_notifications === true));
  if (opsFlagged.length > 0) return { recipients: opsFlagged, tier: "ops_flag" };

  const superadmins = ids(active.filter((r) => (r.role ?? "").toLowerCase() === "superadmin"));
  if (superadmins.length > 0) return { recipients: superadmins, tier: "superadmin" };

  return { recipients: [], tier: "none" };
}
