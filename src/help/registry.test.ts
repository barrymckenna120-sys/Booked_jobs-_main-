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
  it("screenshot markers stay inside the image and have unique numbers", () => {
    HELP_GUIDES.forEach((g) => g.steps.forEach((s) => s.screenshots.forEach(({ markers = [] }) => {
      expect(new Set(markers.map((marker) => marker.number)).size).toBe(markers.length);
      markers.forEach((marker) => {
        expect(marker.x).toBeGreaterThanOrEqual(0); expect(marker.x).toBeLessThanOrEqual(100);
        expect(marker.y).toBeGreaterThanOrEqual(0); expect(marker.y).toBeLessThanOrEqual(100);
      });
    })));
  });
  it("orders Engineer steps 3-5 with no shared screenshots", () => {
    const g = findGuide("engineer")!;
    expect(g.steps).toHaveLength(11);
    expect(g.steps.slice(2, 5).map((s) => s.slug)).toEqual(["todays-jobs", "customer-job-details", "travel"]);
    const srcs = g.steps.slice(2, 5).flatMap((s) => s.screenshots.flatMap((x) => x.segments ? x.segments.map((p) => p.src) : [x.src]));
    expect(new Set(srcs).size).toBe(srcs.length);
    const today = g.steps[2].screenshots;
    expect(today).toHaveLength(1);
    expect(today[0].segments).toHaveLength(2);
  });

  it("computes segment crop styles", () => {
    const st = segmentStyles({ src: "x", naturalWidth: 412, naturalHeight: 842, crop: { x: 1, y: 53, width: 401, height: 789 } });
    expect(st.box.aspectRatio).toBe("401 / 789");
    expect(parseFloat(st.img.width)).toBeCloseTo(102.74, 1);
    expect(parseFloat(st.img.top)).toBeCloseTo(-6.72, 1);
  });

  it("marks the four Engineer header controls", () => {
    expect(findStep(findGuide("engineer"), "header")?.step.screenshots[0].markers?.map((marker) => marker.label)).toEqual([
      "Engineer", "Office", "Notifications", "Three dots (⋮)",
    ]);
  });
  it("customer import follows the approved 10-step guide", () => {
    expect(findGuide("customer-import")!.steps.map((s) => s.title)).toEqual([
      "Open Customer Import", "Download the BookedJobs template", "Upload your Excel file", "Check recognised fields",
      "Fix blocked rows", "Review duplicate rows", "Review warnings", "Review customers already in BookedJobs",
      "Review and confirm", "Check the import result",
    ]);
  });
  it.each([
    ["merge","customer-import"],["import customer","customer-import"],["service reminder","customer-profile"],
    ["customer payment","customer-profile"],["order a part","engineer"],["request part","engineer"],
    ["fault finder","engineer"],["take payment","engineer"],["add engineer","team-users"],
    ["engineer availability","team-users"],["reset password","team-users"],["block user","team-users"],
  ])("search %s finds %s", (q, g) => expect(searchHelp(q)[0]?.guide.slug).toBe(g));
});
