// Shared helper: resolve a tenant's public-facing URL from
// organisations.public_domain. Returns null when the org has no
// public_domain configured (or the lookup fails) — callers must handle
// the null case (typically by omitting the public link from the message
// rather than falling back to an incorrect hostname).

export async function getTenantPublicUrl(
  supabaseUrl: string,
  orgId: string,
  path: string,
): Promise<string | null> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!orgId || !supabaseUrl || !serviceKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/organisations?id=eq.${orgId}&select=public_domain&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    const domain =
      Array.isArray(rows) && rows[0]?.public_domain
        ? String(rows[0].public_domain).trim()
        : null;
    if (!domain) return null;

    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `https://${domain}${suffix}`;
  } catch (_e) {
    return null;
  }
}
