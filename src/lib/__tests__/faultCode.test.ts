import { describe, it, expect } from "vitest";
import { findExactCode, anyCodeStartsWith } from "../faultCode";
import { resolveFaultResult } from "../faultFinder";

const codes = [
  "F1", "F4 / L4", "F5 / L5", "--", "00", "d",
  "Flame On Before Gas On", "F.22", "228",
].map((code) => ({ code, category: "fault", explanation: code, manual_url: "https://m" }));

const hit = (q: string) => findExactCode(codes, q)?.code ?? null;

describe("shared fault-code matching", () => {
  it("'/' alternatives match each part and the whole", () => {
    expect(hit("f4")).toBe("F4 / L4");
    expect(hit("l4")).toBe("F4 / L4");
    expect(hit("F4/L4")).toBe("F4 / L4");
    expect(hit("F4 / L4")).toBe("F4 / L4");
  });
  it("ignores case and spaces", () => {
    expect(hit("F 1")).toBe("F1");
    expect(hit("D")).toBe("d");
  });
  it("empty normalised search never matches", () => {
    for (const q of ["", "-", "--", "   ", " - "]) {
      expect(hit(q)).toBeNull();
      expect(anyCodeStartsWith(codes, q)).toBe(false);
    }
  });
  it("existing codes still match", () => {
    expect(hit("flame on before gas on")).toBe("Flame On Before Gas On");
    expect(hit("F22")).toBe("F.22");
    expect(hit("f.22")).toBe("F.22");
    expect(hit("228")).toBe("228");
  });
  it("exact match beats a partial suggestion", () => {
    const rows = [{ code: "F10" }, { code: "F1" }];
    expect(findExactCode(rows, "F1")?.code).toBe("F1");
    const r = resolveFaultResult(codes as never, "F1", "Ideal", false);
    expect(r.status).toBe("found");
  });
  it("engineer live result: '--' search is idle, L4 is found", () => {
    expect(resolveFaultResult(codes as never, "--", "Ideal", true).status).toBe("idle");
    const r = resolveFaultResult(codes as never, "L4", "Ideal", false);
    expect(r.status === "found" && r.fault.code).toBe("F4 / L4");
  });
});
