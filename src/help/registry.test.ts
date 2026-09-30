import { describe, it, expect } from "vitest";
import { findGuide, findStep, searchHelp, HELP_GUIDES } from "./registry";

describe("help registry", () => {
  it("finds guides and steps by slug", () => {
    const g = findGuide("customer-import");
    expect(g).not.toBeNull();
    expect(findStep(g, "import-result")?.index).toBe(g!.steps.length - 1);
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
  it("mobile crops stay inside the image", () => {
    HELP_GUIDES.forEach((g) => g.steps.forEach((s) => s.screenshots.forEach(({ mobileCrop: c }) => {
      if (!c) return;
      expect(c.width).toBeGreaterThan(0); expect(c.height).toBeGreaterThan(0);
      expect(c.x + c.width).toBeLessThanOrEqual(100); expect(c.y + c.height).toBeLessThanOrEqual(100);
    })));
  });
  it("customer import follows the approved 10-step guide", () => {
    expect(findGuide("customer-import")!.steps.map((s) => s.title)).toEqual([
      "Open Customer Import", "Download the BookedJobs template", "Upload your Excel file", "Check recognised fields",
      "Fix blocked rows", "Review duplicate rows", "Review warnings", "Review customers already in BookedJobs",
      "Review and confirm", "Check the import result",
    ]);
  });
});
