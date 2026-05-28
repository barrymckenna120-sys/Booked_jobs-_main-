// Shared helper for resolving org-aware branding (company name, phone, message footer)
// from the `settings` table. Falls back to sensible defaults if fields are missing.

export interface OrgBranding {
  name: string;
  phone: string;
  footer: string;
}

const DEFAULTS: OrgBranding = {
  name: "our team",
  phone: "",
  footer: "",
};

/**
 * Fetch org branding via REST. `supabaseUrl` and `serviceRoleKey` are required.
 */
export async function getOrgBranding(
  supabaseUrl: string,
  serviceRoleKey: string,
  organisationId: string,
): Promise<OrgBranding> {
  if (!organisationId) return { ...DEFAULTS };
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/settings?organisation_id=eq.${organisationId}&select=business_name,company_name,business_phone,company_phone,message_footer&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return { ...DEFAULTS };
    const name = row.business_name || row.company_name || DEFAULTS.name;
    const phone = row.business_phone || row.company_phone || DEFAULTS.phone;
    const footer = row.message_footer || name || DEFAULTS.footer;
    return { name, phone, footer };
  } catch (_e) {
    return { ...DEFAULTS };
  }
}

/**
 * Fetch via a supabase-js client instance (for functions that already have one).
 */
export async function getOrgBrandingClient(
  supabase: { from: (t: string) => any },
  organisationId: string,
): Promise<OrgBranding> {
  if (!organisationId) return { ...DEFAULTS };
  try {
    const { data } = await supabase
      .from("settings")
      .select("business_name,company_name,business_phone,company_phone,message_footer")
      .eq("organisation_id", organisationId)
      .limit(1)
      .maybeSingle();
    if (!data) return { ...DEFAULTS };
    const name = data.business_name || data.company_name || DEFAULTS.name;
    const phone = data.business_phone || data.company_phone || DEFAULTS.phone;
    const footer = data.message_footer || name || DEFAULTS.footer;
    return { name, phone, footer };
  } catch (_e) {
    return { ...DEFAULTS };
  }
}
