import { describe, it, expect, beforeEach } from "vitest";
import { modelsForBrand, buildBrandModelIndex, filterOptions, getManualLink, loadRecent, lookupFault, saveRecent, STARTER_BRANDS } from "./faultFinder";

const mem: Record<string,string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => mem[k] ?? null,
  setItem: (k: string, v: string) => { mem[k] = v; },
  clear: () => { for (const k of Object.keys(mem)) delete mem[k]; },
};

describe("faultFinder", () => {
  beforeEach(() => localStorage.clear());

  it("never returns a diagnosis in Phase 1", async () => {
    const r = await lookupFault("Baxi", "800 Combi", "E133");
    expect(r.status).toBe("unknown");
    expect(r.manualUrl).toMatch(/^https:\/\/www\.baxi/);
  });

  it("has an official manual link for every starter brand", () => {
    STARTER_BRANDS.forEach((b) => expect(getManualLink(b)).toMatch(/^https:\/\//));
    expect(getManualLink("glowworm")).toBe(getManualLink("Glow-worm"));
    expect(getManualLink("Unknown Brand")).toBeNull();
  });

  it("dedupes brands and models case-insensitively", () => {
    const idx = buildBrandModelIndex([
      { brand_name: "baxi", model_name: "800 Combi" },
      { brand_name: "Baxi", model_name: "800 combi" },
      { brand_name: "Alpha", model_name: null },
      { brand_name: "  ", model_name: "x" },
    ]);
    expect(idx.get("Baxi")).toEqual(["600 Combi", "800 Combi"]);
    expect(idx.has("Alpha")).toBe(true);
    expect([...idx.keys()].length).toBe(STARTER_BRANDS.length + 1);
  });

  it("every starter brand has models even with no database rows", () => {
    const idx = buildBrandModelIndex([]);
    STARTER_BRANDS.forEach((b) => expect(modelsForBrand(idx, b).length).toBeGreaterThan(0));
    expect(modelsForBrand(idx, "glowworm")).toEqual(["Energy Combi"]);
    expect(modelsForBrand(idx, "Nobody")).toEqual([]);
  });

  it("filters options", () => {
    expect(filterOptions(["Baxi", "Vaillant"], "vai")).toEqual(["Vaillant"]);
    expect(filterOptions(["Baxi"], "")).toEqual(["Baxi"]);
  });

  it("remembers recent brand/model", () => {
    expect(loadRecent()).toBeNull();
    saveRecent("Ideal", "Logic Combi");
    expect(loadRecent()).toEqual({ brand: "Ideal", model: "Logic Combi" });
  });
});
