import { describe, expect, it } from "vitest";
import { resolveEffectiveOrgId } from "./resolveEffectiveOrgId";

describe("resolveEffectiveOrgId", () => {
  it("uses the selected tenant for any server-side superadmin, not only the legacy hardcoded email", () => {
    expect(
      resolveEffectiveOrgId({
        profileOrgId: "home-org",
        profileRole: "superadmin",
        sessionEmail: "office@example.com",
        viewingOrgId: "view-as-org",
        legacySuperAdminEmail: "barrymckenna120@gmail.com",
      }),
    ).toBe("view-as-org");
  });

  it("keeps normal users scoped to their profile organisation", () => {
    expect(
      resolveEffectiveOrgId({
        profileOrgId: "home-org",
        profileRole: "office",
        sessionEmail: "office@example.com",
        viewingOrgId: "view-as-org",
        legacySuperAdminEmail: "barrymckenna120@gmail.com",
      }),
    ).toBe("home-org");
  });
});