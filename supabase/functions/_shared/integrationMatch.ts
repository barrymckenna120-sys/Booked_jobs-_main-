// Pure machine→tenant matching logic. No Deno/npm imports so the app test
// runner can cover it; I/O lives in machineOrg.ts.

export type IntegrationRow = {
  organisation_id: string | null;
  integration_type?: string | null;
  config: Record<string, unknown> | null;
};

/** Identifier presented by the upstream provider, e.g. { key: "form_id", value: "wAbC12" }. */
export type IntegrationIdentifier = { keys: string[]; value: string | null | undefined };

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function uniqueOrgs(rows: IntegrationRow[]): string[] {
  return [...new Set(rows.map((r) => String(r.organisation_id ?? "")).filter(Boolean))];
}

/**
 * Pure matcher — no I/O, unit-testable. Returns the orgs whose integration row
 * matches the presented secret and/or the upstream identifier.
 */
export function matchIntegrations(
  rows: IntegrationRow[],
  opts: {
    providedSecret?: string | null;
    secretEnv?: (name: string) => string | undefined;
    identifier?: IntegrationIdentifier;
  },
): { bySecret: string[]; byIdentifier: string[] } {
  const provided = String(opts.providedSecret ?? "").trim();
  const env = opts.secretEnv ?? (() => undefined);

  const bySecret = provided
    ? uniqueOrgs(rows.filter((r) => {
      const cfg = r.config ?? {};
      const candidates = [cfg.webhook_secret, cfg.shared_secret]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean);
      const named = String(cfg.webhook_secret_name ?? "").trim();
      if (named) {
        const fromEnv = String(env(named) ?? "").trim();
        if (fromEnv) candidates.push(fromEnv);
      }
      return candidates.includes(provided);
    }))
    : [];

  const idValue = norm(opts.identifier?.value);
  const byIdentifier = idValue
    ? uniqueOrgs(rows.filter((r) => {
      const cfg = r.config ?? {};
      return (opts.identifier?.keys ?? []).some((k) => {
        const raw = cfg[k];
        if (Array.isArray(raw)) return raw.some((v) => norm(v) === idValue);
        return norm(raw) !== "" && norm(raw) === idValue;
      });
    }))
    : [];

  return { bySecret, byIdentifier };
}

/**
 * Resolve the organisation a machine caller is allowed to act for.
 * `claimedOrgId` is accepted only as a cross-check (or for service-role callers).
 */
