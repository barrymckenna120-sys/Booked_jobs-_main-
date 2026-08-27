import { describe, it, expect } from "vitest";
import {
  decideFollowup,
  renderFollowupMessage,
  firstNameOf,
} from "../../../supabase/functions/_shared/quoteFollowup";

const openQuote = {
  status: "sent",
  approved: false,
  approved_at: null,
  viewed_at: null,
  follow_up_day3_sent: false,
  follow_up_day6_sent: false,
  customers: { name: "Paula White", phone: "+353871112223", opted_out: false },
};

describe("decideFollowup - day 3 matrix", () => {
  it("A: unread + unapproved -> send", () => {
    expect(decideFollowup(3, openQuote)).toEqual({ send: true, reason: "eligible" });
  });

  it("B: read + unapproved -> skip", () => {
    expect(decideFollowup(3, { ...openQuote, viewed_at: "2026-08-20T10:00:00Z" })).toEqual({
      send: false,
      reason: "quote_read",
    });
    // status 'viewed' alone must also stop it
    expect(decideFollowup(3, { ...openQuote, status: "viewed" }).send).toBe(false);
  });

  it("C: unread + approved -> skip", () => {
    expect(decideFollowup(3, { ...openQuote, approved: true }).reason).toBe("quote_approved");
    expect(decideFollowup(3, { ...openQuote, approved_at: "2026-08-20T10:00:00Z" }).reason).toBe(
      "quote_approved",
    );
    expect(decideFollowup(3, { ...openQuote, status: "Accepted" }).reason).toBe("quote_approved");
  });

  it("D: read + approved -> skip", () => {
    expect(
      decideFollowup(3, { ...openQuote, viewed_at: "2026-08-20T10:00:00Z", approved: true }).send,
    ).toBe(false);
  });

  it("E: day 3 already sent -> skip (no duplicate)", () => {
    expect(decideFollowup(3, { ...openQuote, follow_up_day3_sent: true })).toEqual({
      send: false,
      reason: "already_sent",
    });
  });

  it("skips opted-out, phoneless and customer-less quotes", () => {
    expect(decideFollowup(3, { ...openQuote, customers: { ...openQuote.customers, opted_out: true } }).reason).toBe("opted_out");
    expect(decideFollowup(3, { ...openQuote, customers: { name: "X", phone: "  " } }).reason).toBe("no_phone");
    expect(decideFollowup(3, { ...openQuote, customers: null }).reason).toBe("no_customer");
  });
});

describe("decideFollowup - day 6 matrix", () => {
  const day6Ready = { ...openQuote, follow_up_day3_sent: true };

  it("A: unread + unapproved (day3 sent) -> send", () => {
    expect(decideFollowup(6, day6Ready)).toEqual({ send: true, reason: "eligible" });
  });

  it("B: read before day 6 -> skip (day 6 re-checks state)", () => {
    expect(decideFollowup(6, { ...day6Ready, viewed_at: "2026-08-25T09:00:00Z" }).reason).toBe(
      "quote_read",
    );
  });

  it("C: approved before day 6 -> skip", () => {
    expect(decideFollowup(6, { ...day6Ready, approved: true }).reason).toBe("quote_approved");
  });

  it("D: read + approved -> skip", () => {
    expect(
      decideFollowup(6, { ...day6Ready, viewed_at: "2026-08-25T09:00:00Z", approved: true }).send,
    ).toBe(false);
  });

  it("E: day 6 already sent -> skip (no duplicate)", () => {
    expect(decideFollowup(6, { ...day6Ready, follow_up_day6_sent: true }).reason).toBe("already_sent");
  });

  it("never sends day 6 when day 3 never went out", () => {
    expect(decideFollowup(6, openQuote).reason).toBe("day3_not_sent");
  });
});

describe("renderFollowupMessage", () => {
  const dublinGas = {
    customerName: "Paula White",
    businessName: "Dublin Gas",
    businessPhone: "01 2121211",
    quoteNumber: "Q-2026-0151",
    quoteUrl: "https://dublin-gas.bookedjobs.ie/quote/abc",
  };

  it("renders distinct day 3 and day 6 copy with all variables resolved", () => {
    const d3 = renderFollowupMessage(3, dublinGas);
    const d6 = renderFollowupMessage(6, dublinGas);
    expect(d3).not.toEqual(d6);
    for (const msg of [d3, d6]) {
      expect(msg).toContain("Hi Paula,");
      expect(msg).toContain("Q-2026-0151");
      expect(msg).toContain("https://dublin-gas.bookedjobs.ie/quote/abc");
      expect(msg).toContain("Thanks,\nDublin Gas");
      expect(msg).not.toMatch(/undefined|null|\{\{|\}\}/);
    }
    expect(d6).toContain("call us on 01 2121211");
    expect(d3).not.toContain("call us on");
  });

  it("degrades gracefully with no link, no number, no phone, no name", () => {
    const msg = renderFollowupMessage(6, {});
    expect(msg).toContain("Hi there,");
    expect(msg).toContain("the quote");
    expect(msg).toContain("Reply to this message if you have any questions.");
    expect(msg).toContain("our team");
    expect(msg).not.toContain("View your quote");
    expect(msg).not.toMatch(/undefined|null|https?:\/\/\s|:\s*$/);
  });

  it("takes the first name only", () => {
    expect(firstNameOf("  Mary Jane  O'Brien ")).toBe("Mary");
    expect(firstNameOf(null)).toBe("there");
  });
});
