import { describe, it, expect } from "vitest";
import {
  buildCategoryInsert,
  buildCategoryUpdate,
} from "@/lib/categoryPayload";

const ORG = "f1950683-e8b9-41cf-8972-2aa59516850d";

describe("category insert payload", () => {
  it("always names the organisation so the row is never left unowned", () => {
    const res = buildCategoryInsert({ name: "Boilers", description: "" }, ORG);
    expect(res).toEqual({
      ok: true,
      payload: { name: "Boilers", description: null, organisation_id: ORG },
    });
  });

  it("refuses to build an insert when the org has not resolved yet", () => {
    for (const orgId of [null, undefined, ""]) {
      expect(
        buildCategoryInsert({ name: "Boilers", description: "" }, orgId),
      ).toEqual({ ok: false, reason: "missing-org" });
    }
  });

  it("requires a name, and reports that before the org check", () => {
    expect(buildCategoryInsert({ name: "   ", description: "x" }, ORG)).toEqual({
      ok: false,
      reason: "missing-name",
    });
    expect(buildCategoryInsert({ name: "  ", description: "" }, null)).toEqual({
      ok: false,
      reason: "missing-name",
    });
  });

  it("trims fields and stores an empty description as null", () => {
    const res = buildCategoryInsert(
      { name: "  pipe work  ", description: "  bits  " },
      ORG,
    );
    expect(res).toEqual({
      ok: true,
      payload: {
        name: "pipe work",
        description: "bits",
        organisation_id: ORG,
      },
    });
  });
});

describe("category update payload", () => {
  it("never carries an organisation, so an edit cannot reassign the tenant", () => {
    const res = buildCategoryUpdate({ name: "Labour", description: "" });
    expect(res).toEqual({
      ok: true,
      payload: { name: "Labour", description: null },
    });
    expect(res.ok && "organisation_id" in res.payload).toBe(false);
  });

  it("requires a name", () => {
    expect(buildCategoryUpdate({ name: "", description: "x" })).toEqual({
      ok: false,
      reason: "missing-name",
    });
  });
});
