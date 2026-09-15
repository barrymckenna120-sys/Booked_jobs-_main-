import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND_SETTINGS,
  DEFAULT_CATEGORIES,
  DEFAULT_JOB_TIME_BLOCKS,
  DEFAULT_OPENING_HOURS,
  DEFAULT_SETTINGS,
  DEFAULT_TERMS,
  defaultPaymentPlaceholder,
  derivePrefix,
  generateWebhookSecret,

  TENANT_CONFIG_VERSION,
} from "../../../supabase/functions/_shared/tenantDefaults.ts";

describe("tenant defaults", () => {
  it("carries no tenant-specific identity anywhere in the default set", () => {
    const serialised = JSON.stringify({
      DEFAULT_SETTINGS,
      DEFAULT_BRAND_SETTINGS,
      DEFAULT_CATEGORIES,
      DEFAULT_TERMS,
      DEFAULT_OPENING_HOURS,
      DEFAULT_JOB_TIME_BLOCKS,
      placeholder: defaultPaymentPlaceholder(),
    }).toLowerCase();

    for (const forbidden of [
      "k&n",
      "kn gas",
      "kngasservices",
      "karlsgas",
      "dublin gas",
      "cavan",
      "8c37827f",
      "beechdale",
      "087",
      "sup_sk",
      "g.page",
    ]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("is version 1", () => {
    expect(TENANT_CONFIG_VERSION).toBe(1);
  });

  it("provisions exactly the six approved categories", () => {
    expect(DEFAULT_CATEGORIES).toEqual([
      "Boilers",
      "Parts",
      "Labour",
      "Materials",
      "Heat Controls",
      "Pipework",
    ]);
  });

  it("derives prefixes from the tenant's own slug", () => {
    expect(derivePrefix("acme-gas-services", 2)).toBe("AC");
    expect(derivePrefix("acme-gas-services", 1)).toBe("A");
    expect(derivePrefix("", 2)).toBe("BJ");
  });

  // Regression: <slug>.bookedjobs.ie has no wildcard DNS, so provisioning must
  // never derive a tenant domain — links fall back to the platform host.
  it("starts a new tenant with no service areas", () => {
    expect(DEFAULT_SETTINGS.service_areas).toEqual([]);
  });


  it("marks the payment placeholder as sandbox with no credentials", () => {
    const p = defaultPaymentPlaceholder();
    expect(p.environment).toBe("sandbox");
    expect(p.merchant_code).toBe("");
    expect(p.api_key_secret).toBe("");
    expect(p.environments.sandbox).toEqual({ merchant_code: "", api_key_secret: "" });
  });

  it("generates a unique webhook secret per call", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).not.toEqual(b);
    expect(a.startsWith("whsec_")).toBe(true);
    expect(a.length).toBeGreaterThan(30);
  });

  it("keeps working hours and time blocks internally consistent", () => {
    expect(DEFAULT_OPENING_HOURS).toHaveLength(7);
    expect(DEFAULT_OPENING_HOURS.filter((d) => d.enabled)).toHaveLength(6);
    expect(DEFAULT_JOB_TIME_BLOCKS.map((b) => b.label)).toEqual([
      "Morning",
      "Midday",
      "Afternoon",
    ]);
  });
});
