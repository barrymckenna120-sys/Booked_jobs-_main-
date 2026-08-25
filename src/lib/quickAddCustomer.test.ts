import { describe, it, expect } from "vitest";
import {
  validatePhone,
  validatePhoneLegacyShape,
  validateLandline,
  validateEircode,
  validateRequired,
  formatEircode,
  formatPhoneInternational,
  last9Digits,
  samePhone,
} from "./customerValidation";


/**
 * Regression tests for the New Job wizard quick-add customer form
 * (StepCustomer in NewJobPanel.tsx). Covers the "Fred  White " defects:
 * un-normalised phone, untrimmed name, unformatted eircode.
 */

// Mirrors StepCustomer's canProceed for the isNew branch. Duplicates are a
// warning, not a gate, so they are deliberately absent here.
const canProceedNew = (name: string, phone: string, address: string, checking: boolean) =>
  Boolean(name.trim() && validatePhone(phone) === null && address.trim() && !checking);

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

  it("blocks Continue on invalid phone or an in-flight check", () => {
    expect(canProceedNew("Fred White", "0894436301", "20 Harcourt St", false)).toBe(true);
    expect(canProceedNew("Fred White", "12345", "20 Harcourt St", false)).toBe(false);
    expect(canProceedNew("Fred White", "0894436301", "20 Harcourt St", true)).toBe(false);
    expect(canProceedNew("", "0894436301", "20 Harcourt St", false)).toBe(false);
  });
});

/**
 * BJ duplicate-check fix: the check matched on exact `+353…` string equality
 * via `.maybeSingle()`, which ERRORS when several customers share a number
 * (15 K&N rows share +353892109224). It now matches on last-9 digits over a
 * list query, and duplicates warn instead of hard-blocking.
 */
describe("quick-add duplicate check", () => {
  // Mirrors the matching in StepCustomer.handleNext: `last9Digits` no longer
  // decides equality — `samePhone` does, so country codes must agree.
  const findMatches = (typed: string, rows: Array<{ id: string; name: string; phone: string | null }>) =>
    rows.filter((r) => samePhone(r.phone, formatPhoneInternational(typed)));

  const rows = [
    { id: "a", name: "Aisling Power", phone: "+353892109224" },
    { id: "b", name: "ZZ Scratch Boiler Audit", phone: "089 210 9224" },
    { id: "c", name: "Jim Wong", phone: "0892109224" },
    { id: "d", name: "Sean Murphy", phone: "+353871234567" },
    { id: "e", name: "No Phone", phone: null },
  ];

  it("matches the same line across every stored format", () => {
    const forms = ["+353894436301", "0894436301", "089 443 6301", "(089) 443-6301"];
    for (const a of forms) {
      for (const b of forms) expect(samePhone(a, b)).toBe(true);
    }
  });

  it("REGRESSION: does not flag a same-last-9 number from another country", () => {
    expect(samePhone("+212656802656", "+353656802656")).toBe(false);
    const withMoroccan = [...rows, { id: "m", name: "Test Handset", phone: "+212892109224" }];
    expect(findMatches("0892109224", withMoroccan).map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps last9Digits as a narrowing hint that deliberately collides", () => {
    expect(last9Digits("+353894436301")).toBe("894436301");
    expect(last9Digits("089 443 6301")).toBe("894436301");
    // Same key across countries — which is exactly why it must not gate equality.
    expect(last9Digits("+212656802656")).toBe(last9Digits("+353656802656"));
  });

  it("returns an empty key for unmatchable input so blanks never match each other", () => {
    expect(last9Digits("")).toBe("");
    expect(last9Digits("12345")).toBe("");
    expect(last9Digits(null)).toBe("");
    expect(last9Digits(undefined)).toBe("");
    expect(samePhone(null, null)).toBe(false);
    expect(samePhone("", "")).toBe(false);
    expect(findMatches("12345", rows)).toHaveLength(0);
  });


  it("returns EVERY match instead of erroring on multiple rows", () => {
    const matches = findMatches("0892109224", rows);
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.name)).toEqual([
      "Aisling Power",
      "ZZ Scratch Boiler Audit",
      "Jim Wong",
    ]);
  });

  it("finds a match typed in a different format to the stored value", () => {
    expect(findMatches("087 123 4567", rows).map((m) => m.name)).toEqual(["Sean Murphy"]);
  });

  it("returns nothing for a genuinely unused number", () => {
    expect(findMatches("0834567890", rows)).toHaveLength(0);
  });

  // Mirrors the gate order in handleNext: force/ack short-circuits the query.
  const gate = (opts: { force: boolean; acked: boolean; matches: number; queryFailed: boolean }) => {
    if (opts.force || opts.acked) return "proceed";
    if (opts.queryFailed) return "blocked-error";
    return opts.matches > 0 ? "warned" : "proceed";
  };

  it("warns on matches, but Create anyway proceeds", () => {
    expect(gate({ force: false, acked: false, matches: 3, queryFailed: false })).toBe("warned");
    expect(gate({ force: true, acked: false, matches: 3, queryFailed: false })).toBe("proceed");
    expect(gate({ force: false, acked: true, matches: 3, queryFailed: false })).toBe("proceed");
  });

  it("still hard-blocks on a real query failure", () => {
    expect(gate({ force: false, acked: false, matches: 0, queryFailed: true })).toBe("blocked-error");
  });

  it("proceeds with no warning when there are no matches", () => {
    expect(gate({ force: false, acked: false, matches: 0, queryFailed: false })).toBe("proceed");
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
