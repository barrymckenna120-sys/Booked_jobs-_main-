// Guard against one tenant being given another tenant's integration identity.
//
// A booking form URL or webhook secret identifies the tenant a submission
// belongs to. If two organisations are configured with the same value, incoming
// bookings are created under whichever organisation the upstream scenario names
// (and secret-based binding becomes ambiguous), so the other tenant never sees
// the job. Values that identify a tenant must therefore be unique per tenant.

export type IntegrationConfigRow = {
  organisation_id: string | null;
  integration_type: string | null;
  config: Record<string, unknown> | null;
};

/** Config keys that identify which tenant an inbound submission belongs to. */
export const TENANT_IDENTIFYING_KEYS = [
  "webhook_secret",
  "make_webhook_secret",
  "new_booking_url",
  "renewal_form_url",
] as const;

export type IntegrationConflict = {
  integrationType: string;
  key: string;
  organisationId: string;
};

/**
 * Values in `submitted` that are already configured on a DIFFERENT organisation.
 *
 * `submitted` is keyed by integration_type, then config key.
 */
export function findSharedIntegrationValues(
  rows: IntegrationConfigRow[],
  organisationId: string,
  submitted: Record<string, Record<string, string>>,
): IntegrationConflict[] {
  const conflicts: IntegrationConflict[] = [];
  const mine = String(organisationId ?? "").trim();

  for (const [integrationType, fields] of Object.entries(submitted ?? {})) {
    for (const key of TENANT_IDENTIFYING_KEYS) {
      const value = String(fields?.[key] ?? "").trim();
      if (!value) continue;

      for (const row of rows ?? []) {
        const owner = String(row?.organisation_id ?? "").trim();
        if (!owner || owner === mine) continue;
        if (row?.integration_type !== integrationType) continue;
        const existing = String((row?.config ?? {})[key] ?? "").trim();
        if (existing && existing === value) {
          conflicts.push({ integrationType, key, organisationId: owner });
        }
      }
    }
  }

  return conflicts;
}

/** Human-readable message for the admin saving the integration. */
export function sharedIntegrationMessage(
  conflicts: IntegrationConflict[],
  nameFor: (organisationId: string) => string,
): string {
  const first = conflicts[0];
  if (!first) return "";
  const label = first.key.replace(/_/g, " ");
  return (
    `This ${label} is already in use by ${nameFor(first.organisationId)}. ` +
    `Each company needs its own booking form and webhook secret, otherwise its ` +
    `bookings are created under the other company.`
  );
}
