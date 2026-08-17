import { describe, it, expect } from "vitest";
import {
  validatePhone,
  validatePhoneLegacyShape,
  validateLandline,
  validateEircode,
  validateRequired,
  formatEircode,
  formatPhoneInternational,
} from "./customerValidation";


/**
 * Regression tests for the New Job wizard quick-add customer form
 * (StepCustomer in NewJobPanel.tsx). Covers the "Fred  White " defects:
 * un-normalised phone, untrimmed name, unformatted eircode.
 */

// Mirrors StepCustomer's canProceed for the isNew branch.
const canProceedNew = (name: string, phone: string, address: string, duplicate: boolean, checking: boolean) =>
  Boolean(name.trim() && validatePhone(phone) === null && address.trim() && !duplicate && !checking);

describe("quick-add customer normalisation", () => {
  it("normalises a leading-0 Irish mobile to +353", () => {
    expect(validatePhone("0894436301")).toBeNull();
    expect(formatPhoneInternational("0894436301")).toBe("+353894436301");
  });

  it("trims and collapses whitespace in the name", () => {
    const cleaned = "Fred  White ".replace(/\s+/g, " ").trim();
    expect(cleaned).toBe("Fred White");
    expect(validateRequired(cleaned)).toBeNull();
  });

  it("formats a lowercase unspaced eircode", () => {
    expect(validateEircode("d02h123")).toBeNull();
    expect(formatEircode("d02h123")).toBe("D02 H123");
  });

  it("rejects malformed phone input even though the formatter would pass it through", () => {
    expect(validatePhone("12345g")).not.toBeNull();
    // The formatter never throws or rejects — proof it must not be used as a gate.
    expect(formatPhoneInternational("12345g")).toBe("+35312345g");
  });

  it("blocks Continue on invalid phone, duplicates, or an in-flight check", () => {
    expect(canProceedNew("Fred White", "0894436301", "20 Harcourt St", false, false)).toBe(true);
    expect(canProceedNew("Fred White", "12345", "20 Harcourt St", false, false)).toBe(false);
    expect(canProceedNew("Fred White", "0894436301", "20 Harcourt St", true, false)).toBe(false);
    expect(canProceedNew("Fred White", "0894436301", "20 Harcourt St", false, true)).toBe(false);
    expect(canProceedNew("", "0894436301", "20 Harcourt St", false, false)).toBe(false);
  });
});

/** BJ-0046 follow-up: Mobile Number must be an Irish mobile; landlines go in their own field. */
describe("mobile-only primary phone", () => {
  it("accepts every Irish mobile prefix in national, international and spaced form", () => {
    for (const p of ["083", "084", "085", "086", "087", "089"]) {
      expect(validatePhone(`${p}1234567`)).toBeNull();
      expect(validatePhone(`+353${p.slice(1)}1234567`)).toBeNull();
      expect(validatePhone(`${p} 123 4567`)).toBeNull();
    }
  });

  it("rejects landlines", () => {
    expect(validatePhone("01 441 2618")).not.toBeNull();
    expect(validatePhone("+35314412618")).not.toBeNull();
    expect(validatePhone("0651234567")).not.toBeNull();
    expect(validatePhone("0211234567")).not.toBeNull();
  });

  it("keeps a shape-only check for untouched legacy records", () => {
    expect(validatePhoneLegacyShape("+35314412618")).toBeNull();
    expect(validatePhoneLegacyShape("0651234567")).toBeNull();
    expect(validatePhoneLegacyShape("")).not.toBeNull();
    expect(validatePhoneLegacyShape("12345g")).not.toBeNull();
  });
});

describe("optional landline field", () => {
  it("allows blank", () => {
    expect(validateLandline("")).toBeNull();
    expect(validateLandline("   ")).toBeNull();
  });

  it("accepts plausible landlines in any format", () => {
    expect(validateLandline("014412618")).toBeNull();
    expect(validateLandline("01 441 2618")).toBeNull();
    expect(validateLandline("+353 1 441 2618")).toBeNull();
  });

  it("rejects too-short and absurdly long input", () => {
    expect(validateLandline("123")).not.toBeNull();
    expect(validateLandline("1234567890123456")).not.toBeNull();
  });
});
