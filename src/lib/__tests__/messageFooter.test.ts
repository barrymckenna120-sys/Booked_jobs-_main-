import { describe, it, expect } from "vitest";
import { buildContactSyncPatch } from "../messageFooter";

describe("buildContactSyncPatch", () => {
  it("syncs company_phone to the trimmed business phone", () => {
    expect(buildContactSyncPatch({ phone: " 014412618 " })).toEqual({ company_phone: "014412618" });
  });
  it("blank phone gives null company_phone", () => {
    expect(buildContactSyncPatch({ phone: "" }).company_phone).toBeNull();
    expect(buildContactSyncPatch({ phone: null }).company_phone).toBeNull();
  });
  it("never includes a message_footer key", () => {
    expect(Object.keys(buildContactSyncPatch({ phone: "087" }))).not.toContain("message_footer");
  });
});
