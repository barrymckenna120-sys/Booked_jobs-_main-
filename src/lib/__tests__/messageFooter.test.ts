import { describe, it, expect } from "vitest";
import { rebuildMessageFooter } from "../messageFooter";

describe("rebuildMessageFooter", () => {
  const stale = "K&N gas services Ltd | 12 Beechdale Road | 0872354257";

  it("replaces stale address and phone, keeping the name segment", () => {
    expect(rebuildMessageFooter({ existingFooter: stale, businessName: "Other", address: "1 New St", phone: "0873685252" }))
      .toBe("K&N gas services Ltd | 1 New St | 0873685252");
  });

  it("drops a deleted address instead of keeping the old one", () => {
    const out = rebuildMessageFooter({ existingFooter: stale, address: "", phone: "0873685252" });
    expect(out).toBe("K&N gas services Ltd | 0873685252");
    expect(out).not.toContain("Beechdale");
    expect(out).not.toContain("0872354257");
  });

  it("keeps a name-only footer name unchanged", () => {
    expect(rebuildMessageFooter({ existingFooter: "K&N Gas Services", address: "83 The Dale", phone: "087" }))
      .toBe("K&N Gas Services | 83 The Dale | 087");
  });

  it("falls back to business name when no footer exists", () => {
    expect(rebuildMessageFooter({ existingFooter: null, businessName: "Acme", address: null, phone: null })).toBe("Acme");
  });
});
