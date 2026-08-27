import { describe, it, expect } from "vitest";
import {
  normaliseLogStatus,
  formatMessageType,
  formatRecipientPhone,
  relatedLabel,
} from "../whatsappLogRow";

describe("normaliseLogStatus", () => {
  it("maps internal + provider values onto display statuses", () => {
    expect(normaliseLogStatus("pending")).toBe("queued");
    expect(normaliseLogStatus("Sent")).toBe("sent");
    expect(normaliseLogStatus("success")).toBe("sent");
    expect(normaliseLogStatus("delivered")).toBe("delivered");
    expect(normaliseLogStatus("read")).toBe("read");
    expect(normaliseLogStatus("failed")).toBe("failed");
  });

  it("handles empty/unknown values without throwing", () => {
    expect(normaliseLogStatus(null)).toBe("unknown");
    expect(normaliseLogStatus("")).toBe("unknown");
    expect(normaliseLogStatus("weird")).toBe("unknown");
  });
});

describe("formatMessageType", () => {
  it("humanises slugs", () => {
    expect(formatMessageType("quote_sent")).toBe("Quote sent");
    expect(formatMessageType("warranty-day14")).toBe("Warranty day14");
    expect(formatMessageType(undefined)).toBe("Unknown");
  });
});

describe("formatRecipientPhone", () => {
  it("adds + to digit-only numbers and leaves others alone", () => {
    expect(formatRecipientPhone("353871234567")).toBe("+353871234567");
    expect(formatRecipientPhone("+353871234567")).toBe("+353871234567");
    expect(formatRecipientPhone(null)).toBe("—");
  });
});

describe("relatedLabel", () => {
  const maps = { quotes: { q1: "Q-1024" }, jobs: { j1: "DG-446" }, invoices: {} };

  it("labels a quote with its number", () => {
    expect(relatedLabel("quote", "q1", maps)).toBe("Quote Q-1024");
  });

  it("labels a job via service_call", () => {
    expect(relatedLabel("service_call", "j1", maps)).toBe("Job DG-446");
  });

  it("falls back when the reference is not resolved", () => {
    expect(relatedLabel("invoice", "i9", maps)).toBe("Invoice");
    expect(relatedLabel("quote", null, maps)).toBe("—");
    expect(relatedLabel(null, "x", maps)).toBe("—");
  });
});
