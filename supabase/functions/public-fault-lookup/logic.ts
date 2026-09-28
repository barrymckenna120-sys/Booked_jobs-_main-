/**
 * public-fault-lookup — pure helpers (no I/O) so tests need no database.
 *
 * Defence in depth: the caller in handler.ts also filters status='published'
 * in every query; publishedOnly() re-checks the returned rows so a draft or
 * draft_test_excluded row can never reach a payload even if a filter is
 * missed later. Payload builders whitelist the exact fields, so sensitive
 * columns can never leak.
 */

export const ALLOWED_BRANDS = ["Ideal", "Baxi", "Glow-worm", "Vaillant", "Worcester Bosch"] as const;

/** Official manufacturer technical-document pages (same values as src/lib/faultFinder.ts). */
export const MANUAL_LINKS: Record<string, string> = {
  Ideal: "https://idealheating.com/tech-hub/literature",
  Baxi: "https://www.baxi.co.uk/support/literature",
  "Glow-worm": "https://www.glow-worm.co.uk/installers/downloads/",
  Vaillant: "https://professional.vaillant.co.uk/downloads/product-manuals/",
  "Worcester Bosch": "https://www.worcester-bosch.co.uk/support/literature",
};

import { findExactCode, normCode } from "../_shared/faultCode.ts";
/** Shared with the engineer app (see _shared/faultCode.ts). */
export { normCode };

/** Brand keys ignore spaces and hyphens so "glow worm" matches "Glow-worm" (as the engineer UI does). */
const brandKey = (s: string): string => s.trim().toLowerCase().replace(/[\s-]+/g, "");

/** Returns the canonical allowed brand name, or null when the brand is not public-facing. */
export const isAllowedBrand = (brand: string): string | null => {
  const q = brandKey(brand);
  return ALLOWED_BRANDS.find((b) => brandKey(b) === q) ?? null;
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
  const hit = findExactCode(publishedOnly(rows), code);
  if (hit) {
    return { found: true, code: hit.code, category: hit.category ?? null, explanation: hit.explanation, manual_url: hit.manual_url };
  }
  return { found: false, manual_url: brand ? (MANUAL_LINKS[brand] ?? null) : null };
};
