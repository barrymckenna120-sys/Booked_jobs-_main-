import { describe, expect, it } from "vitest";
import { assertSameOrganisation } from "../../../supabase/functions/_shared/sameOrg";

const A = "8c37827f-ce2c-4507-a821-a5e807d89856";
const B = "f1950683-e8b9-41cf-8972-2aa59516850d";

describe("assertSameOrganisation", () => {
  it("passes when every participant matches the expected org", () => {
    expect(
      assertSameOrganisation(A, [
        { label: "job", orgId: A },
        { label: "customer", orgId: A },
      ]),
    ).toEqual({ ok: true });
  });

  it("denies a cross-tenant participant", () => {
    const res = assertSameOrganisation(A, [
      { label: "job", orgId: A },
      { label: "customer", orgId: B },
    ]);
    expect(res.ok).toBe(false);
    expect((res as { detail: string }).detail).toContain("customer");
  });

  it("denies a participant with no organisation (fail closed, never best-effort)", () => {
    const res = assertSameOrganisation(A, [{ label: "invoice", orgId: null }]);
    expect(res.ok).toBe(false);
    expect((res as { detail: string }).detail).toContain("no organisation");
  });

  it("denies when the expected organisation is missing or blank", () => {
    expect(assertSameOrganisation("", [{ label: "job", orgId: A }]).ok).toBe(false);
    expect(assertSameOrganisation(null, [{ label: "job", orgId: A }]).ok).toBe(false);
  });

  it("ignores surrounding whitespace on both sides", () => {
    expect(assertSameOrganisation(` ${A} `, [{ label: "job", orgId: `${A} ` }])).toEqual({
      ok: true,
    });
  });
});
