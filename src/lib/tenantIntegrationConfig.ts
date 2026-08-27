/**
 * Merge submitted integration fields into an existing tenant_integrations config.
 *
 * Rules:
 * - A submitted field with a non-empty value is saved (trimmed).
 * - A submitted field the user explicitly cleared ("" / whitespace) is removed
 *   from the stored config, which every reader treats as "not configured".
 * - Keys that were NOT submitted are left untouched.
 */
export type IntegrationConfig = Record<string, unknown>;

export function mergeIntegrationConfig(
  existing: IntegrationConfig | null | undefined,
  submitted: Record<string, string>
): IntegrationConfig {
  const next: IntegrationConfig = { ...(existing ?? {}) };
  for (const [key, raw] of Object.entries(submitted)) {
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (value === "" || value == null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

export interface TenantConfigRow {
  organisation_id: string;
  integration_type: string;
  config: IntegrationConfig;
}

/**
 * Build upsert rows for the submitted fields, grouped by integration type,
 * merging each group over the tenant's existing config.
 */
export function buildTenantConfigRows(
  organisationId: string,
  submittedByType: Record<string, Record<string, string>>,
  existingRows: { integration_type: string; config?: IntegrationConfig | null }[] | null | undefined
): TenantConfigRow[] {
  return Object.entries(submittedByType).map(([integration_type, submitted]) => {
    const prev = existingRows?.find((r) => r.integration_type === integration_type)?.config ?? {};
    return {
      organisation_id: organisationId,
      integration_type,
      config: mergeIntegrationConfig(prev, submitted),
    };
  });
}

export interface ClearableField {
  type: string;
  key: string;
  label: string;
  secret?: boolean;
}

/** Credential-ish fields need an explicit confirmation before they can be cleared. */
export function isCredentialField(f: ClearableField): boolean {
  return f.secret === true || f.key === "merchant_code";
}

/**
 * Labels of credential fields that had a stored value and are now blank,
 * i.e. the user is explicitly clearing a credential.
 */
export function detectClearedCredentials(
  fields: ClearableField[],
  initial: Record<string, string>,
  current: Record<string, string>
): string[] {
  return fields
    .filter((f) => {
      if (!isCredentialField(f)) return false;
      const id = `${f.type}::${f.key}`;
      const before = (initial[id] ?? "").trim();
      const after = (current[id] ?? "").trim();
      return before !== "" && after === "";
    })
    .map((f) => f.label);
}
