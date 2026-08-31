// Canonical, tenant-scoped organisation branding resolver.
//
// Phase 2 (BJ WhatsApp canonicalisation). This module is the SINGLE place that
// decides what `org_name`, `org_address` and `org_phone` are for a tenant.
//
// Hard rules (see docs/whatsapp/phase2-migration-map.md):
//   1. Resolution ALWAYS starts from a confirmed `organisation_id`. A blank /
//      missing id is a programming error and throws — it never falls through to
//      "some settings row".
//   2. No lookup may select branding by `user_id`. There is no such code path
//      in this module and `resolveOrgBranding` cannot see a user id at all.
//   3. No cross-tenant fallback. Every query is `organisation_id = <id>`, and a
//      tenant with no configuration resolves to empty strings + an explicit
//      `missing` list — never to another tenant's values.
//   4. The resolver never emits the literal strings "undefined" / "null" /
//      "NaN" (defect D12 class). Those are normalised to "" and reported as
//      missing, so callers decide skip-vs-degrade explicitly.
//
// Field precedence is declared once, in BRANDING_PRECEDENCE, and is the
// authority for the whole codebase. It was chosen from the Phase 1 audit
// (docs/whatsapp/template-audit.md, defects D1 and D10) — `settings.business_*`
// wins because it is the pair the Settings UI writes and the pair the majority
// of live send paths already read; `company_*` is the older column pair; the
// `tenant_integrations` copies are last because they are integration-local
// mirrors that drift (root cause of the deposit-phone bug).

export type BrandingField = "org_name" | "org_address" | "org_phone" | "footer";

/** Ordered candidate list per canonical field. First non-blank wins. */
export const BRANDING_PRECEDENCE: Record<BrandingField, string[]> = {
  org_name: [
    "settings.business_name",
    "settings.company_name",
    "tenant_integrations.360messenger.config.company_name",
    "tenant_integrations.make.config.company_name",
    "organisations.name",
  ],
  org_address: [
    "settings.business_address",
    "organisations.address",
  ],
  org_phone: [
    "settings.business_phone",
    "settings.company_phone",
    "tenant_integrations.360messenger.config.company_phone",
    "tenant_integrations.make.config.company_phone",
  ],
  footer: [
    "settings.message_footer",
    "<org_name>",
  ],
};

export interface BrandingSettingsRow {
  business_name?: string | null;
  company_name?: string | null;
  business_phone?: string | null;
  company_phone?: string | null;
  business_address?: string | null;
  message_footer?: string | null;
}

export interface BrandingIntegrationRow {
  integration_type: string;
  config: Record<string, unknown> | null;
}

export interface BrandingOrganisationRow {
  name?: string | null;
  address?: string | null;
}

export interface BrandingResolverInput {
  organisationId: string;
  settings?: BrandingSettingsRow | null;
  integrations?: BrandingIntegrationRow[] | null;
  organisation?: BrandingOrganisationRow | null;
}

export interface CanonicalOrgBranding {
  organisationId: string;
  org_name: string;
  org_address: string;
  org_phone: string;
  /** Sign-off line. Never blank when org_name resolves. */
  footer: string;
  /** Which candidate actually supplied each value ("" when unresolved). */
  sources: Record<BrandingField, string>;
  /** Canonical fields that could not be resolved for this tenant. */
  missing: BrandingField[];
}

/** Thrown when a caller tries to resolve branding without a confirmed org id. */
export class BrandingScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrandingScopeError";
  }
}

const BAD_TOKENS = new Set(["undefined", "null", "nan", "[object object]"]);

/** Trim + reject the stringified-nothing values that leaked into live messages. */
function clean(value: unknown): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
  if (BAD_TOKENS.has(s.toLowerCase())) return "";
  return s;
}

function integrationConfig(
  rows: BrandingIntegrationRow[] | null | undefined,
  type: string,
): Record<string, unknown> {
  const row = (rows || []).find((r) => r?.integration_type === type);
  return (row?.config as Record<string, unknown>) || {};
}

