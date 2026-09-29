import { describe, it, expect } from "vitest";
import { rebuildMessageFooter, buildContactSyncPatch } from "../messageFooter";

describe("rebuildMessageFooter", () => {
  const stale = "K&N gas services Ltd | 12 Beechdale Road | 0872354257";

  it("piped footer: keeps first segment, replaces address and phone", () => {
    expect(rebuildMessageFooter({ existingFooter: stale, businessName: "Other", address: "1 New St", phone: "0873685252" }))
      .toBe("K&N gas services Ltd | 1 New St | 0873685252");
  });

  it("no-pipe footer: keeps the whole footer as the name", () => {
    expect(rebuildMessageFooter({ existingFooter: "K&N Gas Services", businessName: "Other", address: "83 The Dale", phone: "087" }))
      .toBe("K&N Gas Services | 83 The Dale | 087");
  });

  it("blank address is dropped (old address removed)", () => {
    const out = rebuildMessageFooter({ existingFooter: stale, address: "", phone: "0873685252" });
    expect(out).toBe("K&N gas services Ltd | 0873685252");
    expect(out).not.toContain("Beechdale");
    expect(out).not.toContain("0872354257");
  });

  it("blank phone is dropped", () => {
    expect(rebuildMessageFooter({ existingFooter: stale, address: "1 New St", phone: "  " }))
      .toBe("K&N gas services Ltd | 1 New St");
  });

  it("empty footer falls back to business name", () => {
    expect(rebuildMessageFooter({ existingFooter: "", businessName: "Acme", address: null, phone: null })).toBe("Acme");
    expect(rebuildMessageFooter({ existingFooter: null, businessName: "Acme", address: "1 St", phone: "01" })).toBe("Acme | 1 St | 01");
  });
});

describe("buildContactSyncPatch", () => {
  it("syncs company_phone to business phone and rebuilds footer", () => {
    expect(buildContactSyncPatch({ existingFooter: "Dublin Gas | 5 Main St | 01 5433433", address: "5 Main St", phone: "014412618" }))
      .toEqual({ company_phone: "014412618", message_footer: "Dublin Gas | 5 Main St | 014412618" });
  });
  it("blank phone gives null company_phone", () => {
    expect(buildContactSyncPatch({ existingFooter: "X", phone: "" }).company_phone).toBeNull();
  });
});
