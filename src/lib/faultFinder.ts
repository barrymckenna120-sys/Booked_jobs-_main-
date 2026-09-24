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

export type FaultLookupResult = { status: "unknown"; manualUrl: string | null };

export const lookupFault = async (
  brand: string,
  _model: string,
  _code: string,
): Promise<FaultLookupResult> => ({ status: "unknown", manualUrl: getManualLink(brand) });

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
