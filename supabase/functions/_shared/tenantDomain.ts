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

// Platform-wide public app host, used ONLY by callers that opt in (see
// getPublicUrlWithPlatformFallback). organisations.public_domain stays the
// branded, per-tenant address and remains unique per tenant, because
// host-based tenant resolution (resolve-document-link, stream-receipt-pdf)
// depends on that uniqueness. The platform host is tenant-neutral: links
// built on it are capability-token links, resolved from the token alone, so
// no tenant's data becomes reachable through another tenant's address.
export const PLATFORM_PUBLIC_HOST_FALLBACK = "https://karlsgas.lovable.app";

/** Pure: join a platform base URL and a path. Returns null when base is blank. */
export function platformPublicUrl(path: string, base: string | null | undefined): string | null {
  const raw = String(base ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  const origin = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${suffix}`;
}

/**
 * Tenant domain first; when the tenant has no branded public_domain yet, fall
 * back to the platform's own public app host so token-based customer links are
 * never silently omitted. Never falls back to ANOTHER tenant's hostname.
 */
export async function getPublicUrlWithPlatformFallback(
  supabaseUrl: string,
  orgId: string,
  path: string,
): Promise<{ url: string | null; usedPlatformFallback: boolean }> {
  const tenantUrl = await getTenantPublicUrl(supabaseUrl, orgId, path);
  if (tenantUrl) return { url: tenantUrl, usedPlatformFallback: false };

  const base = Deno.env.get("APP_PUBLIC_URL") || PLATFORM_PUBLIC_HOST_FALLBACK;
  return { url: platformPublicUrl(path, base), usedPlatformFallback: true };
}

