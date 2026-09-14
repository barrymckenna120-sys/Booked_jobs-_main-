import { describe, it, expect } from "vitest";
import { normalisePublicDomain } from "../publicDomain";

describe("normalisePublicDomain", () => {
  it("keeps a bare host as-is", () => {
    expect(normalisePublicDomain("kngasservices.bookedjobs.ie")).toEqual({
      ok: true,
      value: "kngasservices.bookedjobs.ie",
    });
  });

  // Regression: a pasted full URL used to be stored verbatim, producing
  // https://https://host/quote/... in customer messages.
  it("strips scheme, path and trailing dots, and lowercases", () => {
    expect(normalisePublicDomain(" HTTPS://Dublin-Gas.BookedJobs.ie/quote/x ")).toEqual({
      ok: true,
      value: "dublin-gas.bookedjobs.ie",
    });
  });

  it("treats blank as cleared rather than invalid", () => {
    expect(normalisePublicDomain("   ")).toEqual({ ok: true, value: null });
  });

  it("rejects anything that is not a hostname", () => {
    expect(normalisePublicDomain("not a domain").ok).toBe(false);
    expect(normalisePublicDomain("localhost").ok).toBe(false);
    expect(normalisePublicDomain("-bad.example.com").ok).toBe(false);
  });
});
