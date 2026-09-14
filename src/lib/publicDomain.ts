/**
 * Normalise the host a tenant's customer-facing links are built from
 * (organisations.public_domain).
 *
 * Quote/receipt/certificate messages omit their link entirely when this is
 * blank, so it must be stored as a bare host — no scheme, no path, no
 * trailing slash — because Edge Functions build `https://<host><path>`.
 */
export type PublicDomainResult = {
  ok: boolean;
  value?: string | null;
  error?: string;
};

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

/**
 * Two organisations must never share a public_domain: stream-receipt-pdf
 * resolves the tenant from the request host by matching public_domain, so a
 * duplicate host makes that resolution ambiguous. The database enforces this
 * (organisations_public_domain_unique); this turns the raw violation into
 * something an admin can act on.
 */
export function publicDomainSaveError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = error instanceof Error ? error.message : "";
  if (code === "23505" || /organisations_public_domain_unique/.test(message)) {
    return "That web address is already used by another company. Each company needs its own address.";
  }
  return message || "Failed to save web address";
}
