import { describe, expect, it } from "vitest";
import {
  environmentMismatchWarning,
  normaliseEnvironment,
  validateSumUpForm,
  valuesForEnvironment,
} from "../sumupIntegrationForm";

const base = { merchantCode: "MBBMEYG7", secretName: "SUMUP_API_KEY_ACME", environment: "test" as const };

describe("validateSumUpForm", () => {
  it("accepts a well-formed config", () => {
    expect(validateSumUpForm(base)).toEqual({});
  });

  it("requires a merchant code", () => {
    expect(validateSumUpForm({ ...base, merchantCode: "  " }).merchant).toBeTruthy();
  });

  it("rejects a malformed merchant code", () => {
    expect(validateSumUpForm({ ...base, merchantCode: "AB" }).merchant).toBeTruthy();
    expect(validateSumUpForm({ ...base, merchantCode: "MB-BM" }).merchant).toBeTruthy();
  });

  it("accepts lowercase merchant codes (upper-cased on save)", () => {
    expect(validateSumUpForm({ ...base, merchantCode: "mbbmeyg7" }).merchant).toBeUndefined();
  });

  it("rejects a pasted API key in the secret-name field", () => {
    expect(validateSumUpForm({ ...base, secretName: "sup_sk_abc123" }).secret).toMatch(/NAME/);
  });

  it("rejects a lowercase secret name", () => {
    expect(validateSumUpForm({ ...base, secretName: "sumup_key" }).secret).toBeTruthy();
  });

  it("rejects an unknown environment", () => {
    expect(validateSumUpForm({ ...base, environment: "staging" as never }).environment).toBeTruthy();
  });
});

describe("normaliseEnvironment", () => {
  it("defaults unknown values to test", () => {
    expect(normaliseEnvironment(undefined)).toBe("test");
    expect(normaliseEnvironment("prod")).toBe("test");
  });

  it("passes through known values", () => {
    expect(normaliseEnvironment("live")).toBe("live");
  });
});

describe("valuesForEnvironment", () => {
  const envs = {
    test: { merchant_code: "m9mejm9k", api_key_secret: "SUMUP_API_KEY_ACME_TEST" },
    live: { merchant_code: "M9Z8RGV6", api_key_secret: "SUMUP_API_KEY_ACME" },
  };

  it("returns the saved pair for the selected environment, upper-cased", () => {
    expect(valuesForEnvironment("test", envs)).toEqual({
      merchantCode: "M9MEJM9K",
      secretName: "SUMUP_API_KEY_ACME_TEST",
    });
  });

  it("never bleeds one environment's secret into the other", () => {
    expect(valuesForEnvironment("live", { test: envs.test })).toEqual({ merchantCode: "", secretName: "" });
  });

  it("handles a missing environments map", () => {
    expect(valuesForEnvironment("test", null)).toEqual({ merchantCode: "", secretName: "" });
  });
});

describe("environmentMismatchWarning", () => {
  it("warns when a test-looking secret is used for live", () => {
    expect(environmentMismatchWarning("live", "SUMUP_API_KEY_ACME_TEST")).toBeTruthy();
    expect(environmentMismatchWarning("live", "SUMUP_SANDBOX_KEY")).toBeTruthy();
  });

  it("warns when a live-looking secret is used for test", () => {
    expect(environmentMismatchWarning("test", "SUMUP_API_KEY_LIVE")).toBeTruthy();
  });

  it("stays quiet for neutral names", () => {
    expect(environmentMismatchWarning("live", "SUMUP_API_KEY_ACME")).toBeNull();
    expect(environmentMismatchWarning("test", "SUMUP_API_KEY_ACME")).toBeNull();
  });
});