/**
 * Pure resolver. No IO, no tenant discovery — the caller has already confirmed
 * `organisationId` and fetched the rows for THAT organisation only.
 */
export function resolveOrgBranding(input: BrandingResolverInput): CanonicalOrgBranding {
  const organisationId = clean(input?.organisationId);
  if (!organisationId) {
    throw new BrandingScopeError(
      "resolveOrgBranding requires a confirmed organisation_id; refusing to resolve branding without tenant scope",
    );
  }

  const s = input.settings || {};
  const org = input.organisation || {};
  const messenger = integrationConfig(input.integrations, "360messenger");
  const make = integrationConfig(input.integrations, "make");

  const candidates: Record<Exclude<BrandingField, "footer">, Array<[string, unknown]>> = {
    org_name: [
      ["settings.business_name", s.business_name],
      ["settings.company_name", s.company_name],
      ["tenant_integrations.360messenger.config.company_name", messenger.company_name],
      ["tenant_integrations.make.config.company_name", make.company_name],
      ["organisations.name", org.name],
    ],
    org_address: [
      ["settings.business_address", s.business_address],
      ["organisations.address", org.address],
    ],
    org_phone: [
      ["settings.business_phone", s.business_phone],
      ["settings.company_phone", s.company_phone],
      ["tenant_integrations.360messenger.config.company_phone", messenger.company_phone],
      ["tenant_integrations.make.config.company_phone", make.company_phone],
    ],
  };

  const sources: Record<BrandingField, string> = {
    org_name: "",
    org_address: "",
    org_phone: "",
    footer: "",
  };
  const resolved: Record<Exclude<BrandingField, "footer">, string> = {
    org_name: "",
    org_address: "",
    org_phone: "",
  };

  for (const field of Object.keys(candidates) as Array<Exclude<BrandingField, "footer">>) {
    for (const [source, raw] of candidates[field]) {
      const v = clean(raw);
      if (v) {
        resolved[field] = v;
        sources[field] = source;
        break;
      }
    }
  }

  let footer = clean(s.message_footer);
  if (footer) {
    sources.footer = "settings.message_footer";
  } else if (resolved.org_name) {
    footer = resolved.org_name;
    sources.footer = "<org_name>";
  }

  const missing: BrandingField[] = [];
  if (!resolved.org_name) missing.push("org_name");
  if (!resolved.org_address) missing.push("org_address");
  if (!resolved.org_phone) missing.push("org_phone");
  if (!footer) missing.push("footer");

  return {
    organisationId,
    org_name: resolved.org_name,
    org_address: resolved.org_address,
    org_phone: resolved.org_phone,
    footer,
    sources,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Loaders — thin IO wrappers around the pure resolver
// ---------------------------------------------------------------------------

const SETTINGS_SELECT =
  "business_name,company_name,business_phone,company_phone,business_address,message_footer";

/** Resolve canonical branding through a supabase-js client (service role). */
export async function getCanonicalOrgBranding(
  supabase: { from: (t: string) => any },
  organisationId: string,
): Promise<CanonicalOrgBranding> {
  if (!clean(organisationId)) {
    throw new BrandingScopeError(
      "getCanonicalOrgBranding requires a confirmed organisation_id",
    );
  }
  const [settingsRes, integrationsRes, orgRes] = await Promise.all([
    supabase
      .from("settings")
      .select(SETTINGS_SELECT)
      .eq("organisation_id", organisationId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tenant_integrations")
      .select("integration_type,config")
      .eq("organisation_id", organisationId),
    supabase
      .from("organisations")
      .select("name,address")
      .eq("id", organisationId)
      .maybeSingle(),
  ]);

  return resolveOrgBranding({
    organisationId,
    settings: settingsRes?.data ?? null,
    integrations: integrationsRes?.data ?? [],
    organisation: orgRes?.data ?? null,
  });
}

/** Resolve canonical branding over the REST API (functions without a client). */
export async function getCanonicalOrgBrandingRest(
  supabaseUrl: string,
  serviceRoleKey: string,
  organisationId: string,
): Promise<CanonicalOrgBranding> {
  if (!clean(organisationId)) {
    throw new BrandingScopeError(
      "getCanonicalOrgBrandingRest requires a confirmed organisation_id",
    );
  }
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
  const get = async (path: string) => {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers });
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    } catch (_e) {
      return [];
    }
  };

  const [settings, integrations, orgs] = await Promise.all([
    get(`settings?organisation_id=eq.${organisationId}&select=${SETTINGS_SELECT}&limit=1`),
    get(`tenant_integrations?organisation_id=eq.${organisationId}&select=integration_type,config`),
    get(`organisations?id=eq.${organisationId}&select=name,address&limit=1`),
  ]);

  return resolveOrgBranding({
    organisationId,
    settings: settings[0] ?? null,
    integrations: integrations as BrandingIntegrationRow[],
    organisation: orgs[0] ?? null,
  });
}

