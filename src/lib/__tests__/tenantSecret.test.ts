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

describe("env-stored per-tenant webhook secret (webhook_secret_name)", () => {
  const envRows = [
    { organisation_id: "org-env", config: { webhook_secret_name: "TALLY_SECRET_ENV" } },
    { organisation_id: "org-b", config: { webhook_secret: "bbb" } },
  ];
  const env = (name: string) => (name === "TALLY_SECRET_ENV" ? "s3cr3t-value" : undefined);

  it("resolves the tenant when the secret lives in the secret store, not the row", () => {
    expect(orgForSecret(envRows, "s3cr3t-value", env)).toBe("org-env");
  });

  it("does not match when no env resolver is supplied", () => {
    expect(orgForSecret(envRows, "s3cr3t-value")).toBeNull();
  });

  it("does not match an unset or blank env secret", () => {
    expect(orgForSecret(envRows, "s3cr3t-value", () => undefined)).toBeNull();
    expect(orgForSecret(envRows, "s3cr3t-value", () => "   ")).toBeNull();
  });

  it("still matches inline secrets on other tenants", () => {
    expect(orgForSecret(envRows, "bbb", env)).toBe("org-b");
  });

  it("fails closed when two tenants resolve to the same env value", () => {
    const ambiguous = [
      { organisation_id: "org-a", config: { webhook_secret_name: "A" } },
      { organisation_id: "org-b", config: { webhook_secret: "same" } },
    ];
    expect(orgForSecret(ambiguous, "same", () => "same")).toBeNull();
  });
});
