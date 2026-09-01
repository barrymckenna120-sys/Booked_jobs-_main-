import { describe, it, expect } from "vitest";
import {
  normalisePhoneKey,
  normaliseGprnKey,
  normaliseNameAddressKey,
  completenessScore,
  extraFields,
  findInFileDuplicateGroups,
  matchExistingCustomers,
  buildMergePayload,
} from "../importDuplicates";

describe("key normalisation", () => {
  it("treats +353 / 0 / spaced phone formats as the same number", () => {
    expect(normalisePhoneKey("+353 87 123 4567")).toBe("871234567");
    expect(normalisePhoneKey("087 1234567")).toBe("871234567");
    expect(normalisePhoneKey("00353871234567")).toBe("871234567");
  });

  it("returns blank for missing values so blanks never match", () => {
    expect(normalisePhoneKey("")).toBe("");
    expect(normaliseGprnKey(null)).toBe("");
    expect(normaliseNameAddressKey("Ann Ward", "")).toBe("");
  });

  it("strips GPRN punctuation", () => {
    expect(normaliseGprnKey("12 345 67")).toBe("1234567");
  });

  it("folds eircode into the name+address key", () => {
    expect(normaliseNameAddressKey("Ann  Ward", "1 Main St.", "D01 X123")).toBe(
      "ann ward|1 main st|d01 x123"
    );
    expect(normaliseNameAddressKey("Ann Ward", "1 Main St", "D01X123")).not.toBe(
      normaliseNameAddressKey("Ann Ward", "1 Main St", "D02X123")
    );
  });
});

describe("completeness", () => {
  it("counts populated fields only", () => {
    expect(completenessScore({ name: "A", phone: "", gprn: null })).toBe(1);
    expect(completenessScore(null)).toBe(0);
  });

  it("reports which fields the richer row adds", () => {
    expect(
      extraFields({ name: "A", gprn: "1234567", notes: "x" }, { name: "A", gprn: "", notes: null })
    ).toEqual(["gprn", "notes"]);
  });
});

describe("findInFileDuplicateGroups — the Ann Ward case", () => {
  const rows = [
    {
      rowNum: 2,
      data: {
        name: "Ann Ward",
        phone: "+353871234567",
        address: "1 Main St",
        eircode: "D01X123",
        gprn: "1234567",
        notes: "Key under mat",
      },
    },
    {
      rowNum: 3,
      data: {
        name: "ann ward",
        phone: "087 123 4567",
        address: "1 Main St.",
        eircode: "D01 X123",
        gprn: "",
        notes: "",
      },
    },
    {
      rowNum: 4,
      data: { name: "Joe Bloggs", phone: "+353899999999", address: "9 Other Rd", eircode: "T12AB34" },
    },
  ];

  it("groups the two Ann Ward rows and leaves the unrelated row alone", () => {
    const groups = findInFileDuplicateGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].rowNums).toEqual([2, 3]);
  });

  it("explains the match on both phone and name+address", () => {
    const [g] = findInFileDuplicateGroups(rows);
    expect(g.reasons).toEqual(["phone", "name_address"]);
  });

  it("suggests keeping the more complete row and excluding the sparse one", () => {
    const [g] = findInFileDuplicateGroups(rows);
    expect(g.keepRowNum).toBe(2);
    expect(g.suggestedExcludeRowNums).toEqual([3]);
  });

  it("groups transitively via GPRN even when phone differs", () => {
    const groups = findInFileDuplicateGroups([
      { rowNum: 2, data: { name: "A", phone: "0871111111", address: "1 X", gprn: "7654321" } },
      { rowNum: 3, data: { name: "B", phone: "0872222222", address: "2 Y", gprn: "7654321" } },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reasons).toEqual(["gprn"]);
  });

  it("does not group rows that only share a blank GPRN", () => {
    expect(
      findInFileDuplicateGroups([
        { rowNum: 2, data: { name: "A", phone: "0871111111", address: "1 X", gprn: "" } },
        { rowNum: 3, data: { name: "B", phone: "0872222222", address: "2 Y", gprn: "" } },
      ])
    ).toEqual([]);
  });

  it("breaks completeness ties by the earlier row", () => {
    const [g] = findInFileDuplicateGroups([
      { rowNum: 5, data: { name: "A", phone: "0871111111", address: "1 X" } },
      { rowNum: 6, data: { name: "A", phone: "0871111111", address: "1 X" } },
    ]);
    expect(g.keepRowNum).toBe(5);
    expect(g.suggestedExcludeRowNums).toEqual([6]);
  });
});

describe("matchExistingCustomers", () => {
  const existing = [
    { id: "c1", name: "Ann Ward", address: "1 Main St", eircode: "D01X123", phone: "+353871234567", gprn: "1234567" },
    { id: "c2", name: "Other Person", address: "5 Elm", eircode: "D02Y456", phone: "+353870000000", gprn: null },
  ];

  it("prefers a GPRN match", () => {
    const res = matchExistingCustomers({ gprn: "12 345 67", phone: "0899999999" }, existing);
    expect(res).toHaveLength(1);
    expect(res[0].customer.id).toBe("c1");
    expect(res[0].reason).toBe("gprn");
  });

  it("falls back to phone", () => {
    const res = matchExistingCustomers({ phone: "087 123 4567" }, existing);
    expect(res[0].reason).toBe("phone");
  });

  it("falls back to name + address", () => {
    const res = matchExistingCustomers(
      { name: "ANN WARD", address: "1 main st.", eircode: "d01 x123" },
      existing
    );
    expect(res[0].reason).toBe("name_address");
  });

  it("returns every customer sharing the winning key (ambiguous)", () => {
    const res = matchExistingCustomers({ phone: "0871234567" }, [
      ...existing,
      { id: "c3", name: "Twin", address: "1 Main St", phone: "0871234567", gprn: null },
    ]);
    expect(res.map((r) => r.customer.id).sort()).toEqual(["c1", "c3"]);
  });

  it("returns nothing when no key matches", () => {
    expect(matchExistingCustomers({ name: "Nobody", address: "Nowhere", phone: "0850000000" }, existing)).toEqual([]);
  });
});

describe("buildMergePayload", () => {
  it("only fills fields the existing customer is missing", () => {
    expect(
      buildMergePayload(
        { name: "Ann W", gprn: "1234567", notes: "New note", phone: "" },
        { name: "Ann Ward", gprn: null, notes: "  " }
      )
    ).toEqual({ gprn: "1234567", notes: "New note" });
  });

  it("never blanks an existing value", () => {
    expect(buildMergePayload({ name: "" }, { name: "Ann Ward" })).toEqual({});
  });
});
