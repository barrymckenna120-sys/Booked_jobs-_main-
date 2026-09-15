import { describe, it, expect } from "vitest";
import {
  PLATFORM_PUBLIC_HOST_FALLBACK,
  platformPublicUrl,
} from "../../../supabase/functions/_shared/tenantDomain";

describe("platformPublicUrl", () => {
  it("builds a token link on the platform host when a tenant has no branded domain", () => {
    expect(platformPublicUrl("/quote/abc", PLATFORM_PUBLIC_HOST_FALLBACK)).toBe(
      "https://karlsgas.lovable.app/quote/abc",
    );
  });

  it("accepts a bare hostname and normalises slashes", () => {
    expect(platformPublicUrl("pdf/abc", "example.app/")).toBe("https://example.app/pdf/abc");
  });

  it("returns null when no platform base is configured", () => {
    expect(platformPublicUrl("/quote/abc", "")).toBeNull();
    expect(platformPublicUrl("/quote/abc", null)).toBeNull();
  });

  it("never invents a tenant hostname from the path", () => {
    expect(platformPublicUrl("/quote/abc", PLATFORM_PUBLIC_HOST_FALLBACK)).not.toContain(
      "bookedjobs.ie",
    );
  });
});
