/**
 * Normalise the host a tenant's customer-facing links are built from
 * (organisations.public_domain).
 *
 * Quote/receipt/certificate messages omit their link entirely when this is
 * blank, so it must be stored as a bare host — no scheme, no path, no
 * trailing slash — because Edge Functions build `https://<host><path>`.
 */
export type PublicDomainResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export function normalisePublicDomain(raw: string): PublicDomainResult {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };

  const host = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.+$/, "")
    .toLowerCase();

  if (!host) return { ok: true, value: null };

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
    return {
      ok: false,
      error: "Enter a web address like kngasservices.bookedjobs.ie",
    };
  }

  return { ok: true, value: host };
}
