import { describe, it, expect } from "vitest";
import { buildLogoStoragePath } from "@/lib/logoStoragePath";

describe("buildLogoStoragePath", () => {
  it("scopes the logo to the organisation folder (storage policy requirement)", () => {
    expect(buildLogoStoragePath("8c37827f-ce2c-4507-a821-a5e807d89856", "png")).toBe(
      "8c37827f-ce2c-4507-a821-a5e807d89856/logo.png"
    );
  });

  it("never falls back to a non-org folder when the org is unknown", () => {
    expect(() => buildLogoStoragePath(null, "png")).toThrow(/organisation/i);
    expect(() => buildLogoStoragePath(undefined, "png")).toThrow(/organisation/i);
  });

  it("normalises the extension", () => {
    expect(buildLogoStoragePath("org-1", "PNG")).toBe("org-1/logo.png");
    expect(buildLogoStoragePath("org-1", undefined)).toBe("org-1/logo.png");
  });
});
