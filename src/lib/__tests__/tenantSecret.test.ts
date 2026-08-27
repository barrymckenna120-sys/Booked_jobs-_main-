import { describe, it, expect } from "vitest";
import {
  orgForSecret,
  orgsMatchingSecret,
} from "../../../supabase/functions/_shared/tenantSecret.ts";

const rows = [
  { organisation_id: "org-a", config: { webhook_secret: "aaa" } },
  { organisation_id: "org-a", config: { webhook_secret: "aaa", api_key: "x" } },
  { organisation_id: "org-b", config: { webhook_secret: "bbb" } },
  { organisation_id: "org-c", config: null },
  { organisation_id: null, config: { webhook_secret: "aaa" } },
];

describe("per-tenant webhook secret matching (BJ-0089 Band 4)", () => {
  it("resolves the owning organisation for a tenant secret", () => {
    expect(orgForSecret(rows, "aaa")).toBe("org-a");
    expect(orgForSecret(rows, "bbb")).toBe("org-b");
  });

  it("never matches on an empty or unknown secret", () => {
    expect(orgForSecret(rows, "")).toBeNull();
    expect(orgForSecret(rows, "   ")).toBeNull();
    expect(orgForSecret(rows, "nope")).toBeNull();
  });

  it("treats an ambiguous secret as no match (fails closed)", () => {
    const ambiguous = [
      { organisation_id: "org-a", config: { webhook_secret: "shared" } },
      { organisation_id: "org-b", config: { webhook_secret: "shared" } },
    ];
    expect(orgsMatchingSecret(ambiguous, "shared").sort()).toEqual(["org-a", "org-b"]);
    expect(orgForSecret(ambiguous, "shared")).toBeNull();
  });

  it("ignores rows with no organisation and tolerates missing config", () => {
    expect(orgsMatchingSecret(rows, "aaa")).toEqual(["org-a"]);
    expect(orgsMatchingSecret([], "aaa")).toEqual([]);
  });

  it("trims whitespace on both sides", () => {
    const padded = [{ organisation_id: "org-a", config: { webhook_secret: " aaa " } }];
    expect(orgForSecret(padded, "aaa")).toBe("org-a");
  });
});
