// Pure matching of a presented machine secret against per-tenant webhook secrets.
//
// Kept dependency-free so it is unit-testable from the frontend test suite.
// A presented secret is only accepted when it identifies EXACTLY ONE tenant —
// an ambiguous match (two tenants sharing a value) is treated as no match.

export type TenantIntegrationRow = {
  organisation_id: string | null;
  config: Record<string, unknown> | null;
};

const SECRET_KEYS = ["webhook_secret", "make_webhook_secret"];

/** Organisations whose configured webhook secret equals `provided`. */
export function orgsMatchingSecret(
  rows: TenantIntegrationRow[],
  provided: string,
): string[] {
  const needle = (provided ?? "").trim();
  if (!needle) return [];
  const orgs = new Set<string>();
  for (const row of rows ?? []) {
    const orgId = (row?.organisation_id ?? "").trim();
    if (!orgId) continue;
    const config = row?.config ?? {};
    for (const key of SECRET_KEYS) {
      const value = String((config as Record<string, unknown>)[key] ?? "").trim();
      if (value && value === needle) orgs.add(orgId);
    }
  }
  return [...orgs];
}

/** The single organisation a presented secret belongs to, or null. */
export function orgForSecret(
  rows: TenantIntegrationRow[],
  provided: string,
): string | null {
  const matches = orgsMatchingSecret(rows, provided);
  return matches.length === 1 ? matches[0] : null;
}
