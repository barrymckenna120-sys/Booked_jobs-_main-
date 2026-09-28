/**
 * public-fault-lookup — pure helpers (no I/O) so tests need no database.
 *
 * Defence in depth: the caller in handler.ts also filters status='published'
 * in every query; publishedOnly() re-checks the returned rows so a draft or
 * draft_test_excluded row can never reach a payload even if a filter is
 * missed later. Payload builders whitelist the exact fields, so sensitive
 * columns can never leak.
 */

export const ALLOWED_BRANDS = ["Ideal", "Baxi", "Glow-worm"] as const;

/** Official manufacturer technical-document pages (same values as src/lib/faultFinder.ts). */
export const MANUAL_LINKS: Record<string, string> = {
  Ideal: "https://idealheating.com/tech-hub/literature",
  Baxi: "https://www.baxi.co.uk/support/literature",
  "Glow-worm": "https://www.glow-worm.co.uk/installers/downloads/",
};

/** Same rule as normCode in src/lib/faultFinder.ts: case-insensitive, ignores spaces, dots and dashes. */
export const normCode = (c: string): string =>
  c.trim().toUpperCase().replace(/[\s.-]/g, "");

/** Returns the canonical allowed brand name, or null when the brand is not public-facing. */
export const isAllowedBrand = (brand: string): string | null => {
  const q = brand.trim().toLowerCase();
  return ALLOWED_BRANDS.find((b) => b.toLowerCase() === q) ?? null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isValidUuid = (s: string): boolean => UUID_RE.test(s.trim());

export type PublishedRow = { status?: string | null; draft_test_excluded?: boolean | null };

export const publishedOnly = <T extends PublishedRow>(rows: T[]): T[] =>
  rows.filter((r) => r.status === "published" && !r.draft_test_excluded);

const CAT_ORDER: Record<string, number> = { fault: 0, message: 1, status: 2 };

export const buildModelsPayload = (
  rows: (PublishedRow & { id: string; brand: string; model_name: string })[],
): { id: string; brand: string; model_name: string }[] =>
  publishedOnly(rows)
    .map((r) => ({ id: r.id, brand: r.brand, model_name: r.model_name }))
    .sort((a, b) => a.model_name.localeCompare(b.model_name));

export const buildCodesPayload = (
  rows: (PublishedRow & { code: string; category: string | null })[],
): { code: string; category: string | null }[] =>
  publishedOnly(rows)
    .map((r) => ({ code: r.code, category: r.category ?? null }))
    .sort((a, b) =>
      (CAT_ORDER[a.category ?? ""] ?? 3) - (CAT_ORDER[b.category ?? ""] ?? 3) ||
      a.code.localeCompare(b.code));

export type LookupResult =
  | { found: true; code: string; category: string | null; explanation: string; manual_url: string }
  | { found: false; manual_url: string | null };

export const buildLookup = (
  rows: (PublishedRow & { code: string; category: string | null; explanation: string; manual_url: string })[],
  code: string,
  brand: string | null,
): LookupResult => {
  const q = normCode(code);
  const hit = publishedOnly(rows).find((r) => normCode(r.code) === q);
  if (hit) {
    return { found: true, code: hit.code, category: hit.category ?? null, explanation: hit.explanation, manual_url: hit.manual_url };
  }
  return { found: false, manual_url: brand ? (MANUAL_LINKS[brand] ?? null) : null };
};
