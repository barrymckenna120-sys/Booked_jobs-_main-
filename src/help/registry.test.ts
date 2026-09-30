import { describe, it, expect } from "vitest";
import { findGuide, findStep, searchHelp, HELP_GUIDES } from "./registry";

describe("help registry", () => {
  it("finds guides and steps by slug", () => {
    const g = findGuide("customer-import");
    expect(g).not.toBeNull();
    expect(findStep(g, "confirm-import")?.index).toBe(g!.steps.length - 1);
  });
  it("returns null for unknown slugs", () => {
    expect(findGuide("nope")).toBeNull();
    expect(findStep(findGuide("customer-import"), "nope")).toBeNull();
  });
  it("step slugs are unique within each guide", () => {
    HELP_GUIDES.forEach((g) => expect(new Set(g.steps.map((s) => s.slug)).size).toBe(g.steps.length));
  });
  it("search ranks title matches first and requires all words", () => {
    const r = searchHelp("merge existing");
    expect(r[0].step.slug).toBe("existing-customers");
    expect(searchHelp("zzqq")).toEqual([]);
    expect(searchHelp("")).toEqual([]);
  });
  it("every screenshot has alt text", () => {
    HELP_GUIDES.forEach((g) => g.steps.forEach((s) => s.screenshots.forEach((i) => expect(i.alt.length).toBeGreaterThan(10))));
  });
});
