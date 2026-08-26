import { describe, expect, it } from "vitest";
import { extractRefDigits, matchesJobRef } from "./jobRefSearch";

describe("job reference search", () => {
  it("extracts digits from tenant-specific job prefixes", () => {
    expect(extractRefDigits("KN-123")).toBe("123");
    expect(extractRefDigits("DG-9001")).toBe("9001");
    expect(extractRefDigits("dg 009001")).toBe("009001");
  });

  it("matches Dublin Gas references by full reference or digits", () => {
    expect(matchesJobRef("DG-9001", "9001")).toBe(true);
    expect(matchesJobRef("DG-9001", "DG-9001")).toBe(true);
    expect(matchesJobRef("DG-009001", "9001")).toBe(true);
  });

  it("does not match unrelated references", () => {
    expect(matchesJobRef("DG-9001", "9002")).toBe(false);
    expect(matchesJobRef(null, "9001")).toBe(false);
  });
});