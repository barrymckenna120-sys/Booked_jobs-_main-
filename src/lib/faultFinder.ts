/**
 * Boiler Fault Finder — Phase 1 (read-only).
 *
 * No verified fault-code library exists yet (Phase 2). `lookupFault` therefore
 * always returns "unknown" and directs the engineer to the official manual.
 * It must never return an unverified diagnosis.
 */

export const STARTER_BRANDS = [
  "Baxi",
  "Ideal",
  "Worcester Bosch",
  "Viessmann",
  "Vaillant",
  "Glow-worm",
] as const;

/** Starter model families (Phase 1 brief) — merged with boiler_brands rows. */
export const STARTER_MODELS: Record<string, string[]> = {
  Baxi: ["600 Combi", "800 Combi"],
  Ideal: ["Logic Combi", "Logic Max Combi"],
  "Worcester Bosch": ["Greenstar 4000"],
  Viessmann: ["Vitodens 100-W"],
  Vaillant: ["ecoTEC plus"],
  "Glow-worm": ["Energy Combi"],
};

/** Official manufacturer technical-document pages (public, no redistribution). */
const MANUAL_LINKS: Record<string, string> = {
  baxi: "https://www.baxi.co.uk/support/literature",
  ideal: "https://idealheating.com/tech-hub/literature",
  "worcester bosch": "https://www.worcester-bosch.co.uk/professional/literature",
  viessmann: "https://www.viessmann.co.uk/en/services/technical-documentation.html",
  vaillant: "https://www.vaillant.ie/installers/downloads/",
  "glow-worm": "https://www.glow-worm.co.uk/installers/downloads/",
};

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/glowworm|glow worm/, "glow-worm");

export const getManualLink = (brand: string | null | undefined): string | null =>
  MANUAL_LINKS[norm(brand)] ?? null;

export type PublishedFaultCode = {
  id: string; code: string; explanation: string; possible_causes: string[];
  technical_details: string | null; manual_title: string; manual_url: string;
  manual_revision: string | null; manual_page: string | null; category?: "fault" | "status" | "message";
};
export type PublishedFaultModel = { id: string; brand: string; model_name: string };

export type FaultLookupResult =
  | { status: "unknown"; manualUrl: string | null }
  | { status: "found"; fault: PublishedFaultCode };

const normCode = (c: string) => c.trim().toUpperCase().replace(/[\s.-]/g, "");

/** Exact code match within one model's published codes (never across models). */
export const matchFaultCode = (codes: PublishedFaultCode[], code: string): PublishedFaultCode | null =>
  codes.find((c) => normCode(c.code) === normCode(code)) ?? null;

/** Find the published library model for a brand/model pair (case-insensitive). */
export const findLibraryModel = (models: PublishedFaultModel[], brand: string, model: string) =>
  models.find((m) => norm(m.brand) === norm(brand) && norm(m.model_name) === norm(model)) ?? null;

export const lookupFault = async (
  brand: string,
  _model: string,
  code: string,
  codes: PublishedFaultCode[] = [],
): Promise<FaultLookupResult> => {
  const hit = matchFaultCode(codes, code);
  return hit ? { status: "found", fault: hit } : { status: "unknown", manualUrl: getManualLink(brand) };
};

export type BrandModelRow = { brand_name: string | null; model_name: string | null };

/** Deduplicated brand → models map (case-insensitive), starter brands always present. */
export const buildBrandModelIndex = (rows: BrandModelRow[]): Map<string, string[]> => {
  const brands = new Map<string, { label: string; models: Map<string, string> }>();
  const add = (b?: string | null, m?: string | null) => {
    const label = (b ?? "").trim();
    if (!label) return;
    const key = norm(label);
    if (!brands.has(key)) brands.set(key, { label, models: new Map() });
    const model = (m ?? "").trim();
    if (model) {
      const entry = brands.get(key)!;
      if (!entry.models.has(model.toLowerCase())) entry.models.set(model.toLowerCase(), model);
    }
  };
  STARTER_BRANDS.forEach((b) => (STARTER_MODELS[b] ?? [null]).forEach((m) => add(b, m)));
  rows.forEach((r) => add(r.brand_name, r.model_name));
  const out = new Map<string, string[]>();
  [...brands.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach((e) => out.set(e.label, [...e.models.values()].sort((a, b) => a.localeCompare(b))));
  return out;
};

/** Models for a brand, matched case-insensitively (e.g. "glowworm" → Glow-worm). */
export const modelsForBrand = (index: Map<string, string[]>, brand: string): string[] => {
  const key = [...index.keys()].find((k) => norm(k) === norm(brand));
  return key ? index.get(key)! : [];
};

/**
 * Model list: exact shared-library models first; a tenant's short model name is
 * dropped only when it is the same model minus a size/variant suffix
 * (e.g. "Logic+ Combi2" vs "Logic+ Combi2 C24 C30 C35"). Different generations
 * such as "600 Combi" vs "600 Combi 2" are kept.
 */
const libBaseKey = (s: string) =>
  norm(s).replace(/\s*\([^)]*\)\s*$/, "").replace(/(\s+c\d{2})+$/, "").trim();
export const mergeModelOptions = (libraryModels: string[], tenantModels: string[]): string[] => {
  const seen = new Set<string>(); const out: string[] = [];
  libraryModels.forEach((m) => { const k = norm(m); if (!seen.has(k)) { seen.add(k); seen.add(libBaseKey(m)); out.push(m); } });
  tenantModels.forEach((m) => { const k = norm(m); if (!seen.has(k)) { seen.add(k); out.push(m); } });
  return out;
};

export const filterOptions = (options: string[], query: string): string[] => {
  const q = query.trim().toLowerCase();
  return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
};

const RECENT_KEY = "bj.faultFinder.recent";

export const loadRecent = (): { brand: string; model: string } | null => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "null");
    return v && typeof v.brand === "string" ? { brand: v.brand, model: String(v.model ?? "") } : null;
  } catch (_e) {
    return null;
  }
};

export const saveRecent = (brand: string, model: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify({ brand, model }));
  } catch (_e) {
    /* storage unavailable — non-critical */
  }
};

/** Preview hosts only (Lovable preview / local dev) — never the published app or custom domains. */
export const isPreviewHost = (hostname: string): boolean =>
  hostname === "localhost" || hostname === "127.0.0.1" ||
  hostname.startsWith("id-preview--") || hostname.endsWith(".lovableproject.com");

export type LiveFaultResult =
  | { status: "idle" }
  | { status: "found"; fault: PublishedFaultCode }
  | { status: "unknown"; manualUrl: string | null };

/**
 * Derive the result from current inputs (no stale state): exact match → found;
 * no match and (submitted, or no code starts with what was typed) → unknown;
 * otherwise idle while the engineer is still typing a possible prefix.
 */
export const resolveFaultResult = (
  codes: PublishedFaultCode[], code: string, brand: string, submitted: boolean,
): LiveFaultResult => {
  const q = normCode(code);
  if (!q || !brand.trim()) return { status: "idle" };
  const hit = matchFaultCode(codes, code);
  if (hit) return { status: "found", fault: hit };
  const stillPrefix = codes.some((c) => normCode(c.code).startsWith(q));
  if (!submitted && stillPrefix) return { status: "idle" };
  return { status: "unknown", manualUrl: codes.find((c) => c.manual_url)?.manual_url ?? getManualLink(brand) };
};