// ---------------------------------------------------------------------------
// Legacy compatibility shims
// ---------------------------------------------------------------------------
//
// The existing send paths (quote follow-ups, cancellations, warranty, inbound,
// SumUp part-payment) consume `{ name, phone, footer }` and rely on the legacy
// `"our team"` default. Phase 2 must not change any customer-facing output, so
// these wrappers keep that exact behaviour while resolving through the
// canonical resolver underneath. The `"our team"` default is a KNOWN DEFECT
// (audit F4 / D1) and is removed as a deliberate copy change in Phase 3.

export interface OrgBranding {
  name: string;
  phone: string;
  footer: string;
}

/** The pre-Phase-2 default. Retained only so output stays byte-identical. */
export const LEGACY_NAME_DEFAULT = "our team";

export function toLegacyBranding(canonical: CanonicalOrgBranding): OrgBranding {
  // Byte-compatibility: the legacy helper only ever read the `settings` row, so
  // values that the canonical resolver picked up from `tenant_integrations` or
  // `organisations` are deliberately NOT surfaced here. Widening the legacy
  // chain would silently change live message text inside a refactor.
  const fromSettings = (field: BrandingField, value: string) =>
    canonical.sources[field].startsWith("settings.") ? value : "";
  const name = fromSettings("org_name", canonical.org_name) || LEGACY_NAME_DEFAULT;
  const phone = fromSettings("org_phone", canonical.org_phone);
  const footerFromSettings = fromSettings("footer", canonical.footer);
  return {
    name,
    phone,
    footer: footerFromSettings || name,
  };
}


const LEGACY_DEFAULTS: OrgBranding = {
  name: LEGACY_NAME_DEFAULT,
  phone: "",
  footer: "",
};

/** @deprecated use getCanonicalOrgBrandingRest — kept for un-migrated callers. */
export async function getOrgBranding(
  supabaseUrl: string,
  serviceRoleKey: string,
  organisationId: string,
): Promise<OrgBranding> {
  if (!clean(organisationId)) return { ...LEGACY_DEFAULTS };
  try {
    return toLegacyBranding(
      await getCanonicalOrgBrandingRest(supabaseUrl, serviceRoleKey, organisationId),
    );
  } catch (_e) {
    return { ...LEGACY_DEFAULTS };
  }
}

/** @deprecated use getCanonicalOrgBranding — kept for un-migrated callers. */
export async function getOrgBrandingClient(
  supabase: { from: (t: string) => any },
  organisationId: string,
): Promise<OrgBranding> {
  if (!clean(organisationId)) return { ...LEGACY_DEFAULTS };
  try {
    return toLegacyBranding(await getCanonicalOrgBranding(supabase, organisationId));
  } catch (_e) {
    return { ...LEGACY_DEFAULTS };
  }
}
