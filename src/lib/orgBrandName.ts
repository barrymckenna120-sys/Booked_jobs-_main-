// Frontend mirror of the org_name precedence in
// supabase/functions/_shared/orgBranding.ts (BRANDING_PRECEDENCE.org_name):
// settings.business_name → settings.company_name → organisations.name.
// Returns "" when nothing is set — callers use neutral wording, never another
// tenant's name.

const BAD = new Set(["undefined", "null", "nan", "[object object]"]);

function clean(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s && !BAD.has(s.toLowerCase()) ? s : "";
}

export function resolveOrgBrandName(input: {
  business_name?: string | null;
  company_name?: string | null;
  organisation_name?: string | null;
}): string {
  return clean(input.business_name) || clean(input.company_name) || clean(input.organisation_name);
}
