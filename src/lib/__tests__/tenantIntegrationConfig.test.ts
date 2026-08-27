import { describe, it, expect } from "vitest";
import { mergeIntegrationConfig, buildTenantConfigRows } from "../tenantIntegrationConfig";

describe("mergeIntegrationConfig", () => {
  it("saves a changed existing value", () => {
    const out = mergeIntegrationConfig(
      { merchant_code: "OLD" },
      { merchant_code: "NEW" }
    );
    expect(out).toEqual({ merchant_code: "NEW" });
  });

  it("clears an existing value when submitted empty", () => {
    const out = mergeIntegrationConfig(
      { merchant_code: "OLD" },
      { merchant_code: "" }
    );
    expect(out.merchant_code).toBeUndefined();
    expect("merchant_code" in out).toBe(false);
  });

  it("treats whitespace-only input as cleared", () => {
    const out = mergeIntegrationConfig({ api_key_secret: "S" }, { api_key_secret: "   " });
    expect("api_key_secret" in out).toBe(false);
  });

  it("leaves keys that were not submitted untouched", () => {
    const out = mergeIntegrationConfig(
      { merchant_code: "OLD", environment: "live", extra: 1 },
      { merchant_code: "" }
    );
    expect(out).toEqual({ environment: "live", extra: 1 });
  });

  it("trims saved values", () => {
    const out = mergeIntegrationConfig({}, { renewal_form_url: " https://x " });
    expect(out.renewal_form_url).toBe("https://x");
  });
});

describe("buildTenantConfigRows", () => {
  it("merges per integration type and preserves unsubmitted keys", () => {
    const rows = buildTenantConfigRows(
      "org-1",
      {
        sumup: { merchant_code: "", environment: "test" },
        tally: { renewal_form_url: "https://tally.so/r/abc" },
      },
      [
        { integration_type: "sumup", config: { merchant_code: "OLD", api_key_secret: "K" } },
        { integration_type: "tally", config: { new_booking_url: "https://keep.me" } },
      ]
    );

    const sumup = rows.find((r) => r.integration_type === "sumup")!;
    expect(sumup.config).toEqual({ api_key_secret: "K", environment: "test" });

    const tally = rows.find((r) => r.integration_type === "tally")!;
    expect(tally.config).toEqual({
      new_booking_url: "https://keep.me",
      renewal_form_url: "https://tally.so/r/abc",
    });

    expect(rows.every((r) => r.organisation_id === "org-1")).toBe(true);
  });

  it("handles missing existing rows", () => {
    const rows = buildTenantConfigRows("org-2", { make: { review_webhook_url: "" } }, null);
    expect(rows).toEqual([
      { organisation_id: "org-2", integration_type: "make", config: {} },
    ]);
  });
});
