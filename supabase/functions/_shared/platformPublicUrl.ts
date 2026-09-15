// Pure helpers for the platform-wide public app host.
//
// organisations.public_domain stays the branded, per-tenant address and remains
// unique per tenant, because host-based tenant resolution
// (resolve-document-link, stream-receipt-pdf) depends on that uniqueness. The
// platform host below is tenant-neutral and is only used for capability-token
// links (/quote/<token>, /pdf/<token>) that resolve from the token alone, so no
// tenant's documents become reachable through another tenant's address.

export const PLATFORM_PUBLIC_HOST_FALLBACK = "https://karlsgas.lovable.app";

/** Join a platform base URL and a path. Returns null when the base is blank. */
export function platformPublicUrl(
  path: string,
  base: string | null | undefined,
): string | null {
  const raw = String(base ?? "").trim().replace(/\/+$/, "");
  if (!raw) return null;
  const origin = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${suffix}`;
}
